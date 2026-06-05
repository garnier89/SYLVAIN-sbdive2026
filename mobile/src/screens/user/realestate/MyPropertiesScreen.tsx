import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { realEstateAPI } from '@/api/endpoints';

const fmtPrice = (p: number, type: string, period?: string) => {
  const v = Number(p || 0).toLocaleString('fr-FR');
  return type === 'rent' ? `${v} € /${period || 'mois'}` : `${v} €`;
};

const STATUS_LABEL: Record<string, string> = { active: 'Active', sold: 'Vendu', rented: 'Loué', inactive: 'Inactive' };

export default function MyPropertiesScreen() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<'listings' | 'inquiries'>('listings');
  const [listings, setListings] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, i] = await Promise.all([realEstateAPI.myListings(), realEstateAPI.myInquiries()]);
      setListings(l.data || []);
      setInquiries(i.data || []);
    } catch {
      /* keep prior */
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markSold = async (item: any) => {
    const next = item.listing_type === 'rent' ? 'rented' : 'sold';
    await realEstateAPI.setStatus(item.id, next).catch(() => {});
    load();
  };
  const removeListing = async (item: any) => {
    await realEstateAPI.remove(item.id).catch(() => {});
    load();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} testID="myprops-back"><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
        <Text style={styles.headerTitle}>Mes annonces</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        {(['listings', 'inquiries'] as const).map((tp) => (
          <Pressable key={tp} style={[styles.tab, tab === tp && styles.tabActive]} onPress={() => setTab(tp)} testID={`tab-${tp}`}>
            <Text style={[styles.tabTxt, tab === tp && styles.tabTxtActive]}>{tp === 'listings' ? 'Mes biens' : 'Mes demandes'}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : tab === 'listings' ? (
        <FlatList
          data={listings}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`myprop-${item.id}`}>
              <Pressable style={styles.cardTop} onPress={() => nav.navigate('PropertyDetail', { id: item.id })}>
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}><Ionicons name="home" size={24} color={colors.textMuted} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.price}>{fmtPrice(item.price, item.listing_type, item.rent_period)}</Text>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.statusBadge, item.status === 'active' ? { backgroundColor: '#DCFCE7' } : { backgroundColor: colors.surfaceAlt }]}>
                      <Text style={[styles.statusTxt, { color: item.status === 'active' ? colors.accent : colors.textSecondary }]}>{STATUS_LABEL[item.status] || item.status}</Text>
                    </View>
                    {item.unread_inquiries > 0 && (
                      <View style={styles.unread}><Text style={styles.unreadTxt}>{item.unread_inquiries} nouvelle(s)</Text></View>
                    )}
                  </View>
                </View>
              </Pressable>
              <View style={styles.actions}>
                {item.status === 'active' && (
                  <Pressable style={styles.actionBtn} onPress={() => markSold(item)} testID={`mark-sold-${item.id}`}>
                    <Ionicons name="checkmark-done" size={16} color={colors.info} />
                    <Text style={[styles.actionTxt, { color: colors.info }]}>{item.listing_type === 'rent' ? 'Marquer loué' : 'Marquer vendu'}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.actionBtn} onPress={() => removeListing(item)} testID={`delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={[styles.actionTxt, { color: colors.danger }]}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="home-outline" label="Vous n'avez publié aucune annonce." />}
        />
      ) : (
        <FlatList
          data={inquiries}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <Pressable style={styles.inqCard} onPress={() => nav.navigate('PropertyDetail', { id: item.listing_id })} testID={`inquiry-${item.id}`}>
              <Text style={styles.inqTitle} numberOfLines={1}>{item.listing_title || 'Annonce'}</Text>
              {item.offer_amount != null && <Text style={styles.inqOffer}>Offre : {Number(item.offer_amount).toLocaleString('fr-FR')} €</Text>}
              {!!item.message && <Text style={styles.inqMsg} numberOfLines={2}>{item.message}</Text>}
              <Text style={styles.inqStatus}>{item.status === 'new' ? 'Envoyée' : item.status}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="paper-plane-outline" label="Aucune demande envoyée." />}
        />
      )}
    </SafeAreaView>
  );
}

function EmptyState({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Text style={styles.emptyTxt}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  tabs: { flexDirection: 'row', margin: spacing.lg, marginBottom: 0, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.secondary },
  tabTxt: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textSecondary },
  tabTxtActive: { color: colors.textInverse },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.sm, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  price: { fontSize: fontSizes.md, fontWeight: '900', color: colors.secondary },
  title: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6, alignItems: 'center' },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  statusTxt: { fontSize: fontSizes.xs, fontWeight: '800' },
  unread: { backgroundColor: '#FEE2E2', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  unreadTxt: { fontSize: fontSizes.xs, fontWeight: '800', color: colors.danger },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  actionTxt: { fontSize: fontSizes.sm, fontWeight: '700' },
  inqCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  inqTitle: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  inqOffer: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.accent, marginTop: 4 },
  inqMsg: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 4 },
  inqStatus: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyTxt: { color: colors.textMuted, fontSize: fontSizes.md },
});
