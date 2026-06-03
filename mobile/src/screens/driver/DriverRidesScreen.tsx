import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { rideAPI } from '@/api/endpoints';

export default function DriverRidesScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const [available, setAvailable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await rideAPI.getAvailable();
      setAvailable(res.data?.items ?? res.data ?? []);
    } catch {
      setAvailable([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const accept = async (id: string) => {
    try {
      await rideAPI.accept(id);
      nav.navigate('ActiveRide', { rideId: id });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>{t('driver.new_ride')}</Text>
      <FlatList
        data={available}
        keyExtractor={(it, i) => it.id ?? String(i)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8 }}>
              Aucune course disponible
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.fare}>
                {(item.fare ?? 0).toFixed?.(2) ?? item.fare ?? '--'} EUR
              </Text>
              <Text style={styles.meta}>
                {item.distance_km
                  ? `${item.distance_km.toFixed?.(1) ?? item.distance_km} km`
                  : ''}
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="ellipse" size={10} color={colors.accent} />
              <Text style={styles.addr} numberOfLines={1}>
                {item.pickup_address ?? '—'}
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="location" size={12} color={colors.danger} />
              <Text style={styles.addr} numberOfLines={1}>
                {item.dropoff_address ?? '—'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                label={t('driver.decline')}
                variant="outline"
                size="md"
                style={{ flex: 1 }}
              />
              <Button
                testID={`accept-${item.id}`}
                label={t('driver.accept')}
                onPress={() => accept(item.id)}
                size="md"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  fare: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary },
  meta: { color: colors.textMuted },
  addr: { color: colors.textPrimary, flex: 1 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
});
