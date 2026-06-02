# SB Drive VTC - Mobile (Expo + React Native)

App mobile native pour iOS et Android, partagée par les rôles User, Driver et Merchant.
Consomme l'API FastAPI existante (sans modification backend).

## Installation

```bash
cd /app/mobile
yarn install
cp .env.example .env  # Renseigner EXPO_PUBLIC_BACKEND_URL et clé Google Maps
```

## Démarrage en développement

```bash
# Tunnel (recommandé depuis un environnement cloud)
yarn start:tunnel

# Local (téléphone sur même WiFi que le PC)
yarn start
```

Scanner le QR code avec **Expo Go** (App Store / Google Play).

## Architecture

```
src/
├── api/             # Client axios + endpoints (mirror du web)
├── contexts/        # Auth, Locale, Theme
├── navigation/      # Stack/Tabs/Drawer (rôles)
├── screens/         # auth/, user/, driver/, merchant/, shared/
├── components/      # Composants UI réutilisables
├── locales/         # i18n (fr, en, ...)
├── theme/           # Couleurs, typo, spacing
├── hooks/           # Hooks custom
└── utils/           # Helpers
```

## Auth

- L'API web utilise des cookies httpOnly.
- L'API mobile utilise **Bearer token** stocké dans `expo-secure-store` (chiffré natif iOS Keychain / Android Keystore).
- Le backend supporte les deux modes (voir `backend/core/deps.py`).

## Build production (EAS)

```bash
npx eas build --platform ios
npx eas build --platform android
```
