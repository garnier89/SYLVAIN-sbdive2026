import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Image, TextInput, Modal, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { pharmacyAPI } from '@/api/endpoints';

const fmt = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
const PAYMENTS = [
  { id: 'cash', label: 'Espèces à la livraison' },
  { id: 'wallet', label: 'Portefeuille' },
  { id: 'sbpaygo', label: 'SB PayGo' },
  { id: 'card', label: 'Carte' },
];

export default function PharmacyCatalogScreen() {
  const nav = useNavigation<any>();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, { product: any; qty: number }>>({});
  const [checkout, setCheckout] = useState(false);
  const [form, setForm] = useState<any>({ pharmacy_id: '', delivery_address: '', recipient_name: '', recipient_phone: '', payment_method: 'cash' });
  const [coords, setCoords] = useState<any>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = useCallback(() => {
    pharmacyAPI.products({ category: category !== 'all' ? category : undefined, search: search || undefined })
      .then((r) => setProducts(r.data || [])).catch(() => {});
  }, [category, search]);

  useEffect(() => {
    pharmacyAPI.categories().then((r) => setCategories(r.data.categories || [])).catch(() => {});
    pharmacyAPI.pharmacies().then((r) => setPharmacies(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(loadProducts, 250); return () => clearTimeout(t); }, [loadProducts]);

  const cartItems = Object.values(cart);
  const cartCount = cartItems.reduce((s, c) => s + c.qty, 0);
  const cartSubtotal = useMemo(() => cartItems.reduce((s, c) => s + c.product.price * c.qty, 0), [cartItems]);
  const total = estimate?.total ?? null;
  const isWalletPay = ['wallet', 'sbpaygo'].includes(form.payment_method);
  const insufficient = isWalletPay && total != null && (balances[form.payment_method] ?? 0) < total;

  const addToCart = (p: any) => setCart((c) => ({ ...c, [p.id]: { product: p, qty: (c[p.id]?.qty || 0) + 1 } }));
  const decFromCart = (p: any) => setCart((c) => {
    const qty = (c[p.id]?.qty || 0) - 1; const next = { ...c };
    if (qty <= 0) delete next[p.id]; else next[p.id] = { product: p, qty };
    return next;
  });

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Localisation', 'Permission refusée.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  };

  const openCheckout = () => {
    if (cartCount === 0) return Alert.alert('Panier', 'Votre panier est vide');
    setCheckout(true);
    pharmacyAPI.paymentMethods().then((r) => {
      const map: Record<string, number> = {}; (r.data.methods || []).forEach((m: any) => { map[m.id] = m.balance; }); setBalances(map);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!checkout || !coords) { setEstimate(null); return; }
    pharmacyAPI.estimate({
      items: cartItems.map((c) => ({ product_id: c.product.id, qty: c.qty })),
      pharmacy_id: form.pharmacy_id || undefined, delivery_lat: coords.lat, delivery_lng: coords.lng,
    }).then((r) => setEstimate(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout, coords, form.pharmacy_id, cartCount]);

  const recharge = async () => {
    if (form.payment_method === 'wallet') { setCheckout(false); return nav.navigate('Wallet'); }
    try { const r = await pharmacyAPI.sbpaygoSsoLink(); if (r.data?.url) Linking.openURL(r.data.url); } catch { Alert.alert('Recharge', 'Lien indisponible'); }
  };

  const submit = async () => {
    if (!coords) return Alert.alert('Livraison', 'Indiquez votre position de livraison');
    if (!form.recipient_name || !form.recipient_phone) return Alert.alert('Destinataire', 'Nom et téléphone requis');
    setSubmitting(true);
    try {
      await pharmacyAPI.createOrder({
        order_type: 'catalog', items: cartItems.map((c) => ({ product_id: c.product.id, qty: c.qty })),
        pharmacy_id: form.pharmacy_id || undefined, delivery_address: form.delivery_address,
        delivery_lat: coords.lat, delivery_lng: coords.lng,
        recipient_name: form.recipient_name, recipient_phone: form.recipient_phone, payment_method: form.payment_method,
      });
      setCheckout(false); setCart({});
      Alert.alert('Commande confirmée', 'La pharmacie prépare votre commande.', [{ text: 'OK', onPress: () => nav.navigate('PharmacyOrders') }]);
    } catch (e: any) { Alert.alert('Erreur', e.response?.data?.detail || 'Échec de la commande'); }
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
        <Text style={styles.headerTitle}>Catalogue</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Rechercher un produit…" placeholderTextColor={colors.textMuted} style={styles.searchInput} testID="catalog-search" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8, alignItems: 'center' }}>
        {[{ key: 'all', label: 'Tout' }, ...categories].map((c) => (
          <Pressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.chip, category === c.key && styles.chipActive]} testID={`cat-${c.key}`}>
            <Text style={[styles.chipTxt, category === c.key && styles.chipTxtActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {products.map((p) => {
          const qty = cart[p.id]?.qty || 0;
          return (
            <View key={p.id} style={styles.card} testID={`product-${p.id}`}>
              {!!p.image_url && <Image source={{ uri: p.image_url }} style={styles.cardImg} />}
              <Text style={styles.cardName} numberOfLines={2}>{p.name}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardPrice}>{fmt(p.price)}</Text>
                {qty === 0 ? (
                  <Pressable onPress={() => addToCart(p)} style={styles.addBtn} testID={`add-${p.id}`}><Ionicons name="add" size={18} color={colors.secondary} /></Pressable>
                ) : (
                  <View style={styles.qtyRow}>
                    <Pressable onPress={() => decFromCart(p)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={colors.textPrimary} /></Pressable>
                    <Text style={styles.qtyTxt} testID={`qty-${p.id}`}>{qty}</Text>
                    <Pressable onPress={() => addToCart(p)} style={[styles.qtyBtn, { backgroundColor: colors.primary }]} testID={`inc-${p.id}`}><Ionicons name="add" size={16} color={colors.secondary} /></Pressable>
                  </View>
                )}
              </View>
            </View>
          );
        })}
        {products.length === 0 && <Text style={styles.empty}>Aucun produit trouvé.</Text>}
      </ScrollView>

      {cartCount > 0 && (
        <Pressable style={styles.cartBar} onPress={openCheckout} testID="open-checkout-btn">
          <Text style={styles.cartBarTxt}><Ionicons name="cart" size={16} /> {cartCount} article{cartCount > 1 ? 's' : ''}</Text>
          <Text style={styles.cartBarTxt}>{fmt(cartSubtotal)} · Commander</Text>
        </Pressable>
      )}

      <Modal visible={checkout} transparent animationType="slide" onRequestClose={() => setCheckout(false)}>
        <View style={styles.sheetWrap}>
          <ScrollView style={styles.sheet} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
            <Text style={styles.sheetTitle}>Finaliser la commande</Text>

            <Text style={styles.label}>Pharmacie (optionnel)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
              <Pressable onPress={() => setForm({ ...form, pharmacy_id: '' })} style={[styles.chip, !form.pharmacy_id && styles.chipActive]}><Text style={[styles.chipTxt, !form.pharmacy_id && styles.chipTxtActive]}>Plus proche</Text></Pressable>
              {pharmacies.map((p) => (
                <Pressable key={p.id} onPress={() => setForm({ ...form, pharmacy_id: p.id })} style={[styles.chip, form.pharmacy_id === p.id && styles.chipActive]}><Text style={[styles.chipTxt, form.pharmacy_id === p.id && styles.chipTxtActive]}>{p.name}</Text></Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>Adresse de livraison</Text>
            <TextInput value={form.delivery_address} onChangeText={(v) => setForm({ ...form, delivery_address: v })} placeholder="Ex: 10 rue de la Paix" placeholderTextColor={colors.textMuted} style={styles.input} testID="checkout-address" />
            <Pressable onPress={useMyLocation} style={styles.locBtn} testID="use-location-btn">
              <Ionicons name="location" size={16} color={colors.accent} />
              <Text style={styles.locTxt}>{coords ? `Position définie (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : 'Utiliser ma position'}</Text>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={form.recipient_name} onChangeText={(v) => setForm({ ...form, recipient_name: v })} placeholder="Nom" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1 }]} testID="checkout-name" />
              <TextInput value={form.recipient_phone} onChangeText={(v) => setForm({ ...form, recipient_phone: v })} placeholder="Téléphone" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.input, { flex: 1 }]} testID="checkout-phone" />
            </View>

            <Text style={styles.label}>Paiement</Text>
            <View style={styles.payGrid}>
              {PAYMENTS.map((pm) => (
                <Pressable key={pm.id} onPress={() => setForm({ ...form, payment_method: pm.id })} style={[styles.payBtn, form.payment_method === pm.id && styles.payBtnActive]} testID={`pay-${pm.id}`}>
                  <Text style={[styles.payTxt, form.payment_method === pm.id && styles.payTxtActive]}>{pm.label}</Text>
                  {['wallet', 'sbpaygo'].includes(pm.id) && <Text style={styles.payBal}>Solde : {balances[pm.id] != null ? fmt(balances[pm.id]) : '—'}</Text>}
                </Pressable>
              ))}
            </View>

            {insufficient && (
              <Pressable onPress={recharge} style={styles.insuffBox} testID="recharge-btn">
                <Text style={styles.insuffTxt}>Solde insuffisant — Recharger →</Text>
              </Pressable>
            )}

            <View style={styles.summary}>
              <View style={styles.sumRow}><Text style={styles.sumLbl}>Sous-total</Text><Text style={styles.sumVal}>{fmt(estimate?.subtotal ?? cartSubtotal)}</Text></View>
              <View style={styles.sumRow}><Text style={styles.sumLbl}>Livraison</Text><Text style={styles.sumVal}>{estimate ? fmt(estimate.delivery_fee) : '—'}</Text></View>
              <View style={[styles.sumRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }]}><Text style={styles.sumTotalLbl}>Total</Text><Text style={styles.sumTotalVal} testID="checkout-total">{estimate ? fmt(estimate.total) : '—'}</Text></View>
            </View>

            <Pressable onPress={submit} disabled={submitting || insufficient} style={[styles.primaryBtn, (submitting || insufficient) && { opacity: 0.6 }]} testID="confirm-order-btn">
              {submitting ? <ActivityIndicator color={colors.secondary} /> : <Text style={styles.primaryBtnTxt}>{insufficient ? 'Solde insuffisant' : 'Confirmer la commande'}</Text>}
            </Pressable>
            <Pressable onPress={() => setCheckout(false)} style={{ paddingVertical: 12 }}><Text style={styles.cancelTxt}>Annuler</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, margin: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.textPrimary, fontSize: fontSizes.md },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '700' },
  chipTxtActive: { color: colors.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 100 },
  card: { width: '48%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardImg: { width: '100%', height: 90, borderRadius: radius.sm, marginBottom: 6, backgroundColor: colors.surfaceAlt },
  cardName: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary, minHeight: 34 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cardPrice: { fontSize: fontSizes.md, fontWeight: '800', color: colors.primaryDark },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  qtyTxt: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary, minWidth: 16, textAlign: 'center' },
  empty: { color: colors.textMuted, textAlign: 'center', width: '100%', paddingVertical: spacing.xl },
  cartBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', ...shadow.lg },
  cartBarTxt: { color: colors.secondary, fontWeight: '800', fontSize: fontSizes.md },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '92%' },
  sheetTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSizes.xs, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSizes.md, color: colors.textPrimary, marginBottom: 8 },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginBottom: 8 },
  locTxt: { color: colors.accent, fontWeight: '700', fontSize: fontSizes.sm },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payBtn: { width: '48%', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, backgroundColor: colors.surface },
  payBtnActive: { borderColor: colors.primaryDark, backgroundColor: '#FFF7E6' },
  payTxt: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textSecondary },
  payTxtActive: { color: colors.primaryDark },
  payBal: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  insuffBox: { backgroundColor: '#FEE2E2', borderRadius: radius.md, padding: 10, marginTop: 10 },
  insuffTxt: { color: colors.danger, fontWeight: '700', fontSize: fontSizes.sm, textAlign: 'center' },
  summary: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, gap: 4 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLbl: { color: colors.textSecondary, fontSize: fontSizes.sm },
  sumVal: { color: colors.textPrimary, fontSize: fontSizes.sm },
  sumTotalLbl: { color: colors.textPrimary, fontWeight: '800', fontSize: fontSizes.md },
  sumTotalVal: { color: colors.textPrimary, fontWeight: '800', fontSize: fontSizes.md },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.md },
  primaryBtnTxt: { color: colors.secondary, fontWeight: '800', fontSize: fontSizes.md },
  cancelTxt: { textAlign: 'center', color: colors.textMuted, fontSize: fontSizes.sm },
});
