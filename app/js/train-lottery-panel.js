import { isTrueFalseQuestion, isValidOption } from './card-validation.js';
import { shuffle } from './questions.js';
import { registerNativeTap, unregisterNativeTap } from './native-app.js';

/** Hardcoded fallback when deck is not ready (صح/خطأ). */
export const FALLBACK_LOTTERY_CARD = {
  id: 'fallback-lottery-tf',
  question: 'عاصمة فلسطين هي القدس.',
  options: ['صح', 'خطأ'],
  correctAnswer: 'صح',
  stepsCorrect: 3,
  stepsWrong: 1,
  isTrueFalse: true,
  levelName: 'قرعة',
};

export function getFallbackLotteryCard() {
  return { ...FALLBACK_LOTTERY_CARD };
}

/** Native APK panel, or mobile layout when Capacitor detection is late. */
export function shouldUseNativeLotteryPanel() {
  if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.() === true) {
    return true;
  }
  if (document.documentElement.classList.contains('native-app')) return true;
  if (document.body.classList.contains('train-mobile-layout')) return true;
  return false;
}

const panel = () => document.getElementById('train-lottery-panel');
const titleEl = () => document.getElementById('train-lottery-title');
const questionEl = () => document.getElementById('train-lottery-question');
const optionsEl = () => document.getElementById('train-lottery-options');

let optionTapSeq = 0;
const activeTapKeys = [];

/** Inject lottery panel when APK ships stale index.html without the element. */
export function createLotteryPanelDom() {
  let el = panel();
  if (el) return el;

  el = document.createElement('div');
  el.id = 'train-lottery-panel';
  el.className = 'train-lottery-panel hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="train-lottery-panel-inner">
      <h3 id="train-lottery-title"></h3>
      <p id="train-lottery-question"></p>
      <div id="train-lottery-options"></div>
    </div>
  `;
  document.body.appendChild(el);
  console.info('[train-lottery-panel] createLotteryPanelDom injected panel');
  return el;
}

function ensureLotteryPanelDom() {
  return panel() || createLotteryPanelDom();
}

function forcePanelVisible(el) {
  if (!el) return;
  if (!el.isConnected) document.body.appendChild(el);
  el.classList.remove('hidden');
  el.style.display = 'flex';
  el.style.zIndex = '999999';
  el.style.pointerEvents = 'auto';
  el.setAttribute('aria-hidden', 'false');
}

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
  return { options: shuffle([...options]), correctAnswer };
}

function clearOptionTaps() {
  activeTapKeys.forEach((key) => unregisterNativeTap(key));
  activeTapKeys.length = 0;
}

export function isNativeLotteryPanelOpen() {
  const el = panel();
  return Boolean(el && !el.classList.contains('hidden') && el.style.display !== 'none');
}

export function hideNativeLotteryPanel() {
  clearOptionTaps();
  const el = panel();
  if (el) {
    el.classList.add('hidden');
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
  }
  const opts = optionsEl();
  if (opts) opts.innerHTML = '';
}

/**
 * In-screen lottery question (native APK) — not a modal overlay.
 * @param {object} card
 * @param {string} playerName
 * @param {(correct: boolean, steps: number) => void} onComplete
 */
export function showNativeLotteryQuestion(card, playerName, onComplete) {
  const safeCard = card && prepareShuffledOptions(card) ? card : getFallbackLotteryCard();
  const el = ensureLotteryPanelDom();
  const title = titleEl();
  const question = questionEl();
  const optsContainer = optionsEl();

  if (!title || !question || !optsContainer) {
    console.error('[train-lottery-panel] missing inner DOM nodes after ensure');
    forcePanelVisible(el);
    if (title) title.textContent = `قرعة — ${playerName || 'اللاعب 1'}`;
    if (question) question.textContent = safeCard.question || '';
  }

  const prepared = prepareShuffledOptions(safeCard);
  const options = prepared?.options;
  if (!options || options.length < 2) {
    console.error('[train-lottery-panel] no options — showing fallback card UI anyway');
    forcePanelVisible(el);
    if (title) title.textContent = `قرعة — ${playerName || 'اللاعب 1'}`;
    if (question) question.textContent = getFallbackLotteryCard().question;
    return;
  }

  const correctAnswer = prepared.correctAnswer;
  const stepsCorrect = Math.max(0, Number(safeCard.stepsCorrect ?? 3) || 0);
  const stepsWrong = Math.max(0, Number(safeCard.stepsWrong ?? 1) || 0);

  hideNativeLotteryPanel();

  title.textContent = `قرعة — ${playerName}`;
  question.textContent = safeCard.question || '';
  optsContainer.innerHTML = '';

  let answered = false;

  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'train-lottery-option-btn btn-gold';
    btn.textContent = opt;
    btn.dir = 'rtl';
    btn.lang = 'ar';

    const tapKey = `lottery-opt-${++optionTapSeq}`;
    const handler = () => {
      if (answered) return;
      answered = true;
      const userWasCorrect = choiceMatches(opt, correctAnswer);
      const steps = userWasCorrect ? stepsCorrect : stepsWrong;

      optsContainer.querySelectorAll('.train-lottery-option-btn').forEach((b) => {
        b.disabled = true;
        const choice = b.textContent;
        if (choiceMatches(choice, correctAnswer)) b.classList.add('correct');
        else if (choiceMatches(choice, opt) && !userWasCorrect) b.classList.add('wrong');
      });

      setTimeout(() => {
        hideNativeLotteryPanel();
        onComplete?.(userWasCorrect, steps);
      }, 380);
    };

    btn.onclick = handler;
    btn.setAttribute('data-native-tap', tapKey);
    registerNativeTap(tapKey, handler);
    activeTapKeys.push(tapKey);
    optsContainer.appendChild(btn);
  });

  forcePanelVisible(el);
  console.info('[train-lottery-panel] showNativeLotteryQuestion visible', { playerName });
}
