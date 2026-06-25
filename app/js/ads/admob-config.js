/**
 * Google AdMob — Mobile app ad IDs (Android / iOS)
 * NOT the same as AdSense — see ADS_SETUP.md and mobile/MOBILE_BUILD.md
 *
 * ⚠️ Replace placeholders before production release.
 * While developing, USE_TEST_ADS: true uses Google's official test ad units.
 */
export const ADMOB_CONFIG = {
  /** Master switch for native AdMob (Capacitor app only) */
  enabled: true,

  /**
   * true = Google test ad units (safe for debug APK / TestFlight)
   * false = your real AdMob ad unit IDs from admob.google.com
   */
  USE_TEST_ADS: true,

  /**
   * AdMob App IDs (Dashboard → Apps → App settings)
   * Format: ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   * Also set in mobile/capacitor.config.json → plugins.AdMob
   */
  appIdAndroid: 'ca-app-pub-3940256099942544~3347511713',
  appIdIOS: 'ca-app-pub-3940256099942544~1458002511',

  /** Production ad unit IDs — replace after creating units in AdMob */
  adUnits: {
    bannerAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    bannerIOS: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    interstitialAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    interstitialIOS: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    rewardedAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    rewardedIOS: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
  },

  /** Google official test IDs (do not change unless Google updates them) */
  testIds: {
    bannerAndroid: 'ca-app-pub-3940256099942544/6300978111',
    bannerIOS: 'ca-app-pub-3940256099942544/2934735716',
    interstitialAndroid: 'ca-app-pub-3940256099942544/1033173712',
    interstitialIOS: 'ca-app-pub-3940256099942544/4411468910',
    rewardedAndroid: 'ca-app-pub-3940256099942544/5224354917',
    rewardedIOS: 'ca-app-pub-3940256099942544/1712485313',
  },
};

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
