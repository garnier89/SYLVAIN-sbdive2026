import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { phase2API } from '@/api/endpoints';

// Reusable catalog screen for the 9 V3Cube service categories.
// Maps screen "service" param -> backend collection.
const COLLECTIONS: Record<string, string> = {
  beauty: 'beauty_salons',
  pet: 'pet_providers',
  car_care: 'car_services',
  towing: 'towing_partners',
  nearby: 'nearby_businesses',
  on_demand: 'ondemand_services',
  marketplace: 'marketplace_listings',
  carpool: 'carpool_trips',
  food: 'merchants',
  delivery: 'merchants',
};

export default function CatalogScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const service: string = route.params?.service ?? 'beauty';
  const collection = COLLECTIONS[service] ?? service;

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await phase2API.catalog(collection);
      const list = res.data?.items ?? res.data ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [collection]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textInverse} />
        </Pressable>
        <Text style={styles.headerTitle}>{capitalize(service)}</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(it, i) => it.id ?? String(i)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80, gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="basket-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>
                Aucun resultat
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card}>
            {item.is_featured ? (
              <View style={styles.featured}>
                <Ionicons name="star" size={12} color={colors.secondary} />
                <Text style={styles.featuredText}>SPONSORISE</Text>
              </View>
            ) : null}
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={32} color={colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1, padding: spacing.md, gap: 4 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name ?? item.title ?? 'Sans nom'}
              </Text>
              <Text style={styles.meta} numberOfLines={2}>
                {item.address ?? item.description ?? ''}
              </Text>
              <View style={styles.metaRow}>
                {item.rating ? (
                  <View style={styles.rating}>
                    <Ionicons name="star" size={12} color={colors.warning} />
                    <Text style={styles.ratingText}>{item.rating.toFixed?.(1) ?? item.rating}</Text>
                  </View>
                ) : null}
                {item.price ? (
                  <Text style={styles.price}>
                    {item.price} {item.currency ?? 'EUR'}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: colors.textInverse,
    fontSize: fontSizes.lg,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadow.sm,
  },
  image: { width: 110, height: 110 },
  imagePlaceholder: {
    width: 110,
    height: 110,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  meta: { color: colors.textSecondary, fontSize: fontSizes.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { color: colors.textPrimary, fontWeight: '700', fontSize: fontSizes.sm },
  price: { color: colors.primaryDark, fontWeight: '800', fontSize: fontSizes.sm },
  featured: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  featuredText: { fontSize: 10, fontWeight: '800', color: colors.secondary },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
});
