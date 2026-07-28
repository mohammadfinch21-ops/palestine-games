import {
  isPlayableCard,
  isTrueFalseQuestion,
  isValidQuestion,
  isValidOption,
} from './card-validation.js';
import { drawQuestion, shuffle } from './questions.js';
import { pickCityQuestion } from './city-questions.js';
import { bindTap, isNativeApp, registerNativeTap, unregisterNativeTap } from './native-app.js';

let overlay;
let titleEl;
let bodyEl;
let actionsEl;
let onCloseCallback = null;
const modalButtonHandlers = new WeakMap();
let modalTapSeq = 0;

function resolveModalTapTarget(e) {
  const touch = e.changedTouches?.[0];
  if (touch) {
    const hit = document.elementFromPoint(touch.clientX, touch.clientY);
    return hit?.closest?.('.modal-close, #modal-actions button, .question-card-option-btn') ?? null;
  }
  return e.target?.closest?.('.modal-close, #modal-actions button, .question-card-option-btn') ?? null;
}

function unbindModalButton(btn) {
  if (!btn) return;
  const key = btn.getAttribute('data-native-tap');
  if (key?.startsWith('modal-')) unregisterNativeTap(key);
  modalButtonHandlers.delete(btn);
  btn.removeAttribute('data-native-tap');
  btn.onclick = null;
}

function unbindModalButtons(root) {
  root?.querySelectorAll?.('button')?.forEach?.((btn) => unbindModalButton(btn));
}

function bindModalButton(btn, handler) {
  if (!btn || typeof handler !== 'function') return;
  unbindModalButton(btn);
  modalButtonHandlers.set(btn, handler);

  if (isNativeApp()) {
    const key = `modal-${++modalTapSeq}`;
    btn.setAttribute('data-native-tap', key);
    registerNativeTap(key, handler);
    btn.style.touchAction = 'manipulation';
    btn.style.cursor = 'pointer';
    btn.onclick = (e) => {
      e?.preventDefault?.();
      handler(e);
    };
    return;
  }

  bindTap(btn, handler);
}

function restoreAdsAfterModal() {
  if (!isNativeApp()) return;
  const screen = document.querySelector('.screen.active')?.id?.replace('screen-', '') ?? 'menu';
  import('./ads/ad-manager.js')
    .then(({ refreshBannerAds }) => refreshBannerAds(screen))
    .catch(() => {});
}

export function initModal() {
  overlay = document.getElementById('modal-overlay');
  titleEl = document.getElementById('modal-title');
  bodyEl = document.getElementById('modal-body');
  actionsEl = document.getElementById('modal-actions');

  const closeBtn = overlay.querySelector('.modal-close');
  if (closeBtn) bindModalButton(closeBtn, hideModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !overlay.classList.contains('modal--question')) hideModal();
  });

  if (isNativeApp()) {
    overlay.addEventListener(
      'touchend',
      (e) => {
        if (overlay.classList.contains('hidden')) return;
        const btn = resolveModalTapTarget(e);
        if (!btn || btn.disabled) return;
        const handler = modalButtonHandlers.get(btn);
        if (!handler) return;
        e.preventDefault();
        e.stopPropagation();
        handler(e);
      },
      { passive: false, capture: true },
    );
  }
}

export function showModal({ title, bodyHtml, actions = [], onClose = null }) {
  onCloseCallback = onClose;
  overlay.classList.remove('modal--question');
  const closeBtn = overlay.querySelector('.modal-close');
  if (closeBtn) closeBtn.hidden = false;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  unbindModalButtons(actionsEl);
  actionsEl.innerHTML = '';
  actionsEl.classList.remove('question-card-actions');
  actions.forEach(({ label, className = 'btn-primary', onClick, keepOpen = false }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = className;
    const runAction = () => {
      try {
        onClick?.();
      } catch (err) {
        console.error('modal action failed', err);
      }
      if (!keepOpen) hideModal();
    };
    bindModalButton(btn, runAction);
    actionsEl.appendChild(btn);
  });
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  if (isNativeApp()) {
    import('./ads/ad-manager.js')
      .then(({ refreshBannerAds, hideNativeBannerImmediate }) => {
        hideNativeBannerImmediate?.();
        refreshBannerAds('modal');
      })
      .catch(() => {});
  }
}

export function isModalOpen() {
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

export function hideModal() {
  overlay.classList.add('hidden');
  overlay.classList.remove('modal--question');
  overlay.setAttribute('aria-hidden', 'true');
  const closeBtn = overlay.querySelector('.modal-close');
  if (closeBtn) closeBtn.hidden = false;
  onCloseCallback?.();
  onCloseCallback = null;
  restoreAdsAfterModal();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LEVEL_HEX = {
  yellow: '#eab308',
  green: '#16a34a',
  red: '#dc2626',
  brown: '#92400e',
  purple: '#5c2d91',
};

function deriveOptions(card) {
  const q = card.question || '';
  if (Array.isArray(card.options) && card.options.length >= 2) {
    const clean = card.options.filter(isValidOption);
    if (clean.length >= 2) {
      if (isTrueFalseQuestion(q)) return ['صح', 'خطأ'];
      return clean;
    }
  }
  if (isTrueFalseQuestion(q)) return ['صح', 'خطأ'];
  return null;
}

function getCardTheme(card) {
  return card.color || card.level || 'yellow';
}

function normalizeChoice(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function choiceMatches(a, b) {
  return normalizeChoice(a) === normalizeChoice(b);
}

function prepareShuffledOptions(card) {
  const options = deriveOptions(card);
  if (!options) return null;
  const correctAnswer = card.correctAnswer ?? card.answer ?? options[0];
  const shuffled = shuffle([...options]);
  return { options: shuffled, correctAnswer };
}

function buildQuestionCardHtml(card, levelName, stepsCorrect, stepsWrong, modalOptions) {
  const theme = getCardTheme(card);
  const hex = LEVEL_HEX[theme] || LEVEL_HEX.yellow;
  const question = escapeHtml(card.question);
  const cityName = modalOptions.cityName || card.cityName || '';
  const factHtml = card.fact
    ? `<p class="pt-fact" dir="rtl" lang="ar">${escapeHtml(card.fact)}</p>`
    : '';

  let stepsHintHtml;
  if (modalOptions.cityBonus != null) {
    stepsHintHtml = `
      <div class="pt-steps-hint">
        <span class="pt-step pt-step--correct">✓ صح: +${modalOptions.cityBonus} للمدينة</span>
        <span class="pt-step pt-step--wrong">✗ خطأ: تبقى مكانك</span>
      </div>`;
  } else {
    stepsHintHtml = `
      <div class="pt-steps-hint">
        <span class="pt-step pt-step--correct">✓ صح: ${stepsCorrect} خطوات</span>
        <span class="pt-step pt-step--wrong">✗ خطأ: ${stepsWrong} ${stepsWrong === 1 ? 'خطوة' : 'خطوات'}</span>
      </div>`;
  }

  return `
    <div class="question-card-wrap">
      <div class="pt-card pt-card--html pt-card--${theme}${modalOptions.cityBonus != null ? ' pt-card--city' : ''}" style="--level-color:${hex}">
        <div class="pt-card-header">
          <span class="pt-level-badge">${escapeHtml(levelName || '')}</span>
          ${cityName ? `<span class="pt-city-badge">🏙️ ${escapeHtml(cityName)}</span>` : ''}
        </div>
        <section class="pt-section pt-question">
          <span class="pt-label">السؤال</span>
          <p class="pt-question-text" dir="rtl" lang="ar">${question}</p>
          ${factHtml}
        </section>
        ${stepsHintHtml}
      </div>
    </div>
  `;
}

function bindOptionButton(btn, opt, btnWrap, onChoice) {
  bindModalButton(btn, () => {
    if (btn.disabled || btnWrap.dataset.answered === '1') return;
    btnWrap.dataset.answered = '1';
    onChoice(opt, btnWrap);
  });
}

function renderOptionButtons(options, theme, onChoice) {
  unbindModalButtons(actionsEl);
  actionsEl.innerHTML = '';
  actionsEl.classList.add('question-card-actions');

  const hint = document.createElement('p');
  hint.className = 'question-card-hint';
  hint.textContent = 'اختر إجابتك:';
  hint.dir = 'rtl';
  actionsEl.appendChild(hint);

  const btnWrap = document.createElement('div');
  btnWrap.className = `question-card-option-btns question-card-option-btns--${theme}`;
  btnWrap.dir = 'rtl';

  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'question-card-option-btn btn-outline';
    btn.textContent = opt;
    btn.dir = 'rtl';
    btn.lang = 'ar';
    btn.dataset.choice = opt;
    bindOptionButton(btn, opt, btnWrap, onChoice);
    btnWrap.appendChild(btn);
  });

  actionsEl.appendChild(btnWrap);
}

function pickReplacementCard(modalOptions) {
  const levelId = modalOptions.levelId;
  if (modalOptions.citySquare != null) {
    return pickCityQuestion(
      modalOptions.citySquare,
      modalOptions.cityName,
      modalOptions.cityPlayerId ?? 'local',
    );
  }
  return drawQuestion(levelId, { tiebreak: Boolean(modalOptions.tiebreak) }).card;
}

export function showQuestionCardModal(card, onComplete, modalOptions = {}) {
  const retries = modalOptions._retries || 0;
  const levelId = modalOptions.levelId;

  if (!card) {
    showModal({
      title: 'تنبيه',
      bodyHtml: '<p>لم تُحمَّل بطاقات الأسئلة بعد. انتظر اكتمال التحميل أو أعد تحميل الصفحة.</p>',
      actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => onComplete?.(false, 0, null) }],
    });
    return;
  }

  if (!isValidQuestion(card.question) || !isPlayableCard(card)) {
    if (retries < 8) {
      const next = pickReplacementCard(modalOptions);
      if (next && next.id !== card.id) {
        return showQuestionCardModal(next, onComplete, { ...modalOptions, _retries: retries + 1 });
      }
    }
    showModal({
      title: 'تنبيه',
      bodyHtml: '<p>نص هذا السؤال غير مقروء — تم تخطيه.</p>',
      actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => onComplete?.(false, 0, card) }],
    });
    return;
  }

  const prepared = prepareShuffledOptions(card);
  const options = prepared?.options;
  if (!options || options.length < 2 || !options.every(isValidOption)) {
    if (retries < 8) {
      const next = pickReplacementCard(modalOptions);
      if (next && next.id !== card.id) {
        return showQuestionCardModal(next, onComplete, { ...modalOptions, _retries: retries + 1 });
      }
    }
    showModal({
      title: 'تنبيه',
      bodyHtml: '<p>خيارات هذه البطاقة غير متوفرة أو غير مقروءة.</p>',
      actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => onComplete?.(false, 0, card) }],
    });
    return;
  }

  if (!isPlayableCard({ ...card, options: deriveOptions(card) })) {
    if (retries < 8) {
      const next = pickReplacementCard(modalOptions);
      if (next && next.id !== card.id) {
        return showQuestionCardModal(next, onComplete, { ...modalOptions, _retries: retries + 1 });
      }
    }
    showModal({
      title: 'تنبيه',
      bodyHtml: '<p>بيانات هذه البطاقة غير صالحة للعب.</p>',
      actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => onComplete?.(false, 0, card) }],
    });
    return;
  }

  const correctAnswer = prepared.correctAnswer;
  const stepsCorrect = Math.max(0, Number(card.stepsCorrect ?? 3) || 0);
  const stepsWrong = Math.max(0, Number(card.stepsWrong ?? 1) || 0);
  const theme = getCardTheme(card);
  const levelName = card.levelName || '';

  const modalTitle =
    modalOptions.title ||
    (modalOptions.cityBonus != null && (modalOptions.cityName || card.cityName)
      ? `أسئلة عامة — ${modalOptions.cityName || card.cityName}`
      : `سؤال — ${levelName}`);

  let resolved = false;
  const safeComplete = (userWasCorrect, steps, answeredCard = card) => {
    if (resolved) return;
    resolved = true;
    if (!modalOptions.deferClose) hideModal();
    try {
      onComplete?.(userWasCorrect, steps, answeredCard);
    } catch (err) {
      console.error('showQuestionCardModal onComplete failed', err);
    }
  };

  showModal({
    title: modalTitle,
    bodyHtml: buildQuestionCardHtml(card, levelName, stepsCorrect, stepsWrong, modalOptions),
    actions: [],
    onClose: () => {
      if (!resolved) {
        const fallbackSteps = modalOptions.cityBonus != null ? 0 : stepsWrong;
        resolved = true;
        try {
          onComplete?.(false, fallbackSteps, card);
        } catch (err) {
          console.error('showQuestionCardModal onClose failed', err);
        }
      }
    },
  });
  overlay.classList.add('modal--question');
  const closeBtn = overlay.querySelector('.modal-close');
  if (closeBtn) closeBtn.hidden = true;

  const handleChoice = (userChoice, btnWrap) => {
    if (resolved) return;
    const userWasCorrect = choiceMatches(userChoice, correctAnswer);
    const steps = userWasCorrect ? stepsCorrect : stepsWrong;

    btnWrap.querySelectorAll('.question-card-option-btn').forEach((b) => {
      b.disabled = true;
      if (choiceMatches(b.dataset.choice, correctAnswer)) b.classList.add('correct');
      else if (choiceMatches(b.dataset.choice, userChoice) && !userWasCorrect) b.classList.add('wrong');
    });

    requestAnimationFrame(() => {
      setTimeout(() => safeComplete(userWasCorrect, steps, card), 380);
    });
  };

  renderOptionButtons(options, theme, handleChoice);
}
