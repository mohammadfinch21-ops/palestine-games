/**
 * أسئلة عامة عن مدن فلسطين — تُعرض عند الوقوف على مربع مدينة
 * مجموعة منفصلة عن أسئلة المراحل — تتبع مستخدمة لكل لاعب لكل مربع
 */
import { shuffle } from './questions.js';

let cityDeck = null;
let loadPromise = null;

const CITY_RECYCLE_EXCLUDE_MIN = 3;
const CITY_RECYCLE_EXCLUDE_MAX = 5;

/** cityUsedIds: Map<sessionKey, Set<cardId>> — sessionKey = square:playerId */
const cityUsedIds = new Map();
const cityDecks = new Map();
const cityRecentQueues = new Map();
const cityRecycleCounts = new Map();

export async function loadCityQuestions() {
  if (cityDeck) return cityDeck;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const res = await fetch('js/city-questions.json');
    if (!res.ok) {
      throw new Error(`city-questions.json — HTTP ${res.status}`);
    }
    cityDeck = await res.json();
    return cityDeck;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export function areCityQuestionsReady() {
  return Boolean(cityDeck?.cities && Object.keys(cityDeck.cities).length);
}

export function getCityQuestionCount() {
  if (!cityDeck?.cities) return 0;
  return Object.values(cityDeck.cities).reduce(
    (sum, entry) => sum + (Array.isArray(entry.questions) ? entry.questions.length : 0),
    0,
  );
}

export function resetCityQuestionSession() {
  cityUsedIds.clear();
  cityDecks.clear();
  cityRecentQueues.clear();
  cityRecycleCounts.clear();
}

function citySessionKey(square, playerId) {
  return `${String(square)}:${String(playerId ?? 'local')}`;
}

function cityCardId(square, raw) {
  const key = raw?.id || (raw?.question || '').trim().slice(0, 40);
  return `city-${square}-${key}`;
}

function getCityUsedSet(square, playerId) {
  const key = citySessionKey(square, playerId);
  if (!cityUsedIds.has(key)) cityUsedIds.set(key, new Set());
  return cityUsedIds.get(key);
}

function trackCityRecent(square, playerId, id) {
  const key = citySessionKey(square, playerId);
  const queue = cityRecentQueues.get(key) || [];
  queue.push(id);
  while (queue.length > CITY_RECYCLE_EXCLUDE_MAX + 2) queue.shift();
  cityRecentQueues.set(key, queue);
}

function buildCityRecycledPool(square, playerId, questions) {
  const key = citySessionKey(square, playerId);
  const recent = cityRecentQueues.get(key) || [];
  const excludeCount = Math.min(
    CITY_RECYCLE_EXCLUDE_MIN + Math.floor(Math.random() * (CITY_RECYCLE_EXCLUDE_MAX - CITY_RECYCLE_EXCLUDE_MIN + 1)),
    recent.length,
  );
  const exclude = new Set(recent.slice(-excludeCount));
  let recycled = questions.filter((q) => !exclude.has(cityCardId(square, q)));
  if (!recycled.length) recycled = [...questions];
  cityRecycleCounts.set(key, (cityRecycleCounts.get(key) || 0) + 1);
  getCityUsedSet(square, playerId).clear();
  return shuffle(recycled);
}

export function getCityQuestionStats(square, playerId = 'local') {
  const entry = cityDeck?.cities?.[String(square)];
  const total = entry?.questions?.length || 0;
  const remaining = entry?.questions
    ? entry.questions.filter((q) => !getCityUsedSet(square, playerId).has(cityCardId(square, q))).length
    : 0;
  const sessionKey = citySessionKey(square, playerId);
  return {
    total,
    remaining,
    recycled: cityRecycleCounts.get(sessionKey) || 0,
  };
}

/** @returns {import('./modal.js').QuestionCardLike | null} */
export function pickCityQuestion(square, cityName = '', playerId = 'local') {
  const squareKey = String(square);
  const entry = cityDeck?.cities?.[squareKey];
  if (!entry?.questions?.length) return null;

  const sessionKey = citySessionKey(square, playerId);
  const used = getCityUsedSet(square, playerId);
  let deck = cityDecks.get(sessionKey);
  if (!deck?.remaining.length) {
    let cards = entry.questions.filter((q) => !used.has(cityCardId(square, q)));
    let recycled = false;
    if (!cards.length) {
      cards = buildCityRecycledPool(square, playerId, entry.questions);
      recycled = true;
    }
    deck = { remaining: shuffle(cards), recycled };
    cityDecks.set(sessionKey, deck);
  }

  const raw = deck.remaining.pop();
  if (!raw) return null;

  const id = cityCardId(square, raw);
  used.add(id);
  trackCityRecent(square, playerId, id);

  return {
    id,
    question: raw.question,
    options: raw.options,
    correctAnswer: raw.correctAnswer,
    fact: raw.fact || '',
    levelName: 'أسئلة عامة',
    level: 'city',
    color: 'green',
    cityName: cityName || entry.name || '',
    square,
  };
}
