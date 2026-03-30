/* =========================================
   chatbot.js
   予約受付・案内チャットボット
   ルールベース（キーワードマッチング）
========================================= */

(function initChatbot() {

  /* =========================================
     DOM 要素の取得
  ========================================= */
  const fab        = document.getElementById('chatFab');
  const chatWindow = document.getElementById('chatWindow');
  const chatBody   = document.getElementById('chatBody');
  const chatInput  = document.getElementById('chatInput');
  const chatSend   = document.getElementById('chatSend');
  const chatQuick  = document.getElementById('chatQuick');

  if (!fab || !chatWindow) return;

  /* =========================================
     チャット開閉
  ========================================= */
  let isOpen = false;

  fab.addEventListener('click', () => {
    isOpen = !isOpen;
    fab.classList.toggle('open', isOpen);
    chatWindow.classList.toggle('open', isOpen);
    chatWindow.setAttribute('aria-hidden', String(!isOpen));

    // 初回オープン時にウェルカムメッセージを表示
    if (isOpen && chatBody.children.length === 0) {
      showWelcome();
    }

    // 開いたらインプットにフォーカス
    if (isOpen) {
      setTimeout(() => chatInput.focus(), 300);
    }
  });

  /* =========================================
     ウェルカムメッセージ
  ========================================= */
  function showWelcome() {
    // 少し間を置いて順番に表示
    addBotMessage('こんにちは！Liebeへようこそ。');

    setTimeout(() => {
      addBotMessage('ご予約やメニュー・料金のご案内が可能です。\nお気軽にお聞かせください 😊');
      showQuickReplies([
        '予約したい',
        '営業時間は？',
        'メニューと料金',
        'アクセスを教えて',
        'スタッフについて'
      ]);
    }, 600);
  }

  /* =========================================
     ルール定義（キーワード → 返答）
  ========================================= */
  const rules = [
    // ---- 予約関連 ----
    {
      keywords: ['予約', '予約したい', 'ブッキング', '空き', '空き状況'],
      response: () => {
        scrollToSection('availability');
        return 'ページ上部の「予約空き状況」カレンダーで直近の空きをご確認いただけます。\nご希望の日時が見つかりましたら、予約フォームからお送りください。';
      },
      quick: ['予約フォームへ', '電話で予約したい', 'メニューと料金']
    },
    {
      keywords: ['予約フォーム', 'フォーム', '問い合わせ'],
      response: () => {
        scrollToSection('contact');
        return 'お問い合わせ・予約フォームへご案内します。\nお名前・電話番号・ご希望日時を入力のうえお送りください。';
      },
      quick: ['営業時間は？', 'アクセスを教えて']
    },
    {
      keywords: ['電話', '電話番号', 'tel', '電話で'],
      response: () => '電話番号は 072-000-0000 です。\n営業時間内にお気軽にご連絡ください。',
      quick: ['営業時間は？', 'アクセスを教えて']
    },

    // ---- 営業時間・定休日 ----
    {
      keywords: ['営業時間', '何時', '開いてる', '閉まる', '何時まで', '定休', '休み'],
      response: () =>
        '【営業時間】\n火〜土：10:00〜20:00\n日・祝：10:00〜18:00\n定休日：月曜日',
      quick: ['予約したい', 'アクセスを教えて']
    },

    // ---- メニュー・料金 ----
    {
      keywords: ['メニュー', 'サービス', '何ができる', 'どんなメニュー'],
      response: () => {
        scrollToSection('menu');
        return '提供メニューはこちらです：\n・カット\n・カラー\n・パーマ / 縮毛矯正\n・トリートメント / ヘッドスパ\n・アイブロウ\n\n詳細はページの「メニュー」セクションをご覧ください。';
      },
      quick: ['料金を知りたい', '予約したい']
    },
    {
      keywords: ['料金', '値段', '価格', 'いくら', '費用', '金額'],
      response: () => {
        scrollToSection('price');
        return '【主な料金の目安（税込）】\nカット：¥4,400〜\nカラー：¥6,600〜\nパーマ：¥13,200〜\n縮毛矯正：¥16,500〜\nトリートメント：¥3,300〜\nヘッドスパ：¥5,500〜\nアイブロウ：¥2,200〜\n\n詳しくは料金表セクションをご覧ください。';
      },
      quick: ['予約したい', 'メニューと料金']
    },
    {
      keywords: ['カット'],
      response: () => 'カットは ¥4,400〜（ショート〜ミディアム）、¥5,500〜（ロング）です。\n前髪カットのみは ¥1,100 となっております。',
      quick: ['予約したい', '他のメニューも見たい']
    },
    {
      keywords: ['カラー', '白髪', 'ハイライト', 'バレイヤージュ'],
      response: () => 'カラーは ¥6,600〜 からご対応しています。\nグレイカラー（白髪染め）や、ハイライト・バレイヤージュも承ります。\nまずカウンセリングにてご相談ください。',
      quick: ['予約したい', 'トリートメントについて']
    },
    {
      keywords: ['パーマ', 'デジタルパーマ', 'くせ毛', '縮毛', '縮毛矯正', 'ストレート'],
      response: () => 'パーマ・縮毛矯正も得意なメニューです。\nデジタルパーマ：¥13,200〜\n縮毛矯正：¥16,500〜\nご自身の髪質に合わせてご提案します。',
      quick: ['予約したい', '料金を知りたい']
    },
    {
      keywords: ['トリートメント', 'ヘッドスパ', 'スパ', 'ケア'],
      response: () => 'トリートメント（¥3,300〜）とヘッドスパ（¥5,500〜）をご用意しています。\n日々の疲れを癒し、美しい髪へと整えます。',
      quick: ['予約したい', '料金を知りたい']
    },
    {
      keywords: ['アイブロウ', '眉', '眉毛'],
      response: () => '眉スタイリング（シェービング）¥2,200 と眉カラー ¥3,300 があります。\n顔全体の印象を整えるのに人気のメニューです！',
      quick: ['予約したい', '他のメニューも見たい']
    },

    // ---- スタッフ ----
    {
      keywords: ['スタッフ', 'スタイリスト', '担当', 'だれ'],
      response: () => {
        scrollToSection('staff');
        return '現在のスタッフをご紹介します：\n👩 山田 花子（Head Stylist）\n👩 田中 美咲（Color Specialist）\n👨 鈴木 涼太（Perm Specialist）\n\n詳細はスタッフ紹介セクションをご覧ください。';
      },
      quick: ['予約したい', 'メニューと料金']
    },

    // ---- アクセス ----
    {
      keywords: ['アクセス', '場所', '住所', '駅', '行き方', '地図'],
      response: () =>
        '【アクセス】\n〒569-0000\n大阪府高槻市○○町1-2-3\n\nJR高槻駅 徒歩5分\n阪急高槻市駅 徒歩7分\n\nお車でのご来店は近隣のコインパーキングをご利用ください。',
      quick: ['営業時間は？', '予約したい']
    },

    // ---- 駐車場 ----
    {
      keywords: ['駐車場', '車', '駐車', 'パーキング'],
      response: () => '専用駐車場はございませんが、近隣にコインパーキングが複数ございます。\nお車でのご来店も歓迎しております。',
      quick: ['アクセスを教えて', '営業時間は？']
    },

    // ---- 口コミ ----
    {
      keywords: ['口コミ', 'レビュー', '評判', '評価'],
      response: () => {
        scrollToSection('reviews');
        return 'Googleの口コミ評価は4.9（5段階中）です！\nお客様の声は口コミセクションでご確認いただけます。';
      },
      quick: ['予約したい', 'メニューと料金']
    },

    // ---- 初回・初めて ----
    {
      keywords: ['初めて', '初回', 'はじめて', '初めての'],
      response: () =>
        'ご来店はじめての方もお気軽にどうぞ！\n丁寧なカウンセリングからスタートしますので、ご安心ください。\nご希望やお悩みをなんでもお聞かせください。',
      quick: ['予約したい', 'メニューと料金', '料金を知りたい']
    },
  ];

  /* =========================================
     メッセージ追加関数
  ========================================= */
  // ボットのメッセージを追加
  function addBotMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--bot';
    // 改行コードをbrタグに変換
    div.innerHTML = text.replace(/\n/g, '<br>');
    chatBody.appendChild(div);
    scrollToBottom();
  }

  // ユーザーのメッセージを追加
  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--user';
    div.textContent = text;
    chatBody.appendChild(div);
    scrollToBottom();
  }

  // チャット本文を最下部にスクロール
  function scrollToBottom() {
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  /* =========================================
     クイックリプライ表示
  ========================================= */
  function showQuickReplies(replies) {
    chatQuick.innerHTML = '';
    replies.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'quick-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        handleInput(label);
      });
      chatQuick.appendChild(btn);
    });
  }

  function clearQuickReplies() {
    chatQuick.innerHTML = '';
  }

  /* =========================================
     セクションへスクロール
     ヘッダー高さ分だけオフセットして先頭へ移動
  ========================================= */
  function scrollToSection(id) {
    setTimeout(() => {
      const section = document.getElementById(id);
      const headerEl = document.getElementById('header');
      if (section) {
        const headerHeight = headerEl?.offsetHeight ?? 72;
        const top = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }, 400);
  }

  /* =========================================
     入力処理（キーワードマッチング）
  ========================================= */
  function handleInput(text) {
    const input = text.trim();
    if (!input) return;

    // ユーザーメッセージを表示してクイックリプライをクリア
    addUserMessage(input);
    clearQuickReplies();

    // 少し間を置いてボットが返答（自然に見せる）
    setTimeout(() => {
      const response = findResponse(input);
      addBotMessage(response.text);
      if (response.quick && response.quick.length > 0) {
        showQuickReplies(response.quick);
      } else {
        // デフォルトのクイックリプライ
        showQuickReplies(['予約したい', 'メニューと料金', '営業時間は？']);
      }
    }, 400);
  }

  // ルールからレスポンスを検索
  function findResponse(input) {
    const lower = input.toLowerCase()
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

    // キーワードマッチング
    for (const rule of rules) {
      const matched = rule.keywords.some(kw => lower.includes(kw.toLowerCase()));
      if (matched) {
        return {
          text: typeof rule.response === 'function' ? rule.response() : rule.response,
          quick: rule.quick || []
        };
      }
    }

    // マッチしなかった場合のデフォルト返答
    return {
      text: 'ご質問ありがとうございます。\n詳しい内容については、スタッフが直接ご案内いたします。\nお電話（072-000-0000）またはお問い合わせフォームからお気軽にご連絡ください。',
      quick: ['予約したい', '電話番号を教えて', '営業時間は？']
    };
  }

  /* =========================================
     送信ボタン・Enterキーのイベント
  ========================================= */
  chatSend.addEventListener('click', () => {
    const val = chatInput.value;
    if (val.trim()) {
      handleInput(val);
      chatInput.value = '';
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = chatInput.value;
      if (val.trim()) {
        handleInput(val);
        chatInput.value = '';
      }
    }
  });

})();
