import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { pharmacyAPI } from '@/api/endpoints';

export default function PharmacyHomeScreen() {
  const nav = useNavigation<any>();
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    pharmacyAPI.pharmacies().then((r) => setPharmacies(r.data || [])).catch(() => {});
    pharmacyAPI.settings().then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const inactive = settings && settings.active === false;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} testID="pharmacy-back">
          <Ionicons name="arrow-back" size={24} color={colors.textInverse} />
        </Pressable>
        <Text style={styles.headerTitle}>Pharmacie</Text>
        <Pressable onPress={() => nav.navigate('PharmacyOrders')} hitSlop={12} testID="pharmacy-orders-link">
          <Ionicons name="receipt-outline" size={22} color={colors.textInverse} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>Vos médicaments livrés à domicile — sur ordonnance ou en parapharmacie.</Text>

        {inactive ? (
          <View style={[styles.banner, { backgroundColor: '#FEE2E2' }]}><Text style={[styles.bannerTxt, { color: colors.danger }]}>Service Pharmacie momentanément indisponible.</Text></View>
        ) : settings?.info_note ? (
          <View style={[styles.banner, { backgroundColor: '#FFF7E6' }]}><Text style={[styles.bannerTxt, { color: colors.primaryDark }]}>{settings.info_note}</Text></View>
        ) : null}

        <Pressable style={styles.actionCard} onPress={() => nav.navigate('PharmacyPrescription')} testID="pharmacy-prescription-btn">
          <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="document-text" size={28} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Commander sur ordonnance</Text>
            <Text style={styles.actionSub}>Photographiez votre ordonnance, une pharmacie la prépare et un coursier vous livre.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <Pressable style={styles.actionCard} onPress={() => nav.navigate('PharmacyCatalog')} testID="pharmacy-catalog-btn">
          <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="bag-handle" size={28} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Parcourir le catalogue</Text>
            <Text style={styles.actionSub}>Parapharmacie sans ordonnance : antidouleurs, vitamines, hygiène…</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionTitle}>Pharmacies partenaires</Text>
        {pharmacies.map((p) => (
          <View key={p.id} style={styles.partner} testID={`pharmacy-partner-${p.id}`}>
            {!!p.image_url && <Image source={{ uri: p.image_url }} style={styles.partnerImg} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.partnerName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.partnerAddr} numberOfLines={1}>{p.address}</Text>
              <Text style={styles.partnerMeta}>⭐ {p.rating} · {p.open_hours}</Text>
            </View>
          </View>
        ))}
        {pharmacies.length === 0 && <Text style={styles.empty}>Aucune pharmacie disponible.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  intro: { color: colors.textSecondary, fontSize: fontSizes.sm, marginBottom: spacing.lg },
  banner: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  bannerTxt: { fontSize: fontSizes.xs, fontWeight: '700', textAlign: 'center' },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadow.sm },
  actionIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  actionSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  partner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  partnerImg: { width: 52, height: 52, borderRadius: radius.sm },
  partnerName: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  partnerAddr: { fontSize: fontSizes.xs, color: colors.textMuted },
  partnerMeta: { fontSize: fontSizes.xs, color: colors.warning, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
});
