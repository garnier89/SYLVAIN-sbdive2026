# 📱 Générer les APK SB Drive (client / chauffeur / marchand)

L'app mobile (`mobile/`) est une app **Expo / React Native**. On génère de **vrais APK
installables** via **Expo EAS Build** (build dans le cloud Expo, gratuit pour démarrer).
Une seule base de code → **3 APK séparés** grâce aux variantes (packages Android distincts,
donc installables côte à côte sur le même téléphone pour tester).

| Profil | Nom de l'app | Package Android | Rôle |
|--------|--------------|------------------|------|
| `client`   | SB Drive            | `com.sbdrive.vtc`      | utilisateur |
| `driver`   | SB Drive Chauffeur  | `com.sbdrive.driver`   | chauffeur |
| `merchant` | SB Drive Marchand   | `com.sbdrive.merchant` | marchand |

Les APK pointent sur le **backend de production** (`https://gojek-mvp-1.emergent.host`)
et embarquent la clé Google Maps (voir `eas.json`).

---

## Étapes (sur votre ordinateur)

```bash
# 1. Installer EAS CLI
npm install -g eas-cli

# 2. Se connecter (compte Expo gratuit : https://expo.dev/signup)
eas login

# 3. Aller dans le dossier mobile
cd mobile
npm install        # (ou yarn)

# 4. Initialiser le projet EAS (première fois seulement)
eas init           # crée le projectId et l'associe à votre compte Expo

# 5. Construire chaque APK (build cloud → lien de téléchargement à la fin)
eas build -p android --profile client
eas build -p android --profile driver
eas build -p android --profile merchant
```

À la fin de chaque build, EAS affiche une **URL** pour télécharger le fichier `.apk`
(également disponible sur https://expo.dev → votre projet → Builds).

---

## Notes importantes

- **Google Maps** : pour la production, restreignez la clé API Android (Google Cloud Console)
  aux 3 packages ci-dessus + leur empreinte SHA-1 (EAS l'affiche, ou `eas credentials`).
  Pour un test rapide, une clé sans restriction fonctionne aussi.
- **buildType = apk** (dans `eas.json`) → fichier `.apk` direct (pas un `.aab`).
  Pour publier sur Google Play, utilisez plutôt `"buildType": "app-bundle"`.
- **Backend** : modifiable dans `eas.json` (`env.EXPO_PUBLIC_BACKEND_URL`).
- **Tester en local sans build** : `npx expo start` puis l'app **Expo Go** (scan du QR code).
  Pour choisir le rôle en local : `APP_VARIANT=merchant npx expo start`.

## Ce que fait chaque app

- **Client** : courses, livraison, food, beauté, pharmacie, immobilier, wallet, suivi de course.
- **Chauffeur** : missions, courses actives, gains, rapports hebdo, navigation.
- **Marchand** : tableau de bord (recettes/commandes du jour, top produits), boutique
  ouverte/fermée, gestion des **commandes** (accepter → préparation → prête → remise),
  et **menu** (ajout de produits, disponibilité/rupture).

---

## 🅰️ Alternative : ouvrir dans Android Studio (dossier `android/`)

Un projet Expo n'a **pas** de dossier `android/` par défaut — il se **génère** avec
`expo prebuild`. ⚠️ N'ouvrez **jamais** le dossier `mobile/` dans Android Studio : ouvrez
le sous-dossier **`mobile/android/`**.

Le dossier `mobile/android/` est **déjà généré** dans ce projet pour la variante **client**
(`com.sbdrive.vtc`, « SB Drive », clé Google Maps intégrée).

### Ouvrir & compiler le client
```bash
cd mobile && npm install        # installe les dépendances JS
# Android Studio : File > Open > sélectionner le dossier  mobile/android
# Laisser Gradle se synchroniser, puis Build > Build APK(s)
# — ou en ligne de commande :
cd mobile/android
./gradlew assembleRelease        # APK :  app/build/outputs/apk/release/
./gradlew bundleRelease          # AAB (Play Store) : app/build/outputs/bundle/release/
```

### Générer le dossier android/ pour CHAUFFEUR ou MARCHAND
Le dossier `android/` est lié à **une** variante. Pour les autres, régénérez-le
(⚠️ écrase le dossier `android/` existant) :
```bash
cd mobile
APP_VARIANT=driver   npx expo prebuild -p android --clean   # com.sbdrive.driver
# ou
APP_VARIANT=merchant npx expo prebuild -p android --clean   # com.sbdrive.merchant
# puis rebuild avec ./gradlew dans mobile/android
```

👉 **Le plus simple pour obtenir les 3 apps reste EAS** (section ci-dessus) : pas de
Gradle ni d'Android Studio, et les 3 variantes se construisent proprement en une commande
chacune.

> ℹ️ Il n'y a **pas** d'app « kiosk » dans ce projet Expo : les rôles disponibles sont
> **client / chauffeur / marchand** (+ admin). Un éventuel « KioskApp » est un produit
> V3Cube externe, non inclus ici.
