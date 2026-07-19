# ربط games.scout4pal.com بموقع ألعاب فلسطين (Netlify)

> **لـ AdSense:** ربط نطاق مؤسسي مثل `games.scout4pal.com` غالباً أهم من إضافة مقال إضافي.  
> نطاق `*.netlify.app` المجاني يزيد احتمال الرفض أو التأخير عند المراجعة.

| العنوان | التقييم |
|---------|---------|
| `palestine-games.netlify.app` | نطاق مجاني مشترك — ثقة أقل |
| `games.scout4pal.com` | يظهر ارتباطاً واضحاً بمؤسسة **scout4pal.com** |

الموقع المنشور حالياً يعمل على:  
**https://palestine-games.netlify.app**  
(لا تحذفه — يبقى يعمل مع النطاق الجديد.)

---

## ⚠️ خطوة 0 — تحقق أولاً: هل scout4pal.com موجود؟

قبل أي شيء، افتح في المتصفح: **https://scout4pal.com**

| النتيجة | المعنى | ماذا تفعل |
|---------|--------|----------|
| الموقع المؤسسي يفتح | النطاق مفعّل | انتقل للخطوة 1 |
| «لا يمكن الوصول» / خطأ DNS / غير موجود | النطاق **غير مسجّل** أو Nameservers غير مفعّلة | **سجّل أو فعّل** `scout4pal.com` أولاً عند أي مسجّل (Namecheap / GoDaddy / Cloudflare Registrar / …) ثم عد هنا |

> **ملاحظة تقنية (يوليو 2026):** استعلام DNS العام لـ `scout4pal.com` أعاد *NXDOMAIN* (النطاق غير ظاهر في الإنترنت).  
> بدون تسجيل/تفعيل النطاق الأب، **لا يمكن** إنشاء `games.scout4pal.com`.

---

## الخطوات العملية (حوالي 15–30 دقيقة بعد تفعيل النطاق)

### 1) في Netlify — أضف النطاق (واجهة الموقع)

> أداة Netlify CLI غير مسجّلة الدخول على جهاز المطوّر؛ نفّذ الخطوات من المتصفح.

1. افتح [app.netlify.com](https://app.netlify.com) وسجّل الدخول.
2. اختر موقع **palestine-games** (الرابط `palestine-games.netlify.app`).
3. من القائمة الجانبية: **Domain management** (أو **Site configuration → Domain management**).
4. اضغط **Add a domain** / **Add domain alias**.
5. أدخل بالضبط: `games.scout4pal.com` → Confirm.
6. ستظهر تعليمات DNS — انسخها أو استخدم الجدول أدناه.

> يمكنك إضافة النطاق في Netlify **قبل** أو **بعد** سجل DNS. شهادة HTTPS تكتمل فقط بعد نجاح DNS.

---

### 2) عند مزوّد DNS لـ scout4pal.com — السجل المطلوب

**أين تفتح؟** لوحة إدارة النطاق عند من اشترى/يستضيف `scout4pal.com`  
(غالباً: **Cloudflare** → DNS · أو **Namecheap** → Advanced DNS · أو **GoDaddy** → DNS · أو cPanel → Zone Editor).

أضف سجلاً واحداً فقط:

| النوع (Type) | الاسم / Host | القيمة (Value / Target / Points to) | TTL |
|--------------|--------------|--------------------------------------|-----|
| **CNAME** | `games` | `palestine-games.netlify.app` | Auto أو 3600 |

النتيجة: `games.scout4pal.com` → نفس موقع Netlify.

#### ملاحظات حسب اللوحة

- إن طلب الحقل الاسم الكامل: اكتب `games.scout4pal.com` بدل `games`.
- إن طلب نقطة في النهاية: `palestine-games.netlify.app.` (مع النقطة).
- **لا تغيّر Nameservers** للنطاق بالكامل إلا إذا كنت تنقل DNS عن قصد — CNAME الفرعي كافٍ.
- إن ظهرت رسالة تعارض مع سجل **A** أو **AAAA** لنفس الاسم `games` — احذف السجل القديم المتعارض ثم أضف الـ CNAME.
- بديل نادر (إن رفضت اللوحة CNAME): سجلات Netlify الوثائقية **A** للـ apex فقط؛ للنطاق الفرعي `games` يبقى **CNAME** هو الصحيح.

إن لم تملك صلاحية DNS: أرسل لمدير النطاق هذه الجملة فقط:

> الرجاء إضافة CNAME: الاسم `games` → القيمة `palestine-games.netlify.app`

---

### 3) تفعيل HTTPS على Netlify

1. بعد انتشار DNS، ارجع إلى **Domain management** في Netlify.
2. بجانب `games.scout4pal.com` انتظر حتى تصبح الحالة **Netlify DNS / External DNS verified** ثم **HTTPS / SSL = Provisioned** أو قفل أخضر.
3. فعّل إن وُجد: **HTTPS → Force HTTPS** / **Automatic TLS certificates** (غالباً مفعّل افتراضياً).
4. لا تحتاج شراء شهادة — Netlify يستخدم **Let's Encrypt** مجاناً.

**مدة DNS عادةً:** دقائق إلى ساعة، وأحياناً حتى **24–48 ساعة** حسب المسجّل والكاش.

---

### 4) ماذا تتحقق؟ (قبل AdSense)

افتح في متصفح خاص / نافذة خاصة:

1. **https://games.scout4pal.com** — الصفحة الرئيسية تفتح بقفل HTTPS.
2. جرب أيضاً: `/privacy.html` و `/articles/` و `/about.html`.
3. تأكد أن **https://palestine-games.netlify.app** ما زال يعمل (لا يُحذف).

إن فتحت الصفحة بدون HTTPS أو ظهر تحذير شهادة: انتظر اكتمال Provisioning في Netlify أو راجع صحة الـ CNAME.

---

### 5) بعد نجاح HTTPS — Google Search Console

1. ادخل [Google Search Console](https://search.google.com/search-console).
2. **Add property** → نوع **URL prefix** → أدخل:  
   `https://games.scout4pal.com`
3. أكمل التحقق (HTML file أو meta tag أو DNS TXT — أي طريقة متاحة).
4. **Sitemaps** → أرسل:  
   `https://games.scout4pal.com/sitemap.xml`

---

### 6) بعد نجاح HTTPS — Google AdSense

1. ادخل [Google AdSense](https://www.google.com/adsense) → **Sites**.
2. **Add site** (أو أضف نطاقاً للموقع الحالي حسب الواجهة) →  
   `https://games.scout4pal.com`
3. أكمل التحقق إن طُلب (meta أو DNS).
4. **اطلب المراجعة / Submit for review** على النطاق المؤسسي بعد أن:
   - يعمل HTTPS
   - صفحة الخصوصية والشروط والمحتوى تفتح على النطاق الجديد
5. لا تعتمد على `*.netlify.app` وحدها كعنوان أساسي للمراجعة إن أمكنك النطاق المخصص.

تفاصيل وحدات الإعلان والكود: راجع `ADS_SETUP.md` و `DEPLOY_NETLIFY.md`.

---

### 7) بعد ثبات النطاق — تحديث روابط SEO (المطوّر)

حالياً الملفات تشير إلى `palestine-games.netlify.app` عمداً حتى لا يُكسر الفهرسة قبل تفعيل `games`.

بعد أن يعمل **https://games.scout4pal.com** بالقفل الأخضر، شغّل من مجلد المستودع:

```powershell
cd app
.\scripts\switch-primary-host.ps1
```

هذا يستبدل المضيف الأساسي إلى `games.scout4pal.com` في:

- `canonical` / `og:url` / JSON-LD في صفحات HTML
- `sitemap.xml` و `robots.txt`

ثم أعد النشر على Netlify (git push أو deploy).  
**العنوان القديم `palestine-games.netlify.app` يبقى يعمل** كعنوان إضافي — لا يُحذف من Domain management.

---

## قائمة تحقق سريعة قبل طلب مراجعة AdSense

- [ ] `scout4pal.com` نفسه يعمل (النطاق الأب مسجّل ومفعّل)
- [ ] CNAME: `games` → `palestine-games.netlify.app`
- [ ] النطاق مضاف في Netlify Domain management
- [ ] `https://games.scout4pal.com` يفتح بـ HTTPS
- [ ] الخصوصية + الشروط + المقالات تعمل على النطاق الجديد
- [ ] أُضيف في Search Console + أُرسلت الخريطة
- [ ] أُضيف / اعتُمد في AdSense
- [ ] (مستحسن خلال أيام) تشغيل `scripts/switch-primary-host.ps1` وإعادة النشر

---

## إذا ظهرت مشكلة شائعة

| المشكلة | الحل المختصر |
|---------|--------------|
| Netlify: Waiting for DNS | راجع الاسم/القيمة؛ انتظر حتى ساعة |
| شهادة SSL عالقة | تأكد أن CNAME يشير لموقعك وليس لموقع آخر |
| الموقع يفتح على http فقط | فعّل Force HTTPS في Netlify |
| AdSense لا يرى الموقع | استخدم الرابط بـ `https://` والنطاق بعد نجاح القفل |

طالما لم تمسح الموقع من Netlify، العنوان القديم `palestine-games.netlify.app` يبقى صالحاً مع `games.scout4pal.com`.
