import React, { useMemo } from 'react';
import {
  Image,
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

export default function UserHomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigation<any>();

  const services = useMemo(
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

        {/* Services grid */}
        <Text style={styles.sectionTitle}>{t('user_home.categories')}</Text>
        <View style={styles.grid}>
          {services.map((s) => (
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
  recentEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
});
