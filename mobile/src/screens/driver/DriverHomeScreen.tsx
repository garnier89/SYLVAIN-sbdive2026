import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { driverAPI, rideAPI } from '@/api/endpoints';
import { useAuth } from '@/contexts/AuthContext';

export default function DriverHomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigation<any>();
  const [online, setOnline] = useState(false);
  const [activity, setActivity] = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);

  const loadActivity = async () => {
    try {
      const res = await driverAPI.myActivity();
      setActivity(res.data ?? null);
      setOnline(!!res.data?.online);
    } catch {}
  };

  const loadActive = async () => {
    try {
      const res = await rideAPI.getActive();
      const r = res.data?.ride ?? res.data ?? null;
      setActiveRide(r && r.id ? r : null);
    } catch {
      setActiveRide(null);
    }
  };

  useEffect(() => {
    loadActivity();
    loadActive();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadActive();
    }, [])
  );

  const toggleOnline = async () => {
    try {
      const res = await driverAPI.toggleOnline();
      setOnline(!!res.data?.online);
    } catch {
      setOnline((o) => !o);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {activeRide ? (
          <Pressable
            testID="resume-ride-banner"
            onPress={() => nav.navigate('ActiveRide', { rideId: activeRide.id })}
            style={styles.resumeBanner}
          >
            <View style={styles.resumeIcon}>
              <Ionicons name="car-sport" size={20} color={colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>Course en cours</Text>
              <Text style={styles.resumeSub} numberOfLines={1}>
                {activeRide.dropoff_address ?? activeRide.pickup_address ?? '—'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.secondary} />
          </Pressable>
        ) : null}

        <View style={styles.headerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Bonjour {user?.name?.split(' ')[0] ?? ''}</Text>
            <Text style={styles.subhello}>
              {online ? t('driver.online') : t('driver.offline')}
            </Text>
          </View>
          <Switch
            testID="driver-online-switch"
            value={online}
            onValueChange={toggleOnline}
            trackColor={{ false: '#475569', true: colors.accent }}
            thumbColor={colors.primary}
          />
        </View>

        <View style={styles.statsRow}>
          <Stat
            icon="cash"
            label={t('driver.earnings_today')}
            value={`${(activity?.earnings_today ?? 0).toFixed?.(2) ?? '0.00'} EUR`}
            color={colors.accent}
          />
          <Stat
            icon="car"
            label={t('driver.rides_today')}
            value={String(activity?.rides_today ?? 0)}
            color={colors.info}
          />
        </View>
        <View style={styles.statsRow}>
          <Stat
            icon="star"
            label={t('driver.rating')}
            value={String(activity?.rating ?? '5.0')}
            color={colors.warning}
          />
          <Stat
            icon="trending-up"
            label={t('driver.activity_score')}
            value={`${activity?.activity_score ?? 100}/100`}
            color={colors.danger}
          />
        </View>

        <Text style={styles.section}>{t('driver.my_activity')}</Text>
        <View style={styles.activityCard}>
          <Row label={t('driver.acceptance')} value={`${activity?.acceptance_rate ?? 100}%`} />
          <Row label={t('driver.cancellation')} value={`${activity?.cancellation_rate ?? 0}%`} />
          <Row label="Points" value={String(activity?.points ?? 50)} />
          <Row
            label={t('driver.priority')}
            value={t(`driver.palette_${activity?.palette ?? 'standard'}`)}
          />
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

function Row({ label, value }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.md,
  },
  hello: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  subhello: { color: colors.primary, fontSize: fontSizes.sm, marginTop: 4, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
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
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  activityCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textSecondary },
  rowValue: { color: colors.textPrimary, fontWeight: '700' },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    ...shadow.md,
  },
  resumeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeTitle: { color: colors.secondary, fontWeight: '800', fontSize: fontSizes.sm },
  resumeSub: { color: colors.secondary, fontSize: fontSizes.xs, opacity: 0.8 },
});
