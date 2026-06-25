import { initModal } from './modal.js';
import { initTrainGame } from './train-game.js';
import { initMemoryGame } from './memory-game.js';
import { initAds, onScreenChange } from './ads/ad-manager.js';
import { loadCardData } from './questions.js';
import { initNativeShell, isNativeApp } from './native-app.js';

let currentScreen = 'menu';

const TAB_ORDER = { menu: 0, train: 1, memory: 2, about: 3 };

function updateBottomNav(id) {
  document.querySelectorAll('.native-tab').forEach((tab) => {
    const active = tab.dataset.screen === id;
    tab.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function showScreen(id, { animate = true } = {}) {
  if (id === currentScreen) return;

  const previous = currentScreen;
  const prevEl = document.getElementById(`screen-${previous}`);
  const nextEl = document.getElementById(`screen-${id}`);
  if (!nextEl) return;

  const useNativeAnim = animate && isNativeApp() && prevEl && TAB_ORDER[id] !== undefined;

  if (useNativeAnim) {
    const forward = (TAB_ORDER[id] ?? 0) >= (TAB_ORDER[previous] ?? 0);
    const outClass = forward ? 'slide-out-left' : 'slide-out-right';
    const inClass = forward ? 'slide-in-right' : 'slide-in-left';

    prevEl.classList.add('screen-animating', outClass);
    nextEl.classList.add('active', 'screen-animating', inClass);

    const cleanup = () => {
      prevEl.classList.remove('active', 'screen-animating', outClass);
      nextEl.classList.remove('screen-animating', inClass);
    };

    nextEl.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 320);
  } else {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.remove('active', 'screen-animating', 'slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
    });
    nextEl.classList.add('active');
  }

  currentScreen = id;
  updateBottomNav(id);
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
  showScreen('menu', { animate: false });
});
