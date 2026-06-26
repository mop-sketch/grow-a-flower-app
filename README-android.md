# Grow a Flower — Android build

The game is a static web app (root `index.html`) wrapped with [Capacitor](https://capacitorjs.com)
so it runs as a native Android app. All assets — including the Indie Flower and
Walter Turncoat fonts (`fonts/`, declared in `fonts.css`) — are bundled locally,
so the game runs **fully offline** with no network access.

## Project layout

- Source web app lives at the repo root (`index.html`, `style.css`, `script.js`, `game.js`, `fonts/`, `flower/`, `music and images/`).
- `npm run build:web` copies those into `www/` (the Capacitor `webDir`).
- `android/` is the generated native Android project (committed; build outputs are gitignored).

## Prerequisites (one-time, on your machine)

- Node.js (installed)
- **JDK 17** — required by Capacitor 6 / Android Gradle Plugin
- **Android SDK** (compileSdk 34) — easiest via **Android Studio**

## Build & run

```bash
npm install                 # one-time
npm run build:web           # copy web assets into www/
npx cap sync android        # push www/ + plugins into android/
npx cap open android        # open in Android Studio -> Run / build APK
```

Or the shortcut: `npm run android` (build:web + sync + open).

### Build an APK from the command line (instead of Android Studio)

From the `android/` folder, after `npx cap sync android`:

```bash
cd android
./gradlew assembleDebug     # Windows: gradlew.bat assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

## After editing the web game

Re-run `npm run build:web && npx cap sync android` to push changes into the
native project, then rebuild.
