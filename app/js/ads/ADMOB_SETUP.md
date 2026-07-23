# إعداد Google AdMob — تطبيق لعبة قطار فلسطين

> **التوصية:** لا تنشر في Google Play أو App Store قبل إكمال هذا الدليل بالكامل.  
> الإعلانات التجريبية («Test Ad») لا تُدرّ أرباحاً.

---

## ما الذي يُفعَّل في التطبيق؟

| النوع | المكان | الملف |
|-------|--------|-------|
| **Banner** | أسفل الشاشة أثناء اللعب | `admob-config.js` → `bannerAndroid` / `bannerIOS` |
| **Interstitial** | بين الشاشات / كل 3 أدوار / نهاية اللعبة | `interstitialAndroid` / `interstitialIOS` |
| **Rewarded** | زر «🎬 شاهد إعلاناً» في قطار فلسطين (+2 خطوات) وبطاقات الذاكرة (كشف زوج) | `rewardedAndroid` / `rewardedIOS` |

الويب (Netlify) يستخدم **AdSense** من `config.js` — AdMob للجوال فقط.

---

## الخطوة 1 — حساب AdMob

1. افتح [admob.google.com](https://admob.google.com) وسجّل الدخول بحساب Google.
2. إن لم يكن لديك حساب AdMob، أكمل التسجيل (قد يُطلب ربط AdSense لاحقاً لتحويل الأرباح).

---

## الخطوة 2 — إنشاء التطبيق في AdMob

### Android (الأولوية — Google Play)

1. AdMob → **Apps** → **Add app**.
2. اختر **No** إذا التطبيق غير منشور بعد (يمكن ربطه لاحقاً بـ Play Console).
3. **Platform:** Android.
4. **App name:** `لعبة قطار فلسطين`.
5. **Package name:** `com.scout4pal.palestinetrain` (يجب أن يطابق `mobile/capacitor.config.json` → `appId`).
6. احفظ **App ID** — الشكل: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`.

### iOS (لاحقاً — App Store)

كرر نفس الخطوات مع Platform: iOS و Bundle ID من Xcode.

---

## الخطوة 3 — إنشاء 3 وحدات إعلان (Ad units)

داخل تطبيق Android في AdMob → **Ad units** → **Add ad unit**:

| # | نوع الوحدة | الاسم المقترح | المفتاح في الكود |
|---|------------|---------------|------------------|
| 1 | **Banner** | Palestine Train — Banner | `bannerAndroid` |
| 2 | **Interstitial** | Palestine Train — Interstitial | `interstitialAndroid` |
| 3 | **Rewarded** | Palestine Train — Rewarded | `rewardedAndroid` |

لكل وحدة: انسخ **Ad unit ID** — الشكل: `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY`.

كرر للـ iOS عند جاهزية App Store (`bannerIOS`, `interstitialIOS`, `rewardedIOS`).

---

## الخطوة 4 — لصق المعرفات في الكود

### أ) `app/js/ads/admob-config.js`

```javascript
export const ADMOB_CONFIG = {
  enabled: true,           // ← اتركه true (الربح مفعّل)
  USE_TEST_ADS: false,     // ← غيّره إلى false للإنتاج

  appIdAndroid: 'ca-app-pub-XXXX~YYYY',     // App ID من الخطوة 2
  appIdIOS: 'ca-app-pub-XXXX~YYYY',         // عند جاهزية iOS

  adUnits: {
    bannerAndroid: 'ca-app-pub-XXXX/YYYY',
    interstitialAndroid: 'ca-app-pub-XXXX/YYYY',
    rewardedAndroid: 'ca-app-pub-XXXX/YYYY',
    // iOS...
  },
};
```

### ب) `mobile/capacitor.config.json`

```json
"AdMob": {
  "appIdAndroid": "ca-app-pub-XXXX~YYYY",
  "appIdIOS": "ca-app-pub-XXXX~YYYY",
  "initializeForTesting": false
}
```

| الإعداد | التطوير | الإنتاج (المتجر) |
|---------|---------|------------------|
| `USE_TEST_ADS` | `true` | **`false`** |
| `initializeForTesting` | `true` | **`false`** |
| App IDs | معرفات Google التجريبية | **معرفاتك الحقيقية** |

---

## الخطوة 5 — مزامنة وبناء

```bash
cd mobile
npx cap sync android
cd android
gradlew.bat assembleRelease   # أو bundleRelease للـ AAB
```

---

## الخطوة 6 — التحقق على جهاز حقيقي

1. ثبّت APK/AAB release (أو internal testing track).
2. افتح اللعبة — يجب **ألا** ترى «Test Ad» أو «Google Test Ads».
3. جرّب:
   - Banner أسفل الشاشة.
   - انتقل بين القائمة واللعب → Interstitial.
   - اضغط «🎬 شاهد إعلاناً — تلميح» → Rewarded ثم المكافأة.

إن ظهر «Test Ad» → راجع أن `USE_TEST_ADS: false` و `initializeForTesting: false` ومعرفاتك حقيقية.

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| لا إعلانات | انتظر 24–48 ساعة بعد إنشاء الوحدات؛ تحقق من App ID في `capacitor.config.json` |
| Test Ad فقط | `USE_TEST_ADS` أو `initializeForTesting` لا يزال `true` |
| Rewarded لا يمنح مكافأة | تحقق من اتصال الإنترنت؛ راجع Logcat لـ `[NativeAds]` |
| Plugin not found | `cd mobile && npm install && npx cap sync` |

---

## ملفات ذات صلة

- `mobile/STORE_RELEASE.md` — قائمة النشر الكاملة
- `app/js/ads/native-ads.js` — جسر AdMob
- `app/js/ads/ad-manager.js` — يختار AdMob (جوال) أو AdSense (ويب)
- `app/privacy.html` — سياسة الخصوصية (مطلوبة للمتجر)

---

Global Scout Coalition for Quds and Palestine · scout4pal.com
