import 'react-native-gesture-handler';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import WebAppShell from '@/screens/WebAppShell';

// The mobile APK is a thin native shell around the production web super-app.
// Each per-role build (client / driver / merchant) opens the web app at the
// matching entry path, so the installed APK is identical to the online app.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <WebAppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
