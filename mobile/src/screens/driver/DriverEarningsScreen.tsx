import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { driverAPI } from '@/api/endpoints';

export default function DriverEarningsScreen() {
  const { t } = useTranslation();
  const [earnings, setEarnings] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await driverAPI.getEarnings();
        setEarnings(res.data ?? null);
      } catch {
        setEarnings({});
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        <Text style={styles.title}>{t('tabs.earnings')}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('driver.earnings_today')}</Text>
          <Text style={styles.cardValue}>
            {(earnings?.today ?? 0).toFixed?.(2) ?? earnings?.today ?? '0.00'} EUR
          </Text>
          <Ionicons name="cash" size={48} color={colors.accent} style={styles.cardIcon} />
        </View>
        <View style={[styles.card, { backgroundColor: colors.info, marginTop: spacing.md }]}>
          <Text style={styles.cardLabel}>{t('driver.earnings_week')}</Text>
          <Text style={[styles.cardValue, { color: '#fff' }]}>
            {(earnings?.week ?? 0).toFixed?.(2) ?? earnings?.week ?? '0.00'} EUR
          </Text>
          <Ionicons name="trending-up" size={48} color="#fff" style={[styles.cardIcon, { opacity: 0.4 }]} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.secondary,
    padding: spacing.xl,
    borderRadius: radius.xl,
    ...shadow.md,
    overflow: 'hidden',
  },
  cardLabel: { color: '#94A3B8', fontSize: fontSizes.sm },
  cardValue: { color: colors.primary, fontSize: 40, fontWeight: '800', marginTop: 6 },
  cardIcon: { position: 'absolute', right: 16, top: 16, opacity: 0.3 },
});
