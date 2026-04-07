# Fix 16 Ko Page Size - SB Drive VTC (3 Apps Android)
# Instructions pas à pas

## Fichiers modifiés (prêts à copier-coller)

Ce dossier contient les fichiers corrigés pour les 3 applications.
Pour chaque app, remplacez les fichiers existants par ceux-ci :

### Pour chaque app (KioskApp / ProviderApp / UserApp) :

```
[NomApp]/app/build.gradle.kts         → compileSdk=35, targetSdk=35, versionCode++
[NomApp]/gradle/libs.versions.toml    → agp=8.7.3, kotlin=2.0.21
[NomApp]/gradle/wrapper/gradle-wrapper.properties → Gradle 8.11.1
```

## Comment appliquer les modifications :

### Étape 1 : Copier les fichiers
Pour chaque application (KioskApp, ProviderApp, UserApp) :
1. Ouvrez le dossier de l'app Android sur votre ordinateur
2. Remplacez les 3 fichiers suivants par les versions de ce dossier :
   - `app/build.gradle.kts`
   - `gradle/libs.versions.toml`
   - `gradle/wrapper/gradle-wrapper.properties`

### Étape 2 : Ouvrir dans Android Studio
1. Ouvrez Android Studio (version Ladybug ou plus récent recommandé)
2. Ouvrez le projet de l'app
3. Cliquez "Sync Now" quand Android Studio propose de synchroniser Gradle
4. Attendez que la synchronisation se termine

### Étape 3 : Recompiler
```bash
# Dans le terminal Android Studio :
./gradlew clean assembleRelease
# ou pour un AAB (recommandé pour Google Play) :
./gradlew bundleRelease
```

### Étape 4 : Vérifier
- Build > Analyze APK → chercher les fichiers .so
- S'assurer qu'il n'y a pas d'erreur de compilation

### Étape 5 : Publier sur Google Play Console
- Uploader le nouveau AAB
- L'avertissement 16 Ko devrait disparaître

## Résumé des changements

| Paramètre | Avant | Après |
|-----------|-------|-------|
| compileSdk | 34 | 35 |
| targetSdk | 34 | 35 |
| AGP | 8.5.2 | 8.7.3 |
| Kotlin | 1.9.23 | 2.0.21 |
| Gradle | 8.9 | 8.11.1 |

### Version Codes :
| App | Avant | Après |
|-----|-------|-------|
| KioskApp | 2 (v3.0) | 3 (v3.1) |
| ProviderApp | 7 (v3.1) | 8 (v3.2) |
| UserApp | 17 (v3.1) | 18 (v3.2) |

## ⚠️ Si erreurs de compilation

### SysBaseLib.aar
Si SysBaseLib.aar cause des erreurs avec SDK 35, contactez V3Cube pour
une version mise à jour compilée avec NDK r27+.

### Kotlin 2.0
Si des erreurs liées à Kotlin apparaissent, vous pouvez revenir à 1.9.23 dans
libs.versions.toml. L'important pour le 16 Ko c'est AGP 8.7.3 + targetSdk 35.
