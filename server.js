/* =========================================
   server.js
   Liebe Hair Salon — バックエンドサーバー
   静的ファイル配信 + Claude API プロキシ
========================================= */

require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================
   Claude クライアント初期化
========================================= */
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/* =========================================
   Liebeサロンのシステムプロンプト
========================================= */
const SYSTEM_PROMPT = `あなたはLiebe Hair Salon（大阪・高槻）の親切なAIアシスタントです。
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
- 絵文字は控えめに使ってOKです`;

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
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: recentMessages,
    });

    const reply = response.content[0].text;

    // アシスタントの返答を履歴に追加
    session.messages.push({ role: 'assistant', content: reply });

    res.json({ reply });

  } catch (err) {
    console.error('Claude API エラー:', err.message);

    // API制限やキーエラーの場合はわかりやすいメッセージを返す
    if (err.status === 401) {
      return res.status(500).json({ error: 'APIキーが無効です' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'しばらくしてからお試しください' });
    }

    res.status(500).json({ error: 'エラーが発生しました。しばらくしてからお試しください。' });
  }
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
