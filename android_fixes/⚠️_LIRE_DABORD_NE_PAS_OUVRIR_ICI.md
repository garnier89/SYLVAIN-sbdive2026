# ⚠️ NE PAS OUVRIR CE DOSSIER DANS ANDROID STUDIO

Le dossier `android_fixes/` ne contient **PAS** d'applications Android complètes.
Ce sont **uniquement des fichiers de configuration (patchs)** destinés à être **copiés**
dans les vrais projets natifs **V3Cube** (UserApp / ProviderApp / KioskApp) que vous
possédez sur votre ordinateur.

Chaque sous-dossier (`UserApp`, `ProviderApp`, `KioskApp`) ne contient que :
- `app/build.gradle.kts`
- `gradle/libs.versions.toml`
- `gradle/wrapper/gradle-wrapper.properties`

❌ Il **n'y a pas** de code source (`src/`), pas de `settings.gradle`, pas de `gradlew`.
👉 C'est pour cela qu'Android Studio affiche **« Run gradle init »** et échoue : ce ne sont
pas des projets, on **ne peut pas** les compiler ici.

## Que faire ?

### ✅ Pour construire une VRAIE app Android depuis CE projet
Ouvrez le dossier **`mobile/android`** (PAS la racine, PAS `android_fixes`).
Voir `mobile/BUILD_APK.md`. Le plus simple reste **EAS Build** (cloud, sans Android Studio) :
```
cd mobile
npm install
npx eas-cli login
eas build -p android --profile client     # (ou driver / merchant)
```

### 🧩 Pour les apps natives V3Cube
Récupérez le **projet complet auprès de V3Cube**, ouvrez SON dossier dans Android Studio,
puis copiez-y les fichiers de `android_fixes/<App>/` aux mêmes emplacements
(voir `android_fixes/INSTRUCTIONS.md`). Pour `SysBaseLib.aar` → support V3Cube.
