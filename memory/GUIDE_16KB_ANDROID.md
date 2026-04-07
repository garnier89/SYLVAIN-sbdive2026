# Guide : Support 16 Ko Page Size - SB Drive VTC
# Pour Google Play Console (deadline : 31 mai 2026)

## État actuel de vos 3 apps

| App | Package | compileSdk | targetSdk | AGP | Gradle |
|-----|---------|-----------|-----------|-----|--------|
| **SB Drive Tab** (KioskApp) | com.sbdrivervtc.kiosk | 34 | 34 | 8.5.2 | 8.9 |
| **SB Drive Chauffeur** (ProviderApp) | com.sbdrivervtc.chauffeur | 34 | 34 | 8.5.2 | 8.9 |
| **SB Drive Client** (UserApp) | com.sbdrivervtc.client | 34 | 34 | 8.5.2 | 8.9 |

### Bonne nouvelle
- AGP **8.5.2** >= 8.5.1 requis → ✅ L'alignement automatique 16 Ko est déjà géré
- Gradle **8.9** → ✅ Compatible

### Ce qu'il faut changer

---

## ÉTAPE 1 : Monter targetSdk et compileSdk à 35

### Pour les 3 apps (KioskApp, ProviderApp, UserApp), dans `app/build.gradle.kts` :

**AVANT :**
```kotlin
compileSdk = 34
defaultConfig {
    targetSdk = 34
}
```

**APRÈS :**
```kotlin
compileSdk = 35
defaultConfig {
    targetSdk = 35
}
```

---

## ÉTAPE 2 : Mettre à jour AGP vers 8.7+ (recommandé)

Dans `gradle/libs.versions.toml`, changer :

**AVANT :**
```toml
agp = "8.5.2"
```

**APRÈS :**
```toml
agp = "8.7.3"
```

Et dans `gradle/wrapper/gradle-wrapper.properties` :

**AVANT :**
```
distributionUrl=https\://services.gradle.org/distributions/gradle-8.9-all.zip
```

**APRÈS :**
```
distributionUrl=https\://services.gradle.org/distributions/gradle-8.11.1-all.zip
```

---

## ÉTAPE 3 : Vérifier les bibliothèques natives (.aar et .so)

⚠️ **C'est le point critique.** Vos apps incluent des fichiers `.aar` avec du code natif :

### KioskApp :
- `SysBaseLib.aar` (1.1 MB) — Bibliothèque V3Cube propriétaire

### ProviderApp :
- `SysBaseLib.aar` + `haishinkit` (streaming)

### UserApp :
- `SysBaseLib.aar` + Realm DB (code natif)

**Action requise :**
1. Ouvrir Android Studio
2. Build > Analyze APK
3. Chercher les fichiers `.so` dans `lib/`
4. Vérifier s'ils sont alignés sur 16 Ko

**Si des .so ne sont pas alignés :**
- Pour `SysBaseLib.aar` → **Contacter V3Cube** pour obtenir une version mise à jour compilée avec NDK r27+
- Pour `haishinkit` → Mettre à jour vers la dernière version
- Pour `Realm` → Mettre à jour vers la dernière version (Realm gère déjà 16 Ko)

---

## ÉTAPE 4 : Incrémenter versionCode

### KioskApp (`app/build.gradle.kts`) :
```kotlin
versionCode = 3      // était 2
versionName = "3.1"  // était "3.0"
```

### ProviderApp (`app/build.gradle.kts`) :
```kotlin
versionCode = 8      // était 7
versionName = "3.2"  // était "3.1"
```

### UserApp (`app/build.gradle.kts`) :
```kotlin
versionCode = 18     // était 17
versionName = "3.2"  // était "3.1"
```

---

## ÉTAPE 5 : Recompiler et tester

```bash
# Dans Android Studio, pour chaque app :
./gradlew clean assembleProdRelease

# Ou pour générer un AAB (recommandé pour Google Play) :
./gradlew bundleProdRelease
```

### Tester sur un appareil 16 Ko :
1. Pixel 8 ou plus récent avec Android 15 QPR1+
2. Paramètres développeur > "Page size" → 16 Ko
3. Installer l'APK et vérifier qu'il n'y a pas de crash

### Vérifier l'APK :
```bash
# Vérifier l'alignement des .so
python3 -c "
import zipfile, sys
apk = zipfile.ZipFile(sys.argv[1])
for f in apk.infolist():
    if f.filename.endswith('.so'):
        align = f.header_offset % 16384
        status = '✅' if align == 0 else '❌'
        print(f'{status} {f.filename} (offset: {f.header_offset}, align: {align})')
" votre_app.apk
```

---

## RÉSUMÉ DES FICHIERS À MODIFIER

### Pour CHAQUE app (KioskApp, ProviderApp, UserApp) :

| Fichier | Modification |
|---------|-------------|
| `app/build.gradle.kts` | `compileSdk = 35`, `targetSdk = 35`, incrémenter `versionCode` |
| `gradle/libs.versions.toml` | `agp = "8.7.3"` |
| `gradle/wrapper/gradle-wrapper.properties` | Gradle 8.11.1 |

### Bibliothèques à mettre à jour :
| Bibliothèque | Action |
|-------------|--------|
| `SysBaseLib.aar` | Demander mise à jour à V3Cube (NDK r27+) |
| `haishinkit` | Mettre à jour vers dernière version |
| `realm-android` | Mettre à jour vers 10.18+ |
| Autres .aar dans `libs/` | Vérifier alignement 16 Ko |

---

## ⚡ IMPORTANT
Le problème principal sera probablement **SysBaseLib.aar** — c'est une bibliothèque propriétaire V3Cube compilée avec un ancien NDK. Vous devez contacter V3Cube pour obtenir une version recompilée avec NDK r27 ou supérieur.

Si V3Cube ne fournit pas de mise à jour, vous pouvez essayer de réaligner manuellement :
```bash
# Utiliser zipalign d'Android SDK
zipalign -p -f 16 input.apk output.apk
```
