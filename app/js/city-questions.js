/**
 * أسئلة عامة عن مدن فلسطين — تُعرض عند الوقوف على مربع مدينة
 */
import { pickRandom } from './questions.js';

let cityDeck = null;
let loadPromise = null;

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

/** @returns {import('./modal.js').QuestionCardLike | null} */
export function pickCityQuestion(square, cityName = '') {
  const entry = cityDeck?.cities?.[String(square)];
  if (!entry?.questions?.length) return null;

  const raw = pickRandom(entry.questions);
  return {
    id: `city-${square}-${raw.id || raw.question?.slice(0, 12)}`,
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
