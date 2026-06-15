import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { orderAPI } from '@/api/endpoints';

// Cycle de vie d'une commande côté marchand.
const NEXT: Record<string, { status: string; label: string } | null> = {
  pending: { status: 'accepted', label: 'Accepter' },
  accepted: { status: 'preparing', label: 'En préparation' },
  preparing: { status: 'ready', label: 'Prête' },
  ready: { status: 'delivered', label: 'Remise' },
  delivered: null,
  cancelled: null,
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Nouvelle', color: colors.warning },
  accepted: { label: 'Acceptée', color: colors.info },
  preparing: { label: 'En préparation', color: colors.primaryDark },
  ready: { label: 'Prête', color: colors.accent },
  delivered: { label: 'Livrée', color: colors.textMuted },
  cancelled: { label: 'Annulée', color: colors.danger },
};

const FILTERS = [
  { key: 'active', label: 'En cours' },
  { key: 'pending', label: 'Nouvelles' },
  { key: 'ready', label: 'Prêtes' },
  { key: 'all', label: 'Toutes' },
];

export default function MerchantOrdersScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await orderAPI.list({ limit: 50 });
      setOrders(Array.isArray(res.data) ? res.data : res.data?.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      await orderAPI.updateStatus(id, status);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const visible = orders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['pending', 'accepted', 'preparing', 'ready'].includes(o.status);
    return o.status === filter;
  });

  const renderItem = ({ item }: any) => {
    const meta = STATUS_META[item.status] || STATUS_META.pending;
    const next = NEXT[item.status];
    const itemsCount = (item.items || []).reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0);
    return (
      <View style={styles.card} testID={`merchant-order-${item.id}`}>
        <View style={styles.cardHead}>
          <Text style={styles.orderId}>#{String(item.id || '').slice(-6).toUpperCase()}</Text>
          <View style={[styles.badge, { backgroundColor: meta.color + '22' }]}>
            <Text style={[styles.badgeTxt, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={styles.orderInfo}>{itemsCount} article(s) · {(item.total ?? 0).toFixed?.(2) ?? item.total} €</Text>
        {item.delivery_address ? <Text style={styles.addr} numberOfLines={1}>📍 {item.delivery_address}</Text> : null}

        {(next || ['pending', 'accepted'].includes(item.status)) && (
          <View style={styles.actions}>
            {['pending', 'accepted'].includes(item.status) && (
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                disabled={busy === item.id}
                onPress={() => changeStatus(item.id, 'cancelled')}
                testID={`merchant-order-reject-${item.id}`}
              >
                <Text style={[styles.btnTxt, { color: colors.danger }]}>Refuser</Text>
              </TouchableOpacity>
            )}
            {next && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                disabled={busy === item.id}
                onPress={() => changeStatus(item.id, next.status)}
                testID={`merchant-order-advance-${item.id}`}
              >
                {busy === item.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.btnTxt, { color: '#fff' }]}>{next.label}</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>Commandes</Text>
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
            testID={`merchant-filter-${f.key}`}
          >
            <Text style={[styles.chipTxt, filter === f.key && styles.chipTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primaryDark} size="large" /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={44} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>Aucune commande</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  chipActive: { backgroundColor: colors.secondary },
  chipTxt: { color: colors.textSecondary, fontSize: fontSizes.sm, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadow.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeTxt: { fontSize: fontSizes.xs, fontWeight: '800' },
  orderInfo: { color: colors.textSecondary, marginTop: 6, fontSize: fontSizes.sm },
  addr: { color: colors.textMuted, marginTop: 4, fontSize: fontSizes.xs },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  btn: { flex: 1, paddingVertical: 11, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primaryDark },
  btnGhost: { backgroundColor: colors.surfaceAlt },
  btnTxt: { fontWeight: '800', fontSize: fontSizes.sm },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
});
