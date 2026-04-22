/* =========================================
   server.js
   Liebe hair&treatment 高槻 — バックエンドサーバー
   静的ファイル配信 + Claude API プロキシ
========================================= */

require('dotenv').config();
const express  = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

/* =========================================
   Claude クライアント初期化
========================================= */
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/* =========================================
   データファイル読み込み
   回答優先順位:
     1. 公式掲載情報または実装上で取得できた最新データ
     2. store_data.json
     3. coupon_data.json
     4. stylist_data.json
     5. faq.json
     6. 不明 → 定型フレーズ
========================================= */
function loadDataFile(filename) {
  const filepath = path.join(__dirname, 'data', filename);
  try {
    return fs.readFileSync(filepath, 'utf-8');
  } catch (e) {
    console.warn(`⚠️  data/${filename} が読み込めませんでした: ${e.message}`);
    return null;
  }
}

function buildSystemPrompt() {
  // 1. 判断ルール（system_prompt.txt）
  const basePrompt = loadDataFile('system_prompt.txt') || '';

  // 2〜5. 各 JSON データを結合
  const storeRaw   = loadDataFile('store_data.json');
  const couponRaw  = loadDataFile('coupon_data.json');
  const stylistRaw = loadDataFile('stylist_data.json');
  const faqRaw     = loadDataFile('faq.json');

  const sections = [];

  if (storeRaw) {
    sections.push('## 店舗情報 (store_data.json)\n' + storeRaw);
  }
  if (couponRaw) {
    sections.push('## クーポン・料金情報 (coupon_data.json)\n' + couponRaw);
  }
  if (stylistRaw) {
    sections.push('## スタイリスト情報 (stylist_data.json)\n' + stylistRaw);
  }
  if (faqRaw) {
    sections.push('## よくある質問 (faq.json)\n' + faqRaw);
  }

  return [basePrompt, ...sections].join('\n\n---\n\n');
}

// 起動時に一度組み立て（ファイル変更はサーバー再起動で反映）
const SYSTEM_PROMPT = buildSystemPrompt();

/* =========================================
   セッション管理（会話履歴を保持）
========================================= */
const sessions = new Map();

// 古いセッションを定期削除（1時間で期限切れ）
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > 60 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

/* =========================================
   ミドルウェア
========================================= */
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* =========================================
   POST /api/chat — Claude API エンドポイント
========================================= */
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'メッセージが必要です' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'APIキーが設定されていません' });
  }

  // セッション取得 or 新規作成
  const sid = sessionId || 'default';
  if (!sessions.has(sid)) {
    sessions.set(sid, { messages: [], updatedAt: Date.now() });
  }
  const session = sessions.get(sid);
  session.updatedAt = Date.now();

  // ユーザーメッセージを履歴に追加
  session.messages.push({ role: 'user', content: message });

  // 直近10ターン（20メッセージ）のみ送信してコストを抑える
  const recentMessages = session.messages.slice(-20);

  try {
    let response;
    let lastError;

    // 500エラーに対して最大3回までリトライ
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system:     SYSTEM_PROMPT,
          messages:   recentMessages,
        });
        break; // 成功したらループを抜ける
      } catch (retryErr) {
        lastError = retryErr;
        // 500エラーの場合はリトライ、それ以外は即座にthrow
        if (retryErr.status === 500 && attempt < 3) {
          console.warn(`リトライ ${attempt}/3: 500エラー - ${retryErr.message}`);
          await new Promise(r => setTimeout(r, 1000 * attempt)); // 指数バックオフ
        } else {
          throw retryErr;
        }
      }
    }

    const reply = response.content[0].text;

    // アシスタントの返答を履歴に追加
    session.messages.push({ role: 'assistant', content: reply });

    res.json({ reply });

  } catch (err) {
    console.error('Claude API エラー:', {
      status: err.status,
      message: err.message,
      type: err.type,
      requestId: err.request_id || 'unknown',
    });

    if (err.status === 401) {
      return res.status(500).json({ error: 'APIキーが無効です' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'しばらくしてからお試しください' });
    }
    if (err.status === 500) {
      return res.status(503).json({ error: 'サーバーが一時的に利用できません。しばらくしてからお試しください。' });
    }

    res.status(500).json({ error: 'エラーが発生しました。しばらくしてからお試しください。' });
  }
});

/* =========================================
   SPAフォールバック（未定義ルートは index.html を返す）
========================================= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* =========================================
   サーバー起動
========================================= */
app.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。');
  }
});
