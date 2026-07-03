/**
 * بطاقات لعبة القطار — أربع مراحل كشفية
 */
import { filterPlayableCards, isPlayableCard, isValidOption, isValidQuestion, isTfOptions, isTrueFalseQuestion } from './card-validation.js';

let TRAIN_DECK = null;
let selectedLevelId = 'ashbal';
let cardsLoadState = 'idle';
let loadError = null;
let loadPromise = null;

/** المراحل الأربع — ألوان من كرت PDF */
export const TRAIN_LEVELS = [
  { id: 'ashbal', nameArabic: 'أشبال', color: 'yellow', hex: '#eab308' },
  { id: 'scout', nameArabic: 'كشاف', color: 'green', hex: '#16a34a' },
  { id: 'rover', nameArabic: 'جوالة', color: 'red', hex: '#dc2626' },
  { id: 'advanced', nameArabic: 'المتقدم', color: 'brown', hex: '#92400e' },
];

/** مراحل لعبة الذاكرة */
export const MEMORY_STAGES = [
  { id: 'ashbal', nameArabic: 'أشبال', color: 'yellow', hex: '#e6b422' },
  { id: 'scout', nameArabic: 'كشاف', color: 'green', hex: '#3d9b4a' },
  { id: 'advanced', nameArabic: 'متقدم', color: 'brown', hex: '#8b5a2b' },
  { id: 'rover', nameArabic: 'جوالة', color: 'red', hex: '#c62828' },
];

let QUESTION_CARDS = [];
let MEMORY_PAIRS = [];

const RECYCLE_EXCLUDE_MIN = 3;
const RECYCLE_EXCLUDE_MAX = 5;

/** بطاقات مستخدمة لكل مرحلة ونوع مجموعة — main / tiebreak منفصلان تماماً */
const sessionUsedIds = new Map();

/** ترتيب آخر السحوبات لكل مجموعة — يُستثنى 3–5 عند إعادة الخلط */
const recentDrawQueues = new Map();

/** مجموعات مخلوطة جاهزة للسحب */
const sessionDecks = new Map();

/** عدد مرات إعادة الخلط لكل مجموعة */
const recycleCounts = new Map();

/** Minimum cards before we warn the user that the deck is small. */
export const LOW_POOL_THRESHOLD = 8;

export function getTrainLevelInfo(levelId = selectedLevelId) {
  return TRAIN_LEVELS.find((l) => l.id === levelId) || TRAIN_LEVELS[0];
}

export function setTrainLevel(levelId) {
  if (TRAIN_LEVELS.some((l) => l.id === levelId) && getCardsForLevel(levelId).length) {
    selectedLevelId = levelId;
    resetQuestionSession();
    document.dispatchEvent(new CustomEvent('train-level-changed', { detail: { levelId } }));
  }
}

export function getTrainLevel() {
  return selectedLevelId;
}

export function getCardsForLevel(levelId = selectedLevelId) {
  if (!TRAIN_DECK?.levels) return [];
  return filterPlayableCards(TRAIN_DECK.levels[levelId]?.cards || []);
}

export function getPlayableCards(levelId = selectedLevelId) {
  return getCardsForLevel(levelId);
}

export function areCardsReady() {
  return cardsLoadState === 'ready' && TRAIN_LEVELS.some((l) => getCardsForLevel(l.id).length > 0);
}

export function getCardsLoadState() {
  return {
    state: cardsLoadState,
    error: loadError,
    count: getPlayableCards().length,
    level: selectedLevelId,
    stats: TRAIN_DECK?.stats || {},
  };
}

export async function loadCardData() {
  if (cardsLoadState === 'ready') {
    return { questions: getPlayableCards().length, memory: MEMORY_PAIRS.length };
  }
  if (loadPromise) return loadPromise;

  cardsLoadState = 'loading';
  loadError = null;

  loadPromise = (async () => {
    const [trainRes, mRes] = await Promise.all([
      fetch('js/train-questions-by-level.json'),
      fetch('js/memory-pairs-data.json'),
    ]);
    if (!trainRes.ok) {
      throw new Error(`train-questions-by-level.json — HTTP ${trainRes.status}`);
    }
    if (!mRes.ok) {
      throw new Error(`memory-pairs-data.json — HTTP ${mRes.status}`);
    }
    TRAIN_DECK = await trainRes.json();
    const mData = await mRes.json();
    MEMORY_PAIRS.splice(0, MEMORY_PAIRS.length, ...mData.filter((p) => p.isPlayable !== false));

    if (TRAIN_DECK?.levels) {
      for (const level of Object.values(TRAIN_DECK.levels)) {
        if (Array.isArray(level.cards)) {
          level.cards = filterPlayableCards(level.cards);
        }
      }
    }

    if (!TRAIN_LEVELS.some((l) => getCardsForLevel(l.id).length)) {
      throw new Error('لا توجد بطاقات — شغّل build_train_questions.py');
    }

    if (!getCardsForLevel(selectedLevelId).length) {
      selectedLevelId = TRAIN_LEVELS.find((l) => getCardsForLevel(l.id).length)?.id || 'ashbal';
    }

    cardsLoadState = 'ready';
    return { questions: getPlayableCards().length, memory: MEMORY_PAIRS.length };
  })();

  try {
    return await loadPromise;
  } catch (err) {
    cardsLoadState = 'error';
    loadError = err;
    loadPromise = null;
    throw err;
  }
}

/** @deprecated */
export function getProgressQuestions() {
  return getPlayableCards();
}

export function getQuestionCards() {
  return QUESTION_CARDS;
}

export function getMemoryPairs() {
  return MEMORY_PAIRS;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function poolKey(levelId, tiebreak) {
  return `${levelId}:${tiebreak ? 'tiebreak' : 'main'}`;
}

function getUsedSet(levelId, tiebreak) {
  const key = poolKey(levelId, tiebreak);
  if (!sessionUsedIds.has(key)) sessionUsedIds.set(key, new Set());
  return sessionUsedIds.get(key);
}

function getCardId(card) {
  if (card?.id != null && card.id !== '') return String(card.id);
  const q = (card?.question || '').trim();
  return q ? `syn:${q}` : null;
}

function trackRecentDraw(levelId, tiebreak, id) {
  const key = poolKey(levelId, tiebreak);
  const queue = recentDrawQueues.get(key) || [];
  queue.push(id);
  while (queue.length > RECYCLE_EXCLUDE_MAX + 2) queue.shift();
  recentDrawQueues.set(key, queue);
}

function markCardUsed(card, levelId, tiebreak) {
  const id = getCardId(card);
  if (!id) return;
  getUsedSet(levelId, tiebreak).add(id);
  trackRecentDraw(levelId, tiebreak, id);
}

function getValidatedPool(levelId = selectedLevelId) {
  return getPlayableCards(levelId).filter(
    (c) => isPlayableCard(c) && isValidQuestion(c.question) && c.options?.every(isValidOption),
  );
}

/** بطاقات لم تُسحب بعد في هذه المجموعة — لا تكرار حتى تُستنفد كلها */
function getUnusedPool(levelId, tiebreak) {
  const used = getUsedSet(levelId, tiebreak);
  return getValidatedPool(levelId).filter((c) => {
    const id = getCardId(c);
    return id && !used.has(id);
  });
}

function getRecycleExcludeCount(recentLength) {
  if (!recentLength) return 0;
  const want = RECYCLE_EXCLUDE_MIN + Math.floor(Math.random() * (RECYCLE_EXCLUDE_MAX - RECYCLE_EXCLUDE_MIN + 1));
  return Math.min(want, recentLength);
}

function buildRecycledPool(levelId, tiebreak) {
  const pool = getValidatedPool(levelId);
  if (!pool.length) return [];

  const key = poolKey(levelId, tiebreak);
  const recent = recentDrawQueues.get(key) || [];
  const excludeCount = getRecycleExcludeCount(recent.length);
  const exclude = new Set(recent.slice(-excludeCount));

  let recycled = pool.filter((c) => !exclude.has(getCardId(c)));
  if (!recycled.length) recycled = [...pool];

  recycleCounts.set(key, (recycleCounts.get(key) || 0) + 1);
  getUsedSet(levelId, tiebreak).clear();
  return shuffle(recycled);
}

function getAvailablePool(levelId, tiebreak) {
  const unused = getUnusedPool(levelId, tiebreak);
  if (unused.length) return { cards: unused, recycled: false };
  const recycled = buildRecycledPool(levelId, tiebreak);
  return { cards: recycled, recycled: recycled.length > 0 };
}

function refillSessionDeck(levelId, tiebreak) {
  const key = poolKey(levelId, tiebreak);
  const { cards, recycled } = getAvailablePool(levelId, tiebreak);
  if (!cards.length) {
    sessionDecks.delete(key);
    return null;
  }
  const deck = { remaining: shuffle(cards), recycled };
  sessionDecks.set(key, deck);
  return deck;
}

function clearPoolState(levelId, tiebreak) {
  const key = poolKey(levelId, tiebreak);
  sessionDecks.delete(key);
  sessionUsedIds.delete(key);
  recentDrawQueues.delete(key);
  recycleCounts.delete(key);
}

/** Clear session state (all levels or one). Call on new game or level change. */
export function resetQuestionSession(levelId = null) {
  if (levelId != null) {
    clearPoolState(levelId, false);
    clearPoolState(levelId, true);
    return;
  }
  sessionDecks.clear();
  sessionUsedIds.clear();
  recentDrawQueues.clear();
  recycleCounts.clear();
}

/** After lottery: fresh main deck only — قرعة منفصلة ولا تُنقص مجموعة اللعب */
export function beginMainGameSession(levelId = selectedLevelId) {
  clearPoolState(levelId, false);
}

export function getSessionQuestionStats(levelId = selectedLevelId) {
  const total = getValidatedPool(levelId).length;
  const remaining = getUnusedPool(levelId, false).length;
  const used = Math.max(0, total - remaining);
  const recycled = recycleCounts.get(poolKey(levelId, false)) || 0;
  return {
    total,
    remaining,
    used,
    recycled,
    isLow: total > 0 && total < LOW_POOL_THRESHOLD,
    isEmpty: total === 0,
    willRecycleNext: remaining === 0 && total > 0,
  };
}

export function getLowPoolMessage(levelId = selectedLevelId) {
  const stats = getSessionQuestionStats(levelId);
  const levelName = getTrainLevelInfo(levelId).nameArabic;
  if (stats.isEmpty) return `لا توجد أسئلة في مرحلة ${levelName}.`;
  if (stats.isLow) {
    return `⚠️ ${stats.total} سؤالاً في مرحلة ${levelName} — لن يتكرر سؤال حتى تُستنفد المجموعة.`;
  }
  return null;
}

function drawFromSessionDeck(levelId = selectedLevelId, options = {}) {
  const tiebreak = Boolean(options.tiebreak);
  if (!getValidatedPool(levelId).length) return { card: null, recycled: false };

  const key = poolKey(levelId, tiebreak);
  let deck = sessionDecks.get(key);
  if (!deck?.remaining.length) {
    deck = refillSessionDeck(levelId, tiebreak);
    if (!deck) return { card: null, recycled: false };
  }

  const card = deck.remaining.pop() ?? null;
  if (card) markCardUsed(card, levelId, tiebreak);
  return { card, recycled: Boolean(deck.recycled) };
}

/** Pick a card for tiebreak (القرعة) or main gameplay. */
export function pickRandomCard(levelId = selectedLevelId, options = {}) {
  return drawFromSessionDeck(levelId, options).card;
}

export function pickTiebreakCard(levelId = selectedLevelId) {
  return pickRandomCard(levelId, { tiebreak: true });
}

export function getPlayableMemoryPairs() {
  return MEMORY_PAIRS.filter((p) => p.isPlayable !== false);
}

export function getTotalMemoryPairs() {
  return getPlayableMemoryPairs().length;
}

export function getMemoryStageCount() {
  return MEMORY_STAGES.length;
}

export function getMemoryStageInfo(stageOneBased) {
  return MEMORY_STAGES[Math.max(0, stageOneBased - 1)] || MEMORY_STAGES[0];
}

export function getMemoryPairsForStage(stageOneBased) {
  const stage = getMemoryStageInfo(stageOneBased);
  if (!stage) return [];
  return getPlayableMemoryPairs().filter((p) => p.stage === stage.id);
}

export function getMemoryStageCounts() {
  return MEMORY_STAGES.map((stage, index) => ({
    ...stage,
    stageNumber: index + 1,
    count: getMemoryPairsForStage(index + 1).length,
  }));
}

export function getLevelCounts() {
  return TRAIN_LEVELS.map((l) => ({
    ...l,
    count: getCardsForLevel(l.id).length,
  }));
}
