# دليل النشر على الإنترنت
# Web Deployment Guide

> **المضيف المختار:** [Netlify](https://www.netlify.com) — HTTPS مجاني، نشر سريع، مناسب لـ AdSense.

> **📘 الدليل الكامل خطوة بخطوة:** [`DEPLOY_NETLIFY.md`](DEPLOY_NETLIFY.md) — Netlify + AdSense بالعربية والإنجليزية.

---

## 🇵🇸 العربية — انشر الآن (3 طرق)

### المتطلبات قبل AdSense

1. ✅ الموقع على **HTTPS** (Netlify يوفّرها تلقائياً)
2. ✅ صفحة **سياسة الخصوصية**: `privacy.html` (جاهزة)
3. ⏳ حساب [Google AdSense](https://www.google.com/adsense) + إضافة نطاقك
4. ⏳ بعد الموافقة: عدّل `js/ads/config.js` — راجع `ADS_SETUP.md`

---

### الطريقة 1: سحب وإفلات (الأسرع — بدون Git)

1. افتح [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. سجّل دخول (GitHub / Google / Email)
3. **اسحب مجلد `app/` كاملاً** إلى الصفحة
4. انتظر 30–60 ثانية — ستحصل على رابط مثل: `https://random-name-123.netlify.app`
5. (اختياري) **Domain settings → Add custom domain** لربط نطاقك

**تحديث لاحقاً:** اسحب المجلد مرة أخرى أو استخدم Netlify CLI:

```bash
cd app
npx netlify-cli deploy --prod --dir=.
```

---

### الطريقة 2: Git + Netlify (موصى بها للتحديثات)

#### أ) إعداد Git في مجلد `app/`

```bash
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\app"
git init
git add .
git commit -m "Initial deploy: Palestine Train Game"
```

#### ب) رفع إلى GitHub

1. أنشئ مستودعاً جديداً على [github.com/new](https://github.com/new) (مثلاً `palestine-train-game`)
2. اربط وادفع:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/palestine-train-game.git
git push -u origin main
```

#### ج) ربط Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. اختر GitHub → المستودع
3. إعدادات البناء (Netlify يقرأ `netlify.toml` تلقائياً):
   - **Base directory:** (فارغ — المستودع = مجلد app)
   - **Publish directory:** `.`
   - **Build command:** (فارغ)
4. **Deploy site**

كل `git push` إلى `main` يعيد النشر تلقائياً.

---

### الطريقة 3: Netlify CLI

```bash
npm install -g netlify-cli
cd app
netlify login
netlify init
netlify deploy --prod --dir=.
```

---

## تخصيص النطاق (Custom Domain)

1. Netlify → **Site configuration → Domain management → Add a domain**
2. أدخل نطاقك (مثلاً `game.scout4pal.com`)
3. عند الم registrar (GoDaddy, Namecheap, …):
   - **A record** → `75.2.60.5` (Netlify load balancer)
   - أو **CNAME** → `your-site.netlify.app`
4. فعّل **HTTPS** (Let's Encrypt — تلقائي بعد التحقق)
5. حدّث في الملفات:
   - `index.html` → `link rel="canonical"` و `og:url`
   - `robots.txt` و `sitemap.xml` → استبدل `YOUR-SITE.netlify.app`

---

## بعد النشر — AdSense

1. AdSense → **Sites → Add site** → أدخل `https://your-domain.com`
2. تحقق (meta tag في `<head>` أو DNS)
3. انسخ **Publisher ID** و **Slot IDs** إلى `js/ads/config.js`:

```javascript
USE_PLACEHOLDER_ADS: false,
publisherId: 'ca-pub-XXXXXXXXXXXXXXXX',
```

4. أزل التعليق عن سطر AdSense في `index.html` `<head>`
5. أعد النشر (push أو drag-drop)

---

## التحقق من المسارات

| المورد | المسار |
|--------|--------|
| CSS | `css/styles.css` |
| JS | `js/app.js` |
| الخارطة PDF | `assets/الخارطة.pdf` |
| الخصوصية | `privacy.html` |

اختبار محلي:

```bash
cd app
npx --yes serve .
```

---

## 🇬🇧 English — Deploy Now

### Quick deploy (Drag & Drop)

1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire **`app/`** folder
3. Your site is live at `https://*.netlify.app` with HTTPS

### Git + Netlify (recommended)

```bash
cd app
git init && git add . && git commit -m "Initial deploy"
# Create GitHub repo, then:
git remote add origin https://github.com/YOUR_USERNAME/palestine-train-game.git
git push -u origin main
```

Import the repo in Netlify. Settings from `netlify.toml`:
- Publish: `.` (root)
- No build command

### Custom domain

Netlify → Domain management → Add domain → configure DNS (A or CNAME) → HTTPS auto-enabled.

Update `YOUR-SITE.netlify.app` in `index.html`, `robots.txt`, `sitemap.xml`.

### AdSense after deploy

1. Add your HTTPS URL in AdSense
2. Set real IDs in `js/ads/config.js`, `USE_PLACEHOLDER_ADS: false`
3. Redeploy

---

## ملفات النشر | Deployment files

| File | Purpose |
|------|---------|
| `netlify.toml` | Netlify headers & publish dir |
| `privacy.html` | Required for AdSense |
| `robots.txt` | SEO |
| `sitemap.xml` | SEO (update domain) |
| `.gitignore` | Git hygiene |

---

Global Scout Coalition for Quds and Palestine · scout4pal.com
