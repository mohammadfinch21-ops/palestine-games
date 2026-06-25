import { initModal } from './modal.js';
import { initTrainGame } from './train-game.js';
import { initMemoryGame } from './memory-game.js';
import { initAds, onScreenChange } from './ads/ad-manager.js';
import { loadCardData } from './questions.js';
import { initNativeShell } from './native-app.js';

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

function initNavigation() {
  document.querySelectorAll('[data-screen]').forEach((el) => {
    el.addEventListener('click', () => {
      showScreen(el.dataset.screen);
    });
  });

  document.addEventListener('native-navigate', (e) => {
    if (e.detail?.screen) showScreen(e.detail.screen);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await initNativeShell();
  initModal();
  initNavigation();
  await initAds();

  const cardsLoadingEl = document.getElementById('cards-loading-status');
  if (cardsLoadingEl) {
    cardsLoadingEl.classList.remove('hidden');
    cardsLoadingEl.textContent = 'جاري تحميل بطاقات الأسئلة…';
  }

  try {
    const counts = await loadCardData();
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

  initTrainGame();
  initMemoryGame();
  showScreen('menu');
});
