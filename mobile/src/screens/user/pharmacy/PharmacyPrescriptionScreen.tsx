import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Image, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { pharmacyAPI } from '@/api/endpoints';

export default function PharmacyPrescriptionScreen() {
  const nav = useNavigation<any>();
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [coords, setCoords] = useState<any>(null);
  const [form, setForm] = useState<any>({ pharmacy_id: '', delivery_address: '', recipient_name: '', recipient_phone: '', prescription_note: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { pharmacyAPI.pharmacies().then((r) => setPharmacies(r.data || [])).catch(() => {}); }, []);

  const pickImage = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission', 'Accès refusé.');
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!res.canceled && res.assets?.[0]?.base64) {
      setImage(`data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  };

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Localisation', 'Permission refusée.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  };

  const submit = async () => {
    if (!image) return Alert.alert('Ordonnance', 'Photographiez votre ordonnance');
    if (!coords) return Alert.alert('Livraison', 'Indiquez votre position de livraison');
    if (!form.recipient_name || !form.recipient_phone) return Alert.alert('Destinataire', 'Nom et téléphone requis');
    setSubmitting(true);
    try {
      await pharmacyAPI.createOrder({
        order_type: 'prescription', prescription_image: image, prescription_note: form.prescription_note,
        pharmacy_id: form.pharmacy_id || undefined, delivery_address: form.delivery_address,
        delivery_lat: coords.lat, delivery_lng: coords.lng,
        recipient_name: form.recipient_name, recipient_phone: form.recipient_phone,
      });
      Alert.alert('Ordonnance envoyée', 'La pharmacie va vérifier et vous proposer un devis.', [{ text: 'OK', onPress: () => nav.navigate('PharmacyOrders') }]);
    } catch (e: any) { Alert.alert('Erreur', e.response?.data?.detail || "Échec de l'envoi"); }
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
        <Text style={styles.headerTitle}>Sur ordonnance</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Photo de l'ordonnance</Text>
        {image ? (
          <View>
            <Image source={{ uri: image }} style={styles.preview} testID="rx-preview" />
            <Pressable onPress={() => setImage(null)} style={styles.removeBtn} testID="rx-remove"><Ionicons name="close" size={16} color="#fff" /></Pressable>
          </View>
        ) : (
          <View style={styles.uploadRow}>
            <Pressable onPress={() => pickImage(true)} style={styles.uploadBox} testID="rx-camera"><Ionicons name="camera" size={28} color={colors.textMuted} /><Text style={styles.uploadTxt}>Appareil photo</Text></Pressable>
            <Pressable onPress={() => pickImage(false)} style={styles.uploadBox} testID="rx-gallery"><Ionicons name="images" size={28} color={colors.textMuted} /><Text style={styles.uploadTxt}>Galerie</Text></Pressable>
          </View>
        )}

        <Text style={styles.label}>Pharmacie (optionnel)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          <Pressable onPress={() => setForm({ ...form, pharmacy_id: '' })} style={[styles.chip, !form.pharmacy_id && styles.chipActive]}><Text style={[styles.chipTxt, !form.pharmacy_id && styles.chipTxtActive]}>Plus proche</Text></Pressable>
          {pharmacies.map((p) => (
            <Pressable key={p.id} onPress={() => setForm({ ...form, pharmacy_id: p.id })} style={[styles.chip, form.pharmacy_id === p.id && styles.chipActive]}><Text style={[styles.chipTxt, form.pharmacy_id === p.id && styles.chipTxtActive]}>{p.name}</Text></Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Note pour la pharmacie (optionnel)</Text>
        <TextInput value={form.prescription_note} onChangeText={(v) => setForm({ ...form, prescription_note: v })} placeholder="Ex: générique accepté, 2 boîtes…" placeholderTextColor={colors.textMuted} style={[styles.input, { height: 70 }]} multiline testID="rx-note" />

        <Text style={styles.label}>Adresse de livraison</Text>
        <TextInput value={form.delivery_address} onChangeText={(v) => setForm({ ...form, delivery_address: v })} placeholder="Ex: 10 rue de la Paix" placeholderTextColor={colors.textMuted} style={styles.input} testID="rx-address" />
        <Pressable onPress={useMyLocation} style={styles.locBtn} testID="rx-location-btn">
          <Ionicons name="location" size={16} color={colors.accent} />
          <Text style={styles.locTxt}>{coords ? `Position définie (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : 'Utiliser ma position'}</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={form.recipient_name} onChangeText={(v) => setForm({ ...form, recipient_name: v })} placeholder="Nom" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1 }]} testID="rx-name" />
          <TextInput value={form.recipient_phone} onChangeText={(v) => setForm({ ...form, recipient_phone: v })} placeholder="Téléphone" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.input, { flex: 1 }]} testID="rx-phone" />
        </View>

        <View style={styles.infoBox}><Text style={styles.infoTxt}>💡 Le prix sera confirmé par la pharmacie après vérification. Vous serez notifié du devis pour payer.</Text></View>

        <Pressable onPress={submit} disabled={submitting} style={[styles.primaryBtn, submitting && { opacity: 0.6 }]} testID="rx-submit-btn">
          {submitting ? <ActivityIndicator color={colors.secondary} /> : <Text style={styles.primaryBtnTxt}>Envoyer l'ordonnance</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  label: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md, marginBottom: 6 },
  uploadRow: { flexDirection: 'row', gap: spacing.md },
  uploadBox: { flex: 1, height: 120, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6 },
  uploadTxt: { color: colors.textMuted, fontSize: fontSizes.sm },
  preview: { width: '100%', height: 200, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  removeBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '700' },
  chipTxtActive: { color: colors.secondary },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSizes.md, color: colors.textPrimary, marginBottom: 8 },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginBottom: 8 },
  locTxt: { color: colors.accent, fontWeight: '700', fontSize: fontSizes.sm },
  infoBox: { backgroundColor: '#FFF7E6', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  infoTxt: { color: colors.primaryDark, fontSize: fontSizes.xs },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg, ...shadow.sm },
  primaryBtnTxt: { color: colors.secondary, fontWeight: '800', fontSize: fontSizes.md },
});
