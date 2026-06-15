import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Switch, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { merchantAPI } from '@/api/endpoints';

export default function MerchantHomeScreen() {
  const [stats, setStats] = useState<any>({});
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        merchantAPI.stats().catch(() => ({ data: {} })),
        merchantAPI.me().catch(() => ({ data: null })),
      ]);
      setStats(s.data ?? {});
      setStore(m.data ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleOpen = async (next: boolean) => {
    setToggling(true);
    setStore((p: any) => ({ ...(p || {}), accepting_orders: next }));
    try {
      const res = await merchantAPI.setAvailability(next);
      setStore((p: any) => ({ ...(p || {}), ...res.data }));
    } catch {
      setStore((p: any) => ({ ...(p || {}), accepting_orders: !next }));
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.primaryDark} size="large" /></SafeAreaView>;
  }

  const open = store?.accepting_orders !== false;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.title} testID="merchant-store-name">{store?.store_name || 'Mon commerce'}</Text>

        {/* Ouvert / Fermé */}
        <View style={[styles.openCard, { borderLeftColor: open ? colors.accent : colors.danger }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.openLabel}>{open ? 'Boutique ouverte' : 'Boutique fermée'}</Text>
            <Text style={styles.openSub}>{open ? 'Vous recevez les commandes' : 'Les nouvelles commandes sont en pause'}</Text>
          </View>
          <Switch
            testID="merchant-open-toggle"
            value={open}
            disabled={toggling}
            onValueChange={toggleOpen}
            trackColor={{ true: colors.accent, false: colors.borderStrong }}
          />
        </View>

        <View style={styles.row}>
          <Stat icon="receipt" label="Commandes du jour" value={String(stats?.today_orders ?? 0)} color={colors.info} />
          <Stat icon="cash" label="Recette du jour" value={`${(stats?.today_revenue ?? 0).toFixed?.(2) ?? '0.00'} €`} color={colors.accent} />
        </View>
        <View style={styles.row}>
          <Stat icon="time" label="En attente" value={String(stats?.pending_orders ?? 0)} color={colors.warning} />
          <Stat icon="star" label="Note" value={`${stats?.rating ?? 5} (${stats?.review_count ?? 0})`} color={colors.primaryDark} />
        </View>
        <View style={styles.row}>
          <Stat icon="fast-food" label="Produits" value={String(stats?.products_total ?? 0)} color={colors.secondary} />
          <Stat icon="alert-circle" label="En rupture" value={String(stats?.out_of_stock ?? 0)} color={colors.danger} />
        </View>

        <Text style={styles.section}>Top produits</Text>
        {(stats?.top_products || []).length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bag-outline" size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8 }}>Pas encore de ventes</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {(stats.top_products || []).map((p: any, i: number) => (
              <View key={i} style={styles.topRow} testID={`merchant-top-${i}`}>
                <Text style={styles.topName} numberOfLines={1}>{i + 1}. {p.name}</Text>
                <Text style={styles.topQty}>×{p.qty}</Text>
              </View>
            ))}
          </View>
        )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  openCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md, borderLeftWidth: 4, marginBottom: spacing.md, ...shadow.sm,
  },
  openLabel: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  openSub: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2 },
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderTopWidth: 3, ...shadow.sm },
  statValue: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary, marginTop: 6 },
  statLabel: { color: colors.textSecondary, fontSize: fontSizes.xs, marginTop: 2 },
  section: { fontSize: fontSizes.sm, color: colors.textSecondary, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  topName: { flex: 1, color: colors.textPrimary, fontSize: fontSizes.sm },
  topQty: { color: colors.primaryDark, fontWeight: '800', fontSize: fontSizes.sm },
  empty: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xxl, alignItems: 'center', ...shadow.sm },
});
