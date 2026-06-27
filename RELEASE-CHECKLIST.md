# Grow a Flower — Play Store Release Checklist

## Already done ✅
- [x] Android project set up (Capacitor)
- [x] App icon + splash screen
- [x] Target SDK 35
- [x] Release signing config + `upload-keystore.jks`
- [x] `applicationId` = `com.growaflower.game`, versionCode 1, versionName 1.0
- [x] Privacy policy written (`docs/privacy-policy.html`)
- [x] Play feature graphic (1024×500) and 512px icon (`store-assets/`)

## Still to do

### 1. Privacy policy
- [x] Replace `REPLACE_WITH_YOUR_EMAIL` in `docs/privacy-policy.html` with a real contact email
- [x] Enable GitHub Pages (Settings → Pages → branch `main`, folder `/docs`)
- [x] Confirm live URL works: `https://mop-sketch.github.io/grow-a-flower-app/privacy-policy.html`

### 2. Build the release artifact
- [x] Sync web assets into Android: `npx cap sync android`
- [x] Build signed App Bundle: `cd android && ./gradlew bundleRelease`
      (set JAVA_HOME to Android Studio's JBR; the system Java 8 won't work)
- [x] Output: `android/app/build/outputs/bundle/release/app-release.aab` (signed, verified)
- [ ] **Back up `upload-keystore.jks` + its passwords somewhere safe** (lose it = can't update the app ever again)

### 3. Store listing assets
- [ ] App title (max 30 chars) + short description (max 80) + full description (max 4000)
- [ ] **Phone screenshots** — minimum 2, up to 8 (none in repo yet — capture from device/emulator)
- [ ] (Optional) 7" / 10" tablet screenshots
- [ ] Feature graphic ✅ and hi-res icon ✅ already prepared

### 4. Google Play Console setup
- [ ] Google Play developer account ($25 one-time) — if not already created
- [ ] Create the app entry, select Game category
- [ ] Upload the AAB to a track (start with **Internal testing**, then Production)
- [ ] Enroll in Play App Signing (Google manages the app signing key)

### 5. Required declarations / forms
- [ ] **Privacy policy URL** entered in App content
- [ ] **Data safety** form (you collect nothing — declare no data collection)
- [ ] **Content rating** questionnaire
- [ ] **Target audience & content** (age groups)
- [ ] **Ads** declaration — "No ads"
- [ ] **App access** — no login required, so "All functionality available without restrictions"
- [ ] Government app? No. News app? No.

### 6. Pricing & distribution
- [ ] Set Free
- [ ] Choose countries/regions
- [ ] Accept content guidelines / US export laws

### 7. Final
- [ ] Test the signed build on a real device (internal testing track)
- [ ] Submit for review
