# 📱 Construire l'application Android — À LIRE

## ❌ L'erreur que vous avez

Vous avez ouvert le **dossier racine** `SBDRIVEVTC-NEW-main` dans Android Studio.
Android Studio a alors accroché `android_fixes/UserApp/app/build.gradle.kts` (et KioskApp…)
→ **échec** (« Run gradle init »), parce que `android_fixes/` ne contient que des **patchs
de config**, PAS de code (voir `android_fixes/⚠️_LIRE_DABORD_NE_PAS_OUVRIR_ICI.md`).

➡️ **N'ouvrez jamais la racine ni `android_fixes/` dans Android Studio.**

---

## ✅ Le bon dossier à ouvrir : `mobile/android`

Ce projet contient une vraie app Android générée depuis l'app Expo, dans **`mobile/android/`**
(`settings.gradle`, `gradlew`, `app/build.gradle`, manifest, clé Google Maps intégrée).

### Option 1 — Android Studio
1. **File ▸ Open** → sélectionnez le dossier **`mobile/android`** (le sous-dossier, pas `mobile`).
2. Laissez Gradle se synchroniser (téléchargement Gradle 8.10.2 + SDK 35 au 1er lancement).
3. **Build ▸ Build App Bundle(s) / APK(s) ▸ Build APK(s)**.
   - APK : `mobile/android/app/build/outputs/apk/`
4. Avant cela : `cd mobile && npm install` (les bundles JS sont nécessaires au build).

### Option 2 — EAS (RECOMMANDÉ, sans Android Studio)
```
cd mobile
npm install
npm i -g eas-cli
eas login
eas init
eas build -p android --profile client     # puis driver, puis merchant
```
→ APK téléchargeable à la fin (les 3 apps : client / chauffeur / marchand).

---

## ℹ️ Important
- Le `mobile/android/` fourni = variante **client** (`com.sbdrive.vtc`).
  Pour **chauffeur**/**marchand** en Android Studio : `cd mobile` puis
  `APP_VARIANT=driver npx expo prebuild -p android --clean` (régénère `android/`).
  Avec **EAS**, les 3 variantes se font automatiquement (voir `mobile/BUILD_APK.md`).
- Il n'y a **pas** d'app « kiosk » dans ce projet (rôles : client / chauffeur / marchand / admin).
- ⚠️ Si vous venez de télécharger : assurez-vous d'avoir la **dernière version** du projet
  (le dossier `mobile/android` doit exister). Sinon, re-téléchargez.
