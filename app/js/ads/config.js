/**
 * إعدادات الإعلانات — Ad Configuration
 *
 * ═══════════════════════════════════════════════════════════════════
 * 📋 قائمة التحقق قبل الإنتاج | Production checklist
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. انشر الموقع على Netlify مع HTTPS (راجع DEPLOY_NETLIFY.md)
 * 2. سجّل الموقع في Google AdSense وانتظر الموافقة
 * 3. أنشئ 4 وحدات إعلان (Display → Responsive) — راجع ADS_SETUP.md
 * 4. الصق publisherId و adUnits أدناه
 * 5. غيّر USE_PLACEHOLDER_ADS إلى false
 * 6. (اختياري) أزل التعليق عن سطر AdSense في index.html <head>
 * 7. أعد النشر على Netlify
 *
 * ⚠️ اترك USE_PLACEHOLDER_ADS: true حتى تضيف المعرفات الحقيقية.
 *    Placeholders = صناديق رمادية آمنة بدون طلبات AdSense.
 */
export const AD_CONFIG = {
  /** Master switch — set false to disable all ads during development */
  enabled: true,

  /**
   * true  → styled placeholders (local dev + pre-AdSense approval)
   * false → load real Google AdSense (requires publisherId + slot IDs below)
   *
   * Flip to false ONLY after AdSense approves your site and IDs are pasted.
   */
  USE_PLACEHOLDER_ADS: true,

  /**
   * Google AdSense Publisher ID
   * Where: AdSense → Account → Account information → Publisher ID
   * Format: ca-pub-XXXXXXXXXXXXXXXX  (16 digits after ca-pub-)
   *
   * Example placeholder — replace with YOUR id:
   *   publisherId: 'ca-pub-1234567890123456',
   */
  publisherId: 'ca-pub-XXXXXXXXXXXXXXXX',

  /**
   * Ad unit Slot IDs — one per unit in AdSense → Ads → By ad unit → Display ads
   * Each value is a numeric string (e.g. '1234567890'), NOT the full ad code.
   *
   * | AdSense unit name (suggested) | Key in code    | Placement              |
   * |-------------------------------|----------------|------------------------|
   * | Palestine — Banner Menu       | bannerMenu     | Main menu footer       |
   * | Palestine — Banner Game       | bannerGame     | Train + memory footers |
   * | Palestine — Interstitial      | interstitial   | Between screens/turns  |
   * | Palestine — Rewarded          | rewarded       | Optional reward button |
   */
  adUnits: {
    /** Banner on main menu — إعلان شريطي في القائمة الرئيسية */
    bannerMenu: 'XXXXXXXXXX',
    /** Banner during gameplay (train + memory) — شريط أثناء اللعب */
    bannerGame: 'XXXXXXXXXX',
    /** Full-screen interstitial slot — إعلان بين الشاشات */
    interstitial: 'XXXXXXXXXX',
    /** Rewarded-style slot (large display in overlay) — مكافأة اختيارية */
    rewarded: 'XXXXXXXXXX',
  },

  /** Minimum ms between interstitial shows (avoid annoying users + policy) */
  interstitialCooldownMs: 45_000,

  /** Show interstitial every N completed turns in train game */
  interstitialEveryNTurns: 3,

  /** Memory game: show interstitial when player reaches these pair counts */
  memoryMilestonePairs: [2, 4, 6],

  /** Seconds before skip button appears on interstitial */
  interstitialSkipDelaySec: 5,

  /** Seconds before rewarded ad can be closed */
  rewardedMinWatchSec: 8,
};
