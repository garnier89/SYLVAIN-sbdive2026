import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { colors, fontSizes, spacing } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function OtpVerifyScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const { loginWithOtp } = useAuth();
  const phone = route.params?.phone ?? '';
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onVerify = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithOtp(phone, otp.trim());
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{t('auth.otp_title')}</Text>
          <Text style={styles.sub}>{t('auth.otp_hint', { phone })}</Text>

          <Input
            testID="otp-input"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
            error={error}
            autoFocus
          />

          <Button
            testID="otp-verify-submit"
            label={t('auth.verify_otp')}
            onPress={onVerify}
            loading={loading}
            disabled={otp.length < 4}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, paddingTop: spacing.xxl },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  sub: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: spacing.xl,
  },
});
