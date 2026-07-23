/**
 * Google AdMob — Mobile app ad IDs (Android / iOS)
 * NOT the same as AdSense — see app/js/ads/ADMOB_SETUP.md and mobile/STORE_RELEASE.md
 *
 * ═══════════════════════════════════════════════════════════════════
 * 🔴 قبل النشر في المتجر | BEFORE STORE RELEASE
 * ═══════════════════════════════════════════════════════════════════
 * 1. أنشئ تطبيق AdMob + 3 وحدات إعلان (راجع ADMOB_SETUP.md)
 * 2. الصق App ID + ad unit IDs في القسم PRODUCTION أدناه
 * 3. USE_TEST_ADS → false
 * 4. mobile/capacitor.config.json → initializeForTesting → false + App IDs
 * 5. npx cap sync && بناء release — تحقق أن الإعلانات ليست «Test Ad»
 *
 * ⚠️ لا تنشر في Play/App Store و USE_TEST_ADS: true — لن تحصل على أرباح.
 */
export const ADMOB_CONFIG = {
  /** Master switch — keep true for release (monetization ON) */
  enabled: true,

  /**
   * ═══ TEST vs PRODUCTION toggle ═══
   *
   * true  → Google official test ad units (debug APK, emulator, internal testing)
   * false → PRODUCTION IDs below (required for store release + real revenue)
   *
   * Flip to false ONLY after pasting your real App ID + ad unit IDs from AdMob console.
   */
  USE_TEST_ADS: true,

  // ─── PRODUCTION — paste your IDs from admob.google.com ───────────
  // TODO: Replace every TODO_* placeholder before store release.

  /** App IDs — AdMob → Apps → [your app] → App settings */
  appIdAndroid: 'TODO_REPLACE_ANDROID_APP_ID', // ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
  appIdIOS: 'TODO_REPLACE_IOS_APP_ID', // ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY

  /** Ad unit IDs — AdMob → Apps → Ad units (Banner, Interstitial, Rewarded) */
  adUnits: {
    bannerAndroid: 'TODO_REPLACE_BANNER_ANDROID', // ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY
    bannerIOS: 'TODO_REPLACE_BANNER_IOS',
    interstitialAndroid: 'TODO_REPLACE_INTERSTITIAL_ANDROID',
    interstitialIOS: 'TODO_REPLACE_INTERSTITIAL_IOS',
    rewardedAndroid: 'TODO_REPLACE_REWARDED_ANDROID',
    rewardedIOS: 'TODO_REPLACE_REWARDED_IOS',
  },

  // ─── TEST — Google's official sample IDs (safe for development) ────
  // Do NOT change unless Google updates documentation.

  testAppIdAndroid: 'ca-app-pub-3940256099942544~3347511713',
  testAppIdIOS: 'ca-app-pub-3940256099942544~1458002511',

  testIds: {
    bannerAndroid: 'ca-app-pub-3940256099942544/6300978111',
    bannerIOS: 'ca-app-pub-3940256099942544/2934735716',
    interstitialAndroid: 'ca-app-pub-3940256099942544/1033173712',
    interstitialIOS: 'ca-app-pub-3940256099942544/4411468910',
    rewardedAndroid: 'ca-app-pub-3940256099942544/5224354917',
    rewardedIOS: 'ca-app-pub-3940256099942544/1712485313',
  },
};

/** Resolve AdMob App ID for Capacitor native config sync */
export function getAdMobAppId(platform) {
  const isIOS = platform === 'ios';
  if (ADMOB_CONFIG.USE_TEST_ADS) {
    return isIOS ? ADMOB_CONFIG.testAppIdIOS : ADMOB_CONFIG.testAppIdAndroid;
  }
  return isIOS ? ADMOB_CONFIG.appIdIOS : ADMOB_CONFIG.appIdAndroid;
}

/** Resolve ad unit ID for current platform */
export function getAdMobUnitId(type) {
  const platform = window.Capacitor?.getPlatform?.() || 'web';
  const isIOS = platform === 'ios';
  const key = `${type}${isIOS ? 'IOS' : 'Android'}`;

  if (ADMOB_CONFIG.USE_TEST_ADS) {
    return ADMOB_CONFIG.testIds[key];
  }
  return ADMOB_CONFIG.adUnits[key];
}
