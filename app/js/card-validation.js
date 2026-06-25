/**
 * Client-side validation — mirrors validate_cards.py / extract_card_text.py
 * Ensures user never sees garbled OCR text.
 */

const TF_RE = /صح\s*(?:أو|ام|أم|او|ا)\s*خط/i;
const GARBAGE_CHARS_RE = /[<>|`\\[\];_{}|+]/;
const LATIN_OR_MIXED_RE = /[a-zA-Z]|[\[\];_{}|\\+]|[<>]|\d(?=[^\d\s\u0600-\u06FF.,،؟?])|(?<=[^\d\s\u0600-\u06FF])[\d٠-٩](?=[^\d\s\u0600-\u06FF])/;
const REPEATED_LETTER_RE = /([\u0600-\u06FF])\1{2,}/;
const SPACED_LETTERS_RE = /(?:^|\s)([\u0600-\u06FF\u0660-\u0669])(?:\s+[\u0600-\u06FF\u0660-\u0669]){2,}/;
const QUESTION_GARBAGE_RE = /30;136|\/85!|٥٥ت٥٥|9٦٥8ه|5٥7\s*073|188100|و\s*ة\s*با|لعبة\s*قطار|scout4pal|Global\s*Scout/i;
const OCR_TYPO_RE = /آحر|مديه|جىوب|\sمي\s|الشلط|اللسم|العذبة|الخربطة|المربب|المعجر|بعادل\s*أجر|الديال[هة]|الرسسم|الذيانة|الإسلامت|أدمر|داثري|مريعي|البا\s*المات|الأقصىء|الجنوبيء|الهدينة|بطلق|المعالب|1\s*\.\s*0\s*194|لرمل|لوجد|لرمر|المسحد|اللقص\s|خط[اأ]ء\s*ام/i;
const QUESTION_INDICATORS = [
  '؟', '?', 'صح', 'خطأ', 'خطا', 'نقول', 'اذكر', 'من ', 'ما ', 'كم ', 'هل ',
  'أين', 'اين', 'متى', 'أو', 'بحيرة', 'مدن', 'مدينة', 'فلسطين',
];
const OCR_GARBAGE_FRAGMENTS = [
  'ادحر', 'تللال', 'ديئ', 'فلسطب', 'الأتز', 'آيل', 'سذر', 'شلس',
  '1فه', 'ا9', 'd9 ', 'م٧٥', 'م سا', '5 ذا', '>0', '01920',
  '9ma', 'كذi', 'لقصى', 'ؤضع', 'اللرض', 'التملة', 'آ9l',
  'صهبون', 'القهب', 'القهيون', 'فلسطبن', 'مدبنة', 'القدبمة',
  'م لبعد', 'آيل ', 'سذرذ', 'لبثان', 'والظير', 'خيذا',
  'م اع ', 'جبل ميذ', 'تجبل ', 'قتقد', 'الحسبن', 'الحسبنى',
  'ائ معركة', 'tarبخ', 'فلسطبنية', 'مخبم',
  'آحر', 'مديه', 'جىوب', 'الشلط', 'اللسم', 'العذبة', 'الخربطة', 'المربب', 'المعجر',
  'بعادل', 'أجرال', 'الديال', 'الرسسم', 'الذيانة', 'الإسلامت', 'أدمر', 'داثري', 'مريعي',
  'البا المات', 'الأقصىء', 'الجنوبيء', 'الهدينة', 'بطلق', 'المعالب', 'لرمل', 'لوجد', 'لرمر', 'المسحد',
];

function arabicRatio(text) {
  if (!text) return 0;
  const chars = [...text];
  const ar = chars.filter((c) => /[\u0600-\u06FF؟]/.test(c)).length;
  return ar / Math.max(chars.length, 1);
}

function hasGarbageFragment(text) {
  return OCR_GARBAGE_FRAGMENTS.some((g) => text.includes(g));
}

export function isValidOption(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return false;
  if (s === 'صح' || s === 'خطأ') return true;
  if (/^(?:عام\s+)?[12]\d{3}$/.test(s)) return true;
  if (s.length < 3) return false;
  if (GARBAGE_CHARS_RE.test(s)) return false;
  if (s.includes('>') || s.includes(' >') || s.includes('>0')) return false;
  if (SPACED_LETTERS_RE.test(s)) return false;
  if (LATIN_OR_MIXED_RE.test(s)) return false;
  if (/[a-zA-Z]/.test(s)) return false;
  if (hasGarbageFragment(s)) return false;
  const letters = s.match(/[\u0600-\u06FF]/g) || [];
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const short = tokens.filter((t) => t.replace(/[^\u0600-\u06FF]/g, '').length <= 1).length;
    if (short >= 1 && short >= tokens.length * 0.34) return false;
  }
  for (const token of tokens) {
    if (/^(?:عام\s+)?[12]\d{3}$/.test(token)) continue;
    if (/[\d٠-٩]/.test(token)) return false;
    if (REPEATED_LETTER_RE.test(token)) return false;
    if (token.replace(/[^\u0600-\u06FF]/g, '').length <= 2 && !['1948', '1967', '1917', '1936', 'غزة', 'عكا', 'يافا', 'حيفا', 'نابلس', 'القدس', 'طبريا', 'بيسان', 'اللد', 'الرملة', 'أريحا', 'صفد', 'جنين', 'الخليل'].includes(token)) return false;
    const ar = (token.match(/[\u0600-\u06FF]/g) || []).length;
    if (token.length >= 3 && ar < token.length * 0.75) return false;
  }
  if (letters.length < 4 && !['1948', '1967', '1917', '1936', 'غزة', 'عكا', 'يافا', 'حيفا', 'نابلس', 'القدس', 'طبريا', 'بيسان', 'اللد', 'الرملة', 'أريحا', 'صفد', 'جنين', 'الخليل'].includes(s) && !/\d{4}/.test(s)) return false;
  if (/^[\d٠-٩\s.]+$/.test(s)) return false;
  return true;
}

export function isValidQuestion(text, minLen = 10) {
  const q = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (q.length < 8) return false;
  const isTf = isTrueFalseQuestion(q);
  const letters = (q.match(/[\u0600-\u06FF]/g) || []).length;
  if (isTf && letters >= 8 && !GARBAGE_CHARS_RE.test(q)) return true;
  if (q.length < minLen) return false;
  if (GARBAGE_CHARS_RE.test(q)) return false;
  if (QUESTION_GARBAGE_RE.test(q)) return false;
  if (OCR_TYPO_RE.test(q)) return false;
  if (SPACED_LETTERS_RE.test(q)) return false;
  if (arabicRatio(q) < 0.48) return false;
  if (LATIN_OR_MIXED_RE.test(q) && !isTf) return false;
  if (/[a-zA-Z]/.test(q)) return false;
  if (/[؟?]\s*[\d١-٩0-9]|^\s*[\d١-٩0-9]\s+على/.test(q)) return false;
  if (/^مل\s+الذي|^tar\b|تاربخ|المميم|المتوسطينية/.test(q)) return false;
  if (REPEATED_LETTER_RE.test(q)) return false;
  if (hasGarbageFragment(q) && !isTf) return false;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const single = tokens.filter((t) => t.replace(/[^\u0600-\u06FF]/g, '').length <= 1 && t !== '؟' && t !== '?').length;
    if (single >= 2) return false;
    const short = tokens.filter((t) => t.replace(/[^\u0600-\u06FF]/g, '').length <= 2).length;
    if (short >= 4 && short >= tokens.length * 0.45 && !isTf) return false;
  }
  const digits = (q.match(/[\d٠-٩]/g) || []).length;
  if (digits >= 3 && digits > letters * 0.12 && !isTf) return false;
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (/[\d٠-٩]/.test(token) && !/^(?:عام\s+)?[12]\d{3}$/.test(token) && !isTf) return false;
  }
  if (!QUESTION_INDICATORS.some((ind) => q.includes(ind))) {
    if (isTf) return letters >= 8;
    return false;
  }
  return true;
}

/** @deprecated use isValidQuestion */
export function isValidArabicText(text, minLen = 8) {
  return isValidQuestion(text, Math.max(minLen, 10));
}

export function isTfOptions(options) {
  return options?.length === 2 && options[0] === 'صح' && options[1] === 'خطأ';
}

export function isTrueFalseQuestion(question) {
  return TF_RE.test(question || '');
}

export function isPlayableCard(card) {
  if (!card?.question) return false;
  if (!isValidQuestion(card.question)) return false;
  const options = card.options;
  if (!Array.isArray(options) || options.length < 2) return false;
  if (!options.every(isValidOption)) return false;
  if (isTrueFalseQuestion(card.question) && !isTfOptions(options)) return false;
  if (!isValidOption(card.correctAnswer)) return false;
  if (!options.includes(card.correctAnswer)) return false;
  return true;
}

export function filterPlayableCards(cards) {
  return (cards || []).filter(isPlayableCard);
}
