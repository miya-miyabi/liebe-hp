/* =========================================
   api/chat.js
   Vercel サーバーレス関数 — Claude API プロキシ
========================================= */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

/* データファイル読み込み */
function loadDataFile(filename) {
  const filepath = path.join(__dirname, '..', 'data', filename);
  try {
    return fs.readFileSync(filepath, 'utf-8');
  } catch (e) {
    console.warn(`⚠️  data/${filename} が読み込めませんでした: ${e.message}`);
    return null;
  }
}

function buildSystemPrompt() {
  const basePrompt  = loadDataFile('system_prompt.txt') || '';
  const storeRaw    = loadDataFile('store_data.json');
  const couponRaw   = loadDataFile('coupon_data.json');
  const stylistRaw  = loadDataFile('stylist_data.json');
  const faqRaw      = loadDataFile('faq.json');

  const sections = [];
  if (storeRaw)   sections.push('## 店舗情報 (store_data.json)\n' + storeRaw);
  if (couponRaw)  sections.push('## クーポン・料金情報 (coupon_data.json)\n' + couponRaw);
  if (stylistRaw) sections.push('## スタイリスト情報 (stylist_data.json)\n' + stylistRaw);
  if (faqRaw)     sections.push('## よくある質問 (faq.json)\n' + faqRaw);

  return [basePrompt, ...sections].join('\n\n---\n\n');
}

const SYSTEM_PROMPT = buildSystemPrompt();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* サーバーレス関数エントリーポイント */
module.exports = async (req, res) => {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, messages: historyMessages } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'メッセージが必要です' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'APIキーが設定されていません' });
  }

  // フロントエンドから会話履歴を受け取る（サーバーレスはステートレスなため）
  const messages = Array.isArray(historyMessages) ? historyMessages : [];
  messages.push({ role: 'user', content: message });

  // 直近10ターン（20メッセージ）のみ送信
  const recentMessages = messages.slice(-20);

  try {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system:     SYSTEM_PROMPT,
          messages:   recentMessages,
        });
        break;
      } catch (retryErr) {
        if (retryErr.status === 500 && attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else {
          throw retryErr;
        }
      }
    }

    const reply = response.content[0].text;
    return res.json({ reply });

  } catch (err) {
    console.error('Claude API エラー:', err.status, err.message);
    if (err.status === 401) return res.status(500).json({ error: 'APIキーが無効です' });
    if (err.status === 429) return res.status(429).json({ error: 'しばらくしてからお試しください' });
    return res.status(500).json({ error: 'エラーが発生しました。しばらくしてからお試しください。' });
  }
};
