# إعداد اللعب الأونلاين — Online Multiplayer Setup

**لعبة قطار فلسطين — المرحلة 2–4 (غرف وميزة الدردشة)**  
Palestine Train Game — Phase 2–4 (rooms + chat)

---

## العربية

### ما تحتاجه

- حساب Google (مجاني)
- مشروع Firebase مع **Realtime Database**
- نشر اللعبة على HTTPS (Netlify أو أي استضافة) — Firebase لا يعمل على `file://`

### 1) إنشاء مشروع Firebase

1. افتح [Firebase Console](https://console.firebase.google.com/)
2. **Add project** / **إضافة مشروع** — اختر اسماً (مثلاً `pal-train-game`)
3. يمكنك تعطيل Google Analytics إن رغبت

### 2) تفعيل Realtime Database

1. من القائمة: **Build → Realtime Database**
2. **Create Database**
3. اختر موقعاً قريباً (مثلاً `europe-west1`)
4. للتطوير: ابدأ بـ **Test mode** (تنتهي صلاحيتها بعد 30 يوماً — حدّث القواعد لاحقاً)

### 3) نسخ مفاتيح التطبيق

1. **Project settings** (⚙️) → **Your apps** → **Web** (`</>`)
2. سجّل التطبيق باسم مثل `pal-train-web`
3. انسخ كائن `firebaseConfig`
4. الصق القيم في `js/firebase-config.js`:

```javascript
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'your-project.firebaseapp.com',
  databaseURL: 'https://your-project-default-rtdb.firebaseio.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
};
```

> **مهم:** `databaseURL` مطلوب للمزامنة الفورية.

### 4) قواعد الأمان (Rules)

في Realtime Database → **Rules**، للتطوير السريع:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true,
        "messages": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

⚠️ هذه القواعد مفتوحة للجميع — مناسبة للاختبار فقط. للإنتاج استخدم Firebase Authentication أو قواعد تقيّد الكتابة على `messages` لأعضاء الغرفة فقط.

### 5) تشغيل اللعبة

1. انشر المجلد `app/` على Netlify أو شغّل خادماً محلياً:
   ```bash
   npx serve app
   ```
2. افتح اللعبة → **لعبة القطار** → **لعب أونلاين**
3. **المضيف:** أدخل اسمك → **إنشاء غرفة** → شارك الرمز (6 أحرف)
4. **اللاعبون:** نفس الرابط → **لعب أونلاين** → اسم + رمز → **انضم**
5. المضيف يضغط **ابدأ** عند وجود لاعبين اثنين أو أكثر

### 6) الدردشة (المرحلة 3–4)

بعد الانضمام لغرفة أونلاين، تظهر لوحة **دردشة** أسفل لوحة اللعب:

| الميزة | الوصف |
|--------|--------|
| رسائل سريعة | أزرار جاهزة: «دوري»، «أحسنت»، «بالتوفيق»، وغيرها |
| رسالة حرة | حقل نص + **إرسال** (حتى 200 حرف) |
| إشعارات | فقاعات/toasts للرسائل الجديدة |
| السجل | آخر 50 رسالة — تُحذف الأقدم تلقائياً |
| محلي | لا تظهر الدردشة في اللعب المحلي |

**على الجوال:** اضغط زر الدردشة 💬 لطي/فتح اللوحة.

عند مغادرة المضيف للغرفة تُحذف الغرفة وكل رسائلها معها.

### 7) إذا ظهر «Firebase غير مُعدّ»

- تأكد أن `js/firebase-config.js` لا يحتوي على `YOUR_...`
- تأكد أن `databaseURL` صحيح
- افتح أدوات المطوّر (F12) → Console للأخطاء

### ما الذي يُزامَن؟

| البيان | ✓ |
|--------|---|
| مواقع اللاعبين | ✓ |
| الدور الحالي | ✓ |
| بدء اللعبة / المرحلة | ✓ |
| حالة اللوحة | ✓ |
| الدردشة (رسائل سريعة + حرة) | ✓ |

---

## English

### Requirements

- Free Google account
- Firebase project with **Realtime Database**
- Deploy the game over **HTTPS** (Netlify, etc.) — Firebase does not work from `file://`

### 1) Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. **Add project** — e.g. `pal-train-game`
3. Google Analytics is optional

### 2) Enable Realtime Database

1. **Build → Realtime Database**
2. **Create Database**
3. Pick a nearby region
4. For development: **Test mode** (expires in 30 days — update rules for production)

### 3) Copy web app config

1. **Project settings** → **Your apps** → **Web**
2. Register the app
3. Copy the `firebaseConfig` object into `js/firebase-config.js` (replace all `YOUR_*` placeholders)

### 4) Security rules

Realtime Database → **Rules** (development):

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true,
        "messages": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

Use stricter rules or Firebase Auth before public launch.

### 5) Run the game

1. Deploy `app/` or run `npx serve app`
2. Open the game → **Train game** → **Online play**
3. **Host:** username → **Create room** → share 6-character code
4. **Players:** same URL → username + code → **Join**
5. Host clicks **Start** when 2+ players are in the lobby

### 6) Chat (Phase 3–4)

After joining an online room, a **chat panel** appears below the board:

- **Preset buttons** for quick phrases (Arabic)
- **Free text** input + Send (max 200 characters)
- **Toasts** for incoming messages
- **History** capped at 50 messages (auto-pruned)
- **Local play:** no chat UI

On mobile, tap **💬 Chat** to collapse/expand the panel. When the host leaves, the room and all messages are deleted.

### 7) Troubleshooting

| Issue | Fix |
|-------|-----|
| “Firebase not configured” | Replace placeholders in `js/firebase-config.js` |
| Connection errors | Check `databaseURL` and HTTPS |
| Room not found | Code is case-insensitive; host must keep the tab open |
| Chat not syncing | Verify Firebase rules allow read/write on `rooms/$code/messages` |

### Synced in Phase 2–4

- Player positions, current turn, game started flag, question level, board state  
- **Chat:** preset + free-form messages (real-time, last 50 kept)

---

## Room data structure

```json
{
  "code": "ABC123",
  "hostId": "p_abc123",
  "level": "ashbal",
  "started": false,
  "currentTurn": 0,
  "players": {
    "p_abc123": { "id": "...", "name": "Ahmad", "color": "#...", "position": 1, "order": 0 }
  },
  "boardState": {
    "waitingForMove": true,
    "processingMove": false,
    "gameOver": false,
    "highlightSquare": null
  },
  "messages": [
    {
      "id": "m_171...",
      "playerId": "p_abc123",
      "playerName": "Ahmad",
      "text": "دوري",
      "timestamp": 1710000000000,
      "type": "preset"
    }
  ]
}
```

---

*الإئتلاف الكشفي العالمي للقدس وفلسطين — The Global Scout Coalition for Quds and Palestine*
