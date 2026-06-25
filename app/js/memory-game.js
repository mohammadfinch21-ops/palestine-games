import {
  getMemoryPairsForStage,
  getMemoryStageCount,
  getMemoryStageInfo,
  getMemoryStageCounts,
  getTotalMemoryPairs,
  shuffle,
} from './questions.js';
import { MEMORY_RULES } from './board-data.js';
import { showModal, hideModal } from './modal.js';
import {
  onMemoryPairMatched,
  onMemoryComplete,
  onMemoryRestart,
  showRewardedAd,
} from './ads/ad-manager.js';

export function initMemoryGame() {
  let cards = [];
  let flipped = [];
  let matchedCount = 0;
  let moves = 0;
  let lock = false;
  let flipBackTimer = null;
  let timer = null;
  let seconds = 0;
  let activePairs = [];
  let currentStage = 1;
  let totalStages = getMemoryStageCount();
  let totalPairsAll = getTotalMemoryPairs();
  let globalMatchedPairs = 0;
  /** @type {'single' | 'sequential' | null} */
  let playMode = null;

  const pickerEl = document.getElementById('memory-stage-picker');
  const gameAreaEl = document.getElementById('memory-game-area');
  const stageSelectorEl = document.getElementById('memory-stage-selector');
  const playAllBtn = document.getElementById('memory-play-all-btn');
  const boardEl = document.getElementById('memory-board');
  const movesEl = document.getElementById('memory-moves');
  const pairsEl = document.getElementById('memory-pairs');
  const totalEl = document.getElementById('memory-total');
  const globalPairsEl = document.getElementById('memory-global-pairs');
  const globalTotalEl = document.getElementById('memory-global-total');
  const globalProgressEl = document.getElementById('memory-global-progress');
  const stageLabelEl = document.getElementById('memory-stage-label');
  const stageBadgeEl = document.getElementById('memory-stage-badge');
  const stageBarEl = document.querySelector('.memory-stage-bar');
  const timeEl = document.getElementById('memory-time');
  const messageEl = document.getElementById('memory-message');
  const restartBtn = document.getElementById('memory-restart');
  const changeStageBtn = document.getElementById('memory-change-stage');
  const rulesBtn = document.getElementById('memory-rules-btn');
  const rewardHintBtn = document.getElementById('memory-reward-hint-btn');
  const nextStageBtn = document.getElementById('memory-next-stage');
  const progressFillEl = document.getElementById('memory-progress-fill');
  let hintUsedThisGame = false;

  globalTotalEl.textContent = totalPairsAll;

  rulesBtn.addEventListener('click', () => {
    showModal({ title: 'طريقة اللعب — بطاقات الذاكرة', bodyHtml: MEMORY_RULES });
  });

  if (restartBtn) {
    restartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      restartCurrentStage();
    });
  }

  if (changeStageBtn) {
    changeStageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showPicker();
    });
  }

  nextStageBtn.addEventListener('click', advanceToNextStage);

  playAllBtn?.addEventListener('click', () => startSequentialPlay());

  rewardHintBtn.addEventListener('click', () => {
    if (hintUsedThisGame || lock || matchedCount >= activePairs.length) return;
    showRewardedAd({
      title: '🎬 شاهد إعلاناً — كشف زوج واحد',
      onReward: () => {
        hintUsedThisGame = true;
        revealRandomPair();
        rewardHintBtn.disabled = true;
        messageEl.textContent = '🎁 تم كشف زوج — استمر!';
      },
    });
  });

  function renderStageSelector() {
    if (!stageSelectorEl) return;
    const stages = getMemoryStageCounts();
    stageSelectorEl.innerHTML = stages
      .map(
        (stage) => `
      <button type="button"
        class="level-btn memory-stage-btn level-btn--${stage.color}"
        data-stage="${stage.stageNumber}"
        ${stage.count === 0 ? 'disabled' : ''}
        style="--level-hex:${stage.hex}"
        title="${stage.count} زوج">
        <span class="level-btn-dot"></span>
        <span class="level-btn-name">${stage.nameArabic}</span>
        <span class="level-btn-count">${stage.count} زوج</span>
      </button>`,
      )
      .join('');

    stageSelectorEl.querySelectorAll('.memory-stage-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stageNum = Number(btn.dataset.stage);
        if (!stageNum || btn.disabled) return;
        startSingleStage(stageNum);
      });
    });
  }

  function showPicker() {
    hideModal();
    onMemoryRestart();
    playMode = null;
    stopTimer();
    clearTimeout(flipBackTimer);
    flipBackTimer = null;
    boardEl.innerHTML = '';
    if (pickerEl) pickerEl.hidden = false;
    if (gameAreaEl) gameAreaEl.hidden = true;
    totalStages = getMemoryStageCount();
    totalPairsAll = getTotalMemoryPairs();
    renderStageSelector();
  }

  function showGameArea() {
    if (pickerEl) pickerEl.hidden = true;
    if (gameAreaEl) gameAreaEl.hidden = false;
  }

  function updateGlobalProgressVisibility() {
    if (!globalProgressEl) return;
    globalProgressEl.hidden = playMode === 'single';
  }

  function startSingleStage(stageOneBased) {
    playMode = 'single';
    currentStage = stageOneBased;
    globalMatchedPairs = 0;
    showGameArea();
    updateGlobalProgressVisibility();
    startStage();
    boardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startSequentialPlay() {
    playMode = 'sequential';
    currentStage = 1;
    globalMatchedPairs = 0;
    showGameArea();
    updateGlobalProgressVisibility();
    globalTotalEl.textContent = totalPairsAll;
    startStage();
    boardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function revealRandomPair() {
    const unmatched = cards.filter((c) => !c.matched);
    if (unmatched.length < 2) return;
    const pairIds = [...new Set(unmatched.map((c) => c.pairId))];
    const targetPair = pairIds[Math.floor(Math.random() * pairIds.length)];
    unmatched.filter((c) => c.pairId === targetPair).forEach((c) => {
      c.matched = true;
      c.flipped = true;
    });
    matchedCount += 1;
    updateStats();
    render();
    if (matchedCount === activePairs.length) {
      onStageComplete();
    } else {
      onMemoryPairMatched(globalMatchedPairs + matchedCount);
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function startTimer() {
    clearInterval(timer);
    seconds = 0;
    timeEl.textContent = formatTime(0);
    timer = setInterval(() => {
      seconds++;
      timeEl.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  function pairMatchKey(pair) {
    return pair.matchKey || pair.id;
  }

  function cardsMatch(a, b) {
    if (a.id === b.id) return false;
    return a.matchKey === b.matchKey || a.pairId === b.pairId;
  }

  function buildCards() {
    const deck = [];
    activePairs.forEach((pair) => {
      const matchKey = pairMatchKey(pair);
      const card = {
        pairId: pair.id,
        matchKey,
        image: pair.image,
        label: pair.label,
      };
      deck.push({ ...card, id: `${pair.id}-a` });
      deck.push({ ...card, id: `${pair.id}-b` });
    });
    return shuffle(deck);
  }

  function cardBackHtml(card) {
    return `<img src="${card.image}" alt="${card.label}" class="memory-card-img" loading="lazy" />`;
  }

  function render() {
    boardEl.innerHTML = cards
      .map(
        (card) => `
      <div class="memory-card ${card.matched ? 'matched' : ''} ${card.flipped ? 'flipped' : ''} ${card.justMatched ? 'just-matched' : ''}"
           data-id="${card.id}" role="button" tabindex="0" aria-label="${card.label}">
        <div class="memory-card-inner">
          <div class="memory-face memory-front"></div>
          <div class="memory-face memory-back">${cardBackHtml(card)}</div>
        </div>
      </div>`,
      )
      .join('');

    boardEl.querySelectorAll('.memory-card').forEach((el) => {
      el.addEventListener('click', () => onCardClick(el.dataset.id));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick(el.dataset.id);
        }
      });
    });
  }

  function updateStageUI() {
    const info = getMemoryStageInfo(currentStage);
    stageLabelEl.textContent = `مرحلة ${info.nameArabic} (${currentStage} من ${totalStages})`;
    if (stageBadgeEl) {
      stageBadgeEl.textContent = info.nameArabic;
      stageBadgeEl.dataset.stage = info.id;
    }
    if (stageBarEl) {
      stageBarEl.dataset.stage = info.id;
      stageBarEl.dataset.stageColor = info.color;
    }
  }

  function updateStats() {
    movesEl.textContent = moves;
    pairsEl.textContent = matchedCount;
    globalPairsEl.textContent = globalMatchedPairs + matchedCount;
    if (progressFillEl && activePairs.length) {
      const pct = Math.round((matchedCount / activePairs.length) * 100);
      progressFillEl.style.width = `${pct}%`;
    }
    if (stageBarEl) {
      stageBarEl.classList.toggle('memory-stage-bar--complete', matchedCount >= activePairs.length && activePairs.length > 0);
    }
  }

  function finishGame() {
    stopTimer();
    nextStageBtn.hidden = true;
    messageEl.textContent = `أحسنت! أكملت جميع ${totalPairsAll} زوجاً! 🏅`;
    showModal({
      title: '🎉 فوز كامل!',
      bodyHtml: `<p>أكملت <strong>جميع ${totalPairsAll} زوجاً</strong> من بطاقات الذاكرة!</p><p>المحاولات في المرحلة الأخيرة: <strong>${moves}</strong></p><p>الوقت في المرحلة الأخيرة: <strong>${formatTime(seconds)}</strong></p>`,
      actions: [
        {
          label: 'العب مجدداً',
          className: 'btn-gold',
          onClick: () => showPicker(),
        },
      ],
    });
    setTimeout(() => onMemoryComplete(), 0);
  }

  function finishSingleStage() {
    stopTimer();
    nextStageBtn.hidden = true;
    const stageInfo = getMemoryStageInfo(currentStage);
    messageEl.textContent = `أحسنت! أكملت مرحلة ${stageInfo.nameArabic}! 🏅`;
    showModal({
      title: `🎉 مرحلة ${stageInfo.nameArabic} مكتملة!`,
      bodyHtml: `<p>أكملت مرحلة <strong>${stageInfo.nameArabic}</strong> — <strong>${activePairs.length}</strong> زوجاً!</p><p>المحاولات: <strong>${moves}</strong></p><p>الوقت: <strong>${formatTime(seconds)}</strong></p>`,
      actions: [
        {
          label: 'اختيار مرحلة أخرى',
          className: 'btn-outline',
          onClick: () => showPicker(),
        },
        {
          label: 'العب مجدداً',
          className: 'btn-gold',
          onClick: () => startSingleStage(currentStage),
        },
      ],
    });
    setTimeout(() => onMemoryComplete(), 0);
  }

  function onStageComplete() {
    stopTimer();
    globalMatchedPairs += activePairs.length;
    updateStats();
    nextStageBtn.hidden = false;

    if (playMode === 'single') {
      finishSingleStage();
      return;
    }

    if (currentStage >= totalStages) {
      finishGame();
      return;
    }

    const stageInfo = getMemoryStageInfo(currentStage);
    messageEl.textContent = `أكملت مرحلة ${stageInfo.nameArabic}! انتقل للمرحلة التالية`;
    showModal({
      title: `🎉 مرحلة ${stageInfo.nameArabic} مكتملة!`,
      bodyHtml: `<p>أكملت مرحلة <strong>${stageInfo.nameArabic}</strong> (${currentStage} من ${totalStages})!</p><p>المحاولات: <strong>${moves}</strong></p><p>الوقت: <strong>${formatTime(seconds)}</strong></p><p>التقدّم الكلي: <strong>${globalMatchedPairs}</strong> من <strong>${totalPairsAll}</strong> زوج</p>`,
      actions: [
        {
          label: 'المرحلة التالية →',
          className: 'btn-gold',
          onClick: () => advanceToNextStage(),
        },
      ],
    });
  }

  function advanceToNextStage() {
    if (playMode !== 'sequential' || currentStage >= totalStages) return;
    hideModal();
    currentStage += 1;
    if (stageBarEl) {
      stageBarEl.classList.add('memory-stage-bar--transition');
      setTimeout(() => stageBarEl.classList.remove('memory-stage-bar--transition'), 500);
    }
    startStage();
  }

  function onCardClick(id) {
    if (lock) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.matched || card.flipped) return;

    if (flipped.length === 0 && moves === 0) startTimer();

    card.flipped = true;
    flipped.push(card);
    render();

    if (flipped.length < 2) return;

    lock = true;
    moves++;
    updateStats();

    const [a, b] = flipped;
    if (cardsMatch(a, b)) {
      clearTimeout(flipBackTimer);
      flipBackTimer = null;
      a.matched = true;
      b.matched = true;
      a.flipped = true;
      b.flipped = true;
      a.justMatched = true;
      b.justMatched = true;
      matchedCount++;
      flipped = [];
      lock = false;
      messageEl.textContent = 'ممتاز! زوج متطابق ✓';
      messageEl.classList.remove('memory-message--miss');
      messageEl.classList.add('memory-message--success');
      render();
      setTimeout(() => {
        a.justMatched = false;
        b.justMatched = false;
        render();
      }, 700);
      updateStats();
      onMemoryPairMatched(globalMatchedPairs + matchedCount);

      if (matchedCount === activePairs.length) {
        onStageComplete();
      }
    } else {
      messageEl.textContent = 'لا يوجد تطابق — حاول مجدداً';
      messageEl.classList.remove('memory-message--success');
      messageEl.classList.add('memory-message--miss');
      clearTimeout(flipBackTimer);
      flipBackTimer = setTimeout(() => {
        a.flipped = false;
        b.flipped = false;
        flipped = [];
        lock = false;
        flipBackTimer = null;
        render();
      }, 900);
    }
  }

  function startStage() {
    clearTimeout(flipBackTimer);
    flipBackTimer = null;
    stopTimer();
    seconds = 0;
    hintUsedThisGame = false;
    rewardHintBtn.disabled = false;
    nextStageBtn.hidden = true;

    activePairs = getMemoryPairsForStage(currentStage);
    totalEl.textContent = activePairs.length;
    if (playMode === 'single') {
      globalTotalEl.textContent = activePairs.length;
    } else {
      globalTotalEl.textContent = totalPairsAll;
    }
    cards = buildCards().map((c) => ({ ...c, flipped: false, matched: false }));
    flipped = [];
    matchedCount = 0;
    moves = 0;
    lock = false;
    updateStageUI();
    updateGlobalProgressVisibility();
    const stageInfo = getMemoryStageInfo(currentStage);
    messageEl.textContent = `مرحلة ${stageInfo.nameArabic}: اقلب بطاقتين وابحث عن الصورة المتطابقة`;
    messageEl.classList.remove('memory-message--success', 'memory-message--miss');
    updateStats();
    timeEl.textContent = '0:00';
    render();
  }

  function restartCurrentStage() {
    hideModal();
    onMemoryRestart();
    if (playMode === 'single') {
      globalMatchedPairs = 0;
    } else if (playMode === 'sequential') {
      globalMatchedPairs = getMemoryStageCounts()
        .slice(0, currentStage - 1)
        .reduce((sum, stage) => sum + stage.count, 0);
    }
    startStage();
    boardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showPicker();
}
