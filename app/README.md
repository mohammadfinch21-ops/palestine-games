# لعبة قطار فلسطين — Palestine Train Game

**الإئتلاف الكشفي العالمي للقدس وفلسطين**  
*The Global Scout Coalition for Quds and Palestine* · [scout4pal.com](https://scout4pal.com)

تطبيق ويب + محمول (Android / iOS) يضم لعبتين:

1. **لعبة قطار فلسطين** — لوحة 100 مربعاً عن التاريخ الفلسطيني
2. **بطاقات الذاكرة** — مطابقة مدن وأحداث

---

## هيكل المشروع

```
لعبة قطار فلسطين/
├── app/          ← التطبيق الويب (HTML/CSS/JS) — انشر هذا المجلد
│   └── assets/
│       ├── logo-square.png   ← شعار الإئتلاف (مستخرج من الخارطة)
│       ├── logo-full.png     ← الشعار مع اسم المنظمة
│       └── favicon-32.png
├── mobile/       ← Capacitor (Android + iOS) — أيقونات من logo-square.png
└── الخارطة.pdf   ← نسخة أصلية (نسخة داخل app/assets/ للنشر)
```

### الهوية البصرية

| العنصر | القيمة |
|--------|--------|
| **اسم اللعبة** | لعبة قطار فلسطين |
| **المنظمة (عربي)** | الإئتلاف الكشفي العالمي للقدس وفلسطين |
| **المنظمة (إنجليزي)** | The Global Scout Coalition for Quds and Palestine |
| **الشعار** | `app/assets/logo-square.png` — قبة الصخرة على كرة أرضية صفراء بإطار حبل كشفي أخضر |
| **إعادة توليد الأصول** | `python app/make_logo_assets.py` (يتطلب PyMuPDF + Pillow) |

---

## 🌐 الويب — النشر على الإنternet (AdSense)

| | |
|---|---|
| **المضيف** | [Netlify](https://www.netlify.com) (HTTPS مجاني) |
| **الدليل** | [`app/DEPLOY.md`](app/DEPLOY.md) |
| **الإعلانات** | Google **AdSense** — [`app/ADS_SETUP.md`](app/ADS_SETUP.md) |
| **الخصوصية** | [`app/privacy.html`](app/privacy.html) (مطلوب لـ AdSense) |

### انشر الآن (سريع)

1. افتح [app.netlify.com/drop](https://app.netlify.com/drop)
2. اسحب مجلد **`app/`** بالكامل
3. احصل على رابط HTTPS → أضفه في AdSense

### تشغيل محلي

```bash
cd app
npx --yes serve .
```

---

## 📱 الجوال — Android + iOS (AdMob)

| | |
|---|---|
| **التقنية** | [Capacitor](https://capacitorjs.com) يغلّف `app/` |
| **الدليل** | [`mobile/MOBILE_BUILD.md`](mobile/MOBILE_BUILD.md) |
| **الإعلانات** | Google **AdMob** — `app/js/ads/admob-config.js` |

### بناء APK (Android)

```bash
cd mobile
npm install
npx cap add android
npx cap sync
npx cap open android
```

Android Studio → **Build APK** → `app-debug.apk`

---

## 💰 الإعلانات: ويب vs جوال

| المنصة | الشبكة | ملف الإعداد |
|--------|--------|-------------|
| موقع Netlify | **AdSense** | `app/js/ads/config.js` |
| APK / App Store | **AdMob** | `app/js/ads/admob-config.js` |

- **ويب:** Banner + Interstitial + Rewarded عبر AdSense
- **جوال:** نفس الأماكن عبر `@capacitor-community/admob`
- **تطوير:** `USE_PLACEHOLDER_ADS: true` (ويب) / `USE_TEST_ADS: true` (جوال)

---

## طريقة اللعب — القطار

1. كل لاعب يجيب سؤالاً لتحديد من يبدأ
2. اسحب سؤالاً أو ارمِ النرد
3. حواجز: تراجع 3 خطوات
4. أول من يصل للمربع 100 (القدس) يفوز

## طريقة اللعب — الذاكرة

اقلب بطاقتين؛ إذا تطابقتا تبقيان مكشوفتين.

---

## 🇬🇧 English summary

- **Web:** Deploy `app/` to Netlify → see `DEPLOY.md` → monetize with AdSense
- **Mobile:** Build with Capacitor in `mobile/` → see `MOBILE_BUILD.md` → monetize with AdMob
- **Privacy:** Required for both AdSense and app stores — `privacy.html`

---

**الإئتلاف الكشفي العالمي للقدس وفلسطين** · scout4pal.com
