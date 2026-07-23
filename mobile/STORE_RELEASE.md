# قائمة النشر في المتجر — قبل أي إصدار

> **التوصية الواضحة:** جهّز **كل** شيء للربح (AdMob + AdSense + توقيع + سياسة خصوصية) **قبل** رفع التطبيق أو الموقع للمراجعة.  
> **لا تنشر** بإعلانات تجريبية (`Test Ad`) — لن تحصل على أرباح.

**المشروع:** لعبة قطار فلسطين  
**الحزمة Android:** `com.scout4pal.palestinetrain`  
**الويب:** https://palestine-games.netlify.app

---

## نظرة عامة — الترتيب الإلزامي

```
المرحلة 1 → AdMob (حساب + تطبيق + 3 وحدات)
     ↓
المرحلة 2 → تعديل الكود (admob-config.js + capacitor.config.json + config.js للويب)
     ↓
المرحلة 3 → بناء release + جهاز حقيقي (بدون Test Ad)
     ↓
المرحلة 4 → Keystore + AAB
     ↓
المرحلة 5 → Google Play Console ($25)
     ↓
المرحلة 6 → AdSense للويب (مسار موازٍ)
     ↓
المرحلة 7 → App Store لاحقاً ($99/سنة — يتطلب Mac)
```

**المدة الواقعية:** 2–4 أسابيع من اليوم الأول حتى أول أرباح (مراجعة Google + fill rate).

---

## المرحلة 1 — AdMob (اليوم — في الكونsole)

راجع التفصيل: [`app/js/ads/ADMOB_SETUP.md`](../app/js/ads/ADMOB_SETUP.md)

- [ ] حساب [admob.google.com](https://admob.google.com)
- [ ] تطبيق Android: `com.scout4pal.palestinetrain`
- [ ] 3 وحدات: Banner، Interstitial، Rewarded
- [ ] نسخ App ID + 3 Ad unit IDs

---

## المرحلة 2 — إعداد الكود

### جوال (AdMob)

| الملف | ماذا تغيّر |
|-------|-----------|
| `app/js/ads/admob-config.js` | `USE_TEST_ADS: false` + App IDs + ad units |
| `mobile/capacitor.config.json` | `appIdAndroid` / `appIdIOS` + `initializeForTesting: false` |

```bash
cd mobile && npx cap sync
```

### ويب (AdSense)

| الملف | ماذا تغيّر |
|-------|-----------|
| `app/js/ads/config.js` | `USE_PLACEHOLDER_ADS: false` + `publisherId` + 4 slots |
| `app/index.html` | تفعيل سطر AdSense في `<head>` إن كان معطّلاً |

راجع: `app/ADS_SETUP.md` و `app/DEPLOY_NETLIFY.md`

### سياسة الخصوصية

- [ ] `app/privacy.html` منشور على Netlify
- [ ] الرابط جاهز لـ Play Console: `https://palestine-games.netlify.app/privacy.html`

---

## المرحلة 3 — اختبار Release على جهاز حقيقي

**هدف:** التأكد من **عدم** ظهور «Test Ad».

```bash
cd mobile
npx cap sync android
cd android
gradlew.bat assembleRelease
```

- [ ] ثبّت APK على هاتف Android
- [ ] Banner يظهر أسفل الشاشة (إعلان حقيقي)
- [ ] Interstitial عند التنقل / أثناء اللعب
- [ ] Rewarded من زر التلميح 🎬 يعمل ويمنح المكافأة
- [ ] **لا** يظهر نص Test Ad

> بدون `key.properties` قد يُوقَّع release بمفتاح debug — مناسب للاختبار الداخلي فقط.

---

## المرحلة 4 — Keystore + AAB (Google Play)

### 1) إنشاء Keystore (مرة واحدة — احفظه في مكان آمن)

```bash
keytool -genkey -v -keystore palestine-train-release.keystore -alias palestine-train -keyalg RSA -keysize 2048 -validity 10000
```

**⚠️ فقدان Keystore = لا يمكن تحديث التطبيق في Play Store.**

### 2) إعداد التوقيع

```bash
cd mobile/android
copy key.properties.example key.properties
# عدّل key.properties بكلمات المرور ومسار keystore
```

الملف `key.properties` **غير متتبّع** في Git.

### 3) بناء AAB

```bash
cd mobile/android
gradlew.bat bundleRelease
```

الملف: `mobile/android/app/build/outputs/bundle/release/app-release.aab`

---

## المرحلة 5 — Google Play Console ($25 مرة واحدة)

1. [play.google.com/console](https://play.google.com/console) — ادفع $25
2. **Create app** → «لعبة قطار فلسطين»
3. **Store listing:**
   - [ ] عنوان ووصف (عربي + إنجليزي)
   - [ ] أيقونة 512×512
   - [ ] لقطات شاشة (هاتف + tablet إن أمكن)
   - [ ] Feature graphic 1024×500
4. **App content:**
   - [ ] **Privacy policy URL:** `https://palestine-games.netlify.app/privacy.html`
   - [ ] **Ads:** نعم — التطبيق يحتوي إعلانات (AdMob)
   - [ ] **Content rating** — استبيان IARC
   - [ ] **Target audience** — عائلات / أطفال (حدّد بدقة)
   - [ ] **Data safety** — اذكر: معرفات إعلانية (Google AdMob)، بيانات Firebase للعب أونلاين، لا جمع بريد/حساب
5. **Release → Production** → ارفع `app-release.aab`
6. **Review** — عادة 1–7 أيام

---

## المرحلة 6 — AdSense للويب (مسار موازٍ)

| | AdMob (جوال) | AdSense (ويب) |
|---|-------------|---------------|
| الحساب | admob.google.com | adsense.google.com |
| الملف | `admob-config.js` | `config.js` |
| الموافقة | فورية غالباً للوحدات | قد تستغرق أيام–أسابيع |

- [ ] الموقع منشور HTTPS على Netlify
- [ ] طلب مراجعة AdSense لـ `palestine-games.netlify.app`
- [ ] بعد الموافقة: 4 وحدات Display + `USE_PLACEHOLDER_ADS: false`
- [ ] ربط AdMob بـ AdSense لتحويل أرباح التطبيق (Payments في AdMob)

**ملاحظة:** AdMob و AdSense يمكنهما العمل معاً — AdMob للـ APK، AdSense للمتصفح.

---

## المرحلة 7 — App Store (لاحقاً — $99/سنة)

- [ ] Apple Developer Program
- [ ] Mac + Xcode
- [ ] AdMob iOS App ID + 3 ad units
- [ ] `admob-config.js` → iOS IDs
- [ ] App Privacy: Advertising Identifier = نعم
- [ ] Archive → App Store Connect

لا يمكن بناء IPA للنشر من Windows — استخدم Mac أو CI.

---

## توقعات الأرباح (واقعية)

| المرحلة | التحميلات/الزيارات | دخل شهري تقريبي* |
|---------|-------------------|------------------|
| البداية (0–3 أشهر) | 100–500 مستخدم/شهر | $0–5 |
| نمو متوسط | 1,000–5,000 | $5–30 |
| نمو جيد (كشافة + مشاركة) | 10,000+ | $30–150+ |

\* تقديرات للألعاب التعليمية العربية — تعتمد على الدولة، fill rate، وعدد جلسات اللعب.  
**Rewarded + Interstitial** عادة أعلى من Banner.

---

## الجدول الزمني المقترح

| الأسبوع | المهام |
|---------|--------|
| **1** | AdMob setup + تعديل الكود + اختبار release |
| **1–2** | Keystore + AAB + Play Console listing |
| **2–3** | مراجعة Google Play + نشر production |
| **1–4** | AdSense review (بالتوازي) |
| **4+** | iOS عند توفر Mac + Developer account |

---

## قائمة تحقق سريعة — «جاهز للنشر؟»

- [ ] `USE_TEST_ADS: false`
- [ ] `initializeForTesting: false`
- [ ] معرفات AdMob حقيقية (ليست TODO_*)
- [ ] لا «Test Ad» على جهاز حقيقي
- [ ] `key.properties` + keystore آمن
- [ ] `app-release.aab` مُوقَّع
- [ ] privacy.html منشور
- [ ] Play Console: Ads = Yes
- [ ] AdSense: placeholders أو وحدات حقيقية (للويب)

---

## ملفات المشروع

| الملف | الغرض |
|-------|-------|
| `app/js/ads/ADMOB_SETUP.md` | خطوات AdMob بالتفصيل |
| `app/js/ads/admob-config.js` | معرفات AdMob |
| `mobile/capacitor.config.json` | App IDs للـ native plugin |
| `mobile/android/key.properties.example` | قالب التوقيع |
| `mobile/android/app/build.gradle` | signingConfig release |
| `mobile/MOBILE_BUILD.md` | بناء APK/AAB |
| `app/ADS_SETUP.md` | AdSense للويب |

---

Global Scout Coalition for Quds and Palestine · scout4pal.com
