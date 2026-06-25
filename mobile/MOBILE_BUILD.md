# دليل بناء التطبيق المحمول
# Mobile Build Guide (Capacitor + AdMob)

> المجلد: `mobile/` — يغلّف محتوى الويب من `../app/` داخل WebView أصلي.
> **واجهة الجوال ≠ موقع الويب:** التطبيق يكتشف Capacitor ويُفعّل تجربة أصلية (شريط سفلي، شاشة كاملة، انتقالات).

---

## 🇵🇸 العربية

### الفرق بين الويب والتطبيق

| الميزة | متصفح الويب (`app/`) | تطبيق Capacitor (`mobile/`) |
|--------|----------------------|-----------------------------|
| الكشف | بدون `native-app` | `Capacitor.isNativePlatform()` → `body.native-app` |
| التنقل | بطاقات القائمة + زر «القائمة» | **شريط تبويب سفلي** (🏠 🚂 🃏 ℹ️) |
| التخطيط | تخطيط سطح المكتب/الويب | ملء الشاشة + safe-area + لوحة قطار قابلة للتمرير |
| الشريط الجانبي (القطار) | عمود ثابت | **لوحة سفلية** (bottom sheet) عبر ☰ |
| الإعلانات | AdSense (Netlify) | AdMob (أصلي) |
| شاشة البداية | — | Splash بشعار فلسطين (#1a3d2e) |
| CSS | `styles.css` | `styles.css` + `mobile-native.css` (`.native-app` فقط) |

الملفات الرئيسية:
- `app/js/native-app.js` — StatusBar، SplashScreen، شريط سفلي
- `app/css/mobile-native.css` — تخطيط الجوال
- `app/js/app.js` — انتقالات الشاشات + ربط التبويبات

---

### المتطلبات

| الأداة | Android | iOS |
|--------|---------|-----|
| Node.js 18+ | ✅ | ✅ |
| Android Studio | ✅ | — |
| JDK 17 | ✅ | — |
| Xcode (Mac فقط) | — | ✅ |
| Apple Developer ($99/سنة) | — | للنشر |
| Google Play Console ($25 مرة واحدة) | للنشر | — |

---

### 1) التثبيت الأول

```bash
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\mobile"
npm install
npx cap add android
npx cap add ios
```

#### أصول الشعار والـ Splash (مرة واحدة أو بعد تغيير الشعار)

```bash
cd "../app"
python make_logo_assets.py      # logo.png + أيقونات Android/iOS
python generate_splash_assets.py   # splash Android + iOS
```

```bash
cd "../mobile"
npx cap sync
```

- **`npx cap sync`** ينسخ ملفات `app/` إلى المشروع الأصلي ويحدّث الإضافات (AdMob، SplashScreen، StatusBar).

---

### 2) اختبار على محاكي Android / جهاز

```bash
cd mobile
npx cap sync android
npx cap open android
```

في **Android Studio**:
1. **Tools → Device Manager** → أنشئ محاكي (مثلاً Pixel 6، API 34)
2. اضغط **Run ▶** (أو Shift+F10)
3. تحقق من: شاشة Splash → شريط التبويب السفلي → انتقالات بين الشاشات → ☰ لفتح لوحة القطار

**من سطر الأوامر (APK تجريبي):**

```bash
cd mobile\android
gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

**ملاحظة:** في المتصفح (`app/index.html`) يبقى التصميم القديم — لاختبار الواجهة الأصلية استخدم المحاكي أو `adb` وليس Chrome فقط.

---

### 3) بناء APK — Android (تجريبي Debug)

```bash
cd mobile
npx cap sync android
npx cap open android
```

في **Android Studio**:
1. انتظر Gradle Sync
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. APK جاهز في: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

أو من سطر الأوامر (Windows):

```bash
cd mobile\android
gradlew.bat assembleDebug
```

ثبّت على جهاز:

```bash
adb install app\build\outputs\apk\debug\app-debug.apk
```

---

### 4) بناء APK/AAB — إصدار Release (Google Play)

#### أ) إنشاء مفتاح التوقيع (مرة واحدة)

```bash
keytool -genkey -v -keystore palestine-train-release.keystore -alias palestine-train -keyalg RSA -keysize 2048 -validity 10000
```

**احفظ كلمة المرور والملف في مكان آمن — لا ترفعه إلى Git.**

#### ب) إعداد Gradle

أنشئ `mobile/android/key.properties` (غير مُتتبّع في Git):

```properties
storeFile=../palestine-train-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=palestine-train
keyPassword=YOUR_KEY_PASSWORD
```

في Android Studio: **Build → Generate Signed Bundle / APK** → **Android App Bundle (AAB)** موصى به للـ Play Store.

أو:

```bash
cd mobile\android
gradlew.bat bundleRelease
```

الملف: `android/app/build/outputs/bundle/release/app-release.aab`

---

### 4) بناء iOS (يتطلب Mac)

```bash
cd mobile
npx cap sync ios
npx cap open ios
```

في **Xcode**:
1. اختر Team (Apple Developer)
2. **Product → Archive**
3. **Distribute App** → App Store Connect أو Ad Hoc

> لا يمكن بناء IPA لـ App Store من Windows — استخدم Mac أو CI (مثل GitHub Actions + macOS runner).

---

### 5) AdMob على الجوال (مختلف عن AdSense)

| الويب (Netlify) | الجوال (Capacitor) |
|-----------------|---------------------|
| Google **AdSense** | Google **AdMob** |
| `app/js/ads/config.js` | `app/js/ads/admob-config.js` |
| Publisher `ca-pub-...` | App ID `ca-app-pub-...~...` |

#### خطوات AdMob

1. [admob.google.com](https://admob.google.com) → إنشاء تطبيق Android + iOS
2. أنشئ وحدات: Banner، Interstitial، Rewarded
3. عدّل **`app/js/ads/admob-config.js`**:
   - `USE_TEST_ADS: false`
   - `appIdAndroid`, `appIdIOS`
   - `adUnits.*` بمعرفاتك الحقيقية
4. عدّل **`mobile/capacitor.config.json`** → `plugins.AdMob.appIdAndroid` / `appIdIOS`
5. `npx cap sync` ثم أعد البناء

**معرفات الاختبار (افتراضياً):** Google Test IDs — آمنة أثناء التطوير.

راجع أيضاً **`app/ADS_SETUP.md`**.

---

### 6) النشر — Google Play Store

1. [play.google.com/console](https://play.google.com/console) — رسوم $25
2. **Create app** → اسم «لعبة قطار فلسطين»
3. **Release → Production → Create new release** → ارفع `app-release.aab`
4. **Store listing**: وصف، لقطات شاشة، أيقونة 512×512
5. **Privacy policy URL**: رابط `privacy.html` على Netlify (مطلوب)
6. **Content rating** + **Target audience**
7. **Ads**: نعم — يستخدم AdMob
8. أرسل للمراجعة (1–7 أيام عادة)

---

### 7) النشر — Apple App Store

1. [developer.apple.com](https://developer.apple.com) — $99/سنة
2. App Store Connect → **New App**
3. ارفع البناء عبر Xcode Archive
4. **App Privacy** + رابط سياسة الخصوصية
5. **Advertising Identifier** — نعم (AdMob)
6. Review (1–3 أيام عادة)

---

### 8) تحديث اللعبة بعد تعديل `app/`

```bash
cd mobile
npx cap sync
# ثم أعد البناء في Android Studio / Xcode
```

---

### هيكل الملفات

| الملف | الوظيفة |
|-------|---------|
| `mobile/capacitor.config.json` | إعدادات Capacitor + AdMob App IDs |
| `mobile/package.json` | تبعيات Capacitor |
| `app/js/ads/admob-config.js` | معرفات وحدات AdMob |
| `app/js/ads/native-ads.js` | جسر AdMob في WebView |
| `app/js/native-app.js` | كشف Capacitor + StatusBar + SplashScreen + شريط سفلي |
| `app/css/mobile-native.css` | تخطيط أصلي (`.native-app` فقط) |
| `app/generate_splash_assets.py` | توليد splash من `assets/logo.png` |
| `app/js/ads/ad-manager.js` | يختار AdSense (ويب) أو AdMob (جوال) |

---

## 🇬🇧 English

### Web vs native UI

- **Browser:** unchanged layout (menu cards, back buttons, AdSense sticky banner).
- **Capacitor app:** `body.native-app` enables bottom tab bar, full-screen layout, slide transitions, train sidebar as bottom sheet, and native splash/status bar. Same game logic and RTL Arabic.

Regenerate branding after logo changes:

```bash
cd app && python make_logo_assets.py && python generate_splash_assets.py
cd ../mobile && npx cap sync
```

### Quick start

```bash
cd mobile
npm install
npx cap add android
npx cap sync
npx cap open android
```

Build debug APK: Android Studio → Build APK, or `gradlew assembleDebug`.

### Release

1. Create keystore with `keytool`
2. Sign AAB/APK in Android Studio
3. Upload AAB to Google Play Console

### iOS

Requires Mac + Xcode: `npx cap sync ios && npx cap open ios` → Archive → App Store Connect.

### Ads

- Web hosting → **AdSense** (`config.js`)
- Native app → **AdMob** (`admob-config.js` + `capacitor.config.json`)

Set `USE_TEST_ADS: false` and real IDs before store release.

---

Global Scout Coalition for Quds and Palestine · scout4pal.com
