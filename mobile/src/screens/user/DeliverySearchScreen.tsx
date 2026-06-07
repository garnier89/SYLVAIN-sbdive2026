import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { merchantAPI } from '@/api/endpoints';

// Visual identity per delivery vertical (store_type) — mirrors the web overlay.
const TYPE_META: Record<string, { icon: any; bg: string; color: string }> = {
  restaurant: { icon: 'restaurant', bg: '#FFF1F2', color: '#F43F5E' },
  grocery: { icon: 'storefront', bg: '#ECFDF5', color: '#10B981' },
  florist: { icon: 'flower', bg: '#FDF2F8', color: '#EC4899' },
  stationery: { icon: 'pencil', bg: '#ECFEFF', color: '#0891B2' },
  wine: { icon: 'wine', bg: '#F5F3FF', color: '#7C3AED' },
  construction: { icon: 'hammer', bg: '#FFFBEB', color: '#D97706' },
  pharmacy: { icon: 'medkit', bg: '#FEF2F2', color: '#EF4444' },
};

const SUGGESTIONS = ['Pizza', 'Courses', 'Roses', 'Vin', 'Lait', 'Pain', 'Sushi'];

const euro = (n: any) =>
  typeof n === 'number' ? `${n.toFixed(2).replace('.', ',')} €` : '';

function TypeIcon({ storeType, size = 20 }: { storeType?: string; size?: number }) {
  const meta = TYPE_META[storeType || ''] || { icon: 'cube', bg: '#F1F5F9', color: '#64748B' };
  return (
    <View style={[styles.typeIcon, { backgroundColor: meta.bg }]}>
      <Ionicons name={meta.icon} size={size} color={meta.color} />
    </View>
  );
}

export default function DeliverySearchScreen() {
  const nav = useNavigation<any>();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(id);
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const q = term.trim();
    if (q.length < 2) {
      setStores([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await merchantAPI.searchDelivery(q);
      setStores(res.data?.stores || []);
      setProducts(res.data?.products || []);
    } catch {
      setStores([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the live search (300ms).
  useEffect(() => {
    const id = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(id);
  }, [query, runSearch]);

  const openStore = () => nav.navigate('Food');

  const hasResults = stores.length > 0 || products.length > 0;
  const showEmpty = query.trim().length >= 2 && !loading && !hasResults;
  const showSuggestions = query.trim().length < 2;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => nav.goBack()} testID="delivery-search-back" hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.textInverse} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('user_home.delivery_search_bar')}</Text>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder={t('user_home.delivery_search_placeholder')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID="delivery-search-input"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} testID="delivery-search-clear" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Body */}
      {showSuggestions ? (
        <View style={styles.suggestions} testID="delivery-search-suggestions">
          <Text style={styles.sectionLabel}>{t('user_home.delivery_search_ideas')}</Text>
          <View style={styles.tagRow}>
            {SUGGESTIONS.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => setQuery(tag)}
                style={styles.tag}
                testID={`delivery-search-tag-${tag.toLowerCase()}`}
              >
                <Text style={styles.tagText}>{tag}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : loading ? (
        <View style={styles.center} testID="delivery-search-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : showEmpty ? (
        <View style={styles.center} testID="delivery-search-empty">
          <Ionicons name="search" size={44} color={colors.border} />
          <Text style={styles.emptyTitle}>{t('user_home.delivery_search_empty')}</Text>
          <Text style={styles.emptyHint}>{t('user_home.delivery_search_empty_hint')}</Text>
        </View>
      ) : (
        <FlatList
          data={[...stores.map((s) => ({ ...s, _kind: 'store' })), ...products.map((p) => ({ ...p, _kind: 'product' }))]}
          keyExtractor={(it, i) => `${it._kind}-${it.id ?? i}`}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const firstStore = item._kind === 'store' && index === 0;
            const firstProduct = item._kind === 'product' && stores.length === index;
            return (
              <>
                {firstStore && (
                  <Text style={styles.groupLabel}>{t('user_home.delivery_search_stores')}</Text>
                )}
                {firstProduct && (
                  <Text style={styles.groupLabel}>{t('user_home.delivery_search_products')}</Text>
                )}
                <Pressable
                  onPress={openStore}
                  style={styles.resultRow}
                  testID={`delivery-search-${item._kind}-${item.id}`}
                >
                  <TypeIcon storeType={item.store_type} size={item._kind === 'product' ? 16 : 20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {item._kind === 'store' ? item.store_name : item.name}
                    </Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {item._kind === 'store'
                        ? `${item.store_type_label} · ${item.address || ''}`
                        : `${item.merchant_name} · ${item.store_type_label}`}
                    </Text>
                  </View>
                  {item._kind === 'store' ? (
                    <Text style={styles.resultEta}>{item.eta_min} min</Text>
                  ) : (
                    <Text style={styles.resultPrice}>{euro(item.price)}</Text>
                  )}
                </Pressable>
              </>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: {
    color: colors.secondary,
    fontWeight: '800',
    fontSize: fontSizes.md,
    flex: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 46,
    marginTop: spacing.md,
  },
  input: { flex: 1, fontSize: fontSizes.md, color: colors.textPrimary },
  suggestions: { padding: spacing.lg },
  sectionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  tagText: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptyHint: { fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 4 },
  groupLabel: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  typeIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultName: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  resultMeta: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  resultEta: { fontSize: fontSizes.xs, color: colors.textMuted },
  resultPrice: { fontSize: fontSizes.md, fontWeight: '800', color: colors.accent },
});
