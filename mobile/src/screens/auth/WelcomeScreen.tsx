import React from 'react';
import {
  ImageBackground,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Button from '@/components/Button';
import { colors, fontSizes, radius, spacing } from '@/theme';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();

  return (
    <View style={styles.root}>
      <View style={styles.bg} />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="car-sport" size={36} color={colors.secondary} />
          </View>
          <Text style={styles.appName}>SB Drive VTC</Text>
          <Text style={styles.tagline}>{t('auth.subtitle')}</Text>
        </View>

        <View style={styles.actions}>
          <Button
            testID="welcome-continue-phone"
            label={t('auth.continue_with_phone')}
            variant="primary"
            size="lg"
            fullWidth
            leftIcon={<Ionicons name="call" size={18} color={colors.secondary} />}
            onPress={() => nav.navigate('PhoneLogin')}
          />
          <Button
            testID="welcome-continue-email"
            label={t('auth.continue_with_email')}
            variant="outline"
            size="lg"
            fullWidth
            leftIcon={<Ionicons name="mail" size={18} color={colors.textPrimary} />}
            onPress={() => nav.navigate('EmailLogin')}
          />
          <Pressable
            testID="welcome-role-driver"
            onPress={() => nav.navigate('Register', { role: 'driver' })}
            style={styles.roleLink}
          >
            <Ionicons name="briefcase-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.roleText}>
              {t('auth.role_driver')} / {t('auth.role_merchant')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.secondary },
  bg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.secondary,
  },
  container: { flex: 1, justifyContent: 'space-between', padding: spacing.xl },
  header: { alignItems: 'center', marginTop: spacing.xxl * 1.5 },
  logo: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textInverse,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: fontSizes.md,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  actions: { gap: spacing.md, marginBottom: spacing.lg },
  roleLink: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 8,
  },
  roleText: { color: '#CBD5E1', fontSize: fontSizes.sm },
});
