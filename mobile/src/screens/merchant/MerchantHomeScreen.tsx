import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { adminAPI } from '@/api/endpoints';

export default function MerchantHomeScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await adminAPI.dashboard();
        setStats(res.data ?? {});
      } catch {
        setStats({});
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        <Text style={styles.title}>{t('merchant.dashboard')}</Text>

        <View style={styles.row}>
          <Stat
            icon="receipt"
            label={t('merchant.today_orders')}
            value={String(stats?.orders_today ?? 0)}
            color={colors.info}
          />
          <Stat
            icon="cash"
            label={t('merchant.today_revenue')}
            value={`${(stats?.revenue_today ?? 0).toFixed?.(2) ?? '0.00'} EUR`}
            color={colors.accent}
          />
        </View>

        <Text style={styles.section}>{t('merchant.orders')}</Text>
        <View style={styles.empty}>
          <Ionicons name="bag-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 8 }}>
            Aucune commande en cours
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, label, value, color }: any) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderTopWidth: 3,
    ...shadow.sm,
  },
  statValue: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 6,
  },
  statLabel: { color: colors.textSecondary, fontSize: fontSizes.xs, marginTop: 2 },
  section: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    ...shadow.sm,
  },
});
