// Configuration dynamique Expo — permet de générer des APK SÉPARÉS par rôle
// (client / chauffeur / marchand) à partir d'une seule base de code.
//
//   APP_VARIANT=client   → SB Drive            (com.sbdrive.vtc)
//   APP_VARIANT=driver   → SB Drive Chauffeur  (com.sbdrive.driver)
//   APP_VARIANT=merchant → SB Drive Marchand   (com.sbdrive.merchant)
//
// Chaque variante a un package Android distinct → les 3 APK s'installent
// côte à côte sur le même téléphone pour faciliter les tests.

const VARIANTS = {
  client: { name: 'SB Drive', pkg: 'com.sbdrive.vtc', role: 'user', startPath: '/' },
  driver: { name: 'SB Drive Chauffeur', pkg: 'com.sbdrive.driver', role: 'driver', startPath: '/chauffeur' },
  merchant: { name: 'SB Drive Marchand', pkg: 'com.sbdrive.merchant', role: 'merchant', startPath: '/merchant' },
};

const variant = process.env.APP_VARIANT || 'client';
const v = VARIANTS[variant] || VARIANTS.client;
const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://gojek-mvp-1.emergent.host';

export default ({ config }) => ({
  ...config,
  name: v.name,
  slug: 'sb-drive-vtc',
  plugins: [...(config.plugins || []), './plugins/withImageCropperFix'],
  extra: {
    ...(config.extra || {}),
    appRole: v.role,
    appVariant: variant,
    startPath: v.startPath,
    backendUrl,
    eas: { projectId: process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId },
  },
  ios: {
    ...(config.ios || {}),
    bundleIdentifier: v.pkg,
  },
  android: {
    ...(config.android || {}),
    package: v.pkg,
    config: {
      ...((config.android && config.android.config) || {}),
      googleMaps: { apiKey: mapsKey },
    },
  },
});
