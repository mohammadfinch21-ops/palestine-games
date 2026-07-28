/**
 * بطاقات لعبة القطار — أربع مراحل كشفية
 * إدارة جلسة السحب: mainDeck / tiebreakDeck منفصلان لكل مرحلة
 */
import { filterPlayableCards, isPlayableCard, isValidOption, isValidQuestion } from './card-validation.js';

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

/** Minimum cards before we warn the user that the deck is small. */
export const LOW_POOL_THRESHOLD = 8;

/**
 * @typedef {object} LevelSession
 * @property {object[]} mainDeck
 * @property {object[]} tiebreakDeck
 * @property {Set<string>} tiebreakUsed
 * @property {string[]} lastMainDraws
 * @property {string[]} lastTiebreakDraws
 * @property {number} mainCycleCount
 * @property {number} tiebreakCycleCount
 */

/** @type {Map<string, LevelSession>} */
const levelSessions = new Map();

let questionDebug = false;
try {
  questionDebug = new URLSearchParams(globalThis.location?.search || '').has('qdebug');
} catch {
  /* non-browser */
}

function qlog(...args) {
  if (questionDebug) console.debug('[questions]', ...args);
}

export function setQuestionDebug(enabled) {
  questionDebug = Boolean(enabled);
}

export function isQuestionDebugEnabled() {
  return questionDebug;
}

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

function notifyCardsLoadSettled() {
  try {
    document.dispatchEvent(new CustomEvent('train-cards-load-settled'));
  } catch {
    /* non-browser */
  }
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
    notifyCardsLoadSettled();
    return { questions: getPlayableCards().length, memory: MEMORY_PAIRS.length };
  })();

  try {
    return await loadPromise;
  } catch (err) {
    cardsLoadState = 'error';
    loadError = err;
    loadPromise = null;
    notifyCardsLoadSettled();
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

function getCardId(card) {
  if (card?.id != null && card.id !== '') return String(card.id);
  const q = (card?.question || '').trim();
  return q ? `syn:${q}` : null;
}

function getValidatedPool(levelId = selectedLevelId) {
  return getPlayableCards(levelId).filter(
    (c) => isPlayableCard(c) && isValidQuestion(c.question) && c.options?.every(isValidOption),
  );
}

function getRecycleExcludeCount(recentLength) {
  if (!recentLength) return 0;
  const want = RECYCLE_EXCLUDE_MIN + Math.floor(Math.random() * (RECYCLE_EXCLUDE_MAX - RECYCLE_EXCLUDE_MIN + 1));
  return Math.min(want, recentLength);
}

function createLevelSession() {
  return {
    mainDeck: [],
    tiebreakDeck: [],
    tiebreakUsed: new Set(),
    lastMainDraws: [],
    lastTiebreakDraws: [],
    mainCycleCount: 0,
    tiebreakCycleCount: 0,
  };
}

function getLevelSession(levelId = selectedLevelId) {
  if (!levelSessions.has(levelId)) {
    levelSessions.set(levelId, createLevelSession());
  }
  return levelSessions.get(levelId);
}

function trimRecent(queue) {
  while (queue.length > RECYCLE_EXCLUDE_MAX + 2) queue.shift();
}

function buildFirstMainDeck(levelId) {
  const session = getLevelSession(levelId);
  const all = getValidatedPool(levelId);
  let pool = all.filter((c) => {
    const id = getCardId(c);
    return id && !session.tiebreakUsed.has(id);
  });
  if (!pool.length) pool = [...all];
  session.mainDeck = shuffle(pool);
  qlog('buildFirstMainDeck', levelId, {
    total: all.length,
    deck: session.mainDeck.length,
    tiebreakExcluded: session.tiebreakUsed.size,
  });
}

function buildRecycledMainDeck(levelId) {
  const session = getLevelSession(levelId);
  const all = getValidatedPool(levelId);
  const excludeCount = getRecycleExcludeCount(session.lastMainDraws.length);
  const exclude = new Set(session.lastMainDraws.slice(-excludeCount));
  let pool = all.filter((c) => !exclude.has(getCardId(c)));
  if (!pool.length) pool = [...all];
  session.mainDeck = shuffle(pool);
  qlog('buildRecycledMainDeck', levelId, {
    total: all.length,
    deck: session.mainDeck.length,
    excluded: excludeCount,
    cycle: session.mainCycleCount,
  });
}

function buildTiebreakDeck(levelId) {
  const session = getLevelSession(levelId);
  const all = getValidatedPool(levelId);
  let pool = all.filter((c) => {
    const id = getCardId(c);
    return id && !session.tiebreakUsed.has(id);
  });

  if (!pool.length) {
    session.tiebreakCycleCount += 1;
    const excludeCount = getRecycleExcludeCount(session.lastTiebreakDraws.length);
    const exclude = new Set(session.lastTiebreakDraws.slice(-excludeCount));
    pool = all.filter((c) => !exclude.has(getCardId(c)));
    if (!pool.length) pool = [...all];
    session.tiebreakUsed.clear();
    qlog('tiebreak recycle', levelId, { cycle: session.tiebreakCycleCount, excluded: excludeCount });
  }

  session.tiebreakDeck = shuffle(pool);
  qlog('buildTiebreakDeck', levelId, { deck: session.tiebreakDeck.length });
}

/** Clear session state (all levels or one). Call on new game or level change. */
export function resetQuestionSession(levelId = null) {
  if (levelId != null) {
    levelSessions.delete(levelId);
    qlog('resetQuestionSession', levelId);
    return;
  }
  levelSessions.clear();
  qlog('resetQuestionSession all');
}

/**
 * After lottery: fresh main deck — يستبعد أسئلة القرعة من الدورة الأولى فقط
 * tiebreakUsed يبقى لتتبع أسئلة القرعة دون تقليص خاطئ لمجموعة اللعب
 */
export function beginMainGameSession(levelId = selectedLevelId) {
  const session = getLevelSession(levelId);
  session.mainDeck = [];
  session.lastMainDraws = [];
  session.mainCycleCount = 0;
  buildFirstMainDeck(levelId);
  qlog('beginMainGameSession', levelId, getSessionStats(levelId));
}

/**
 * Unified draw API — all gameplay paths must use this.
 * @returns {{ card: object|null, recycled: boolean, pool: 'main'|'tiebreak' }}
 */
export function drawQuestion(levelId = selectedLevelId, options = {}) {
  const tiebreak = Boolean(options.tiebreak);
  if (!getValidatedPool(levelId).length) {
    return { card: null, recycled: false, pool: tiebreak ? 'tiebreak' : 'main' };
  }

  const session = getLevelSession(levelId);

  if (tiebreak) {
    if (!session.tiebreakDeck.length) buildTiebreakDeck(levelId);
    const recycled = session.tiebreakCycleCount > 0;
    const card = session.tiebreakDeck.pop() ?? null;
    if (card) {
      const id = getCardId(card);
      if (id) {
        session.tiebreakUsed.add(id);
        session.lastTiebreakDraws.push(id);
        trimRecent(session.lastTiebreakDraws);
      }
      qlog('draw tiebreak', levelId, id, 'remaining', session.tiebreakDeck.length);
    }
    return { card, recycled, pool: 'tiebreak' };
  }

  if (!session.mainDeck.length) {
    if (session.mainCycleCount === 0 && session.lastMainDraws.length > 0) {
      session.mainCycleCount = 1;
      buildRecycledMainDeck(levelId);
    } else if (session.mainCycleCount === 0) {
      buildFirstMainDeck(levelId);
    } else {
      buildRecycledMainDeck(levelId);
    }
  }

  const recycled = session.mainCycleCount > 0;
  const card = session.mainDeck.pop() ?? null;
  if (card) {
    const id = getCardId(card);
    if (id) {
      session.lastMainDraws.push(id);
      trimRecent(session.lastMainDraws);
    }
    qlog('draw main', levelId, id, 'remaining', session.mainDeck.length, 'cycle', session.mainCycleCount);
  }
  return { card, recycled, pool: 'main' };
}

export function getSessionStats(levelId = selectedLevelId) {
  const session = getLevelSession(levelId);
  const total = getValidatedPool(levelId).length;
  const firstCycleSize = Math.max(
    0,
    total - (session.mainCycleCount === 0 ? session.tiebreakUsed.size : 0),
  );
  return {
    levelId,
    total,
    mainRemaining: session.mainDeck.length,
    tiebreakRemaining: session.tiebreakDeck.length,
    tiebreakUsedCount: session.tiebreakUsed.size,
    mainCycleCount: session.mainCycleCount,
    tiebreakCycleCount: session.tiebreakCycleCount,
    firstCycleSize,
    isLow: total > 0 && total < LOW_POOL_THRESHOLD,
    isEmpty: total === 0,
    willRecycleNext: session.mainDeck.length === 0 && total > 0,
  };
}

export function getSessionQuestionStats(levelId = selectedLevelId) {
  const stats = getSessionStats(levelId);
  const cycleSize = stats.mainCycleCount === 0 ? stats.firstCycleSize : stats.total;
  const remaining = stats.mainRemaining;
  const used = Math.max(0, cycleSize - remaining);
  return {
    total: stats.total,
    remaining,
    used,
    recycled: stats.mainCycleCount,
    isLow: stats.isLow,
    isEmpty: stats.isEmpty,
    willRecycleNext: stats.willRecycleNext,
    tiebreakUsed: stats.tiebreakUsedCount,
    firstCycleSize: stats.firstCycleSize,
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

/** Pick a card for tiebreak (القرعة) or main gameplay. */
export function pickRandomCard(levelId = selectedLevelId, options = {}) {
  return drawQuestion(levelId, options).card;
}

export function pickTiebreakCard(levelId = selectedLevelId) {
  return drawQuestion(levelId, { tiebreak: true }).card;
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
