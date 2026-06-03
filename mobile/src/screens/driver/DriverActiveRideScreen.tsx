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
import * as Location from 'expo-location';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { driverAPI, rideAPI } from '@/api/endpoints';
import { metersBetween, regionFromCoords, PARIS } from '@/utils/geo';
import { estimateEtaMinutes, formatEta } from '@/utils/eta';
import { openNavigation } from '@/utils/navApps';
import useRideSocket from '@/hooks/useRideSocket';

type Phase = 'to_pickup' | 'arrived_at_pickup' | 'to_dropoff' | 'completed';

// Map server ride.status -> active phase for the driver
function phaseFor(status: string): Phase {
  if (status === 'in_progress') return 'to_dropoff';
  if (status === 'arrived') return 'arrived_at_pickup';
  if (status === 'completed') return 'completed';
  return 'to_pickup';
}

const PHASE_TITLE: Record<Phase, string> = {
  to_pickup: 'En route vers le client',
  arrived_at_pickup: 'Vous etes arrive',
  to_dropoff: 'Course en cours',
  completed: 'Course terminee',
};

const PHASE_HINT: Record<Phase, string> = {
  to_pickup: 'Suivez la navigation jusqu\'au lieu de prise en charge',
  arrived_at_pickup: 'Attendez le client puis demarrez la course',
  to_dropoff: 'Suivez la navigation jusqu\'a la destination',
  completed: 'Vous avez ete paye',
};

export default function DriverActiveRideScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const rideId: string = route.params?.rideId;
  const mapRef = useRef<MapView | null>(null);

  const [ride, setRide] = useState<any>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchRide = useCallback(async () => {
    try {
      const res = await rideAPI.get(rideId);
      setRide(res.data);
    } catch {}
    finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    fetchRide();
    const id = setInterval(fetchRide, 10000);
    return () => clearInterval(id);
  }, [fetchRide]);

  // Watch driver location + push to backend so passenger map updates
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15, // meters
            timeInterval: 5000,
          },
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setMe(c);
            // Best-effort push, ignore errors
            driverAPI.updateLocation(c.lat, c.lng).catch(() => {});
            wsRef.current?.send?.({ type: 'location_update', lat: c.lat, lng: c.lng });
          }
        );
      } catch {}
    })();
    return () => {
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime ride status updates from server
  const wsRef = useRef<any>(null);
  const ws = useRideSocket({
    enabled: !!rideId,
    rideId,
    onMessage: (msg) => {
      if (msg?.type === 'ride_status_update' && msg.ride_id === rideId) {
        setRide((r: any) => (r ? { ...r, status: msg.status } : r));
      }
    },
  });
  wsRef.current = ws;

  const phase = phaseFor(ride?.status ?? 'accepted');

  const target = (() => {
    if (!ride) return null;
    if (phase === 'to_pickup' || phase === 'arrived_at_pickup') {
      return ride.pickup_lat && ride.pickup_lng
        ? { lat: ride.pickup_lat, lng: ride.pickup_lng, label: ride.pickup_address }
        : null;
    }
    return ride.dropoff_lat && ride.dropoff_lng
      ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng, label: ride.dropoff_address }
      : null;
  })();

  const distanceToTarget =
    me && target ? metersBetween(me, { lat: target.lat, lng: target.lng }) : null;

  const etaMin = estimateEtaMinutes(
    me?.lat,
    me?.lng,
    target?.lat,
    target?.lng,
    ride?.vehicle_type
  );

  // Push ETA to passenger via websocket so it shows in their RideTracking
  useEffect(() => {
    if (etaMin == null) return;
    wsRef.current?.send?.({
      type: 'eta_update',
      ride_id: rideId,
      eta_min: etaMin,
      distance_m: distanceToTarget,
    });
  }, [etaMin, distanceToTarget, rideId]);

  useEffect(() => {
    const points: any[] = [];
    if (me) points.push(me);
    if (target) points.push({ lat: target.lat, lng: target.lng });
    if (points.length) mapRef.current?.animateToRegion(regionFromCoords(points), 600);
  }, [me, target?.lat, target?.lng]);

  const updateStatus = async (status: string) => {
    setUpdating(true);
    try {
      await rideAPI.updateStatus(rideId, status);
      await fetchRide();
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail || 'Mise a jour impossible');
    } finally {
      setUpdating(false);
    }
  };

  const callPassenger = () => {
    const phone = ride?.user?.phone ?? ride?.passenger_phone;
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const onNavigate = () => {
    if (target) openNavigation({ lat: target.lat, lng: target.lng }, target.label, me);
  };

  const onCancel = () => {
    Alert.alert(
      'Annuler',
      'Annuler cette course ? Cela impactera votre taux d\'acceptation.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler la course',
          style: 'destructive',
          onPress: async () => {
            try {
              await rideAPI.cancel(rideId, 'driver_cancelled');
              nav.goBack();
            } catch {}
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: me?.lat ?? ride?.pickup_lat ?? PARIS.lat,
          longitude: me?.lng ?? ride?.pickup_lng ?? PARIS.lng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation
      >
        {target ? (
          <Marker
            coordinate={{ latitude: target.lat, longitude: target.lng }}
            title={target.label ?? 'Destination'}
            pinColor={phase === 'to_pickup' ? 'green' : 'red'}
          />
        ) : null}
        {me && target ? (
          <Polyline
            coordinates={[
              { latitude: me.lat, longitude: me.lng },
              { latitude: target.lat, longitude: target.lng },
            ]}
            strokeWidth={4}
            strokeColor={colors.primary}
          />
        ) : null}
      </MapView>

      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.headerWrap}>
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textInverse} />
          </Pressable>
          <View style={styles.titleBar}>
            <Text style={styles.title}>{PHASE_TITLE[phase]}</Text>
            <Text style={styles.subtitle}>{PHASE_HINT[phase]}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Big floating "Navigate" button */}
      {target && phase !== 'completed' ? (
        <Pressable testID="navigate-btn" onPress={onNavigate} style={styles.navFab}>
          <Ionicons name="navigate" size={22} color={colors.textInverse} />
          <Text style={styles.navFabText}>Naviguer</Text>
        </Pressable>
      ) : null}

      <View style={styles.sheet}>
        <View style={styles.handle} />
        {loading ? (
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>Chargement...</Text>
        ) : (
          <>
            {/* Passenger card */}
            <View style={styles.passengerCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {ride?.user?.name?.[0]?.toUpperCase() ?? ride?.passenger_name?.[0]?.toUpperCase() ?? 'P'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.passengerName}>
                  {ride?.user?.name ?? ride?.passenger_name ?? 'Passager'}
                </Text>
                <Text style={styles.fareInline}>
                  {(ride?.fare ?? 0).toFixed?.(2) ?? ride?.fare ?? '--'} EUR
                  {distanceToTarget != null ? ` · ${(distanceToTarget / 1000).toFixed(1)} km` : ''}
                  {etaMin != null ? ` · ETA ${formatEta(etaMin)}` : ''}
                </Text>
              </View>
              {(ride?.user?.phone ?? ride?.passenger_phone) ? (
                <Pressable testID="call-passenger" onPress={callPassenger} style={styles.callBtn}>
                  <Ionicons name="call" size={20} color={colors.textInverse} />
                </Pressable>
              ) : null}
            </View>

            {/* Address rows highlighting current target */}
            <View
              style={[
                styles.addrRow,
                (phase === 'to_pickup' || phase === 'arrived_at_pickup') && styles.addrRowActive,
              ]}
            >
              <Ionicons name="ellipse" size={10} color={colors.accent} />
              <Text style={styles.addrText} numberOfLines={1}>
                {ride?.pickup_address ?? '—'}
              </Text>
            </View>
            <View style={[styles.addrRow, phase === 'to_dropoff' && styles.addrRowActive]}>
              <Ionicons name="location" size={12} color={colors.danger} />
              <Text style={styles.addrText} numberOfLines={1}>
                {ride?.dropoff_address ?? '—'}
              </Text>
            </View>

            {/* Phase-specific actions */}
            <View style={{ marginTop: spacing.md }}>
              {phase === 'to_pickup' ? (
                <Button
                  testID="arrived-btn"
                  label="Je suis arrive au point de prise en charge"
                  fullWidth
                  loading={updating}
                  onPress={() => updateStatus('arrived')}
                />
              ) : null}
              {phase === 'arrived_at_pickup' ? (
                <Button
                  testID="start-ride-btn"
                  label="Demarrer la course"
                  fullWidth
                  loading={updating}
                  onPress={() => updateStatus('in_progress')}
                />
              ) : null}
              {phase === 'to_dropoff' ? (
                <Button
                  testID="complete-ride-btn"
                  label="Terminer la course"
                  variant="primary"
                  fullWidth
                  loading={updating}
                  onPress={() => updateStatus('completed')}
                />
              ) : null}
              {phase === 'completed' ? (
                <Button
                  label="Retour au tableau de bord"
                  fullWidth
                  onPress={() => nav.popToTop()}
                />
              ) : null}
            </View>

            {phase !== 'completed' ? (
              <Pressable testID="cancel-btn" onPress={onCancel} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Annuler la course</Text>
              </Pressable>
            ) : null}
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
    gap: spacing.sm,
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
  titleBar: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    ...shadow.md,
  },
  title: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: '800', letterSpacing: 0.3 },
  subtitle: { color: colors.textInverse, fontSize: fontSizes.xs, marginTop: 2 },

  navFab: {
    position: 'absolute',
    right: 16,
    bottom: 280,
    backgroundColor: colors.info,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...shadow.lg,
    zIndex: 6,
  },
  navFabText: { color: colors.textInverse, fontWeight: '800', fontSize: fontSizes.md },

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
  passengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.secondary },
  passengerName: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  fareInline: { color: colors.textSecondary, marginTop: 2, fontSize: fontSizes.sm },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  addrRowActive: { backgroundColor: '#FFFBEB', borderColor: colors.primary },
  addrText: { color: colors.textPrimary, flex: 1 },
  cancelBtn: { paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  cancelText: { color: colors.danger, fontWeight: '700' },
});
