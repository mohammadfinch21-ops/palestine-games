/**
 * بطاقات لعبة القطار — أربع مراحل كشفية
 * إدارة جلسة السحب: mainDeck / tiebreakDeck منفصلان لكل مرحلة
 */
import { filterPlayableCards, isPlayableCard, isValidOption, isValidQuestion } from './card-validation.js';
import { isNativeApp, resolveFetchUrl } from './native-app.js';

let TRAIN_DECK = null;
let selectedLevelId = 'ashbal';
let cardsLoadState = 'idle';
let loadError = null;
let loadPromise = null;
let loadStartedAt = 0;

export const CARD_FETCH_TIMEOUT_MS = 15000;
export const CARDS_LOAD_STUCK_MS = 20000;
export const CARDS_LOAD_WATCHDOG_INTERVAL_MS = 2000;

/** @type {XMLHttpRequest[]} */
const activeCardXhrs = [];

/** Minimal playable deck when bundled JSON fetch fails on native WebView. */
const FALLBACK_TRAIN_DECK = {
  stats: { fallback: true },
  levels: {
    ashbal: {
      cards: [
        {
          id: 'fb-ash-1',
          question: 'القدس عاصمة فلسطين؟ صح أم خطأ',
          options: ['صح', 'خطأ'],
          correctAnswer: 'صح',
        },
        {
          id: 'fb-ash-2',
          question: 'غزة مدينة فلسطينية على البحر؟ صح أم خطأ',
          options: ['صح', 'خطأ'],
          correctAnswer: 'صح',
        },
      ],
    },
    scout: {
      cards: [
        {
          id: 'fb-sco-1',
          question: 'نابلس مدينة فلسطينية؟ صح أم خطأ',
          options: ['صح', 'خطأ'],
          correctAnswer: 'صح',
        },
      ],
    },
    rover: {
      cards: [
        {
          id: 'fb-rov-1',
          question: 'الخليل مدينة فلسطينية؟ صح أم خطأ',
          options: ['صح', 'خطأ'],
          correctAnswer: 'صح',
        },
      ],
    },
    advanced: {
      cards: [
        {
          id: 'fb-adv-1',
          question: 'يافا مدينة ساحلية فلسطينية؟ صح أم خطأ',
          options: ['صح', 'خطأ'],
          correctAnswer: 'صح',
        },
      ],
    },
  },
};

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

/** Wait for card JSON — retries load after native fetch path fix or slow startup. */
export async function ensureCardsReady() {
  if (areCardsReady()) return true;
  try {
    await loadCardData();
    return areCardsReady();
  } catch (err) {
    console.error('[questions] ensureCardsReady failed', err);
    return false;
  }
}

export function getCardsLoadState() {
  const elapsedMs = loadStartedAt ? Date.now() - loadStartedAt : 0;
  const stuck = cardsLoadState === 'loading' && elapsedMs >= CARDS_LOAD_STUCK_MS;
  let state = cardsLoadState;
  let error = loadError;
  if (stuck) {
    state = 'error';
    error = error || new Error(`انتهت مهلة تحميل البطاقات (${CARDS_LOAD_STUCK_MS / 1000}ث)`);
  }
  return {
    state,
    error,
    rawState: cardsLoadState,
    stuck,
    elapsedMs,
    count: getPlayableCards().length,
    level: selectedLevelId,
    stats: TRAIN_DECK?.stats || {},
  };
}

/** Abort hung XHR and force error — called by UI watchdog when promise never settles. */
export function forceCardsLoadTimeout(reason) {
  if (cardsLoadState !== 'loading') return false;
  for (const xhr of activeCardXhrs) {
    try {
      xhr.abort();
    } catch {
      /* ignore */
    }
  }
  activeCardXhrs.length = 0;
  loadPromise = null;
  loadStartedAt = 0;
  try {
    applyFallbackDeck();
    cardsLoadState = 'ready';
    loadError = null;
    notifyCardsLoadSettled();
    console.warn('[questions] forceCardsLoadTimeout — using fallback deck', reason);
    return true;
  } catch {
    cardsLoadState = 'error';
    loadError = new Error(reason || `انتهت مهلة تحميل البطاقات (${CARDS_LOAD_STUCK_MS / 1000}ث)`);
    notifyCardsLoadSettled();
    console.warn('[questions] forceCardsLoadTimeout', loadError.message);
    return true;
  }
}

function notifyCardsLoadSettled() {
  try {
    document.dispatchEvent(new CustomEvent('train-cards-load-settled'));
  } catch {
    /* non-browser */
  }
}

function fetchJsonWithTimeout(url, ms = CARD_FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeCardXhrs.push(xhr);
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const idx = activeCardXhrs.indexOf(xhr);
      if (idx >= 0) activeCardXhrs.splice(idx, 1);
      fn(value);
    };

    const timer = setTimeout(() => {
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
      finish(reject, new Error(`انتهت مهلة تحميل (${ms / 1000}ث): ${url}`));
    }, ms);

    xhr.open('GET', url, true);
    xhr.responseType = 'text';

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          finish(resolve, JSON.parse(xhr.responseText));
        } catch {
          finish(reject, new Error(`JSON غير صالح: ${url}`));
        }
        return;
      }
      finish(reject, new Error(`HTTP ${xhr.status}: ${url}`));
    };

    xhr.onerror = () => {
      finish(reject, new Error(`خطأ شبكة: ${url}`));
    };

    xhr.onabort = () => {
      if (!settled) {
        finish(reject, new Error(`أُلغي التحميل: ${url}`));
      }
    };

    try {
      xhr.send();
    } catch (err) {
      finish(reject, err);
    }
  });
}

function applyFallbackDeck() {
  TRAIN_DECK = {
    ...FALLBACK_TRAIN_DECK,
    levels: Object.fromEntries(
      Object.entries(FALLBACK_TRAIN_DECK.levels).map(([id, level]) => [
        id,
        { cards: filterPlayableCards(level.cards) },
      ]),
    ),
  };
  MEMORY_PAIRS.splice(0, MEMORY_PAIRS.length);
  if (!getCardsForLevel(selectedLevelId).length) {
    selectedLevelId = TRAIN_LEVELS.find((l) => getCardsForLevel(l.id).length)?.id || 'ashbal';
  }
  console.warn('[questions] using inline fallback deck');
}

function finalizeLoadedDeck(trainData, memoryData) {
  TRAIN_DECK = trainData;
  MEMORY_PAIRS.splice(0, MEMORY_PAIRS.length, ...(memoryData || []).filter((p) => p.isPlayable !== false));

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
}

/**
 * Synchronous native load from cards-native-bundle.js (classic script, no XHR).
 * @returns {boolean} true when deck is ready
 */
export function primeNativeCardsSync() {
  if (!isNativeApp()) return false;
  if (cardsLoadState === 'ready' && areCardsReady()) return true;

  const trainData = globalThis.__PT_TRAIN_DECK;
  const memoryData = globalThis.__PT_MEMORY_PAIRS;
  if (!trainData?.levels) return false;

  try {
    finalizeLoadedDeck(trainData, memoryData || []);
    cardsLoadState = 'ready';
    loadError = null;
    loadPromise = null;
    loadStartedAt = 0;
    notifyCardsLoadSettled();
    console.info('[questions] native bundle (sync)', {
      questions: getPlayableCards().length,
      memory: MEMORY_PAIRS.length,
    });
    return true;
  } catch (err) {
    console.warn('[questions] native bundle invalid', err);
    return false;
  }
}

/** Last resort on native — bundled deck, inline fallback, or error. */
export function forceNativeCardsReady() {
  if (areCardsReady()) return true;
  if (primeNativeCardsSync()) return true;
  try {
    applyFallbackDeck();
    cardsLoadState = 'ready';
    loadError = null;
    loadPromise = null;
    loadStartedAt = 0;
    notifyCardsLoadSettled();
    console.warn('[questions] forceNativeCardsReady — inline fallback');
    return true;
  } catch (err) {
    console.error('[questions] forceNativeCardsReady failed', err);
    return false;
  }
}

export async function loadCardData() {
  if (cardsLoadState === 'ready') {
    return { questions: getPlayableCards().length, memory: MEMORY_PAIRS.length };
  }

  if (isNativeApp() && primeNativeCardsSync()) {
    return { questions: getPlayableCards().length, memory: MEMORY_PAIRS.length };
  }

  if (loadPromise) return loadPromise;

  cardsLoadState = 'loading';
  loadError = null;
  loadStartedAt = Date.now();

  loadPromise = (async () => {
    if (isNativeApp()) {
      if (primeNativeCardsSync()) {
        return { questions: getPlayableCards().length, memory: MEMORY_PAIRS.length };
      }
    }

    const trainUrl = resolveFetchUrl('js/train-questions-by-level.json');
    const memoryUrl = resolveFetchUrl('js/memory-pairs-data.json');
    console.info('[questions] loading cards', {
      trainUrl,
      memoryUrl,
      origin: globalThis.location?.origin,
      native: isNativeApp(),
    });

    try {
      const [trainData, memoryData] = await Promise.all([
        fetchJsonWithTimeout(trainUrl),
        fetchJsonWithTimeout(memoryUrl),
      ]);
      finalizeLoadedDeck(trainData, memoryData);
    } catch (err) {
      console.error('[questions] card fetch failed', err);
      if (cardsLoadState !== 'loading') {
        throw loadError || err;
      }
      try {
        applyFallbackDeck();
      } catch (fallbackErr) {
        throw err?.message ? err : fallbackErr;
      }
    }

    if (cardsLoadState !== 'loading') {
      throw loadError || new Error('أُلغي تحميل البطاقات');
    }

    cardsLoadState = 'ready';
    loadStartedAt = 0;
    notifyCardsLoadSettled();
    return { questions: getPlayableCards().length, memory: MEMORY_PAIRS.length };
  })();

  try {
    return await loadPromise;
  } catch (err) {
    cardsLoadState = 'error';
    loadError = err;
    loadPromise = null;
    loadStartedAt = 0;
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
