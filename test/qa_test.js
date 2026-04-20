// チャットボット回答品質テスト
const http = require('http');

const questions = [
  // 予約・空き確認
  '今日予約できますか？',
  '当日予約できますか？',
  '土日で空いてる時間ありますか？',
  // 予約方法
  'どうやって予約できますか？',
  '電話予約できますか？',
  'ネット予約できますか？',
  // 予約変更・キャンセル・遅刻
  '予約変更できますか？',
  'キャンセルはどうすればいいですか？',
  '遅刻しそうです',
  // 営業時間・営業日
  '営業時間は何時から何時までですか？',
  '今日営業してますか？',
  '定休日はいつですか？',
  // アクセス・場所
  'お店はどこにありますか？',
  '高槻駅から何分ですか？',
  '行き方を教えてください',
  // 料金案内
  '白髪ぼかしはいくらですか？',
  '縮毛矯正はいくらですか？',
  'メンズカットはいくらですか？',
  // メニュー有無
  '髪質改善メニューはありますか？',
  '縮毛矯正ありますか？',
  'ヘアセットできますか？',
  // スタッフ・指名
  '誰が縮毛矯正得意ですか？',
  '女性スタイリストいますか？',
  '山下さんでヘアセット予約できますか？',
];

const sessionId = 'qa_test_' + Date.now();

function ask(question) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ message: question, sessionId });
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.reply || json.error || data);
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runAll() {
  for (const q of questions) {
    try {
      const a = await ask(q);
      console.log('Q: ' + q);
      console.log('A: ' + a);
      console.log('---');
    } catch (e) {
      console.log('Q: ' + q);
      console.log('ERROR: ' + e.message);
      console.log('---');
    }
    await new Promise(r => setTimeout(r, 600));
  }
}

runAll();
