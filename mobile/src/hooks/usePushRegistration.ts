import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useAuth } from '@/contexts/AuthContext';
import { userAPI } from '@/api/endpoints';
import { navigate } from '@/navigation/navigationRef';

// Foreground notifications: show a banner + play sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null; // push tokens only work on physical devices
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('missions', {
      name: 'Missions & Alertes',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  const perm: any = await Notifications.getPermissionsAsync();
  let granted = perm.granted ?? perm.status === 'granted';
  if (!granted) {
    const req: any = await Notifications.requestPermissionsAsync();
    granted = req.granted ?? req.status === 'granted';
  }
  if (!granted) return null;
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

/**
 * Registers the device's Expo push token with the backend once the user is
 * authenticated. Alerts the customer of pharmacy quotes / urgent missions even
 * when the app is closed. No-op on simulators / when permission is denied.
 */
export function usePushRegistration() {
  const { user } = useAuth();
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      sentRef.current = null;
      return;
    }
    (async () => {
      const token = await registerForPush();
      if (token && sentRef.current !== `${user.id}:${token}`) {
        try {
          await userAPI.registerPushToken(token);
          sentRef.current = `${user.id}:${token}`;
        } catch {
          // best-effort; will retry on next auth change
        }
      }
    })();
  }, [user?.id]);

  // Open the relevant screen when the user taps a notification.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      if (data.type === 'pharmacy_quote_ready') {
        navigate('PharmacyOrders');
      }
    });
    return () => sub.remove();
  }, []);
}
