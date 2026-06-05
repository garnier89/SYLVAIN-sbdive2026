import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';

import '@/locales/i18n';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import RootNavigator from '@/navigation/RootNavigator';
import VoiceAssistantFAB from '@/components/VoiceAssistantFAB';
import { usePushRegistration } from '@/hooks/usePushRegistration';

function AppShell() {
  const { user } = useAuth();
  usePushRegistration();
  return (
    <View style={{ flex: 1 }}>
      <RootNavigator />
      {user ? <VoiceAssistantFAB /> : null}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <AppShell />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
