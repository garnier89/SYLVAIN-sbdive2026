import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigation<any>();

  const rows = [
    { key: 'edit', icon: 'person-outline', label: 'Modifier le profil', screen: 'EditProfile' },
    { key: 'properties', icon: 'home-outline', label: 'Mes annonces immobilières', screen: 'MyProperties' },
    { key: 'addresses', icon: 'location-outline', label: 'Mes adresses', screen: null },
    { key: 'settings', icon: 'settings-outline', label: 'Réglages', screen: 'Settings' },
    { key: 'help', icon: 'help-circle-outline', label: t('profile.help'), screen: null },
  ];

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
              onPress={() => r.screen && nav.navigate(r.screen)}
              testID={`profile-row-${r.key}`}
            >
              <Ionicons name={r.icon as any} size={22} color={colors.textSecondary} />
              <Text style={styles.rowText}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
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
