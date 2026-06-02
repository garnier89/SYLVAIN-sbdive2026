import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { configAPI, rideAPI } from '@/api/endpoints';
import { PARIS, regionFromCoords } from '@/utils/geo';

type Coords = { lat: number; lng: number };
type VehicleType = {
  slug: string;
  name: string;
  icon?: string;
  base_fare?: number;
};
type Picking = 'pickup' | 'dropoff' | null;

export default function BookingScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const mapRef = useRef<MapView | null>(null);

  const [me, setMe] = useState<Coords | null>(null);
  const [pickup, setPickup] = useState<{ coords: Coords; address: string } | null>(null);
  const [dropoff, setDropoff] = useState<{ coords: Coords; address: string } | null>(null);
  const [picking, setPicking] = useState<Picking>(null);

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [estimate, setEstimate] = useState<any>(null);
  const [estimating, setEstimating] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Boot: geolocation + vehicle types
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMe(c);
          // Pre-fill pickup with current location
          const geo = await Location.reverseGeocodeAsync({
            latitude: c.lat,
            longitude: c.lng,
          });
          const a = geo[0];
          const addr = a ? [a.street, a.city].filter(Boolean).join(', ') : '';
          setPickup({ coords: c, address: addr || 'Position actuelle' });
        }
      } catch {}
      try {
        const res = await configAPI.getVehicleTypes('taxi');
        const list: VehicleType[] = res.data?.items ?? res.data ?? [];
        if (list.length) {
          setVehicleTypes(list);
          setSelected(list[0].slug);
        } else {
          const fb = [
            { slug: 'economic', name: 'Economique' },
            { slug: 'comfort', name: 'Confort' },
            { slug: 'premium', name: 'Premium' },
          ];
          setVehicleTypes(fb);
          setSelected(fb[0].slug);
        }
      } catch {
        const fb = [
          { slug: 'economic', name: 'Economique' },
          { slug: 'comfort', name: 'Confort' },
          { slug: 'premium', name: 'Premium' },
        ];
        setVehicleTypes(fb);
        setSelected(fb[0].slug);
      }
    })();
  }, []);

  // Fit map when both pickup + dropoff exist
  useEffect(() => {
    if (pickup && dropoff) {
      const region = regionFromCoords([pickup.coords, dropoff.coords]);
      mapRef.current?.animateToRegion(region, 600);
    }
  }, [pickup, dropoff]);

  const onMapPress = async (e: any) => {
    if (!picking) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const coords = { lat: latitude, lng: longitude };
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      const a = geo[0];
      const addr = a ? [a.street, a.city].filter(Boolean).join(', ') : '';
      const point = { coords, address: addr };
      if (picking === 'pickup') setPickup(point);
      else setDropoff(point);
    } catch {
      const point = { coords, address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
      if (picking === 'pickup') setPickup(point);
      else setDropoff(point);
    }
    setPicking(null);
    Keyboard.dismiss();
  };

  const onEstimate = async () => {
    if (!pickup || !dropoff || !selected) return;
    setEstimating(true);
    setError(null);
    setEstimate(null);
    try {
      const res = await rideAPI.estimate({
        pickup_address: pickup.address,
        dropoff_address: dropoff.address,
        pickup_lat: pickup.coords.lat,
        pickup_lng: pickup.coords.lng,
        dropoff_lat: dropoff.coords.lat,
        dropoff_lng: dropoff.coords.lng,
        vehicle_type: selected,
      });
      setEstimate(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('common.error'));
    } finally {
      setEstimating(false);
    }
  };

  const onBook = async () => {
    if (!pickup || !dropoff || !selected) return;
    setBooking(true);
    setError(null);
    try {
      const res = await rideAPI.create({
        pickup_address: pickup.address,
        dropoff_address: dropoff.address,
        pickup_lat: pickup.coords.lat,
        pickup_lng: pickup.coords.lng,
        dropoff_lat: dropoff.coords.lat,
        dropoff_lng: dropoff.coords.lng,
        vehicle_type: selected,
      });
      const rideId = res.data?.id ?? res.data?.ride?.id;
      if (rideId) nav.replace('RideTracking', { rideId });
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('common.error'));
    } finally {
      setBooking(false);
    }
  };

  const initialRegion = {
    latitude: me?.lat ?? PARIS.lat,
    longitude: me?.lng ?? PARIS.lng,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={onMapPress}
      >
        {pickup ? (
          <Marker
            coordinate={{ latitude: pickup.coords.lat, longitude: pickup.coords.lng }}
            title="Depart"
            pinColor="green"
          />
        ) : null}
        {dropoff ? (
          <Marker
            coordinate={{ latitude: dropoff.coords.lat, longitude: dropoff.coords.lng }}
            title="Arrivee"
            pinColor="red"
          />
        ) : null}
        {pickup && dropoff ? (
          <Polyline
            coordinates={[
              { latitude: pickup.coords.lat, longitude: pickup.coords.lng },
              { latitude: dropoff.coords.lat, longitude: dropoff.coords.lng },
            ]}
            strokeWidth={4}
            strokeColor={colors.primary}
          />
        ) : null}
      </MapView>

      {/* Top header */}
      <SafeAreaView edges={['top']} style={styles.headerWrap}>
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textInverse} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('booking.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Picking hint */}
      {picking ? (
        <View style={styles.pickHint}>
          <Ionicons name="hand-left" size={18} color={colors.secondary} />
          <Text style={styles.pickHintText}>
            Touchez la carte pour {picking === 'pickup' ? 'le depart' : "l'arrivee"}
          </Text>
        </View>
      ) : null}

      {/* Bottom sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <ScrollView style={styles.sheet} contentContainerStyle={{ padding: spacing.lg }}>
          <View style={styles.handle} />

          <Pressable
            onPress={() => setPicking('pickup')}
            style={[styles.addrRow, picking === 'pickup' && styles.addrRowActive]}
          >
            <Ionicons name="ellipse" size={12} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addrLabel}>{t('booking.pickup')}</Text>
              <Text style={styles.addrText} numberOfLines={1}>
                {pickup?.address || 'Touchez pour choisir sur la carte'}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setPicking('dropoff')}
            style={[styles.addrRow, picking === 'dropoff' && styles.addrRowActive]}
          >
            <Ionicons name="location" size={14} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addrLabel}>{t('booking.dropoff')}</Text>
              <Text style={styles.addrText} numberOfLines={1}>
                {dropoff?.address || 'Touchez pour choisir sur la carte'}
              </Text>
            </View>
          </Pressable>

          <Text style={styles.sectionLabel}>{t('booking.vehicle_type')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {vehicleTypes.map((v) => (
              <Pressable
                key={v.slug}
                testID={`vehicle-${v.slug}`}
                onPress={() => setSelected(v.slug)}
                style={[
                  styles.vChip,
                  selected === v.slug && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Ionicons name="car-sport" size={18} color={selected === v.slug ? colors.secondary : colors.textSecondary} />
                <Text
                  style={[
                    styles.vChipLabel,
                    selected === v.slug && { color: colors.secondary, fontWeight: '800' },
                  ]}
                >
                  {v.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {estimate ? (
            <View style={styles.estCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.estLabel}>{t('booking.fare_estimate')}</Text>
                <Text style={styles.estValue}>
                  {(estimate.fare ?? estimate.total ?? 0).toFixed?.(2) ?? estimate.fare ?? '--'} EUR
                </Text>
                <Text style={styles.estMeta}>
                  {estimate.distance_km
                    ? `${estimate.distance_km.toFixed?.(1) ?? estimate.distance_km} km`
                    : ''}
                  {estimate.duration_min ? ` · ${estimate.duration_min} min` : ''}
                </Text>
              </View>
              <Ionicons name="receipt" size={32} color={colors.primaryDark} />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Button
              testID="booking-estimate"
              label={t('booking.estimate')}
              onPress={onEstimate}
              loading={estimating}
              disabled={!pickup || !dropoff || !selected}
              variant="outline"
              style={{ flex: 1 }}
            />
            <Button
              testID="booking-book"
              label={t('booking.book_now')}
              onPress={onBook}
              loading={booking}
              disabled={!estimate}
              style={{ flex: 1.2 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerTitle: {
    flex: 1,
    color: colors.textInverse,
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginHorizontal: spacing.sm,
    textAlign: 'center',
    fontWeight: '800',
    ...shadow.md,
  },
  pickHint: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    ...shadow.md,
    zIndex: 6,
  },
  pickHintText: { color: colors.secondary, fontWeight: '700' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '65%' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...shadow.lg,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: spacing.md },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  addrRowActive: { borderColor: colors.primary, backgroundColor: '#FFFBEB' },
  addrLabel: { fontSize: fontSizes.xs, color: colors.textMuted, fontWeight: '700' },
  addrText: { color: colors.textPrimary, fontSize: fontSizes.md, marginTop: 2 },
  sectionLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  vChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  vChipLabel: { color: colors.textSecondary, fontWeight: '600' },
  estCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  estLabel: { color: colors.textSecondary, fontSize: fontSizes.sm },
  estValue: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  estMeta: { color: colors.textMuted, fontSize: fontSizes.sm, marginTop: 2 },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
