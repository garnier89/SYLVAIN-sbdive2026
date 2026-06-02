import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/locales/i18n';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const rows = [
    { key: 'addresses', icon: 'location-outline', label: 'Mes adresses' },
    { key: 'payment', icon: 'card-outline', label: 'Moyens de paiement' },
    { key: 'help', icon: 'help-circle-outline', label: t('profile.help') },
    { key: 'about', icon: 'information-circle-outline', label: t('profile.about') },
  ];

  const toggleLang = () => {
    const next = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(next);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.name ?? '—'}</Text>
          <Text style={styles.email}>{user?.email ?? user?.phone ?? ''}</Text>
        </View>

        <View style={styles.list}>
          {rows.map((r, i) => (
            <Pressable
              key={r.key}
              style={[styles.row, i < rows.length - 1 && styles.divider]}
            >
              <Ionicons name={r.icon as any} size={22} color={colors.textSecondary} />
              <Text style={styles.rowText}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
          <Pressable style={styles.row} onPress={toggleLang}>
            <Ionicons name="language-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowText}>
              {t('profile.language')} — {i18n.language.toUpperCase()}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Button
          testID="logout-btn"
          label={t('auth.logout')}
          variant="danger"
          fullWidth
          onPress={logout}
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { alignItems: 'center', padding: spacing.xl, gap: 6 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: colors.secondary },
  name: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary },
  email: { fontSize: fontSizes.sm, color: colors.textSecondary },
  list: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    gap: spacing.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1, color: colors.textPrimary, fontSize: fontSizes.md },
});
