import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { colors, fontSizes, radius, spacing } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';

type Role = 'user' | 'driver' | 'merchant';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { register } = useAuth();
  const [role, setRole] = useState<Role>(route.params?.role ?? 'user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        role,
      });
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
          <Text style={styles.title}>{t('auth.register')}</Text>

          <Text style={styles.section}>{t('auth.select_role')}</Text>
          <View style={styles.roleRow}>
            {(['user', 'driver', 'merchant'] as Role[]).map((r) => (
              <Pressable
                key={r}
                testID={`role-${r}`}
                onPress={() => setRole(r)}
                style={[
                  styles.roleChip,
                  role === r && { borderColor: colors.primary, backgroundColor: '#FFFBEB' },
                ]}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    role === r && { color: colors.textPrimary, fontWeight: '700' },
                  ]}
                >
                  {t(`auth.role_${r}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Input
            testID="reg-name"
            label={t('auth.name')}
            value={name}
            onChangeText={setName}
            placeholder="Jean Dupont"
            containerStyle={styles.spaced}
          />
          <Input
            testID="reg-email"
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="vous@example.com"
            containerStyle={styles.spaced}
          />
          <Input
            testID="reg-phone"
            label={t('auth.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+33 6 12 34 56 78"
            containerStyle={styles.spaced}
          />
          <Input
            testID="reg-password"
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={error}
          />

          <Button
            testID="reg-submit"
            label={t('auth.register')}
            onPress={onSubmit}
            loading={loading}
            disabled={!name || !email || !password}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <View style={styles.footer}>
            <Text style={{ color: colors.textSecondary }}>
              {t('auth.have_account')}{' '}
            </Text>
            <Text style={styles.link} onPress={() => nav.navigate('EmailLogin')}>
              {t('auth.login')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, paddingTop: spacing.xl },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  section: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  roleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  roleChipText: { color: colors.textSecondary },
  spaced: { marginBottom: spacing.md },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  link: { color: colors.primaryDark, fontWeight: '700' },
});
