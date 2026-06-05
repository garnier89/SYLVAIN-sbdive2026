// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { driverAPI } from '@/api/endpoints';
import { getAccessToken } from '@/api/client';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const money = (n: number) => `${Number(n || 0).toFixed(2)} EUR`;

function Row({ label, value, strong, color }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontWeight: '800' }, color && { color }]}>{value}</Text>
    </View>
  );
}

export default function DriverWeeklyReportsScreen({ navigation }: any) {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, h] = await Promise.allSettled([
          driverAPI.getWeeklyReport(),
          driverAPI.getWeeklyReportHistory(),
        ]);
        if (c.status === 'fulfilled') setData(c.value.data);
        if (h.status === 'fulfilled') setHistory(h.value.data || []);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const downloadPdf = async (path: string, key: string, filename: string) => {
    setDownloading(key);
    try {
      const token = await getAccessToken();
      const fileUri = FileSystem.cacheDirectory + filename;
      const res = await FileSystem.downloadAsync(`${BASE}/api/driver/weekly-reports/${path}`, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf', dialogTitle: 'Rapport hebdomadaire' });
        } else {
          Alert.alert('PDF enregistré', `Fichier : ${res.uri}`);
        }
      } else {
        Alert.alert('Indisponible', "Aucun rapport PDF pour cette semaine.");
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible de télécharger le PDF.");
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.primaryDark} size="large" />
      </SafeAreaView>
    );
  }

  const r = data?.report;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} testID="reports-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Mes rapports hebdo</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90 }}>
        {/* Current week */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View>
              <Text style={styles.cardSub}>SEMAINE PRÉCÉDENTE</Text>
              <Text style={styles.cardWeek}>{data?.week || '—'}</Text>
            </View>
            <Ionicons name="receipt" size={26} color={colors.primaryDark} />
          </View>

          {data?.has_activity && r ? (
            <>
              <Row label="Courses terminées" value={r.completed} strong />
              <Row label="Courses annulées" value={r.cancelled} />
              <Row label="Chiffre d'affaires brut" value={money(r.gross)} strong />
              <Row label="— espèces" value={money(r.cash)} />
              <Row label="— carte (CB)" value={money(r.card)} />
              <Row label="— portefeuille" value={money(r.wallet)} />
              <Row label="Commission" value={`- ${money(r.commission)}`} color={colors.danger} />
              <Row label="Revenu net" value={money(r.net)} strong />
              <Row label="Montant non retirable" value={money(r.non_withdrawable)} />
              <Row label="Virement à effectuer" value={money(r.transfer)} strong color={colors.accent} />
              <TouchableOpacity
                style={styles.pdfBtn}
                onPress={() => downloadPdf('current/pdf', 'current', 'rapport-hebdo.pdf')}
                disabled={downloading === 'current'}
                testID="download-current-pdf"
              >
                {downloading === 'current'
                  ? <ActivityIndicator color="#fff" />
                  : <><Ionicons name="document-text" size={18} color="#fff" /><Text style={styles.pdfBtnText}>Télécharger le PDF</Text></>}
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.empty}>Aucune activité enregistrée sur la semaine précédente.</Text>
          )}
        </View>

        {/* History */}
        <Text style={styles.sectionTitle}>Historique</Text>
        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
            <Text style={styles.empty}>Aucun rapport envoyé pour le moment.</Text>
          </View>
        ) : (
          history.map((h) => (
            <View key={h.id} style={styles.histRow} testID={`history-${h.id}`}>
              <View style={styles.histIcon}>
                <Ionicons name="document-text" size={18} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.histWeek}>Semaine {h.week}</Text>
                <Text style={styles.histStatus}>
                  {h.status === 'sent' ? '✓ Envoyé' : '• Non envoyé'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => downloadPdf(`${h.id}/pdf`, h.id, `rapport-${h.id}.pdf`)}
                disabled={downloading === h.id}
                style={styles.histPdf}
                testID={`download-history-${h.id}`}
              >
                {downloading === h.id
                  ? <ActivityIndicator color={colors.primaryDark} size="small" />
                  : <><Ionicons name="download" size={16} color={colors.primaryDark} /><Text style={styles.histPdfText}>PDF</Text></>}
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  cardSub: { fontSize: fontSizes.xs, color: colors.textMuted, letterSpacing: 0.5 },
  cardWeek: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  rowLabel: { color: colors.textSecondary, fontSize: fontSizes.sm },
  rowValue: { color: colors.textPrimary, fontSize: fontSizes.sm },
  pdfBtn: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primaryDark, paddingVertical: 14, borderRadius: radius.md },
  pdfBtnText: { color: '#fff', fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  histIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  histWeek: { color: colors.textPrimary, fontSize: fontSizes.sm, fontWeight: '600' },
  histStatus: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 2 },
  histPdf: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  histPdfText: { color: colors.primaryDark, fontWeight: '700', fontSize: fontSizes.sm },
});
