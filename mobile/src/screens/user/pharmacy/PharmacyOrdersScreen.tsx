import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Modal, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, spacing } from '@/theme';
import { pharmacyAPI } from '@/api/endpoints';

const fmt = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
const STATUS: Record<string, { l: string; bg: string; fg: string }> = {
  pending: { l: 'En attente de devis', bg: '#FEF3C7', fg: '#B45309' },
  confirmed: { l: 'Confirmée', bg: '#DBEAFE', fg: '#1D4ED8' },
  preparing: { l: 'En préparation', bg: '#E0E7FF', fg: '#4338CA' },
  accepted: { l: 'Coursier assigné', bg: '#F3E8FF', fg: '#7E22CE' },
  picked_up: { l: 'Récupérée', bg: '#F3E8FF', fg: '#7E22CE' },
  in_transit: { l: 'En livraison', bg: '#CFFAFE', fg: '#0E7490' },
  delivered: { l: 'Livrée', bg: '#DCFCE7', fg: '#15803D' },
  cancelled: { l: 'Annulée', bg: '#E5E7EB', fg: '#6B7280' },
};
const TIMELINE = ['confirmed', 'preparing', 'accepted', 'picked_up', 'in_transit', 'delivered'];

export default function PharmacyOrdersScreen() {
  const nav = useNavigation<any>();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [paying, setPaying] = useState(false);

  const load = useCallback(() => {
    pharmacyAPI.myOrders().then((r) => setOrders(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]));

  const cancel = (id: string) => Alert.alert('Annuler', 'Annuler cette commande ?', [
    { text: 'Non' },
    { text: 'Oui', style: 'destructive', onPress: async () => { try { await pharmacyAPI.cancelOrder(id); load(); } catch (e: any) { Alert.alert('Erreur', e.response?.data?.detail || 'Annulation impossible'); } } },
  ]);

  const openPay = (order: any) => {
    setPayTarget(order);
    pharmacyAPI.paymentMethods().then((r) => { const m: Record<string, number> = {}; (r.data.methods || []).forEach((x: any) => { m[x.id] = x.balance; }); setBalances(m); }).catch(() => {});
  };

  const doPay = async (method: string) => {
    if ((balances[method] ?? 0) < payTarget.total) {
      setPayTarget(null);
      if (method === 'wallet') return nav.navigate('Wallet');
      try { const r = await pharmacyAPI.sbpaygoSsoLink(); if (r.data?.url) Alert.alert('Recharge', 'Ouvrez SB PayGo pour recharger.'); } catch {}
      return;
    }
    setPaying(true);
    try { await pharmacyAPI.payOrder(payTarget.id, method); Alert.alert('Paiement', 'Paiement effectué ✅'); setPayTarget(null); load(); }
    catch (e: any) { Alert.alert('Erreur', e.response?.data?.detail || 'Paiement échoué'); }
    finally { setPaying(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
        <Text style={styles.headerTitle}>Mes commandes</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {loading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.primaryDark} />}
        {!loading && orders.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="medkit-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTxt}>Aucune commande pour le moment.</Text>
            <Pressable onPress={() => nav.navigate('PharmacyHome')}><Text style={styles.emptyCta}>Commander maintenant →</Text></Pressable>
          </View>
        )}
        {orders.map((o) => {
          const st = STATUS[o.status] || { l: o.status, bg: '#E5E7EB', fg: '#374151' };
          const stepIdx = TIMELINE.indexOf(o.status);
          const canCancel = !['in_transit', 'delivered', 'cancelled'].includes(o.status);
          const canPay = o.payment_status === 'pending' && o.total > 0 && !['pending', 'delivered', 'cancelled'].includes(o.status);
          return (
            <View key={o.id} style={styles.card} testID={`order-${o.id}`}>
              <View style={styles.cardHead}>
                <Ionicons name={o.order_type === 'prescription' ? 'document-text' : 'bag-handle'} size={18} color={o.order_type === 'prescription' ? colors.danger : colors.accent} />
                <Text style={styles.cardType}>{o.order_type === 'prescription' ? 'Ordonnance' : 'Catalogue'}</Text>
                <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeTxt, { color: st.fg }]} testID={`order-status-${o.id}`}>{st.l}</Text></View>
              </View>

              {o.needs_quote && o.status === 'pending' && (
                <View style={styles.quoteWait}><Text style={styles.quoteWaitTxt}>⏳ En attente du devis de la pharmacie.</Text></View>
              )}

              {!!o.pharmacy_name && <Text style={styles.meta}>Pharmacie : {o.pharmacy_name}</Text>}
              {o.items?.length > 0 && <Text style={styles.meta}>{o.items.length} article(s) · {o.items.slice(0, 2).map((i: any) => `${i.name} ×${i.qty}`).join(', ')}{o.items.length > 2 ? '…' : ''}</Text>}
              <Text style={styles.meta}>Livraison : {o.delivery_address || '—'}</Text>

              {o.status !== 'cancelled' && o.status !== 'pending' && (
                <View style={styles.timeline}>
                  {TIMELINE.map((s, i) => <View key={s} style={[styles.tlSeg, { backgroundColor: i <= stepIdx ? colors.primaryDark : colors.border }]} />)}
                </View>
              )}

              <View style={styles.cardFoot}>
                <Text style={styles.total}>{o.needs_quote && o.status === 'pending' ? 'Total : à confirmer' : `Total : ${fmt(o.total)}`}{o.payment_status === 'paid' ? '  · Payé ✓' : ''}</Text>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  {canPay && <Pressable onPress={() => openPay(o)} style={styles.payBtn} testID={`order-pay-${o.id}`}><Text style={styles.payBtnTxt}>Payer maintenant</Text></Pressable>}
                  {canCancel && <Pressable onPress={() => cancel(o.id)} testID={`order-cancel-${o.id}`}><Text style={styles.cancelLink}>Annuler</Text></Pressable>}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!payTarget} transparent animationType="slide" onRequestClose={() => setPayTarget(null)}>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Payer la commande</Text>
            {!!payTarget && <Text style={styles.sheetSub}>Total à régler : {fmt(payTarget.total)} (médicaments {fmt(payTarget.medication_total)} + livraison {fmt(payTarget.delivery_fee)}).</Text>}
            {[{ id: 'wallet', label: 'Mon portefeuille' }, { id: 'sbpaygo', label: 'SB PayGo' }].map((m) => {
              const bal = balances[m.id];
              const insuf = payTarget && (bal ?? 0) < payTarget.total;
              return (
                <Pressable key={m.id} onPress={() => doPay(m.id)} disabled={paying} style={styles.payMethod} testID={`pay-method-${m.id}`}>
                  <View>
                    <Text style={styles.payMethodLbl}>{m.label}</Text>
                    <Text style={[styles.payMethodBal, insuf && { color: colors.danger }]}>Solde : {bal == null ? '—' : fmt(bal)}{insuf ? ' · insuffisant' : ''}</Text>
                  </View>
                  <Text style={styles.payMethodArrow}>{insuf ? 'Recharger →' : 'Payer →'}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPayTarget(null)} style={{ paddingVertical: 12 }}><Text style={styles.cancelTxt}>Plus tard</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTxt: { color: colors.textMuted, fontSize: fontSizes.md },
  emptyCta: { color: colors.primaryDark, fontWeight: '800', marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardType: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  badge: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  quoteWait: { backgroundColor: '#FEF3C7', borderRadius: radius.sm, padding: 8, marginBottom: 6 },
  quoteWaitTxt: { color: '#B45309', fontSize: fontSizes.xs },
  meta: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  timeline: { flexDirection: 'row', gap: 4, marginVertical: 10 },
  tlSeg: { flex: 1, height: 6, borderRadius: 3 },
  cardFoot: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  total: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  payBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  payBtnTxt: { color: colors.secondary, fontWeight: '800', fontSize: fontSizes.xs },
  cancelLink: { color: colors.danger, fontWeight: '700', fontSize: fontSizes.xs },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg },
  sheetTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary },
  sheetSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
  payMethod: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: 8 },
  payMethodLbl: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  payMethodBal: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  payMethodArrow: { fontSize: fontSizes.sm, fontWeight: '800', color: colors.primaryDark },
  cancelTxt: { textAlign: 'center', color: colors.textMuted, fontSize: fontSizes.sm },
});
