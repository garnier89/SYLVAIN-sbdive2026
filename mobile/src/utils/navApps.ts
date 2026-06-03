import { Linking, Platform, ActionSheetIOS, Alert } from 'react-native';

type Coords = { lat: number; lng: number };

// Open external navigation app (Google Maps / Apple Maps / Waze).
// On iOS shows an action sheet to pick. On Android opens Google Maps directly,
// or falls back to a geo: URI which lets user pick from any installed nav app.
export async function openNavigation(
  to: Coords,
  label?: string,
  from?: Coords | null
) {
  const lat = to.lat;
  const lng = to.lng;
  const fromStr = from ? `${from.lat},${from.lng}` : '';
  const labelEnc = encodeURIComponent(label ?? 'Destination');

  const gmapsUrl = from
    ? `https://www.google.com/maps/dir/?api=1&origin=${fromStr}&destination=${lat},${lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const appleUrl = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d&q=${labelEnc}`;

  if (Platform.OS === 'ios') {
    return new Promise<void>((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Plans (Apple)', 'Google Maps', 'Waze'],
          cancelButtonIndex: 0,
          title: 'Ouvrir dans...',
        },
        async (idx) => {
          try {
            if (idx === 1) await Linking.openURL(appleUrl);
            else if (idx === 2) await Linking.openURL(gmapsUrl);
            else if (idx === 3) await Linking.openURL(wazeUrl);
          } catch {}
          resolve();
        }
      );
    });
  }

  // Android: try Google Maps first, fall back to geo: URI
  try {
    const canGmaps = await Linking.canOpenURL(gmapsUrl);
    if (canGmaps) {
      await Linking.openURL(gmapsUrl);
      return;
    }
  } catch {}
  try {
    await Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${labelEnc})`);
  } catch {
    Alert.alert(
      'Navigation',
      'Aucune application de navigation trouvee. Installez Google Maps ou Waze.'
    );
  }
}
