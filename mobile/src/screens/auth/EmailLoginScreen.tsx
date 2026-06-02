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
import { useAuth } from '@/contexts/AuthContext';

export default function EmailLoginScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
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
          <Text style={styles.title}>{t('auth.login')}</Text>
          <Text style={styles.sub}>{t('auth.subtitle')}</Text>

          <Input
            testID="email-input"
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="vous@example.com"
            leftIcon={<Ionicons name="mail" size={18} color={colors.textMuted} />}
            containerStyle={{ marginBottom: spacing.md }}
          />

          <Input
            testID="password-input"
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPwd}
            placeholder="••••••••"
            leftIcon={<Ionicons name="lock-closed" size={18} color={colors.textMuted} />}
            rightIcon={
              <Ionicons
                name={showPwd ? 'eye-off' : 'eye'}
                size={18}
                color={colors.textMuted}
                onPress={() => setShowPwd((s) => !s)}
              />
            }
            error={error}
          />

          <Button
            testID="email-login-submit"
            label={t('auth.login')}
            onPress={onSubmit}
            loading={loading}
            disabled={!email || !password}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <View style={styles.footer}>
            <Text style={{ color: colors.textSecondary }}>{t('auth.no_account')} </Text>
            <Text
              testID="goto-register"
              style={styles.link}
              onPress={() => nav.navigate('Register')}
            >
              {t('auth.register')}
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
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  sub: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: spacing.xl,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  link: { color: colors.primaryDark, fontWeight: '700' },
});
