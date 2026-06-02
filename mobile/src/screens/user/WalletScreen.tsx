import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Button from '@/components/Button';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { walletAPI } from '@/api/endpoints';

export default function WalletScreen() {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await walletAPI.get();
      setBalance(res.data?.balance ?? 0);
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const topup = async (amount: number) => {
    setTopupLoading(true);
    try {
      await walletAPI.topup(amount, 'card');
      await load();
    } finally {
      setTopupLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>{t('wallet.title')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('wallet.balance')}</Text>
        <Text style={styles.cardValue}>
          {loading ? '...' : `${(balance ?? 0).toFixed(2)} EUR`}
        </Text>
        <Ionicons name="wallet" size={48} color={colors.primary} style={styles.cardIcon} />
      </View>

      <Text style={styles.section}>{t('wallet.topup')}</Text>
      <View style={styles.row}>
        {[10, 25, 50, 100].map((a) => (
          <Button
            key={a}
            label={`${a} EUR`}
            variant="outline"
            size="md"
            onPress={() => topup(a)}
            loading={topupLoading}
            style={{ flex: 1 }}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt, padding: spacing.lg },
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
  section: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
