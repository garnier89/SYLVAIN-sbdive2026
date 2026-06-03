import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { rideAPI } from '@/api/endpoints';
import { regionFromCoords, PARIS } from '@/utils/geo';
import { estimateEtaMinutes, formatEta } from '@/utils/eta';
import useRideSocket from '@/hooks/useRideSocket';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Recherche d\'un chauffeur',
  accepted: 'Chauffeur en route',
  arriving: 'Chauffeur arrive',
  arrived: 'Chauffeur sur place',
  in_progress: 'Course en cours',
  completed: 'Course terminee',
  cancelled: 'Course annulee',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#F59E0B',
  accepted: '#3B82F6',
  arriving: '#3B82F6',
  arrived: '#10B981',
  in_progress: '#10B981',
  completed: '#10B981',
  cancelled: '#EF4444',
};

export default function RideTrackingScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const rideId: string = route.params?.rideId;
  const mapRef = useRef<MapView | null>(null);

  const [ride, setRide] = useState<any>(null);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRide = useCallback(async () => {
    try {
      const res = await rideAPI.get(rideId);
      setRide(res.data);
      if (res.data?.driver_lat && res.data?.driver_lng) {
        setDriverLoc({ lat: res.data.driver_lat, lng: res.data.driver_lng });
      }
    } catch {}
    finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    fetchRide();
    const id = setInterval(fetchRide, 8000); // fallback polling
    return () => clearInterval(id);
  }, [fetchRide]);

  // Live updates via websocket
  useRideSocket({
    enabled: !!rideId,
    rideId,
    onMessage: (msg) => {
      if (msg?.type === 'driver_location' && msg.ride_id === rideId) {
        setDriverLoc({ lat: msg.lat, lng: msg.lng });
      }
      if (msg?.type === 'ride_status_update' && msg.ride_id === rideId) {
        setRide((r: any) => (r ? { ...r, status: msg.status } : r));
      }
      if (msg?.type === 'eta_update' && msg.ride_id === rideId) {
        if (typeof msg.eta_min === 'number') setEtaMin(msg.eta_min);
      }
    },
  });

  // Fallback: estimate ETA locally if driver pushes location but no eta_update yet
  useEffect(() => {
    if (etaMin != null || !ride || !driverLoc) return;
    const phase = ride.status === 'in_progress' ? 'dropoff' : 'pickup';
    const target =
      phase === 'pickup'
        ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
        : { lat: ride.dropoff_lat, lng: ride.dropoff_lng };
    const local = estimateEtaMinutes(
      driverLoc.lat,
      driverLoc.lng,
      target.lat,
      target.lng,
      ride.vehicle_type
    );
    if (local != null) setEtaMin(local);
  }, [driverLoc, ride, etaMin]);

  // Fit map to all points
  useEffect(() => {
    if (!ride) return;
    const points = [
      ride.pickup_lat && ride.pickup_lng ? { lat: ride.pickup_lat, lng: ride.pickup_lng } : null,
      ride.dropoff_lat && ride.dropoff_lng ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng } : null,
      driverLoc,
    ].filter(Boolean) as Array<{ lat: number; lng: number }>;
    if (points.length) {
      mapRef.current?.animateToRegion(regionFromCoords(points), 600);
    }
  }, [ride, driverLoc]);

  const cancelRide = async () => {
    Alert.alert('Annuler', 'Voulez-vous vraiment annuler cette course ?', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Oui',
        style: 'destructive',
        onPress: async () => {
          try {
            await rideAPI.cancel(rideId, 'user_cancelled');
            nav.goBack();
          } catch {}
        },
      },
    ]);
  };

  const callDriver = () => {
    const phone = ride?.driver?.phone;
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const pickup =
    ride?.pickup_lat && ride?.pickup_lng
      ? { latitude: ride.pickup_lat, longitude: ride.pickup_lng }
      : null;
  const dropoff =
    ride?.dropoff_lat && ride?.dropoff_lng
      ? { latitude: ride.dropoff_lat, longitude: ride.dropoff_lng }
      : null;
  const drv = driverLoc ? { latitude: driverLoc.lat, longitude: driverLoc.lng } : null;

  const status = ride?.status ?? 'pending';
  const isActive = !['completed', 'cancelled'].includes(status);

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: pickup?.latitude ?? PARIS.lat,
          longitude: pickup?.longitude ?? PARIS.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {pickup ? <Marker coordinate={pickup} title="Depart" pinColor="green" /> : null}
        {dropoff ? <Marker coordinate={dropoff} title="Arrivee" pinColor="red" /> : null}
        {drv ? (
          <Marker coordinate={drv} title="Chauffeur" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverDot}>
              <Ionicons name="car-sport" size={18} color={colors.secondary} />
            </View>
          </Marker>
        ) : null}
        {pickup && dropoff ? (
          <Polyline coordinates={[pickup, dropoff]} strokeWidth={4} strokeColor={colors.primary} />
        ) : null}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.headerWrap} pointerEvents="box-none">
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textInverse} />
          </Pressable>
          <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[status] ?? colors.info }]}>
            <Text style={styles.statusText}>{STATUS_LABEL[status] ?? status}</Text>
            {etaMin != null && isActive ? (
              <Text style={styles.etaText}>
                {status === 'in_progress' ? 'Arrivee dans' : 'Chauffeur dans'} {formatEta(etaMin)}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {loading ? (
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{t('common.loading')}</Text>
        ) : (
          <>
            {ride?.driver ? (
              <View style={styles.driverCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {ride.driver?.name?.[0]?.toUpperCase() ?? 'C'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{ride.driver?.name ?? 'Chauffeur'}</Text>
                  <View style={styles.row}>
                    <Ionicons name="star" size={12} color={colors.warning} />
                    <Text style={styles.driverMeta}>
                      {ride.driver?.rating?.toFixed?.(1) ?? '5.0'} · {ride.driver?.vehicle ?? ride.vehicle_type}
                    </Text>
                  </View>
                  {ride.driver?.plate ? (
                    <Text style={styles.plate}>{ride.driver.plate}</Text>
                  ) : null}
                </View>
                {ride.driver?.phone ? (
                  <Pressable onPress={callDriver} style={styles.callBtn}>
                    <Ionicons name="call" size={20} color={colors.textInverse} />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.searchingCard}>
                <Ionicons name="search" size={20} color={colors.primaryDark} />
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {t('booking.searching_driver')}
                </Text>
              </View>
            )}

            <View style={styles.routeRow}>
              <Ionicons name="ellipse" size={10} color={colors.accent} />
              <Text style={styles.routeText} numberOfLines={1}>
                {ride?.pickup_address ?? '—'}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={12} color={colors.danger} />
              <Text style={styles.routeText} numberOfLines={1}>
                {ride?.dropoff_address ?? '—'}
              </Text>
            </View>

            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Tarif</Text>
              <Text style={styles.fareValue}>
                {(ride?.fare ?? 0).toFixed?.(2) ?? ride?.fare ?? '--'} EUR
              </Text>
            </View>

            {isActive ? (
              <Button
                testID="cancel-ride"
                label="Annuler la course"
                variant="danger"
                fullWidth
                onPress={cancelRide}
                style={{ marginTop: spacing.md }}
              />
            ) : (
              <Button
                label="Retour a l'accueil"
                fullWidth
                onPress={() => nav.navigate('UserTabs')}
                style={{ marginTop: spacing.md }}
              />
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    ...shadow.md,
  },
  statusPill: {
    flex: 1,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    ...shadow.md,
  },
  statusText: { color: '#fff', fontWeight: '800' },
  etaText: { color: '#fff', fontSize: fontSizes.xs, opacity: 0.9, marginTop: 2 },
  driverDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.secondary,
    ...shadow.md,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    ...shadow.lg,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: spacing.md },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.secondary },
  driverName: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  driverMeta: { color: colors.textSecondary, fontSize: fontSizes.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  plate: { color: colors.textPrimary, fontWeight: '700', marginTop: 2, fontSize: fontSizes.xs },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  searchingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md },
  routeText: { color: colors.textPrimary, flex: 1 },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  fareLabel: { color: colors.textSecondary, fontSize: fontSizes.sm },
  fareValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
});
