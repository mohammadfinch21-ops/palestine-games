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

    // Client-side safety net: drop any card with garbled text
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

/** Deck per level for the current game session — draw without replacement, then smart recycle. */
const sessionDecks = new Map();

/** Card ids already drawn this game (tiebreak + main gameplay). */
const usedQuestionIds = new Set();

/** Order of recently drawn ids — used to avoid immediate repeats on recycle. */
const recentDrawOrder = [];

/** How many times the pool was reshuffled this session (per level). */
const recycleCounts = new Map();

/** Minimum cards before we warn the user that repeats are likely. */
export const LOW_POOL_THRESHOLD = 8;

function getCardId(card) {
  return card?.id ?? null;
}

function markQuestionUsed(card) {
  const id = getCardId(card);
  if (!id) return;
  usedQuestionIds.add(id);
  recentDrawOrder.push(id);
  const poolSize = getValidatedPool().length;
  const maxRecent = Math.max(1, Math.min(5, Math.floor(poolSize / 2) || 1));
  while (recentDrawOrder.length > maxRecent * 2) {
    recentDrawOrder.shift();
  }
}

function getValidatedPool(levelId = selectedLevelId) {
  return getPlayableCards(levelId).filter(
    (c) => isPlayableCard(c) && isValidQuestion(c.question) && c.options?.every(isValidOption),
  );
}

function getUnusedPool(levelId = selectedLevelId) {
  return getValidatedPool(levelId).filter((c) => {
    const id = getCardId(c);
    return id ? !usedQuestionIds.has(id) : true;
  });
}

function buildRecycledPool(levelId = selectedLevelId) {
  const pool = getValidatedPool(levelId);
  if (!pool.length) return [];

  const cooldown = Math.max(1, Math.min(3, pool.length - 1));
  const recentIds = new Set(recentDrawOrder.slice(-cooldown));
  let recycled = pool.filter((c) => !recentIds.has(getCardId(c)));
  if (!recycled.length) recycled = [...pool];

  recycleCounts.set(levelId, (recycleCounts.get(levelId) || 0) + 1);
  usedQuestionIds.clear();
  return shuffle(recycled);
}

function getAvailablePool(levelId = selectedLevelId) {
  const unused = getUnusedPool(levelId);
  if (unused.length) return { cards: unused, recycled: false };
  const recycled = buildRecycledPool(levelId);
  return { cards: recycled, recycled: recycled.length > 0 };
}

function refillSessionDeck(levelId) {
  const { cards, recycled } = getAvailablePool(levelId);
  if (!cards.length) {
    sessionDecks.delete(levelId);
    return null;
  }
  const deck = { remaining: shuffle(cards), recycled };
  sessionDecks.set(levelId, deck);
  return deck;
}

/** Clear shuffled session decks (all levels or one). Call on new game or level change. */
export function resetQuestionSession(levelId = null) {
  if (levelId != null) {
    sessionDecks.delete(levelId);
    recycleCounts.delete(levelId);
    return;
  }
  sessionDecks.clear();
  usedQuestionIds.clear();
  recentDrawOrder.length = 0;
  recycleCounts.clear();
}

export function getSessionQuestionStats(levelId = selectedLevelId) {
  const total = getValidatedPool(levelId).length;
  const remaining = getUnusedPool(levelId).length;
  const used = Math.max(0, total - remaining);
  const recycled = recycleCounts.get(levelId) || 0;
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
  if (stats.isEmpty) return 'لا توجد أسئلة في هذه المرحلة.';
  if (stats.isLow) {
    return `⚠️ ${stats.total} سؤالاً فقط في مرحلة ${getTrainLevelInfo(levelId).nameArabic} — قد تتكرر الأسئلة أثناء اللعب.`;
  }
  return null;
}

function drawFromSessionDeck(levelId = selectedLevelId, options = {}) {
  const pool = getValidatedPool(levelId);
  if (!pool.length) return { card: null, recycled: false };

  let deck = sessionDecks.get(levelId);
  if (!deck?.remaining.length) {
    deck = refillSessionDeck(levelId);
    if (!deck) return { card: null, recycled: false };
  }

  const card = deck.remaining.pop() ?? null;
  if (card && !options.tiebreak) markQuestionUsed(card);
  return { card, recycled: Boolean(deck.recycled) };
}

/** Pick a card for tiebreak (القرعة) or main gameplay — main-game draws mark id as used. */
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
