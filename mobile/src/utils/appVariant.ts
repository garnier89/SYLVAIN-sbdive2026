import Constants from 'expo-constants';

// Rôle/variante figés au moment du build (voir app.config.js + eas.json).
// Permet de produire des APK séparés : client / chauffeur / marchand.
export const APP_ROLE: string =
  (Constants.expoConfig?.extra as any)?.appRole || 'user';

export const APP_VARIANT: string =
  (Constants.expoConfig?.extra as any)?.appVariant || 'client';
