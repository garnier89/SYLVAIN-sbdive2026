import React, { useCallback, useState } from 'react';
import {
  FlatList, StyleSheet, Text, View, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { merchantAPI } from '@/api/endpoints';

export default function MerchantMenuScreen() {
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', category: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await merchantAPI.me();
      const id = me.data?.id;
      setMerchantId(id);
      if (id) {
        const res = await merchantAPI.getProducts(id);
        setProducts(Array.isArray(res.data) ? res.data : res.data?.products || []);
      }
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleStock = async (p: any) => {
    const available = (p.stock ?? 1) > 0 || p.stock == null;
    setBusy(p.id);
    try {
      await merchantAPI.setStock(p.id, available ? 0 : 99);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const addProduct = async () => {
    const price = parseFloat(form.price.replace(',', '.'));
    if (!form.name.trim() || Number.isNaN(price)) {
      Alert.alert('Champs requis', 'Indiquez un nom et un prix valides.');
      return;
    }
    setSaving(true);
    try {
      await merchantAPI.addProduct({ name: form.name.trim(), price, category: form.category.trim() || 'Général', stock: 99 });
      setForm({ name: '', price: '', category: '' });
      setShowAdd(false);
      await load();
    } catch {
      Alert.alert('Erreur', "Impossible d'ajouter le produit.");
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: any) => {
    const available = (item.stock ?? 1) > 0 || item.stock == null;
    return (
      <View style={styles.card} testID={`merchant-product-${item.id}`}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.pMeta}>{item.category || 'Général'} · {(item.price ?? 0).toFixed?.(2) ?? item.price} €</Text>
        </View>
        <TouchableOpacity
          style={[styles.stockBtn, { backgroundColor: available ? colors.accent + '22' : colors.danger + '22' }]}
          disabled={busy === item.id}
          onPress={() => toggleStock(item)}
          testID={`merchant-stock-${item.id}`}
        >
          {busy === item.id
            ? <ActivityIndicator size="small" color={colors.textSecondary} />
            : <Text style={[styles.stockTxt, { color: available ? colors.accent : colors.danger }]}>{available ? 'Disponible' : 'Rupture'}</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mon menu</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} testID="merchant-add-product">
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addTxt}>Ajouter</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primaryDark} size="large" /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="fast-food-outline" size={44} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>Aucun produit. Ajoutez-en un.</Text>
            </View>
          }
        />
      )}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nouveau produit</Text>
            <TextInput
              style={styles.input} placeholder="Nom du produit" placeholderTextColor={colors.textMuted}
              value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} testID="merchant-form-name"
            />
            <TextInput
              style={styles.input} placeholder="Prix (€)" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad"
              value={form.price} onChangeText={(price) => setForm((f) => ({ ...f, price }))} testID="merchant-form-price"
            />
            <TextInput
              style={styles.input} placeholder="Catégorie (optionnel)" placeholderTextColor={colors.textMuted}
              value={form.category} onChangeText={(category) => setForm((f) => ({ ...f, category }))} testID="merchant-form-category"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setShowAdd(false)}>
                <Text style={[styles.btnTxt, { color: colors.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={addProduct} disabled={saving} testID="merchant-form-save">
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.btnTxt, { color: '#fff' }]}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryDark, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: fontSizes.sm },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm },
  pName: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  pMeta: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2 },
  stockBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, minWidth: 100, alignItems: 'center' },
  stockTxt: { fontWeight: '800', fontSize: fontSizes.xs },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  modalWrap: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: fontSizes.md, color: colors.textPrimary, marginBottom: spacing.sm },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
  btn: { flex: 1, paddingVertical: 13, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primaryDark },
  btnGhost: { backgroundColor: colors.surfaceAlt },
  btnTxt: { fontWeight: '800', fontSize: fontSizes.sm },
});
