import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { configAPI, rideAPI } from '@/api/endpoints';

type VehicleType = {
  slug: string;
  name: string;
  base_fare?: number;
  per_km?: number;
  per_min?: number;
  icon?: string;
};

export default function BookingScreen() {
  const { t } = useTranslation();
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await configAPI.getVehicleTypes('taxi');
        const list: VehicleType[] = res.data?.items ?? res.data ?? [];
        setVehicleTypes(list);
        if (list.length) setSelected(list[0].slug);
      } catch {
        // fallback
        const fallback = [
          { slug: 'economic', name: 'Economique' },
          { slug: 'comfort', name: 'Confort' },
          { slug: 'premium', name: 'Premium' },
        ];
        setVehicleTypes(fallback);
        setSelected(fallback[0].slug);
      }
    })();
  }, []);

  const useMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      setPickupCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      const geo = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const a = geo[0];
      if (a) setPickup(`${a.street ?? ''} ${a.city ?? ''}`.trim());
    } catch (e) {
      console.warn(e);
    }
  };

  const onEstimate = async () => {
    setError(null);
    setLoading(true);
    setEstimate(null);
    try {
      const payload = {
        pickup_address: pickup,
        dropoff_address: dropoff,
        pickup_lat: pickupCoords?.lat,
        pickup_lng: pickupCoords?.lng,
        dropoff_lat: dropoffCoords?.lat,
        dropoff_lng: dropoffCoords?.lng,
        vehicle_type: selected,
      };
      const res = await rideAPI.estimate(payload);
      setEstimate(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const onBook = async () => {
    setBooking(true);
    setError(null);
    try {
      await rideAPI.create({
        pickup_address: pickup,
        dropoff_address: dropoff,
        pickup_lat: pickupCoords?.lat,
        pickup_lng: pickupCoords?.lng,
        dropoff_lat: dropoffCoords?.lat,
        dropoff_lng: dropoffCoords?.lng,
        vehicle_type: selected,
      });
      // navigate to tracking later
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('common.error'));
    } finally {
      setBooking(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t('booking.title')}</Text>

          <View style={styles.card}>
            <Input
              testID="pickup-input"
              label={t('booking.pickup')}
              value={pickup}
              onChangeText={setPickup}
              placeholder="Adresse de depart"
              leftIcon={<Ionicons name="ellipse" size={12} color={colors.accent} />}
              rightIcon={
                <Pressable onPress={useMyLocation}>
                  <Ionicons name="locate" size={20} color={colors.primaryDark} />
                </Pressable>
              }
            />
            <View style={{ height: spacing.sm }} />
            <Input
              testID="dropoff-input"
              label={t('booking.dropoff')}
              value={dropoff}
              onChangeText={setDropoff}
              placeholder="Adresse de destination"
              leftIcon={<Ionicons name="location" size={14} color={colors.danger} />}
            />
          </View>

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
                <Ionicons
                  name="car-sport"
                  size={18}
                  color={selected === v.slug ? colors.secondary : colors.textSecondary}
                />
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

          <Button
            testID="booking-estimate"
            label={t('booking.estimate')}
            onPress={onEstimate}
            loading={loading}
            disabled={!pickup || !dropoff || !selected}
            fullWidth
            size="lg"
            variant="outline"
            style={{ marginTop: spacing.lg }}
          />

          {estimate ? (
            <View style={styles.estimateCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.estimateLabel}>{t('booking.fare_estimate')}</Text>
                <Text style={styles.estimateValue}>
                  {(estimate.fare ?? estimate.total ?? 0).toFixed?.(2) ??
                    estimate.fare ??
                    '--'}
                  {' '}EUR
                </Text>
                <Text style={styles.estimateMeta}>
                  {estimate.distance_km
                    ? `${estimate.distance_km.toFixed?.(1) ?? estimate.distance_km} km`
                    : ''}
                  {estimate.duration_min ? ` · ${estimate.duration_min} min` : ''}
                </Text>
              </View>
              <Ionicons name="receipt" size={40} color={colors.primaryDark} />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            testID="booking-book"
            label={t('booking.book_now')}
            onPress={onBook}
            loading={booking}
            disabled={!estimate}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  sectionLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: spacing.lg,
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
  estimateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.sm,
    marginTop: spacing.lg,
  },
  estimateLabel: { color: colors.textSecondary, fontSize: fontSizes.sm },
  estimateValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  estimateMeta: { color: colors.textMuted, marginTop: 4, fontSize: fontSizes.sm },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
