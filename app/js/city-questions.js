/**
 * أسئلة عامة عن مدن فلسطين — تُعرض عند الوقوف على مربع مدينة
 * مجموعة منفصلة عن أسئلة المراحل — لا تكرار حتى تُستنفد أسئلة المدينة
 */
import { shuffle } from './questions.js';

let cityDeck = null;
let loadPromise = null;

const CITY_RECYCLE_EXCLUDE_MIN = 3;
const CITY_RECYCLE_EXCLUDE_MAX = 5;

/** cityUsedIds: Map<square, Set<cardId>> */
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

function cityCardId(square, raw) {
  const key = raw?.id || (raw?.question || '').trim().slice(0, 40);
  return `city-${square}-${key}`;
}

function getCityUsedSet(square) {
  const key = String(square);
  if (!cityUsedIds.has(key)) cityUsedIds.set(key, new Set());
  return cityUsedIds.get(key);
}

function trackCityRecent(square, id) {
  const key = String(square);
  const queue = cityRecentQueues.get(key) || [];
  queue.push(id);
  while (queue.length > CITY_RECYCLE_EXCLUDE_MAX + 2) queue.shift();
  cityRecentQueues.set(key, queue);
}

function buildCityRecycledPool(square, questions) {
  const key = String(square);
  const recent = cityRecentQueues.get(key) || [];
  const excludeCount = Math.min(
    CITY_RECYCLE_EXCLUDE_MIN + Math.floor(Math.random() * (CITY_RECYCLE_EXCLUDE_MAX - CITY_RECYCLE_EXCLUDE_MIN + 1)),
    recent.length,
  );
  const exclude = new Set(recent.slice(-excludeCount));
  let recycled = questions.filter((q) => !exclude.has(cityCardId(square, q)));
  if (!recycled.length) recycled = [...questions];
  cityRecycleCounts.set(key, (cityRecycleCounts.get(key) || 0) + 1);
  getCityUsedSet(square).clear();
  return shuffle(recycled);
}

export function getCityQuestionStats(square) {
  const entry = cityDeck?.cities?.[String(square)];
  const total = entry?.questions?.length || 0;
  const remaining = entry?.questions
    ? entry.questions.filter((q) => !getCityUsedSet(square).has(cityCardId(square, q))).length
    : 0;
  return {
    total,
    remaining,
    recycled: cityRecycleCounts.get(String(square)) || 0,
  };
}

/** @returns {import('./modal.js').QuestionCardLike | null} */
export function pickCityQuestion(square, cityName = '') {
  const key = String(square);
  const entry = cityDeck?.cities?.[key];
  if (!entry?.questions?.length) return null;

  const used = getCityUsedSet(square);
  let deck = cityDecks.get(key);
  if (!deck?.remaining.length) {
    let cards = entry.questions.filter((q) => !used.has(cityCardId(square, q)));
    let recycled = false;
    if (!cards.length) {
      cards = buildCityRecycledPool(square, entry.questions);
      recycled = true;
    }
    deck = { remaining: shuffle(cards), recycled };
    cityDecks.set(key, deck);
  }

  const raw = deck.remaining.pop();
  if (!raw) return null;

  const id = cityCardId(square, raw);
  used.add(id);
  trackCityRecent(square, id);

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
