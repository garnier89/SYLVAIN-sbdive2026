import React, { useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { rideAPI } from '@/api/endpoints';

export default function OrdersScreen() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await rideAPI.list({ limit: 50 });
      const list = res.data?.items ?? res.data ?? [];
      setRides(Array.isArray(list) ? list : []);
    } catch {
      setRides([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>{t('tabs.orders')}</Text>
      <FlatList
        data={rides}
        keyExtractor={(item, idx) => item.id ?? String(idx)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Aucune course pour le moment</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.status}>{(item.status ?? 'pending').toUpperCase()}</Text>
              <Text style={styles.fare}>
                {(item.fare ?? item.total_fare ?? 0).toFixed?.(2) ?? item.fare ?? '--'} EUR
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="ellipse" size={10} color={colors.accent} />
              <Text style={styles.address} numberOfLines={1}>
                {item.pickup_address ?? '—'}
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="location" size={12} color={colors.danger} />
              <Text style={styles.address} numberOfLines={1}>
                {item.dropoff_address ?? '—'}
              </Text>
            </View>
            <Text style={styles.date}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  status: {
    fontSize: fontSizes.xs,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  fare: { fontSize: fontSizes.md, color: colors.textPrimary, fontWeight: '800' },
  address: { color: colors.textPrimary, flex: 1 },
  date: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 6 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: 8 },
  emptyText: { color: colors.textMuted },
});
