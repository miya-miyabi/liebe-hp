# =========================================
# server.ps1
# Liebe Hair Salon — 静的ファイル + Claude API プロキシサーバー
# =========================================

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# =========================================
# .env ファイルを読み込み
# =========================================
$envFile = Join-Path $root ".env"
$apiKey = ""

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^ANTHROPIC_API_KEY=(.+)$') {
      $apiKey = $Matches[1].Trim()
    }
  }
}

if (-not $apiKey -or $apiKey -like "sk-ant-xxx*") {
  Write-Warning ".env の ANTHROPIC_API_KEY が未設定です。chatbot は動作しません。"
}

# =========================================
# セッション管理（会話履歴、1時間で自動削除）
# =========================================
$sessions = @{}

function Get-Session($sid) {
  if (-not $sessions.ContainsKey($sid)) {
    $sessions[$sid] = @{
      messages  = @()
      updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
  }
  $sessions[$sid].updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  return $sessions[$sid]
}

function Cleanup-Sessions {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $expired = $sessions.Keys | Where-Object { ($now - $sessions[$_].updatedAt) -gt 3600000 }
  $expired | ForEach-Object { $sessions.Remove($_) }
}

# =========================================
# システムプロンプト
# =========================================
$systemPrompt = @"
あなたはLiebe Hair Salon（大阪・高槻）の親切なAIアシスタントです。
お客様のご質問に、丁寧で自然な日本語でお答えください。

【サロン基本情報】
- サロン名：Liebe Hair Salon（リーベ ヘアサロン）
- 住所：大阪府高槻市○○町1-2-3
- 電話：072-000-0000
- 営業時間：火〜土 10:00〜20:00、日・祝 10:00〜18:00
- 定休日：月曜日
- アクセス：JR高槻駅 徒歩5分、阪急高槻市駅 徒歩7分

【メニューと料金（税込）】
カット
- カット（ショート〜ミディアム）：¥4,400
- カット（セミロング〜ロング）：¥5,500
- 前髪カット：¥1,100

カラー
- ワンカラー（ショート〜ミディアム）：¥6,600
- ワンカラー（セミロング〜ロング）：¥8,800
- グレイカラー（白髪染め）：¥7,700〜
- ハイライト・バレイヤージュ：¥11,000〜

パーマ・縮毛矯正
- デジタルパーマ（ショート〜ミディアム）：¥13,200〜
- デジタルパーマ（ロング）：¥17,600〜
- 縮毛矯正：¥16,500〜

トリートメント・ヘッドスパ
- トリートメント（ショート〜ミディアム）：¥3,300〜
- トリートメント（ロング）：¥4,400〜
- ヘッドスパ（30分）：¥5,500
- ヘッドスパ（60分）：¥9,900

アイブロウ
- 眉カット・シェービング：¥2,200
- 眉カラー：¥3,300

【スタッフ】
- 山田 花子（Head Stylist）：カット・バレイヤージュ得意
- 田中 美咲（Color Specialist）：カラー・トリートメント得意
- 鈴木 涼太（Perm Specialist）：縮毛矯正・ヘッドスパ得意

【対応ガイドライン】
- 返答は簡潔に、3〜5文程度でまとめてください
- 料金はすべて税込みで案内してください
- ご予約はホームページのフォームまたはお電話でご案内ください
- わからないことは正直にお伝えし、電話での確認を勧めてください
- 絵文字は控えめに使ってOKです
"@

# =========================================
# MIMEタイプ定義
# =========================================
$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff2"= "font/woff2"
  ".woff" = "font/woff"
}

# =========================================
# サーバー起動
# =========================================
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:3000/")
$listener.Start()
Write-Host "✅ サーバー起動: http://localhost:3000/"

$cleanupCounter = 0

while ($listener.IsListening) {
  $ctx  = $listener.GetContext()
  $req  = $ctx.Request
  $resp = $ctx.Response

  # セッション定期クリーンアップ（50リクエストごと）
  $cleanupCounter++
  if ($cleanupCounter -ge 50) {
    Cleanup-Sessions
    $cleanupCounter = 0
  }

  $urlPath = $req.Url.LocalPath
  $method  = $req.HttpMethod

  # =========================================
  # POST /api/chat — Claude API プロキシ
  # =========================================
  if ($urlPath -eq "/api/chat" -and $method -eq "POST") {
    $resp.ContentType = "application/json; charset=utf-8"
    $resp.Headers.Add("Access-Control-Allow-Origin", "*")

    try {
      # リクエストボディを読み取り
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()

      $bodyObj = $body | ConvertFrom-Json
      $userMessage = $bodyObj.message
      $sessionId   = if ($bodyObj.sessionId) { $bodyObj.sessionId } else { "default" }

      if (-not $userMessage) {
        $resp.StatusCode = 400
        $errJson = '{"error":"メッセージが必要です"}'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
        $resp.ContentLength64 = $bytes.Length
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $resp.OutputStream.Close()
        continue
      }

      if (-not $apiKey) {
        $resp.StatusCode = 500
        $errJson = '{"error":"APIキーが設定されていません。.env ファイルを確認してください。"}'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
        $resp.ContentLength64 = $bytes.Length
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $resp.OutputStream.Close()
        continue
      }

      # セッションから会話履歴を取得してユーザーメッセージを追加
      $session = Get-Session $sessionId
      $session.messages += @{ role = "user"; content = $userMessage }

      # 直近20メッセージのみ送信
      $recentMessages = $session.messages | Select-Object -Last 20

      # Anthropic API リクエストボディを構築
      $apiBody = @{
        model      = "claude-haiku-4-5-20251001"
        max_tokens = 600
        system     = $systemPrompt
        messages   = $recentMessages
      } | ConvertTo-Json -Depth 10

      # Claude API を呼び出し
      $headers = @{
        "x-api-key"         = $apiKey
        "anthropic-version" = "2023-06-01"
        "content-type"      = "application/json"
      }

      $apiResponse = Invoke-RestMethod `
        -Uri "https://api.anthropic.com/v1/messages" `
        -Method POST `
        -Headers $headers `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($apiBody)) `
        -ContentType "application/json; charset=utf-8"

      $reply = $apiResponse.content[0].text

      # アシスタントの返答を履歴に追加
      $session.messages += @{ role = "assistant"; content = $reply }

      $resultJson = @{ reply = $reply } | ConvertTo-Json -Depth 5
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($resultJson)
      $resp.ContentLength64 = $bytes.Length
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)

    } catch {
      $errMsg = $_.Exception.Message
      Write-Host "Claude API エラー: $errMsg"

      $resp.StatusCode = 500
      $errJson = '{"error":"エラーが発生しました。しばらくしてからお試しください。"}'
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
      $resp.ContentLength64 = $bytes.Length
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    }

    $resp.OutputStream.Close()
    continue
  }

  # =========================================
  # OPTIONS プリフライトリクエスト対応
  # =========================================
  if ($method -eq "OPTIONS") {
    $resp.Headers.Add("Access-Control-Allow-Origin", "*")
    $resp.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $resp.StatusCode = 204
    $resp.OutputStream.Close()
    continue
  }

  # =========================================
  # 静的ファイル配信
  # =========================================
  if ($urlPath -eq "/" -or $urlPath -eq "") { $urlPath = "/index.html" }
  $filePath = Join-Path $root ($urlPath.TrimStart("/").Replace("/", "\"))

  if (Test-Path $filePath -PathType Leaf) {
    $ext  = [System.IO.Path]::GetExtension($filePath).ToLower()
    $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $resp.ContentType      = $mime
    $resp.ContentLength64  = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $resp.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $urlPath")
    $resp.OutputStream.Write($msg, 0, $msg.Length)
  }

  $resp.OutputStream.Close()
}
