import { AD_CONFIG } from './config.js';
import {
  initNativeAds,
  isNativeAdsActive,
  hideWebBannerSlots,
  showNativeBanner,
  showNativeInterstitial,
  showNativeRewarded,
} from './native-ads.js';

let lastInterstitialAt = 0;
let interstitialShowing = false;
let adsenseLoaded = false;
let turnCounter = 0;
let usingNativeAds = false;
const shownMemoryMilestones = new Set();

/**
 * Initialize ad system — call once on DOMContentLoaded
 */
export async function initAds() {
  if (!AD_CONFIG.enabled) return;

  injectInterstitialOverlay();
  injectRewardedOverlay();

  usingNativeAds = await initNativeAds();
  if (usingNativeAds) {
    hideWebBannerSlots();
    return;
  }

  refreshBannerAds();

  if (!AD_CONFIG.USE_PLACEHOLDER_ADS) {
    loadAdSenseScript();
  } else {
    fillAllBannerSlots();
  }
}

function loadAdSenseScript() {
  if (adsenseLoaded || !AD_CONFIG.publisherId.includes('pub-')) return;
  if (document.querySelector('script[data-adsense]')) {
    adsenseLoaded = true;
    pushAdSenseSlots();
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CONFIG.publisherId}`;
  script.crossOrigin = 'anonymous';
  script.dataset.adsense = 'true';
  script.onload = () => {
    adsenseLoaded = true;
    pushAdSenseSlots();
  };
  script.onerror = () => {
    console.warn('[Ads] AdSense script failed — falling back to placeholders');
    fillAllBannerSlots();
  };
  document.head.appendChild(script);
}

function createAdSenseIns(slotId, format = 'auto', fullWidth = true) {
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  if (fullWidth) ins.style.width = '100%';
  ins.dataset.adClient = AD_CONFIG.publisherId;
  ins.dataset.adSlot = slotId;
  ins.dataset.adFormat = format;
  if (fullWidth) ins.dataset.fullWidthResponsive = 'true';
  return ins;
}

function pushAdSenseSlots() {
  document.querySelectorAll('.adsbygoogle:not([data-ads-pushed])').forEach((el) => {
    try {
      el.dataset.adsPushed = 'true';
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('[Ads] push failed', e);
    }
  });
}

function renderPlaceholder(container, label, variant = 'banner') {
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('ad-loaded');
  const box = document.createElement('div');
  box.className = `ad-placeholder ad-placeholder--${variant}`;
  const sizeHint = variant === 'banner'
    ? '<span class="ad-placeholder-size">728×90</span>'
    : '';
  box.innerHTML = `
    <span class="ad-placeholder-label">إعلان · Ad</span>
    <span class="ad-placeholder-text">${label}</span>
    ${sizeHint}
    <span class="ad-placeholder-hint">Placeholder — استبدل بـ AdSense</span>
  `;
  container.appendChild(box);
}

function renderAllPlaceholders() {
  document.querySelectorAll('[data-ad-slot]:not([hidden])').forEach((el) => {
    const type = el.dataset.adSlot;
    const labels = {
      'banner-menu': 'Banner — الصفحة الرئيسية',
      'banner-game': 'Banner — أثناء اللعب',
      interstitial: 'Interstitial — بين الجلسات',
      rewarded: 'Rewarded — مكافأة اختيارية',
    };
    renderPlaceholder(el, labels[type] || type, type.includes('banner') ? 'banner' : 'interstitial');
  });
}

function fillBannerSlot(container, slotKey) {
  if (!container || container.dataset.adFilled) return;
  container.dataset.adFilled = 'true';
  container.innerHTML = '';

  const menuLabels = {
    bannerMenu: 'Banner — الصفحة الرئيسية',
    bannerGame: 'Banner — أثناء اللعب',
  };

  if (AD_CONFIG.USE_PLACEHOLDER_ADS) {
    renderPlaceholder(container, menuLabels[slotKey] || `Banner (${slotKey})`, 'banner');
    return;
  }

  const slotId = AD_CONFIG.adUnits[slotKey];
  if (!slotId || slotId.includes('XXXX')) {
    renderPlaceholder(container, `Configure adUnits.${slotKey}`, 'banner');
    return;
  }

  container.appendChild(createAdSenseIns(slotId));
  if (adsenseLoaded) pushAdSenseSlots();
}

function updateWebBannerVisibility(activeScreen) {
  const menuEl = document.getElementById('ad-banner-menu');
  const trainEl = document.getElementById('ad-banner-train');
  const memoryEl = document.getElementById('ad-banner-memory');

  if (menuEl) menuEl.hidden = activeScreen !== 'menu';
  if (trainEl) {
    trainEl.hidden = activeScreen !== 'train';
    trainEl.style.display = activeScreen === 'train' ? '' : 'none';
  }
  if (memoryEl) memoryEl.hidden = activeScreen !== 'memory';
}

function fillAllBannerSlots() {
  const slots = [
    ['ad-banner-menu', 'bannerMenu'],
    ['ad-banner-train', 'bannerGame'],
    ['ad-banner-memory', 'bannerGame'],
  ];
  slots.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) fillBannerSlot(el, key);
  });
}

export function refreshBannerAds(activeScreen = 'menu') {
  if (isNativeAdsActive()) {
    showNativeBanner();
    updateWebBannerVisibility(activeScreen);
    return;
  }

  updateWebBannerVisibility(activeScreen);
  fillAllBannerSlots();
}

function injectInterstitialOverlay() {
  if (document.getElementById('ad-interstitial-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ad-interstitial-overlay';
  overlay.className = 'ad-overlay hidden';
  overlay.innerHTML = `
    <div class="ad-overlay-card">
      <p class="ad-overlay-title">إعلان · Advertisement</p>
      <div id="ad-interstitial-slot" class="ad-slot ad-slot--interstitial" data-ad-slot="interstitial"></div>
      <button type="button" id="ad-interstitial-skip" class="ad-skip-btn" disabled>
        تخطي (<span id="ad-interstitial-countdown">${AD_CONFIG.interstitialSkipDelaySec}</span>)
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function injectRewardedOverlay() {
  if (document.getElementById('ad-rewarded-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ad-rewarded-overlay';
  overlay.className = 'ad-overlay hidden';
  overlay.innerHTML = `
    <div class="ad-overlay-card ad-overlay-card--rewarded">
      <p class="ad-overlay-title">🎁 شاهد إعلاناً للحصول على المكافأة</p>
      <p class="ad-overlay-sub">Watch ad to earn your reward</p>
      <div id="ad-rewarded-slot" class="ad-slot ad-slot--rewarded" data-ad-slot="rewarded"></div>
      <button type="button" id="ad-rewarded-close" class="ad-skip-btn" disabled>
        إغلاق (<span id="ad-rewarded-countdown">${AD_CONFIG.rewardedMinWatchSec}</span>)
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function fillOverlaySlot(slotEl, slotKey, variant) {
  if (!slotEl) return;
  slotEl.innerHTML = '';
  slotEl.dataset.adFilled = '';

  if (AD_CONFIG.USE_PLACEHOLDER_ADS) {
    renderPlaceholder(slotEl, variant, 'interstitial');
    return;
  }

  const slotId = AD_CONFIG.adUnits[slotKey];
  if (!slotId || slotId.includes('XXXX')) {
    renderPlaceholder(slotEl, `Configure adUnits.${slotKey}`, 'interstitial');
    return;
  }

  slotEl.appendChild(createAdSenseIns(slotId, 'auto', true));
  if (adsenseLoaded) pushAdSenseSlots();
}

function runCountdown(btn, countEl, seconds, onDone) {
  let remaining = seconds;
  btn.disabled = true;
  countEl.textContent = String(remaining);

  const interval = setInterval(() => {
    remaining -= 1;
    countEl.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.textContent = btn.dataset.doneLabel || 'متابعة';
      onDone?.();
    }
  }, 1000);

  return () => clearInterval(interval);
}

/**
 * Show full-screen interstitial. Returns Promise resolved when dismissed.
 * Respects cooldown — returns immediately if too soon.
 */
export function showInterstitial(reason = 'transition') {
  if (!AD_CONFIG.enabled) return Promise.resolve(false);

  const now = Date.now();
  if (interstitialShowing) return Promise.resolve(false);
  if (now - lastInterstitialAt < AD_CONFIG.interstitialCooldownMs) {
    return Promise.resolve(false);
  }

  if (isNativeAdsActive()) {
    lastInterstitialAt = now;
    interstitialShowing = true;
    return showNativeInterstitial().finally(() => {
      interstitialShowing = false;
    });
  }

  return new Promise((resolve) => {
    interstitialShowing = true;
    lastInterstitialAt = now;

    const overlay = document.getElementById('ad-interstitial-overlay');
    const slot = document.getElementById('ad-interstitial-slot');
    const skipBtn = document.getElementById('ad-interstitial-skip');
    const countEl = document.getElementById('ad-interstitial-countdown');

    fillOverlaySlot(slot, 'interstitial', `Interstitial (${reason})`);
    skipBtn.dataset.doneLabel = 'تخطي الإعلان · Skip';
    skipBtn.innerHTML = `تخطي (<span id="ad-interstitial-countdown">${AD_CONFIG.interstitialSkipDelaySec}</span>)`;
    const freshCount = document.getElementById('ad-interstitial-countdown');

    overlay.classList.remove('hidden');

    let cancelCountdown = runCountdown(skipBtn, freshCount, AD_CONFIG.interstitialSkipDelaySec);

    const close = () => {
      cancelCountdown?.();
      overlay.classList.add('hidden');
      interstitialShowing = false;
      resolve(true);
    };

    skipBtn.onclick = close;
  });
}

/**
 * Rewarded-style ad: user opts in, watches overlay, then onReward callback fires.
 */
export function showRewardedAd({ title, onReward, onDismiss } = {}) {
  if (!AD_CONFIG.enabled) {
    onReward?.();
    return Promise.resolve(true);
  }

  if (isNativeAdsActive()) {
    return showNativeRewarded().then((granted) => {
      if (granted) onReward?.();
      else onDismiss?.();
      return granted;
    });
  }

  return new Promise((resolve) => {
    const overlay = document.getElementById('ad-rewarded-overlay');
    const slot = document.getElementById('ad-rewarded-slot');
    const closeBtn = document.getElementById('ad-rewarded-close');
    const countEl = document.getElementById('ad-rewarded-countdown');
    const titleEl = overlay.querySelector('.ad-overlay-title');

    if (title && titleEl) titleEl.textContent = title;

    fillOverlaySlot(slot, 'rewarded', 'Rewarded');
    closeBtn.disabled = true;
    closeBtn.innerHTML = `إغلاق (<span id="ad-rewarded-countdown">${AD_CONFIG.rewardedMinWatchSec}</span>)`;
    const freshCount = document.getElementById('ad-rewarded-countdown');

    overlay.classList.remove('hidden');

    let rewarded = false;
    let cancelCountdown = runCountdown(closeBtn, freshCount, AD_CONFIG.rewardedMinWatchSec, () => {
      closeBtn.textContent = 'استلم المكافأة · Claim reward';
    });

    const finish = (granted) => {
      cancelCountdown?.();
      overlay.classList.add('hidden');
      if (granted) onReward?.();
      else onDismiss?.();
      resolve(granted);
    };

    closeBtn.onclick = () => {
      if (closeBtn.disabled) return;
      if (!rewarded) {
        rewarded = true;
        finish(true);
      }
    };
  });
}

/** Call when navigating between major screens (menu ↔ games) */
export function onScreenChange(from, to) {
  if (!AD_CONFIG.enabled) return;
  if (from === to) return;

  if (to === 'menu' || (from === 'menu' && (to === 'train' || to === 'memory'))) {
    showInterstitial(`screen-${from}-to-${to}`);
  }

  refreshBannerAds(to);
}

/** Train game: call after each turn completes */
export function onTrainTurnComplete() {
  if (!AD_CONFIG.enabled) return;
  turnCounter += 1;
  if (turnCounter % AD_CONFIG.interstitialEveryNTurns === 0) {
    showInterstitial('train-turn');
  }
}

/** Train game: game over / win */
export function onTrainGameOver() {
  turnCounter = 0;
  showInterstitial('train-game-over');
}

/** Train game: session started */
export function onTrainGameStart() {
  showInterstitial('train-game-start');
}

/** Memory: milestone pair matched */
export function onMemoryPairMatched(pairCount) {
  if (!AD_CONFIG.enabled) return;
  if (!AD_CONFIG.memoryMilestonePairs.includes(pairCount)) return;
  if (shownMemoryMilestones.has(pairCount)) return;
  shownMemoryMilestones.add(pairCount);
  showInterstitial(`memory-pairs-${pairCount}`);
}

/** Memory: full completion */
export function onMemoryComplete() {
  shownMemoryMilestones.clear();
  showInterstitial('memory-complete');
}

/** Memory: restart */
export function onMemoryRestart() {
  shownMemoryMilestones.clear();
}

/** Reset train turn counter on new game */
export function onTrainReset() {
  turnCounter = 0;
}
