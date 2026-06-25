/**
 * AdMob bridge for Capacitor native apps (Android / iOS).
 * Uses Capacitor plugin bridge — no AdSense on mobile.
 */
import { ADMOB_CONFIG, getAdMobUnitId } from './admob-config.js';

let nativeReady = false;
let bannerVisible = false;

function isNativePlatform() {
  return typeof window.Capacitor !== 'undefined'
    && window.Capacitor.isNativePlatform?.() === true;
}

function getAdMobPlugin() {
  return window.Capacitor?.Plugins?.AdMob ?? null;
}

/** Call once from initAds when running inside Capacitor WebView */
export async function initNativeAds() {
  if (!ADMOB_CONFIG.enabled || !isNativePlatform()) return false;

  const AdMob = getAdMobPlugin();
  if (!AdMob) {
    console.warn('[NativeAds] AdMob plugin not found — run: cd mobile && npx cap sync');
    return false;
  }

  try {
    await AdMob.initialize({
      initializeForTesting: ADMOB_CONFIG.USE_TEST_ADS,
      requestTrackingAuthorization: true,
    });
    nativeReady = true;
    await showNativeBanner();
    return true;
  } catch (err) {
    console.warn('[NativeAds] init failed', err);
    return false;
  }
}

export function isNativeAdsActive() {
  return nativeReady && isNativePlatform();
}

/** Hide HTML banner placeholders — native banner is overlay */
export function hideWebBannerSlots() {
  document.querySelectorAll('.ad-banner, .ad-banner--sticky').forEach((el) => {
    el.style.display = 'none';
  });
}

export async function showNativeBanner() {
  const AdMob = getAdMobPlugin();
  if (!AdMob || !nativeReady) return;

  try {
    if (bannerVisible) {
      await AdMob.resumeBanner().catch(() => {});
      return;
    }
    await AdMob.showBanner({
      adId: getAdMobUnitId('banner'),
      adSize: 'BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
      isTesting: ADMOB_CONFIG.USE_TEST_ADS,
    });
    bannerVisible = true;
  } catch (err) {
    console.warn('[NativeAds] banner failed', err);
  }
}

export async function hideNativeBanner() {
  const AdMob = getAdMobPlugin();
  if (!AdMob || !bannerVisible) return;
  try {
    await AdMob.hideBanner();
  } catch (err) {
    console.warn('[NativeAds] hide banner', err);
  }
}

export async function showNativeInterstitial() {
  const AdMob = getAdMobPlugin();
  if (!AdMob || !nativeReady) return false;

  try {
    const adId = getAdMobUnitId('interstitial');
    await AdMob.prepareInterstitial({ adId, isTesting: ADMOB_CONFIG.USE_TEST_ADS });
    await AdMob.showInterstitial();
    return true;
  } catch (err) {
    console.warn('[NativeAds] interstitial failed', err);
    return false;
  }
}

export async function showNativeRewarded() {
  const AdMob = getAdMobPlugin();
  if (!AdMob || !nativeReady) return false;

  return new Promise(async (resolve) => {
    try {
      const adId = getAdMobUnitId('rewarded');
      const rewardListener = await AdMob.addListener('onRewardedVideoAdReward', () => {
        rewardListener.remove();
        dismissListener.remove();
        resolve(true);
      });
      const dismissListener = await AdMob.addListener('onRewardedVideoAdDismissed', () => {
        rewardListener.remove();
        dismissListener.remove();
        resolve(false);
      });
      await AdMob.prepareRewardVideoAd({ adId, isTesting: ADMOB_CONFIG.USE_TEST_ADS });
      await AdMob.showRewardVideoAd();
    } catch (err) {
      console.warn('[NativeAds] rewarded failed', err);
      resolve(false);
    }
  });
}
