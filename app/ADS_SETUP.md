# دليل إعداد الإعلانات وتحقيق الأرباح
# Ad Setup & Monetization Guide

> **للنشر على Netlify + خطوات AdSense خطوة بخطوة:** راجع **`DEPLOY_NETLIFY.md`** أولاً.

---

## 🇵🇸 خطوات AdSense في لوحة التحكم (بالتفصيل)

> لا يمكن إنشاء حساب AdSense نيابةً عنك — نفّذ هذه الخطوات في [google.com/adsense](https://www.google.com/adsense).

| # | أين في AdSense | ماذا تفعل |
|---|----------------|-----------|
| 1 | **Get started** | سجّل بحساب Google |
| 2 | **Sites → Add site** | أدخل `https://your-site.netlify.app` (يجب HTTPS + الموقع منشور) |
| 3 | **Verification** | Meta tag في `index.html` **أو** سجل DNS TXT → Deploy → Verify |
| 4 | *(انتظر)* | مراجعة Google — 1–14 يوماً |
| 5 | **Account → Account information** | انسخ **Publisher ID** → `ca-pub-XXXXXXXXXXXXXXXX` |
| 6 | **Ads → By ad unit → Display ads** | أنشئ وحدة Responsive باسم «Palestine — Banner Menu» → انسخ Slot ID → `bannerMenu` |
| 7 | نفس الصفحة | 3 وحدات إضافية → `bannerGame`, `interstitial`, `rewarded` |
| 8 | `js/ads/config.js` | الصق IDs، `USE_PLACEHOLDER_ADS: false` |
| 9 | Netlify | أعد النشر (drag-drop أو git push) |

**قبل الخطوة 8:** اترك `USE_PLACEHOLDER_ADS: true` — الصناديق الرمادية آمنة أثناء المراجعة.

---

## 🇵🇸 العربية

### نظرة عامة

تطبيق **لعبة قطار فلسطين** هو تطبيق **ويب (HTML/JavaScript)**. شبكة الإعلانات المناسبة هي **Google AdSense** (للمواقع والتطبيقات المنشورة على الويب).

> **ملاحظة:** إذا حوّلت اللعبة لاحقاً إلى تطبيق Expo/React Native، استخدم **Google AdMob** بدلاً من AdSense. راجع قسم «التطبيقات المحمولة» في الأسفل.

---

### أنواع الإعلانات المدمجة

| النوع | المكان | الهدف |
|-------|--------|-------|
| **Banner (شريطي)** | القائمة الرئيسية، أسفل لعبة القطار، أسفل لعبة الذاكرة، شريط ثابت أسفل الشاشة | دخل مستمر (CPM) |
| **Interstitial (بين الشاشات)** | عند الدخول/الخروج من الألعاب، كل 3 أدوار في القطار، عند الفوز/الخسارة، عند إكمال 2/4/6 أزواج في الذاكرة | دخل أعلى لكل ظهور |
| **Rewarded (مكافأة)** | زر اختياري: «شاهد إعلاناً» — +2 خطوات في القطار، أو كشف زوج في الذاكرة | دخل + UX جيد (اختياري) |

---

### الخطوة 1: إنشاء حساب Google AdSense

1. ادخل إلى [https://www.google.com/adsense](https://www.google.com/adsense)
2. سجّل بحساب Google
3. أضف **موقعك** (يجب أن يكون منشوراً على HTTPS — مثل GitHub Pages، Netlify، Firebase Hosting)
4. انسخ كود التحقق من AdSense وضعه في `<head>` لموقعك (أو استخدم DNS)
5. انتظر **مراجعة Google** (عادة 1–14 يوماً، أحياناً أطول)
6. بعد الموافقة، احصل على **Publisher ID** بصيغة: `ca-pub-XXXXXXXXXXXXXXXX`

---

### الخطوة 2: إنشاء وحدات الإعلان (Ad Units)

في AdSense → **Ads → By ad unit → Display ads**:

| الوحدة | النوع المقترح | الاسم في الكود |
|--------|---------------|----------------|
| قائمة رئيسية | Responsive display | `bannerMenu` |
| أثناء اللعب | Responsive display | `bannerGame` |
| بين الجلسات | Responsive display (كبير) | `interstitial` |
| مكافأة | Responsive display | `rewarded` |

انسخ **Slot ID** لكل وحدة (رقم مثل `1234567890`).

---

### الخطوة 3: لصق المعرفات في الكود

**الملف الرئيسي:** `app/js/ads/config.js`

```javascript
export const AD_CONFIG = {
  enabled: true,
  USE_PLACEHOLDER_ADS: false,  // ← غيّر إلى false بعد إدخال المعرفات

  publisherId: 'ca-pub-XXXXXXXXXXXXXXXX',  // ← Publisher ID

  adUnits: {
    bannerMenu: '1234567890',      // ← Slot ID
    bannerGame: '1234567891',
    interstitial: '1234567892',
    rewarded: '1234567893',
  },
  // ...
};
```

**اختياري — في `app/index.html`:** أزل التعليق عن سطر AdSense في `<head>` واستبدل `ca-pub-XXXXXXXXXXXXXXXX`.

---

### الخطوة 4: النشر على الإنترنت

AdSense **لا يعمل** على `file://` أو localhost بشكل كامل. انشر على:

- [GitHub Pages](https://pages.github.com) (مجاني)
- [Netlify](https://www.netlify.com) (مجاني)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Vercel](https://vercel.com)

ارفع مجلد `app/` كاملًا.

---

### كيف يعمل الدخل؟

| المصطلح | المعنى |
|---------|--------|
| **Impression (ظهور)** | كل مرة يُعرض فيها الإعلان — تُدفع مقابلها (CPM = تكلفة لكل 1000 ظهور) |
| **Click (نقرة)** | عندما ينقر المستخدم — أرباح أعلى (CPC) |
| **CPM** | متوسط 0.5–5$ لكل 1000 ظهور (يختلف حسب البلد والمحتوى) |
| **eCPM** | متوسط الأرباح الفعلية لكل 1000 ظهور |

**تقدير تقريبي:** 1000 زائر/يوم × 5 ظهورات × CPM 1$ ≈ **5$/يوم** (تقدير فقط — يختلف كثيراً).

---

### أفضل الممارسات (UX + سياسات Google)

1. **لا تفرط في الإعلانات** — التطبيق يستخدم cooldown 45 ثانية بين الإعلانات البينية
2. **المكافآت اختيارية** — اللاعب يختار «شاهد إعلاناً»
3. **لا تضع إعلانات فوق أزرار اللعب** — تم وضع البanners في أسفل الشاشة
4. **محتوى تعليمي/ثقافي** — محتوى فلسطين التاريخي يساعد في قبول AdSense
5. **سياسة خصوصية** — أضف صفحة privacy policy على موقعك (مطلوب لـ AdSense)

---

### الجدول الزمني للبدء بالربح

| المرحلة | المدة |
|---------|-------|
| نشر الموقع + طلب AdSense | 1–3 أيام |
| مراجعة AdSense | 1–14 يوم (أحياناً 4 أسابيع) |
| أول ظهور للإعلانات الحقيقية | فور الموافقة |
| أول دفعة | AdSense يدفع عند ≥ **100$** (شهرياً بعد تجاوز الحد) |

---

### التطبيقات المحمولة (Capacitor — جاهز)

المشروع يتضمن مجلد **`mobile/`** مع Capacitor + AdMob:

- دليل البناء: **`mobile/MOBILE_BUILD.md`**
- إعداد AdMob: **`js/ads/admob-config.js`**
- جسر الإعلانات: **`js/ads/native-ads.js`**

```bash
cd mobile
npm install
npx cap sync
npx cap open android
```

---

### الملفات المتعلقة بالإعلانات

| الملف | الوظيفة |
|-------|---------|
| `js/ads/config.js` | المعرفات والإعدادات |
| `js/ads/ad-manager.js` | تحميل AdSense، interstitial، rewarded |
| `index.html` | حاويات Banner + تعليق AdSense |
| `css/styles.css` | تنسيق الإعلانات |
| `js/app.js` | إعلانات عند تغيير الشاشة |
| `js/train-game.js` | إعلانات القطار + مكافأة |
| `js/memory-game.js` | إعلانات الذاكرة + مكافأة |

---

### التشغيل والاختبار

```bash
cd app
npx --yes serve .
```

- **`USE_PLACEHOLDER_ADS: true`** — صناديق رمادية بدون إعلانات حقيقية (آمن للتطوير)
- **`USE_PLACEHOLDER_ADS: false`** + معرفات حقيقية — إعلانات AdSense (على موقع منشور)

---

## 🇬🇧 English

### Overview

**Palestine Train Game** is a **web app (HTML/JS)**. Use **Google AdSense** for monetization when hosted on the web.

For native mobile wrappers (Capacitor/Cordova), switch to **Google AdMob**.

---

### Integrated Ad Placements

| Type | Location | Revenue goal |
|------|----------|--------------|
| **Banner** | Main menu, train game footer, memory game footer, sticky bottom bar | Steady CPM income |
| **Interstitial** | Screen transitions, every 3 train turns, game over/win, memory pairs 2/4/6, game complete | Higher per-view revenue |
| **Rewarded** | Optional: +2 steps (train) or reveal one pair (memory) | High engagement + good UX |

---

### Step 1: Create AdSense Account

1. Go to [https://www.google.com/adsense](https://www.google.com/adsense)
2. Sign up and add your **published HTTPS site**
3. Complete site verification
4. Wait for approval (typically 1–14 days)
5. Copy your **Publisher ID**: `ca-pub-XXXXXXXXXXXXXXXX`

---

### Step 2: Create Ad Units

AdSense → **Ads → By ad unit → Display ads**. Create 4 responsive units and map them:

| Unit | Config key in `config.js` |
|------|---------------------------|
| Main menu banner | `bannerMenu` |
| In-game banner | `bannerGame` |
| Interstitial overlay | `interstitial` |
| Rewarded overlay | `rewarded` |

---

### Step 3: Paste IDs in Code

Edit **`app/js/ads/config.js`**:

```javascript
USE_PLACEHOLDER_ADS: false,
publisherId: 'ca-pub-XXXXXXXXXXXXXXXX',
adUnits: {
  bannerMenu: 'YOUR_SLOT_ID',
  bannerGame: 'YOUR_SLOT_ID',
  interstitial: 'YOUR_SLOT_ID',
  rewarded: 'YOUR_SLOT_ID',
},
```

---

### Step 4: Deploy

Host the `app/` folder on GitHub Pages, Netlify, Firebase, or Vercel. AdSense requires a live HTTPS domain.

---

### How Revenue Works

- **CPM**: payment per 1,000 ad impressions
- **CPC**: payment per click (usually higher)
- Payout threshold: **$100** minimum balance
- Timeline: approval → ads live immediately → first payout after threshold

---

### UX Best Practices

- 45-second cooldown between interstitials (configured in `config.js`)
- Rewarded ads are **opt-in** only
- Banners at bottom, not blocking gameplay buttons
- Add a **Privacy Policy** page (AdSense requirement)

---

### Testing

```bash
cd app
npx --yes serve .
```

Use `USE_PLACEHOLDER_ADS: true` for local dev. Switch to `false` with real IDs on production.

---

### Publishing to App Stores

Native mobile wrapper is ready in **`mobile/`**:

1. Build with **Capacitor** — see **`mobile/MOBILE_BUILD.md`**
2. Use **AdMob** (`js/ads/admob-config.js`) — not AdSense
3. Google Play: $25 one-time; App Store: $99/year Apple Developer

---

Global Scout Coalition for Quds and Palestine · scout4pal.com
