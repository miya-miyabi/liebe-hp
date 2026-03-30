/* =========================================
   main.js
   スクロールアニメーション・ナビ制御・
   予約カレンダー・スライダー・フォームバリデーション
========================================= */

/* =========================================
   1. ヘッダー スクロール制御
========================================= */
const header = document.getElementById('header');

// スクロール量に応じてヘッダーの背景を変更
window.addEventListener('scroll', () => {
  if (window.scrollY > 60) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
}, { passive: true });

/* =========================================
   2. ハンバーガーメニュー（モバイル）
========================================= */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
const mobileLinks = mobileNav.querySelectorAll('.mobile-nav__link');

// ハンバーガークリックでメニュー開閉
hamburger.addEventListener('click', () => {
  const isOpen = hamburger.classList.toggle('open');
  mobileNav.classList.toggle('open', isOpen);
  // メニュー開閉時にスクロールを制御
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

// モバイルナビのリンクをクリックしたらメニューを閉じる
mobileLinks.forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
  });
});

/* =========================================
   3. スクロール時リビールアニメーション
   （Intersection Observer API を使用）
========================================= */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // 一度表示したら監視解除
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    root: null,
    rootMargin: '0px 0px -60px 0px', // 下端から60px手前でトリガー
    threshold: 0.1
  }
);

// .reveal クラスを持つ全要素を監視
document.querySelectorAll('.reveal').forEach(el => {
  revealObserver.observe(el);
});

/* =========================================
   4. スムーズスクロール（ナビリンク）
   セクションの先頭にきちんと移動するよう
   ヘッダー高さ分だけオフセットを引く
========================================= */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      // ヘッダーの実際の高さを毎回取得（リサイズ対応）＋余白16px
      const headerHeight = (document.getElementById('header')?.offsetHeight ?? 72) + 16;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* =========================================
   5. 予約空き状況カレンダー（ダミーデータ）
========================================= */
(function buildCalendar() {
  const table = document.getElementById('availabilityTable');
  if (!table) return;

  // 時間帯の定義
  const timeSlots = [
    '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'
  ];

  // 本日から7日分の日付を生成
  const today = new Date();
  const days = [];
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d,
      label: `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`,
      isClosed: d.getDay() === 1 // 月曜定休
    });
  }

  // ランダムな空き状況を生成（シードを日付で固定してリロードで変わらないようにする）
  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function getStatus(dateIndex, timeIndex) {
    const day = days[dateIndex];
    // 月曜は休業
    if (day.isClosed) return 'closed';
    // 早朝・夜遅めのスロット調整
    const hour = parseInt(timeSlots[timeIndex].split(':')[0]);
    const seed = (dateIndex + 1) * 100 + timeIndex;
    const r = seededRandom(seed);
    if (r < 0.35) return 'open';
    if (r < 0.60) return 'few';
    return 'full';
  }

  // テーブルヘッダーに曜日を追加
  const thead = table.querySelector('thead tr');
  days.forEach(d => {
    const th = document.createElement('th');
    th.textContent = d.label;
    // 土曜日は青、日曜は赤で色付け
    const dayOfWeek = d.date.getDay();
    if (dayOfWeek === 0) th.style.color = 'rgba(255, 120, 120, 0.9)';
    if (dayOfWeek === 6) th.style.color = 'rgba(120, 180, 255, 0.9)';
    thead.appendChild(th);
  });

  // テーブル本体（時間帯 × 曜日）を生成
  const tbody = table.querySelector('tbody');
  timeSlots.forEach((time, tIdx) => {
    const tr = document.createElement('tr');

    // 時間列
    const timeTd = document.createElement('td');
    timeTd.textContent = time;
    timeTd.className = 'time-col';
    tr.appendChild(timeTd);

    // 各曜日のセル
    days.forEach((day, dIdx) => {
      const td = document.createElement('td');
      const status = getStatus(dIdx, tIdx);

      td.className = `avail-cell ${status}`;

      // アイコンとテキストで状態表示
      if (status === 'open')   td.textContent = '○';
      else if (status === 'few')    td.textContent = '△';
      else if (status === 'full')   td.textContent = '×';
      else td.textContent = '−'; // 休業

      // 空き・残りわずかのセルはクリックで予約フォームへ
      if (status === 'open' || status === 'few') {
        td.title = `${day.label} ${time} で予約する`;
        td.style.cursor = 'pointer';
        td.addEventListener('click', () => {
          // 予約フォームへスクロール
          const contactSection = document.getElementById('contact');
          if (contactSection) {
            const offset = header.offsetHeight + 16;
            const top = contactSection.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: 'smooth' });

            // 日時フィールドに選択日時を入力
            const dateInput = document.getElementById('date');
            if (dateInput) {
              const d = new Date(day.date);
              d.setHours(parseInt(time.split(':')[0]), 0, 0, 0);
              // datetime-local形式に変換（YYYY-MM-DDTHH:MM）
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              const hh = String(d.getHours()).padStart(2, '0');
              dateInput.value = `${yyyy}-${mm}-${dd}T${hh}:00`;
            }
          }
        });
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
})();

/* =========================================
   6. 口コミスライダー
========================================= */
(function initSlider() {
  const slider = document.getElementById('reviewsSlider');
  const prevBtn = document.getElementById('sliderPrev');
  const nextBtn = document.getElementById('sliderNext');
  const dotsContainer = document.getElementById('reviewsDots');

  if (!slider) return;

  const cards = slider.querySelectorAll('.review__card');
  let current = 0;

  // 表示枚数を画面幅で判定
  function getVisible() {
    if (window.innerWidth <= 768) return 1;
    if (window.innerWidth <= 1024) return 2;
    return 3;
  }

  // 最大インデックスを計算
  function getMaxIndex() {
    return Math.max(0, cards.length - getVisible());
  }

  // スライダーを移動
  function goTo(index) {
    const maxIdx = getMaxIndex();
    current = Math.max(0, Math.min(index, maxIdx));

    // カード幅（gap含む）を計算して移動
    const cardWidth = cards[0].offsetWidth + 24; // 24 = gap
    slider.style.transform = `translateX(-${current * cardWidth}px)`;

    // ドット更新
    updateDots();
  }

  // ドットを生成・更新
  function buildDots() {
    dotsContainer.innerHTML = '';
    const count = getMaxIndex() + 1;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.className = `dot${i === current ? ' active' : ''}`;
      dot.setAttribute('aria-label', `${i + 1}枚目へ`);
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    }
  }

  function updateDots() {
    dotsContainer.querySelectorAll('.dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
    });
  }

  // 前へ
  prevBtn.addEventListener('click', () => goTo(current - 1));

  // 次へ
  nextBtn.addEventListener('click', () => goTo(current + 1));

  // リサイズ時に再初期化
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      current = Math.min(current, getMaxIndex());
      buildDots();
      goTo(current);
    }, 200);
  });

  // 初期化
  buildDots();

  // タッチスワイプ対応
  let touchStartX = 0;
  slider.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  slider.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goTo(current + 1);
      else goTo(current - 1);
    }
  }, { passive: true });
})();

/* =========================================
   7. 予約フォーム バリデーション
========================================= */
(function initForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  // エラーメッセージを表示するヘルパー
  function showError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  }

  // エラーをクリア
  function clearError(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  }

  // 電話番号の簡易バリデーション
  function isValidPhone(phone) {
    return /^[\d\-\(\)\s\+]{10,15}$/.test(phone.replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let isValid = true;

    // お名前
    const name = document.getElementById('name').value.trim();
    if (!name) {
      showError('nameError', 'お名前を入力してください。');
      isValid = false;
    } else {
      clearError('nameError');
    }

    // 電話番号
    const phone = document.getElementById('phone').value.trim();
    if (!phone) {
      showError('phoneError', '電話番号を入力してください。');
      isValid = false;
    } else if (!isValidPhone(phone)) {
      showError('phoneError', '正しい電話番号を入力してください。');
      isValid = false;
    } else {
      clearError('phoneError');
    }

    // 希望日時
    const date = document.getElementById('date').value;
    if (!date) {
      showError('dateError', '希望日時を選択してください。');
      isValid = false;
    } else {
      clearError('dateError');
    }

    // バリデーション通過時に送信完了を表示
    if (isValid) {
      const btn = form.querySelector('.btn--primary');
      btn.textContent = '送信中...';
      btn.disabled = true;

      // デモ用：1秒後に完了表示
      setTimeout(() => {
        form.innerHTML = `
          <div style="text-align:center; padding: 48px 0;">
            <div style="font-size:3rem; margin-bottom:16px;">✓</div>
            <h3 style="font-family: var(--font-serif); font-size:1.4rem; color:var(--color-navy); margin-bottom:12px;">
              ご送信ありがとうございます
            </h3>
            <p style="font-size:0.9rem; color:var(--color-text-muted); line-height:1.9;">
              内容を確認のうえ、担当者よりご連絡いたします。<br />
              お気軽にお問い合わせください。
            </p>
          </div>
        `;
      }, 1000);
    }
  });

  // 入力時にリアルタイムでエラーをクリア
  ['name', 'phone', 'date'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => clearError(`${id}Error`));
    }
  });
})();
