# ربط نطاق فرعي من scout4pal.com بموقع ألعاب فلسطين (Netlify)

هذا الدليل **اختياري** ولا يغيّر النشر الحالي على `palestine-games.netlify.app`.
هدفُه تحسين ثقة الزوار ومراجعي AdSense عبر نطاق مخصص يتبع مؤسسة الائتلاف.

## لماذا النطاق المخصص مهم؟

- نطاق `*.netlify.app` مجاني ومنتشر، وقد يُنظر إليه بثقة أقل من نطاق مؤسسة معروف.
- ربط شيء مثل `games.scout4pal.com` أو `play.scout4pal.com` يوضح أن الموقع تابع لـ **scout4pal.com**.

## الخطوات (DNS عند مزوّد scout4pal.com)

1. ادخل لوحة DNS للنطاق `scout4pal.com` (حيث يُدار النطاق: Cloudflare / Namecheap / غيرها).
2. أضف سجلًا جديدًا:

| النوع | الاسم (Host) | القيمة | TTL |
|--------|---------------|--------|-----|
| **CNAME** | `games` (أو `play`) | `palestine-games.netlify.app` | تلقائي / 3600 |

مثال النتيجة: `games.scout4pal.com` → يشير إلى موقع Netlify الحالي.

3. في [Netlify](https://app.netlify.com) → الموقع → **Domain management** → **Add domain alias**:
   - أدخل `games.scout4pal.com` (نفس الاسم الذي اخترته).
4. انتظر تفعيل HTTPS تلقائياً من Netlify (Let's Encrypt) — غالباً دقائق إلى ساعة.
5. اختبر: افتح `https://games.scout4pal.com` وتأكد أن الألعاب والمقالات تعمل.
6. (مستحسن لاحقاً) حدّث روابط `canonical` و`sitemap.xml` وSearch Console للنطاق الجديد بعد التأكد من استقرارها.

## ملاحظات مهمة

- **لا تحذف** موقع `palestine-games.netlify.app` قبل التأكد أن النطاق الجديد يعمل؛ Netlify يبقي الاثنين معاً عادة.
- لا تغيّر Nameservers بالكامل إلا إذا كنت تعرف ما تفعل — سجل CNAME فرعي كافٍ.
- بعد الربط، أضف النطاق أيضاً في Google Search Console وAdSense كموقع/نطاق معتمد وفق واجهة كل خدمة.
- إن لم تملك صلاحية DNS لـ scout4pal.com، اطلب من مدير الموقع إضافة الـ CNAME فقط.

## لا تكسر النشر الحالي

طالما لم تُغيّر إعدادات الـ Build ولم تحذف الموقع من Netlify، يبقى العنوان القديم يعمل حتى بعد إضافة النطاق المخصص.
