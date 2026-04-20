# server.ps1
# Liebe Hair Salon - 静的ファイル + Claude API プロキシサーバー

# TLS 1.2 を強制（Anthropic API 接続に必要）
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# .env ファイルを読み込み
$envFile = Join-Path $root ".env"
$apiKey = ""
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^ANTHROPIC_API_KEY=(.+)$') { $apiKey = $Matches[1].Trim() }
  }
}

# セッション管理
$sessions = @{}
function Get-Session($sid) {
  if (-not $sessions.ContainsKey($sid)) {
    $sessions[$sid] = @{ messages = @(); updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  }
  $sessions[$sid].updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  return $sessions[$sid]
}
function Cleanup-Sessions {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $expired = $sessions.Keys | Where-Object { ($now - $sessions[$_].updatedAt) -gt 3600000 }
  $expired | ForEach-Object { $sessions.Remove($_) }
}

# システムプロンプト
$lines = @(
  "あなたはLiebe Hair Salon（大阪・高槻）の親切なAIアシスタントです。お客様のご質問に、丁寧で自然な日本語でお答えください。",
  "",
  "【サロン基本情報】",
  "サロン名：Liebe Hair Salon（リーベ ヘアサロン）",
  "住所：大阪府高槻市○○町1-2-3",
  "電話：072-000-0000",
  "営業時間：火〜土 10:00〜20:00、日・祝 10:00〜18:00、定休日：月曜日",
  "アクセス：JR高槻駅 徒歩5分、阪急高槻市駅 徒歩7分",
  "",
  "【メニューと料金（税込）】",
  "カット：ショート〜ミディアム ¥4,400 / セミロング〜ロング ¥5,500 / 前髪カット ¥1,100",
  "カラー：ワンカラー ¥6,600〜 / グレイカラー ¥7,700〜 / ハイライト・バレイヤージュ ¥11,000〜",
  "パーマ：デジタルパーマ ¥13,200〜 / 縮毛矯正 ¥16,500〜",
  "トリートメント ¥3,300〜 / ヘッドスパ30分 ¥5,500 / ヘッドスパ60分 ¥9,900",
  "アイブロウ：眉カット・シェービング ¥2,200 / 眉カラー ¥3,300",
  "",
  "【スタッフ】",
  "山田 花子（Head Stylist）：カット・バレイヤージュ得意",
  "田中 美咲（Color Specialist）：カラー・トリートメント得意",
  "鈴木 涼太（Perm Specialist）：縮毛矯正・ヘッドスパ得意",
  "",
  "【対応ガイドライン】",
  "返答は簡潔に3〜5文程度。料金は税込みで案内。ご予約はフォームまたはお電話で。不明点は電話確認を勧める。絵文字は控えめに使用可。"
)
$systemPrompt = $lines -join "`n"

# MIMEタイプ
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

# サーバー起動
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:3000/")
$listener.Start()
Write-Host "サーバー起動: http://localhost:3000/"

$cleanupCounter = 0
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { Write-Host ("GetContext error: " + $_.Exception.Message); break }
  $req  = $ctx.Request
  $resp = $ctx.Response
  Write-Host ($req.HttpMethod + " " + $req.Url.LocalPath)

  $cleanupCounter++
  if ($cleanupCounter -ge 50) { Cleanup-Sessions; $cleanupCounter = 0 }

  $urlPath = $req.Url.LocalPath
  $method  = $req.HttpMethod

  # POST /api/chat - Claude API プロキシ
  if ($urlPath -eq "/api/chat" -and $method -eq "POST") {
    $resp.ContentType = "application/json; charset=utf-8"
    $resp.Headers.Add("Access-Control-Allow-Origin", "*")
    try {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()
      $bodyObj = $body | ConvertFrom-Json
      $userMessage = $bodyObj.message
      $sessionId   = if ($bodyObj.sessionId) { $bodyObj.sessionId } else { "default" }

      if (-not $userMessage) {
        $resp.StatusCode = 400
        $errJson = '{"error":"message required"}'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
        $resp.ContentLength64 = $bytes.Length
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $resp.OutputStream.Close()
        continue
      }
      if (-not $apiKey) {
        $resp.StatusCode = 500
        $errJson = '{"error":"APIキーが未設定です。.envファイルを確認してください。"}'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
        $resp.ContentLength64 = $bytes.Length
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $resp.OutputStream.Close()
        continue
      }

      $session = Get-Session $sessionId
      $session.messages += @{ role = "user"; content = $userMessage }
      $recentMessages = @($session.messages | Select-Object -Last 20)

      $apiBody = @{
        model      = "claude-haiku-4-5-20251001"
        max_tokens = 600
        system     = $systemPrompt
        messages   = $recentMessages
      } | ConvertTo-Json -Depth 10

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
      $session.messages += @{ role = "assistant"; content = $reply }

      $resultJson = @{ reply = $reply } | ConvertTo-Json -Depth 5
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($resultJson)
      $resp.ContentLength64 = $bytes.Length
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      Write-Host ("Claude API エラー: " + $_.Exception.Message)
      $resp.StatusCode = 500
      $errJson = '{"error":"エラーが発生しました。しばらくしてからお試しください。"}'
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
      $resp.ContentLength64 = $bytes.Length
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $resp.OutputStream.Close()
    continue
  }

  # OPTIONS プリフライト
  if ($method -eq "OPTIONS") {
    $resp.Headers.Add("Access-Control-Allow-Origin", "*")
    $resp.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $resp.StatusCode = 204
    $resp.OutputStream.Close()
    continue
  }

  # 静的ファイル配信
  if ($urlPath -eq "/" -or $urlPath -eq "") { $urlPath = "/index.html" }
  $filePath = Join-Path $root ($urlPath.TrimStart("/").Replace("/", "\"))
  if (Test-Path $filePath -PathType Leaf) {
    $ext  = [System.IO.Path]::GetExtension($filePath).ToLower()
    $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $resp.ContentType     = $mime
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $resp.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
    $resp.OutputStream.Write($msg, 0, $msg.Length)
  }
  $resp.OutputStream.Close()
}




