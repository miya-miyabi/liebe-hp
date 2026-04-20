[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$baseUrl = 'http://localhost:3001/api/chat'
$questions = @(
  '今日予約できますか？',
  '当日予約できますか？',
  '土日で空いてる時間ありますか？',
  'どうやって予約できますか？',
  '電話予約できますか？',
  'ネット予約できますか？',
  '予約変更できますか？',
  'キャンセルはどうすればいいですか？',
  '遅刻しそうです',
  '営業時間は何時から何時までですか？',
  '今日営業してますか？',
  '定休日はいつですか？',
  'お店はどこにありますか？',
  '高槻駅から何分ですか？',
  '行き方を教えてください',
  '白髪ぼかしはいくらですか？',
  '縮毛矯正はいくらですか？',
  'メンズカットはいくらですか？',
  '髪質改善メニューはありますか？',
  '縮毛矯正ありますか？',
  'ヘアセットできますか？',
  '誰が縮毛矯正得意ですか？',
  '女性スタイリストいますか？',
  '山下さんでヘアセット予約できますか？'
)

$sid = 'test_' + [System.Guid]::NewGuid().ToString('N').Substring(0,8)

foreach ($q in $questions) {
  $body = @{ message = $q; sessionId = $sid } | ConvertTo-Json -Compress
  try {
    $r = Invoke-RestMethod -Uri $baseUrl -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 30
    Write-Output "Q: $q"
    Write-Output "A: $($r.reply)"
    Write-Output '---'
  } catch {
    Write-Output "Q: $q"
    Write-Output "ERROR: $($_.Exception.Message)"
    Write-Output '---'
  }
  Start-Sleep -Milliseconds 800
}
