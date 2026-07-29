# نشر iOS على App Store — بدون Mac (GitHub Actions)

> **التكلفة:** Apple Developer **$99/سنة** + GitHub **مجاني** على **public repo**  
> **Bundle ID:** `com.scout4pal.palestinetrain`  
> **اسم التطبيق:** ألعاب فلسطين

---

## نظرة عامة

```
1. Apple Developer ($99) + App Store Connect
2. Certificates + Provisioning Profile (من موقع Apple — بدون Mac)
3. GitHub Secrets (8 قيم)
4. رفع المشروع إلى GitHub (public)
5. تشغيل workflow: .github/workflows/ios-appstore.yml
6. TestFlight على iPhone → ثم Submit for Review
```

---

## المرحلة 1 — Apple Developer ($99/سنة)

1. [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/)
2. سجّل بحساب Apple ID
3. ادفع **$99/سنة**
4. انتظر الموافقة (ساعات إلى أيام)

### Team ID
- [developer.apple.com/account](https://developer.apple.com/account) → **Membership**
- انسخ **Team ID** (10 أحرف) → `IOS_TEAM_ID`

---

## المرحلة 2 — App Store Connect

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. **My Apps → + → New App**
   - **Name:** ألعاب فلسطين
   - **Bundle ID:** `com.scout4pal.palestinetrain`
   - **SKU:** `palestine-games-001`
   - **Language:** Arabic
3. **App Privacy** + رابط الخصوصية:
   `https://palestine-games.netlify.app/privacy.html`
4. **Advertising Identifier:** Yes (AdMob)

---

## المرحلة 3 — Bundle ID + Certificate + Profile (بدون Mac)

### 3a) App ID
1. [developer.apple.com/account/resources/identifiers/list](https://developer.apple.com/account/resources/identifiers/list)
2. **+** → **App IDs** → **App**
3. **Bundle ID (Explicit):** `com.scout4pal.palestinetrain`
4. Register

### 3b) Distribution Certificate (Windows + OpenSSL)

```powershell
mkdir $env:USERPROFILE\ios-signing -ErrorAction SilentlyContinue
cd $env:USERPROFILE\ios-signing

openssl genrsa -out ios_dist.key 2048
openssl req -new -key ios_dist.key -out ios_dist.csr -subj "/CN=Mohammad Khalil/O=Palestine Games/C=JO"
```

3. [Certificates → + → Apple Distribution](https://developer.apple.com/account/resources/certificates/list)
4. ارفع `ios_dist.csr` → حمّل `distribution.cer`

```powershell
openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM
openssl pkcs12 -export -out distribution.p12 -inkey ios_dist.key -in distribution.pem
```

### 3c) Provisioning Profile

1. [Profiles → + → App Store Connect](https://developer.apple.com/account/resources/profiles/list)
2. **App ID:** `com.scout4pal.palestinetrain`
3. **Certificate:** Apple Distribution
4. **Name:** `Palestine Games App Store` → `IOS_PROVISION_PROFILE_NAME`
5. Download → `.mobileprovision`

### 3d) ترميز base64 لـ GitHub

```powershell
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\mobile\scripts"
.\encode-ios-secrets.ps1 `
  -P12Path "$env:USERPROFILE\ios-signing\distribution.p12" `
  -ProfilePath "$env:USERPROFILE\Downloads\Palestine_Games_App_Store.mobileprovision"
```

---

## المرحلة 4 — App Store Connect API Key

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**
2. **+** → **Admin** → Generate
3. حمّل `AuthKey_XXXXXX.p8` (مرة واحدة)
4. Secrets:
   - `APPSTORE_ISSUER_ID`
   - `APPSTORE_API_KEY_ID`
   - `APPSTORE_API_PRIVATE_KEY` (محتوى .p8 كاملاً)

---

## المرحلة 5 — GitHub Secrets

| Secret | القيمة |
|--------|--------|
| `IOS_BUILD_CERTIFICATE_BASE64` | من encode-ios-secrets.ps1 |
| `IOS_PROVISION_PROFILE_BASE64` | من encode-ios-secrets.ps1 |
| `IOS_P12_PASSWORD` | كلمة مرور .p12 |
| `IOS_KEYCHAIN_PASSWORD` | نص عشوائي |
| `IOS_TEAM_ID` | Team ID |
| `IOS_PROVISION_PROFILE_NAME` | اسم Profile بالضبط |
| `APPSTORE_ISSUER_ID` | Issuer ID |
| `APPSTORE_API_KEY_ID` | Key ID |
| `APPSTORE_API_PRIVATE_KEY` | محتوى AuthKey_*.p8 |

---

## المرحلة 6 — GitHub (public repo)

```powershell
cd "C:\Users\السيريسي\Downloads\لعبة قطار فلسطين"
git init
git add .
git commit -m "Palestine Games — web + Android + iOS CI"
git branch -M main
git remote add origin https://github.com/YOUR_USER/palestine-games.git
git push -u origin main
```

> **Public repo** = macOS builds **مجانية غير محدودة**.

---

## المرحلة 7 — تشغيل البناء

1. GitHub → **Actions** → **iOS App Store** → **Run workflow**
2. `upload_testflight`: **true**
3. انتظر ~20–30 دقيقة

أو:
```bash
git tag ios-v1.0.0 && git push origin ios-v1.0.0
```

---

## المرحلة 8 — TestFlight على iPhone

1. App Store Connect → **TestFlight** → Internal Tester
2. حمّل TestFlight على iPhone
3. جرّب → **Submit for Review**

---

## AdMob iOS

عدّل `appIdIOS` في:
- `app/js/ads/admob-config.js`
- `mobile/capacitor.config.json`
- `mobile/ios/App/App/Info.plist` → `GADApplicationIdentifier`

---

## تحديث الإصدار

في `project.pbxproj`:
- `MARKETING_VERSION` = 1.0.1
- `CURRENT_PROJECT_VERSION` = 2 (زِدها كل build)

```bash
git tag ios-v1.0.1 && git push origin ios-v1.0.1
```

---

**Workflow:** `.github/workflows/ios-appstore.yml`
