# اختبار سريع — لعب أونلاين اليوم (دقيقتان إعداد + دقيقة لعب)

استخدم هذا الملف إذا أردت تجربة **تبويبين على localhost** قبل النشر على Netlify.

---

## هل Firebase جاهز؟

افتح `js/firebase-config.js`. إذا رأيت `YOUR_API_KEY` أو `YOUR_PROJECT` → **لا**، اتبع الخطوات أدناه.

---

## خطوات سريعة (من الصفر إلى لعبتين)

1. **مشروع Firebase:** [Firebase Console](https://console.firebase.google.com/) → **إضافة مشروع** → اسم مثل `pal-train-test` → (Analytics اختياري) → **إنشاء**.

2. **Realtime Database:** من القائمة **Build** → **Realtime Database** → **Create Database** → اختر أقرب منطقة → **Start in test mode** (للتجربة فقط؛ تنتهي صلاحية القواعد بعد ~30 يوم).

3. **قواعد سريعة (Rules):** تبويب **Rules** → الصق ثم **Publish**:
   ```json
   {
     "rules": {
       "rooms": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```
   > للدردشة أيضاً: يمكنك لاحقاً استخدام القواعد التفصيلية في `ONLINE_SETUP.md`.

4. **نسخ إعداد الويب:** ⚙ **Project settings** → **Your apps** → أيقونة **Web** `</>` → سجّل التطبيق (مثلاً `pal-train-web`) → انسخ كائن `firebaseConfig`.

5. **لصق في المشروع:** افتح `js/firebase-config.js` واستبدل **كل** القيم الست/سبع التالية بما نسخته (لا تغيّر أسماء الحقول):
   - `apiKey`
   - `authDomain`
   - `databaseURL` ← **مهم جداً** (يجب أن ينتهي بـ `firebaseio.com`)
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

6. **تشغيل اللعبة محلياً:** من مجلد `app/`:
   ```bash
   python -m http.server 8765
   ```
   افتح في **متصفحين** (أو نافذتين): **http://localhost:8765**

7. **لعب:** **لعبة القطار** → **لعب أونلاين**  
   - **تبويب 1 (مضيف):** اسم مستخدم → **إنشاء غرفة** → انسخ الرمز (6 أحرف)  
   - **تبويب 2 (لاعب):** نفس الرابط → اسم آخر → الرمز → **انضمام**  
   - **المضيف:** **بدء** عندما يكون لاعبان+ → العب.

8. **إن لم يعمل:** F12 → **Console** — رسالة «Firebase not configured» تعني أن placeholders ما زالت في `firebase-config.js`.

---

## ملاحظات

- لا تفتح اللعبة بـ `file://` — استخدم `http://localhost:8765` فقط.
- لا تشارك مفاتيح Firebase علناً؛ مشروع الاختبار + test rules للتجربة الشخصية فقط.

*راجع `ONLINE_SETUP.md` للتفاصيل والقواعد الأكثر أماناً قبل الإطلاق.*