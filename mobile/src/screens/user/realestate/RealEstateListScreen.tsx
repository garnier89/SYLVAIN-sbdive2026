import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { realEstateAPI } from '@/api/endpoints';

const CATEGORIES = [
  { key: '', label: 'Tous' },
  { key: 'residential', label: 'Résidentiel' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'land', label: 'Terrain' },
];

const fmtPrice = (p: number, type: string, period?: string) => {
  const v = Number(p || 0).toLocaleString('fr-FR');
  return type === 'rent' ? `${v} € /${period || 'mois'}` : `${v} €`;
};

function PropertyCard({ item, onPress }: { item: any; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress} testID={`property-card-${item.id}`}>
      <View style={styles.thumbWrap}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="home" size={32} color={colors.textMuted} />
          </View>
        )}
        {item.is_featured && (
          <View style={styles.featuredBadge} testID={`property-featured-${item.id}`}>
            <Ionicons name="star" size={11} color="#fff" />
            <Text style={styles.featuredTxt}>Sponsorisé</Text>
          </View>
        )}
        <View style={[styles.typeBadge, { backgroundColor: item.listing_type === 'rent' ? colors.info : colors.accent }]}>
          <Text style={styles.typeTxt}>{item.listing_type === 'rent' ? 'Location' : 'Vente'}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.price}>{fmtPrice(item.price, item.listing_type, item.rent_period)}</Text>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.loc} numberOfLines={1}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} /> {item.city || item.address || '—'}
        </Text>
        <View style={styles.specs}>
          {item.bedrooms != null && <Text style={styles.spec}>🛏 {item.bedrooms}</Text>}
          {item.bathrooms != null && <Text style={styles.spec}>🛁 {item.bathrooms}</Text>}
          {item.area_sqm != null && <Text style={styles.spec}>📐 {item.area_sqm} m²</Text>}
        </View>
      </View>
    </Pressable>
  );
}

export default function RealEstateListScreen() {
  const nav = useNavigation<any>();
  const [listingType, setListingType] = useState<'sale' | 'rent'>('sale');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { listing_type: listingType };
      if (category) params.category = category;
      if (q.trim()) params.q = q.trim();
      const res = await realEstateAPI.list(params);
      setItems(res.data || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [listingType, category, q]);

  useEffect(() => {
    const tmr = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(tmr);
  }, [load, q]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} testID="realestate-back">
          <Ionicons name="arrow-back" size={24} color={colors.textInverse} />
        </Pressable>
        <Text style={styles.headerTitle}>Immobilier</Text>
        <Pressable onPress={() => nav.navigate('MyProperties')} hitSlop={12} testID="my-properties-link">
          <Ionicons name="folder-outline" size={22} color={colors.textInverse} />
        </Pressable>
      </View>

      {/* Acheter / Louer toggle */}
      <View style={styles.toggleRow}>
        {(['sale', 'rent'] as const).map((tp) => (
          <Pressable
            key={tp}
            style={[styles.toggle, listingType === tp && styles.toggleActive]}
            onPress={() => setListingType(tp)}
            testID={`toggle-${tp}`}
          >
            <Text style={[styles.toggleTxt, listingType === tp && styles.toggleTxtActive]}>
              {tp === 'sale' ? 'Acheter' : 'Louer'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Ville, quartier, mot-clé…"
          placeholderTextColor={colors.textMuted}
          value={q}
          onChangeText={setQ}
          testID="realestate-search"
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable>
        )}
      </View>

      {/* Category chips */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(c) => c.key || 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item: c }) => (
          <Pressable
            style={[styles.chip, category === c.key && styles.chipActive]}
            onPress={() => setCategory(c.key)}
            testID={`chip-${c.key || 'all'}`}
          >
            <Text style={[styles.chipTxt, category === c.key && styles.chipTxtActive]}>{c.label}</Text>
          </Pressable>
        )}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: 100, gap: spacing.md, paddingTop: spacing.sm }}
          renderItem={({ item }) => (
            <PropertyCard item={item} onPress={() => nav.navigate('PropertyDetail', { id: item.id })} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="home-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTxt}>Aucune annonce trouvée</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, margin: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.pill, padding: 4 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  toggleActive: { backgroundColor: colors.secondary },
  toggleTxt: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textSecondary },
  toggleTxtActive: { color: colors.textInverse },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: fontSizes.md },
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary },
  chipTxtActive: { color: colors.secondary },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: '100%', height: 110, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  featuredBadge: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.warning, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  featuredTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  typeBadge: { position: 'absolute', bottom: 6, right: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  typeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  cardBody: { padding: spacing.sm },
  price: { fontSize: fontSizes.md, fontWeight: '900', color: colors.secondary },
  title: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  loc: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  specs: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  spec: { fontSize: fontSizes.xs, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyTxt: { color: colors.textMuted, fontSize: fontSizes.md },
});
