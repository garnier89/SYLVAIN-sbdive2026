import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { colors, fontSizes, spacing } from '@/theme';
import { authAPI } from '@/api/endpoints';

export default function PhoneLoginScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    setError(null);
    setLoading(true);
    try {
      await authAPI.requestOtp(phone.trim());
      nav.navigate('OtpVerify', { phone: phone.trim() });
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
          <Text style={styles.title}>{t('auth.phone_login_title')}</Text>
          <Text style={styles.sub}>{t('auth.phone_login_hint')}</Text>

          <Input
            testID="phone-input"
            label={t('auth.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+33 6 12 34 56 78"
            leftIcon={<Ionicons name="call" size={18} color={colors.textMuted} />}
            error={error}
            autoFocus
          />

          <Button
            testID="phone-send-otp"
            label={t('auth.send_otp')}
            onPress={onSend}
            loading={loading}
            disabled={!phone}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <View style={styles.footer}>
            <Text
              style={styles.link}
              onPress={() => nav.navigate('EmailLogin')}
            >
              {t('auth.continue_with_email')}
            </Text>
          </View>
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
  footer: { alignItems: 'center', marginTop: spacing.xl },
  link: { color: colors.primaryDark, fontWeight: '700' },
});
