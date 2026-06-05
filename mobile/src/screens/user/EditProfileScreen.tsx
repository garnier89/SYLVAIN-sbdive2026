import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { userAPI } from '@/api/endpoints';

export default function EditProfileScreen() {
  const nav = useNavigation<any>();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    setSavedMsg('');
    if (!name.trim()) {
      setError('Le nom est requis');
      return;
    }
    setSaving(true);
    try {
      const res = await userAPI.updateProfile({ name: name.trim(), phone: phone.trim() });
      setUser(res.data);
      setSavedMsg('Profil mis à jour ✓');
      setTimeout(() => nav.goBack(), 900);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Échec de la mise à jour');
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} testID="editprofile-back"><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
        <Text style={styles.headerTitle}>Modifier le profil</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={styles.avatar}><Text style={styles.avatarTxt}>{name?.[0]?.toUpperCase() || 'U'}</Text></View>

        <View style={styles.field}>
          <Text style={styles.label}>Nom complet</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Votre nom" placeholderTextColor={colors.textMuted} testID="profile-name-input" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Téléphone</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+33…" placeholderTextColor={colors.textMuted} testID="profile-phone-input" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.readonly]}><Text style={styles.readonlyTxt}>{user?.email || '—'}</Text></View>
        </View>

        {!!error && <Text style={styles.error} testID="profile-error">{error}</Text>}
        {!!savedMsg && <Text style={styles.success} testID="profile-saved">{savedMsg}</Text>}

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={save} testID="profile-save-btn">
          <Text style={styles.saveTxt}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg },
  avatarTxt: { fontSize: 32, fontWeight: '800', color: colors.secondary },
  field: { marginBottom: spacing.md },
  label: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 13, fontSize: fontSizes.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  readonly: { justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  readonlyTxt: { color: colors.textMuted, fontSize: fontSizes.md },
  error: { color: colors.danger, fontSize: fontSizes.sm, marginBottom: spacing.sm, fontWeight: '600' },
  success: { color: colors.accent, fontSize: fontSizes.sm, marginBottom: spacing.sm, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.secondary, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, ...shadow.sm },
  saveTxt: { color: colors.textInverse, fontSize: fontSizes.md, fontWeight: '800' },
});
