/* =========================================
   chatbot.js
   予約受付・案内チャットボット
   Claude API（/api/chat エンドポイント）使用
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
     セッション ID（タブをまたいで会話履歴を保持）
  ========================================= */
  const sessionId = 'session_' + Math.random().toString(36).slice(2, 10);

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
    return div;
  }

  // ユーザーのメッセージを追加
  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--user';
    div.textContent = text;
    chatBody.appendChild(div);
    scrollToBottom();
  }

  // タイピングインジケーター（…アニメーション）を表示・削除
  function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--bot chat-msg--typing';
    div.id = 'typingIndicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    chatBody.appendChild(div);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
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
     返答にキーワードが含まれる場合に対応するセクションへ移動
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

  // 返答テキストに基づいて関連セクションへ自動スクロール
  function autoScrollFromReply(text) {
    if (/予約空き|カレンダー|空き状況/.test(text)) {
      scrollToSection('availability');
    } else if (/お問い合わせ|予約フォーム|フォームへ/.test(text)) {
      scrollToSection('contact');
    } else if (/メニュー.*セクション|セクションをご覧/.test(text)) {
      scrollToSection('menu');
    } else if (/料金表|料金.*セクション/.test(text)) {
      scrollToSection('price');
    } else if (/スタッフ紹介/.test(text)) {
      scrollToSection('staff');
    } else if (/口コミ/.test(text)) {
      scrollToSection('reviews');
    }
  }

  /* =========================================
     入力処理（Claude API 呼び出し）
  ========================================= */
  let isLoading = false;

  async function handleInput(text) {
    const input = text.trim();
    if (!input || isLoading) return;

    // ユーザーメッセージを表示してクイックリプライをクリア
    addUserMessage(input);
    clearQuickReplies();
    chatInput.value = '';

    // 送信ボタン・入力欄を無効化してタイピング表示
    isLoading = true;
    chatSend.disabled = true;
    chatInput.disabled = true;
    showTypingIndicator();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, sessionId }),
      });

      removeTypingIndicator();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addBotMessage(err.error || 'エラーが発生しました。しばらくしてからお試しください。');
        showQuickReplies(['予約したい', '営業時間は？', 'メニューと料金']);
        return;
      }

      const data = await res.json();
      const reply = data.reply || 'しばらくしてからお試しください。';

      addBotMessage(reply);
      autoScrollFromReply(reply);

      // フォローアップのクイックリプライを表示
      showQuickReplies(['予約したい', 'メニューと料金', '営業時間は？', 'アクセスを教えて']);

    } catch (err) {
      removeTypingIndicator();
      addBotMessage('通信エラーが発生しました。\nお電話（072-000-0000）でもご対応いたします。');
      showQuickReplies(['もう一度試す', '電話番号を教えて']);
    } finally {
      isLoading = false;
      chatSend.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  /* =========================================
     送信ボタン・Enterキーのイベント
  ========================================= */
  chatSend.addEventListener('click', () => {
    const val = chatInput.value;
    if (val.trim()) {
      handleInput(val);
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = chatInput.value;
      if (val.trim()) {
        handleInput(val);
      }
    }
  });

})();
