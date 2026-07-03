import {
  isPlayableCard,
  isTrueFalseQuestion,
  isValidQuestion,
  isValidOption,
} from './card-validation.js';
import { pickRandomCard, pickTiebreakCard, shuffle } from './questions.js';
import { pickCityQuestion } from './city-questions.js';

let overlay;
let titleEl;
let bodyEl;
let actionsEl;
let onCloseCallback = null;

export function initModal() {
  overlay = document.getElementById('modal-overlay');
  titleEl = document.getElementById('modal-title');
  bodyEl = document.getElementById('modal-body');
  actionsEl = document.getElementById('modal-actions');

  overlay.querySelector('.modal-close').addEventListener('click', hideModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideModal();
  });
}

export function showModal({ title, bodyHtml, actions = [], onClose = null }) {
  onCloseCallback = onClose;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  actionsEl.innerHTML = '';
  actionsEl.classList.remove('question-card-actions');
  actions.forEach(({ label, className = 'btn-primary', onClick, keepOpen = false }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = className;
    btn.addEventListener('click', () => {
      onClick?.();
      if (!keepOpen) hideModal();
    });
    actionsEl.appendChild(btn);
  });
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

export function isModalOpen() {
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

export function hideModal() {
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  onCloseCallback?.();
  onCloseCallback = null;
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
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

function choiceMatches(a, b) {
  return normalizeChoice(a) === normalizeChoice(b);
}

function findMatchingOption(answer, options) {
  if (!answer || !Array.isArray(options)) return null;
  return options.find((opt) => choiceMatches(opt, answer)) ?? null;
}

function resolveCorrectAnswer(card, sourceOptions) {
  const originalOptions = Array.isArray(card.options)
    ? card.options.filter(isValidOption)
    : [...sourceOptions];

  if (card.correctAnswer) {
    const fromSource = findMatchingOption(card.correctAnswer, sourceOptions);
    if (fromSource) return fromSource;
    const fromOriginal = findMatchingOption(card.correctAnswer, originalOptions);
    if (fromOriginal) {
      const mapped = findMatchingOption(fromOriginal, sourceOptions);
      if (mapped) return mapped;
      if (isTrueFalseQuestion(card.question || '')) return fromOriginal;
    }
  }

  if (typeof card.correctAnswerIndex === 'number' && originalOptions[card.correctAnswerIndex]) {
    const indexed = originalOptions[card.correctAnswerIndex];
    const fromSource = findMatchingOption(indexed, sourceOptions);
    if (fromSource) return fromSource;
    return indexed;
  }

  const fallback = findMatchingOption(card.correctAnswer, originalOptions);
  return fallback || sourceOptions[0] || 'صح';
}

/** Shuffle display order; resolve correct answer from source options before shuffle. */
function prepareShuffledOptions(card) {
  const sourceOptions = deriveOptions(card);
  if (!sourceOptions) return null;
  const correctAnswer = resolveCorrectAnswer(card, sourceOptions);
  return { options: shuffle(sourceOptions), correctAnswer };
}

function buildQuestionCardHtml(card, levelName, stepsCorrect = 3, stepsWrong = 1, modalOptions = {}) {
  const question = escapeHtml(card.question || '—');
  const theme = getCardTheme(card);
  const hex = LEVEL_HEX[theme] || LEVEL_HEX.yellow;
  const cityName = modalOptions.cityName || card.cityName || '';
  const cityBonus = modalOptions.cityBonus;
  const factHtml = card.fact
    ? `<p class="pt-city-fact" dir="rtl" lang="ar">${escapeHtml(card.fact)}</p>`
    : '';

  let stepsHintHtml;
  if (typeof cityBonus === 'number') {
    const bonus = Math.abs(cityBonus);
    const dirLabel = cityBonus >= 0 ? 'تتقدم' : 'ترتد';
    stepsHintHtml = `
      <div class="pt-steps-hint pt-steps-hint--city">
        <span class="pt-step pt-step--correct">✓ صح: ${dirLabel} ${bonus} مربعات</span>
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

function renderOptionButtons(options, theme, onChoice) {
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
    btn.addEventListener('click', () => onChoice(opt, btnWrap));
    btnWrap.appendChild(btn);
  });

  actionsEl.appendChild(btnWrap);
}

function pickReplacementCard(modalOptions) {
  const levelId = modalOptions.levelId;
  if (modalOptions.citySquare != null) {
    return pickCityQuestion(modalOptions.citySquare, modalOptions.cityName);
  }
  if (modalOptions.tiebreak) {
    return pickTiebreakCard(levelId);
  }
  return pickRandomCard(levelId);
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

  showModal({
    title: modalTitle,
    bodyHtml: buildQuestionCardHtml(card, levelName, stepsCorrect, stepsWrong, modalOptions),
    actions: [],
    onClose: null,
  });

  const handleChoice = (userChoice, btnWrap) => {
    const userWasCorrect = choiceMatches(userChoice, correctAnswer);
    const steps = userWasCorrect ? stepsCorrect : stepsWrong;
    let completed = false;

    btnWrap.querySelectorAll('.question-card-option-btn').forEach((b) => {
      b.disabled = true;
      if (choiceMatches(b.dataset.choice, correctAnswer)) b.classList.add('correct');
      else if (choiceMatches(b.dataset.choice, userChoice) && !userWasCorrect) b.classList.add('wrong');
    });

    const finish = () => {
      if (completed) return;
      completed = true;
      onComplete?.(userWasCorrect, steps, card);
      if (!modalOptions.deferClose) hideModal();
    };

    setTimeout(finish, 450);
  };

  renderOptionButtons(options, theme, handleChoice);
}
