import { initModal } from './modal.js';
import { initAds, onScreenChange } from './ads/ad-manager.js';
import { loadCardData } from './questions.js';
import { loadCityQuestions } from './city-questions.js';
import { initNativeShell, isNativeApp } from './native-app.js';

let currentScreen = 'menu';

function showScreen(id) {
  if (id === currentScreen) return;

  const previous = currentScreen;
  const nextEl = document.getElementById(`screen-${id}`);
  if (!nextEl) return;

  document.querySelectorAll('.screen').forEach((s) => {
    s.classList.remove('active');
  });
  nextEl.classList.add('active');

  currentScreen = id;
  document.dispatchEvent(new CustomEvent('native-screen-change', { detail: { screen: id, previous } }));
  onScreenChange(previous, id);
}

function navigateToScreen(el) {
  const target = el?.dataset?.screen;
  if (target) showScreen(target);
}

function initNavigation() {
  document.querySelectorAll('[data-screen]').forEach((el) => {
    const handleNavigate = (e) => {
      e.preventDefault();
      navigateToScreen(el);
    };

    // Capacitor Android WebView: pointerup is more reliable than click alone
    if (isNativeApp()) {
      el.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        handleNavigate(e);
      });
    } else {
      el.addEventListener('click', handleNavigate);
    }
  });

  document.addEventListener('native-navigate', (e) => {
    if (e.detail?.screen) showScreen(e.detail.screen);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation first — must work even if native plugins or game modules are slow
  initModal();
  initNavigation();

  initNativeShell().catch((err) => {
    console.warn('[Native] shell init failed — continuing', err);
  });

  try {
    await initAds();
  } catch (err) {
    console.warn('[Ads] startup init failed — continuing without ads', err);
  }

  const cardsLoadingEl = document.getElementById('cards-loading-status');
  if (cardsLoadingEl) {
    cardsLoadingEl.classList.remove('hidden');
    cardsLoadingEl.textContent = 'جاري تحميل بطاقات الأسئلة…';
  }

  try {
    const [counts] = await Promise.all([loadCardData(), loadCityQuestions()]);
    console.info(`بطاقات محمّلة: ${counts.questions} سؤال، ${counts.memory} زوج ذاكرة`);
    if (cardsLoadingEl) {
      cardsLoadingEl.textContent = `✓ ${counts.questions} بطاقة سؤال جاهزة`;
      setTimeout(() => cardsLoadingEl.classList.add('hidden'), 2500);
    }
  } catch (err) {
    console.error('فشل تحميل بطاقات PDF', err);
    if (cardsLoadingEl) {
      cardsLoadingEl.textContent = '⚠ فشل تحميل البطاقات — أعد تحميل الصفحة';
      cardsLoadingEl.classList.add('cards-loading-status--error');
    }
  }

  try {
    const [{ initTrainGame }, { initMemoryGame }] = await Promise.all([
      import('./train-game.js'),
      import('./memory-game.js'),
    ]);
    initTrainGame();
    initMemoryGame();
  } catch (err) {
    console.error('فشل تحميل وحدات الألعاب', err);
  }

  showScreen('menu');
});
