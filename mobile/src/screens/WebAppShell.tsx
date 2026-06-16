import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView, WebViewNavigation } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Location from 'expo-location';

const extra = (Constants.expoConfig?.extra as any) || {};

// Backend (web app) URL + role-specific landing path are injected per APK
// variant via app.config.js (client → '/', driver → '/chauffeur',
// merchant → '/merchant'). The APK is therefore EXACTLY the online web app,
// scoped to the role of the build.
const BASE_URL: string =
  process.env.EXPO_PUBLIC_BACKEND_URL || extra.backendUrl || 'https://gojek-mvp-1.emergent.host';
const START_PATH: string = extra.startPath || '/';
const START_URL = `${BASE_URL.replace(/\/$/, '')}${START_PATH}`;

const BG = '#0B1426';

export default function WebAppShell() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // Ask for foreground location once so the web app's navigator.geolocation
  // (pickup, live tracking, driver position) works inside the WebView.
  useEffect(() => {
    (async () => {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch {
        /* user can still grant later via the WebView prompt */
      }
    })();
  }, []);

  // Android hardware back → navigate the WebView history instead of closing.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  // Keep app navigation INSIDE the webview for same-origin URLs; open tel:,
  // mailto:, whatsapp, maps and other external schemes in the system handler.
  const onShouldStart = useCallback((req: { url: string }) => {
    const url = req.url || '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const host = new URL(url).host;
        const baseHost = new URL(BASE_URL).host;
        if (host === baseHost) return true; // stay in the app
      } catch {
        return true;
      }
      // External web link → open in the system browser.
      Linking.openURL(url).catch(() => {});
      return false;
    }
    // Non-http schemes (tel:, mailto:, whatsapp:, geo:, intent:, ...)
    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  const reload = useCallback(() => {
    setError(false);
    setRefreshing(true);
    webRef.current?.reload();
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="light" backgroundColor={BG} />
      {error ? (
        <ScrollView
          contentContainerStyle={styles.errorBox}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor="#fff" />}
        >
          <Text style={styles.errorTitle}>Connexion indisponible</Text>
          <Text style={styles.errorText}>
            Impossible de joindre l'application. Vérifiez votre connexion internet puis réessayez.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reload} testID="webshell-retry">
            <Text style={styles.retryLabel}>Réessayer</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: START_URL }}
          originWhitelist={['*']}
          // Core web features used by the super-app.
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          geolocationEnabled
          // Media (voice assistant, in-app calls) + KYC document capture.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          // UX
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          startInLoadingState
          onNavigationStateChange={onNavChange}
          onShouldStartLoadWithRequest={onShouldStart}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          onHttpError={() => setLoading(false)}
          style={styles.web}
          testID="webshell-webview"
        />
      )}
      {loading && !error && (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFC400" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  errorBox: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: BG },
  errorTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  errorText: { color: '#9CA3AF', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  retryBtn: { backgroundColor: '#FFC400', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  retryLabel: { color: '#0B1426', fontWeight: '800', fontSize: 16 },
});
