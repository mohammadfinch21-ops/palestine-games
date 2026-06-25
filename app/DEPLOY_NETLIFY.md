# نشر ألعاب فلسطين على Netlify + AdSense
# Deploy Palestine Games to Netlify + AdSense

> **المجلد الذي ترفعه:**  
> - **سحب وإفلات:** `netlify-deploy/` (يُنشأ بالسكربت، < 10 MB) — **ليس** `app/`  
> - **Git:** `app/` كاملاً (~176 MB، بدون حد)

---

## ⚠️ حد 10 MB — السحب والإفلات

Netlify **Deploy manually** ([app.netlify.com/drop](https://app.netlify.com/drop)) يرفض المجلدات **> 10 MB**.

| | الحجم |
|---|------|
| مجلد `app/` الكامل | **~176 MB** |
| `assets/images/questions/` | **~110 MB** (784 JPEG) |
| `assets/images/memory/` | **~26 MB** (68 مستخدمة في اللعب) |
| `assets/الخارطة.pdf` | **~7.4 MB** |
| `assets/pdf-page-1-preview.png` | **~3 MB** |
| صور تصحيح PDF (`_pdf_img_*`, `pdf-img-*`) | **~15 MB** |
| `.git/` + سكربتات Python + سجلات | **~7.5 MB** |

**لا تسحب `app/` مباشرة.** استخدم `prepare-netlify-deploy.ps1` أو Git.

---

## 🇵🇸 العربية — خطواتك الآن (بالترتيب)

### المرحلة 1: حساب Netlify ونشر الموقع

#### الخيار أ — سحب وإفلات (~3 دقائق) — **مجلد `netlify-deploy/` < 10 MB**

1. **ابنِ مجلد النشر** (لا يحذف الأصول الأصلية):

```powershell
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\app"
.\prepare-netlify-deploy.ps1
```

أو انقر: **`prepare-netlify-deploy.bat`**

2. ينشئ **`app/netlify-deploy/`** (~**9.99 MB**):
   - HTML / CSS / JS / `netlify.toml`
   - **857 أصلًا مستخدمًا** فقط (بطاقات + خريطة + شعار)
   - ضغط JPEG البطاقات (340px، جودة ~42)
   - **يستبعد:** PDF، Python، سجلات، صور تصحيح، `.git`
   - رابط «PDF» → **صورة الخريطة المضغوطة**

3. **[app.netlify.com/drop](https://app.netlify.com/drop)** → اسحب **`netlify-deploy/`** (وليس `app/`).
4. انتظر 30–60 ثانية → `https://random-name-12345.netlify.app`
5. تحقق: القائمة، **لعبة القطار**، **بطاقات الذاكرة**، **سياسة الخصوصية**.

#### الخيار ب — GitHub + Netlify (موصى به — **بدون حد 10 MB**)

1. أنشئ مستودعاً على **[github.com/new](https://github.com/new)** (مثلاً `palestine-games`).
2. في PowerShell:

```powershell
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\app"
git init
git add .
git commit -m "Initial deploy: Palestine Games"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/palestine-games.git
git push -u origin main
```

3. Netlify → **Add new site → Import an existing project** → GitHub → اختر المستودع.
4. إعدادات البناء (يُقرأ `netlify.toml` تلقائياً):

| الحقل | القيمة |
|-------|--------|
| Branch to deploy | `main` |
| Base directory | *(فارغ)* |
| Build command | *(فارغ)* |
| Publish directory | `.` |

5. **Deploy site**. `.netlifyignore` يستبعد سكربتات التطوير وصور التصحيح — **يبقي كل البطاقات وPDF**.

| | `netlify-deploy/` | Git |
|---|------------------|-----|
| حد الحجم | **≤ 10 MB** | **لا يوجد** |
| جودة الصور | مضغوطة | أصلية |
| PDF الخارطة | ❌ (صورة بديلة) | ✅ |

#### حالة Git على جهازك (آخر فحص)

| الموقع | الحالة |
|--------|--------|
| `لعبة قطار فلسطين\` | **ليس** مستودع Git (لا يوجد `.git`) |
| `لعبة قطار فلسطين\app\` | جاهز للنشر؛ فيه `netlify.toml` و `.gitignore` |
| `الوسام المقدسي\` | يوجد `.git` لكن **بدون commits** و **بدون remote** — ولا يشمل مشروع اللعبة |

> **ملاحظة:** شغّل `prepare-netlify-deploy.ps1` لإنشاء `netlify-deploy/` (~10 MB). Git يتجاوز حد السحب‑والإفلات.

#### أي مستودع على GitHub؟ (اختر واحداً)

**الخيار أ — موصى به:** مستودع يحتوي **محتوى `app/` فقط** (جذر المستودع = ملفات الموقع مباشرة).

| حقل Netlify | القيمة |
|-------------|--------|
| Branch to deploy | `main` |
| Base directory | *(فارغ)* |
| Build command | *(فارغ)* |
| Publish directory | `.` |

**الخيار ب:** مستودع لمجلد **`لعبة قطار فلسطين` كاملاً** (يتضمن `app/` و `mobile/`). استخدم `.gitignore` في جذر المشروع (تمت إضافته).

| حقل Netlify | القيمة |
|-------------|--------|
| Branch to deploy | `main` |
| Base directory | `app` |
| Build command | *(فارغ)* |
| Publish directory | `.` |

*(المجلد `app/` ~176 MB — مناسب لـ GitHub؛ تجنّب ملفات واحدة أكبر من 100 MB.)*

#### أوامر الرفع إلى GitHub (نفّذها أنت — لا يتم الدفع تلقائياً)

**خيار أ — مستودع `app/` فقط:**

```powershell
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\app"
git init
git add .
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "Initial deploy: Palestine Games"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/palestine-games.git
git push -u origin main
```

**خيار ب — مستودع المجلد الأب:**

```powershell
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين"
git init
git add .
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "Initial: Palestine Train Game (web + mobile)"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/palestine-train-game.git
git push -u origin main
```

1. أنشئ المستودع فارغاً على [github.com/new](https://github.com/new) (بدون README إذا كان لديك commits محلية).
2. في Netlify: **Add new site → Import an existing project → GitHub** → اختر المستودع → املأ الجدول أعلاه → **Deploy site**.
 كل `git push` يعيد النشر تلقائياً.

---

### المرحلة 2: إعدادات Netlify بعد النشر

1. **Site configuration → Domain management**
   - الرابط الافتراضي `*.netlify.app` يعمل فوراً مع **HTTPS**.
   - فعّل **HTTPS → Automatic TLS** (مفعّل افتراضياً).
   - فعّل **Force HTTPS** إن لم يكن مفعّلاً.

2. **تحديث روابط SEO** (بعد معرفة رابطك النهائي):
   - `index.html` → `canonical` و `og:url` — استبدل `YOUR-SITE.netlify.app`
   - `robots.txt` → سطر `Sitemap:`
   - `sitemap.xml` → جميع عناوين `<loc>`

3. **(اختياري) نطاق مخصّص** — مثلاً `games.scout4pal.com`:
   - Netlify → **Add a domain**
   - عند الم registrar: **CNAME** → `your-site.netlify.app`  
     أو **A record** → `75.2.60.5`
   - انتظر التحقق ثم HTTPS تلقائي (Let's Encrypt)

4. **اختبار سريع:**

```powershell
cd app
npx --yes serve .
# افتح http://localhost:3000 — نفس المسارات النسبية css/ js/ assets/
```

---

### المرحلة 3: التقديم على Google AdSense

> **مهم:** AdSense يتطلب موقعاً **منشوراً على HTTPS** مع **صفحة خصوصية**.  
> الموقع جاهز بـ `privacy.html` — لا تتقدم قبل النشر.

#### في لوحة AdSense (خطواتك أنت — لا يمكن إنشاء الحساب نيابةً عنك)

1. ادخل **[https://www.google.com/adsense](https://www.google.com/adsense)** → **Get started**.
2. سجّل بحساب Google.
3. **Sites → Add site** → أدخل رابطك الكامل:  
   `https://your-site.netlify.app` (أو نطاقك المخصّص).
4. **التحقق من الملكية** — اختر إحدى الطريقتين:
   - **Meta tag:** انسخ `<meta name="google-adsense-account" content="ca-pub-...">`  
     الصقه داخل `<head>` في `index.html` (فوق `</head>`) → أعد النشر → **Verify** في AdSense.
   - **DNS:** أضف سجل TXT عند الم registrar كما يطلب AdSense.
5. **انتظر المراجعة** — عادة 1–14 يوماً (أحياناً أطول). ستصلك رسالة بريد عند الموافقة أو الرفض.
6. بعد **الموافقة**:
   - **Account → Account information** → انسخ **Publisher ID** (`ca-pub-XXXXXXXXXXXXXXXX`)
   - **Ads → By ad unit → Display ads → Responsive** — أنشئ 4 وحدات:

| اسم مقترح في AdSense | مفتاح في `config.js` | مكان الظهور |
|----------------------|----------------------|-------------|
| Palestine — Banner Menu | `bannerMenu` | أسفل القائمة الرئيسية |
| Palestine — Banner Game | `bannerGame` | أسفل لعبة القطار والذاكرة |
| Palestine — Interstitial | `interstitial` | بين الشاشات / كل 3 أدوار |
| Palestine — Rewarded | `rewarded` | زر «شاهد إعلاناً» |

7. لكل وحدة: انسخ **Slot ID** (رقم مثل `1234567890`).

---

### المرحلة 4: تفعيل الإعلانات الحقيقية في الكود

**الملف:** `js/ads/config.js`

```javascript
USE_PLACEHOLDER_ADS: false,   // ← غيّر من true إلى false

publisherId: 'ca-pub-1234567890123456',  // ← Publisher ID الحقيقي

adUnits: {
  bannerMenu: '1234567890',
  bannerGame: '1234567891',
  interstitial: '1234567892',
  rewarded: '1234567893',
},
```

**(اختياري)** في `index.html` أزل التعليق عن سطر `<script async src="...adsbygoogle.js...">`  
*(الكود يحمّل AdSense تلقائياً من `ad-manager.js` — السطر في `<head>` اختياري)*

**أعد النشر:**
- سحب وإفلات **`netlify-deploy/`** (أعد تشغيل `prepare-netlify-deploy.ps1`)، أو
- `git add . && git commit -m "Enable AdSense" && git push`

**تحقق:** افتح الموقع — يجب أن تظهر إعلانات Google بدلاً من الصناديق الرمادية «Placeholder».

---

### المرحلة 5: قبل AdSense — ماذا ترى الآن؟

| الإعداد | ما يظهر |
|---------|---------|
| `USE_PLACEHOLDER_ADS: true` | صناديق رمادية «إعلان · Ad» — **آمن للنشر والمراجعة** |
| `USE_PLACEHOLDER_ADS: false` + IDs حقيقية | إعلانات Google AdSense |

**اترك `true` حتى الموافقة** — Google يراجع المحتوى والخصوصية أولاً.

---

### ملفات النشر | المسارات

| المورد | المسار النسبي |
|--------|---------------|
| الصفحة الرئيسية | `/` أو `index.html` |
| CSS | `css/styles.css` |
| JavaScript | `js/app.js` (modules) |
| الخارطة PDF | `assets/الخارطة.pdf` |
| الخصوصية | `privacy.html` أو `/privacy` |
| إعداد Netlify | `netlify.toml` |

---

### استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| رفض Netlify / «folder too large» | لا تسحب `app/` — استخدم **`netlify-deploy/`** أو Git |
| صفحة بيضاء | تأكد أن `Publish directory = .` وليس مجلداً أباً |
| 404 على CSS/JS | المسارات نسبية من جذر `app/` — لا تغيّر البنية |
| AdSense لا يظهر | HTTPS؟ موافقة؟ `USE_PLACEHOLDER_ADS: false`؟ IDs صحيحة؟ |
| رفض AdSense | أضف محتوى كافياً، رابط خصوصية واضح، انتظر وأعد التقديم |
| Firebase أونلاين | مفاتيح في `js/firebase-config.js` — client-side طبيعي |

---

## 🇬🇧 English — Quick reference

### Deploy (drag & drop — **≤ 10 MB**)

1. Run `prepare-netlify-deploy.ps1` → creates `netlify-deploy/` (~9.99 MB)
2. [app.netlify.com/drop](https://app.netlify.com/drop) → drag **`netlify-deploy/`** (NOT `app/`)
3. Site live at `https://*.netlify.app` with HTTPS

### Deploy (Git — no size limit)

Import repo in Netlify. Settings from `netlify.toml`: publish `.`, no build command.

### AdSense (after HTTPS is live)

1. [google.com/adsense](https://www.google.com/adsense) → add your HTTPS URL
2. Verify via meta tag in `index.html` or DNS
3. Wait for approval (1–14 days)
4. Create 4 responsive Display ad units → copy Publisher ID + Slot IDs
5. Edit `js/ads/config.js`: set `USE_PLACEHOLDER_ADS: false` and paste IDs
6. Redeploy

### Custom domain (optional)

Netlify → Domain management → Add domain → CNAME to `your-site.netlify.app` or A → `75.2.60.5`.

Update `YOUR-SITE.netlify.app` in `index.html`, `robots.txt`, `sitemap.xml`.

---

## 📁 Related docs

| File | Purpose |
|------|---------|
| `prepare-netlify-deploy.ps1` | Build slim `netlify-deploy/` for drag-drop |
| `build_netlify_deploy.py` | Compression logic (called by PS1) |
| `.netlifyignore` | Exclude dev files on Git deploy |
| `DEPLOY.md` | General deployment overview |
| `ADS_SETUP.md` | Ad types, revenue, AdMob for mobile |
| `js/ads/config.js` | Publisher ID + slot IDs |
| `privacy.html` | Required for AdSense |
| `netlify.toml` | Publish dir, headers, redirects |

---

Global Scout Coalition for Quds and Palestine · scout4pal.com
