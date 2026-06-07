import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ServiceTile from '@/components/ServiceTile';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { homeAPI, servicesAPI } from '@/api/endpoints';
import { phosphorToIonicon, tailwindToHex, routeToNav, taxiCatStyle } from '@/utils/cmsMappings';

export default function UserHomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigation<any>();

  // Dashboard-managed services (CMS). Falls back to the static list below.
  const [cmsItems, setCmsItems] = useState<any[]>([]);
  const [cmsSections, setCmsSections] = useState<any[]>([]);
  const [taxiCats, setTaxiCats] = useState<any[]>([]);
  const [loadingCms, setLoadingCms] = useState(true);

  useEffect(() => {
    let active = true;
    homeAPI
      .getHomeCategories()
      .then((r) => {
        if (!active) return;
        setCmsItems(r.data?.items || []);
        setCmsSections(r.data?.sections || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingCms(false);
      });
    // Taxi services from "Gérer les catégories" (service_categories) → in sync with admin.
    servicesAPI
      .getServiceCategories()
      .then((r) => {
        if (active) setTaxiCats(Array.isArray(r.data) ? r.data : (r.data?.items || []));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Taxi tiles built from service_categories (shaped like CMS items for unified rendering).
  const taxiSection = useMemo(() => {
    if (!taxiCats.length) return null;
    const items = taxiCats
      .filter((c) => c.active !== false)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .slice(0, 7)
      .map((c) => {
        const s = taxiCatStyle(c.key);
        // Custom uploaded image (icon = data:/http URL) takes priority over the default icon.
        const img = typeof c.icon === 'string' && (c.icon.startsWith('http') || c.icon.startsWith('data:')) ? c.icon : null;
        return {
          id: `svccat-${c.key}`,
          section: 'taxi',
          key: c.key,
          label_fr: c.name,
          icon_name: s.icon,
          icon_color_class: s.color,
          image_url: img,
          target_route: `/taxi?mode=${c.key}`,
          visible_home: true,
        };
      });
    return { key: 'taxi', title_fr: 'Services Taxi', items };
  }, [taxiCats]);

  const sections = useMemo(() => {
    const base = cmsItems.length
      ? cmsSections
          .map((sec) => ({
            ...sec,
            items: cmsItems
              .filter((i) => i.section === sec.key && i.visible_home)
              .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
          }))
          .filter((s) => s.items.length)
      : [];
    if (taxiSection) {
      // Replace any CMS taxi section with the admin-managed one (or prepend it).
      const others = base.filter((s) => s.key !== 'taxi');
      return [taxiSection, ...others];
    }
    return base;
  }, [cmsItems, cmsSections, taxiSection]);

  const fallbackServices = useMemo(
    () => [
      { key: 'taxi', label: t('user_home.taxi'), icon: 'car-sport', color: '#F59E0B', screen: 'Booking' },
      { key: 'moto', label: t('user_home.moto'), icon: 'bicycle', color: '#EF4444', screen: 'Booking' },
      { key: 'carpool', label: t('user_home.carpool'), icon: 'people', color: '#10B981', screen: 'Carpool' },
      { key: 'food', label: t('user_home.food'), icon: 'restaurant', color: '#F97316', screen: 'Food' },
      { key: 'delivery', label: t('user_home.delivery'), icon: 'cube', color: '#3B82F6', screen: 'Delivery' },
      { key: 'runner', label: t('user_home.runner'), icon: 'walk', color: '#8B5CF6', screen: 'Runner' },
      { key: 'beauty', label: t('user_home.beauty'), icon: 'flower', color: '#EC4899', screen: 'Beauty' },
      { key: 'pet', label: t('user_home.pet'), icon: 'paw', color: '#A855F7', screen: 'Pet' },
      { key: 'car_care', label: t('user_home.car_care'), icon: 'construct', color: '#0EA5E9', screen: 'CarCare' },
      { key: 'towing', label: t('user_home.towing'), icon: 'car', color: '#6366F1', screen: 'Towing' },
      { key: 'marketplace', label: t('user_home.marketplace'), icon: 'storefront', color: '#14B8A6', screen: 'Marketplace' },
      { key: 'pharmacy', label: 'Pharmacie', icon: 'medkit', color: '#EF4444', screen: 'PharmacyHome' },
      { key: 'real_estate', label: 'Immobilier', icon: 'home', color: '#0D9488', screen: 'RealEstate' },
      { key: 'nearby', label: t('user_home.nearby'), icon: 'location', color: '#84CC16', screen: 'Nearby' },
    ],
    [t]
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello} numberOfLines={1}>
              {t('user_home.hello', { name: user?.name?.split(' ')[0] || '' })}
            </Text>
            <Text style={styles.subhello}>{t('app_name')}</Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => nav.navigate('Wallet')}>
            <Ionicons name="wallet-outline" size={22} color={colors.textInverse} />
          </Pressable>
        </View>

        {/* Search */}
        <Pressable
          testID="home-search"
          onPress={() => nav.navigate('Booking')}
          style={styles.search}
        >
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <Text style={styles.searchText}>{t('user_home.where_to')}</Text>
          <View style={styles.micBtn}>
            <Ionicons name="mic" size={18} color={colors.secondary} />
          </View>
        </Pressable>

        {/* Banner promo */}
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerKicker}>SB Drive Premium</Text>
            <Text style={styles.bannerTitle}>20% sur votre 1ere course</Text>
            <Text style={styles.bannerSub}>Code: WELCOME20</Text>
          </View>
          <View style={styles.bannerIcon}>
            <Ionicons name="gift" size={32} color={colors.secondary} />
          </View>
        </View>

        {/* Unified delivery search */}
        <Pressable
          testID="home-delivery-search"
          onPress={() => nav.navigate('DeliverySearch')}
          style={styles.deliverySearch}
        >
          <Ionicons name="search" size={18} color={colors.primaryDark} />
          <Text style={styles.deliverySearchText} numberOfLines={1}>
            {t('user_home.delivery_search_bar')}
          </Text>
        </Pressable>

        {/* Services grid — synced with the dashboard (CMS) */}
        {loadingCms ? (
          <View style={styles.cmsLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : sections.length > 0 ? (
          sections.map((sec) => (
            <View key={sec.key}>
              <Text style={styles.sectionTitle}>{sec.title_fr || sec.key}</Text>
              <View style={styles.grid}>
                {sec.items.map((item: any) => {
                  const target = routeToNav(sec.key, item.target_route);
                  return (
                    <ServiceTile
                      key={item.id}
                      testID={`tile-${item.section}-${item.key}`}
                      label={(item.label_fr || '').replace(/\n/g, ' ')}
                      iconName={phosphorToIonicon(item.icon_name)}
                      imageUrl={item.image_url}
                      color={tailwindToHex(item.icon_color_class)}
                      onPress={() => nav.navigate(target.screen, target.params)}
                    />
                  );
                })}
              </View>
            </View>
          ))
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t('user_home.categories')}</Text>
            <View style={styles.grid}>
              {fallbackServices.map((s) => (
                <ServiceTile
                  key={s.key}
                  testID={`tile-${s.key}`}
                  label={s.label}
                  iconName={s.icon as any}
                  color={s.color}
                  onPress={() => nav.navigate(s.screen, { service: s.key })}
                />
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{t('user_home.recent')}</Text>
        <View style={styles.recentEmpty}>
          <Ionicons name="time-outline" size={32} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 8 }}>
            Pas encore de course
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.secondary,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  hello: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  subhello: { color: '#94A3B8', fontSize: fontSizes.sm, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.lg,
    gap: spacing.sm,
    ...shadow.md,
  },
  searchText: { flex: 1, color: colors.textMuted, fontSize: fontSizes.md },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    gap: spacing.md,
  },
  bannerKicker: { fontSize: fontSizes.xs, color: colors.secondary, fontWeight: '700' },
  bannerTitle: {
    fontSize: fontSizes.lg,
    color: colors.secondary,
    fontWeight: '800',
    marginTop: 2,
  },
  bannerSub: { fontSize: fontSizes.sm, color: '#1E293B', marginTop: 2, fontWeight: '600' },
  bannerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF7D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliverySearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: '#FCE7B8',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 46,
    borderRadius: radius.lg,
  },
  deliverySearchText: { flex: 1, color: '#B45309', fontSize: fontSizes.sm, fontWeight: '600' },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
  },
  cmsLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  recentEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
});
