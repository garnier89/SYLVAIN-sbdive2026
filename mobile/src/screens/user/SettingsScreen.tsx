import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/locales/i18n';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { userAPI } from '@/api/endpoints';

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const { user, logout } = useAuth();
  const [lang, setLang] = useState(i18n.language);
  const [notifications, setNotifications] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [saving, setSaving] = useState(false);

  const setLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setLang(code);
  };

  const changePassword = async () => {
    setPwErr('');
    setPwMsg('');
    if (next.length < 6) {
      setPwErr('Le nouveau mot de passe doit faire au moins 6 caractères');
      return;
    }
    setSaving(true);
    try {
      await userAPI.changePassword(current, next);
      setPwMsg('Mot de passe modifié ✓');
      setCurrent('');
      setNext('');
      setTimeout(() => setPwOpen(false), 1000);
    } catch (e: any) {
      setPwErr(e?.response?.data?.detail || 'Échec de la modification');
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} testID="settings-back"><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
        <Text style={styles.headerTitle}>Réglages</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Account */}
        <Text style={styles.section}>Compte</Text>
        <View style={styles.group}>
          <Row icon="person-outline" label="Modifier le profil" onPress={() => nav.navigate('EditProfile')} testID="settings-edit-profile" />
          <Divider />
          <Row icon="lock-closed-outline" label="Changer le mot de passe" onPress={() => { setPwErr(''); setPwMsg(''); setPwOpen(true); }} testID="settings-change-password" />
        </View>

        {/* Preferences */}
        <Text style={styles.section}>Préférences</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <Ionicons name="language-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Langue</Text>
            <View style={styles.langToggle}>
              {['fr', 'en'].map((c) => (
                <Pressable key={c} style={[styles.langBtn, lang === c && styles.langBtnActive]} onPress={() => setLanguage(c)} testID={`lang-${c}`}>
                  <Text style={[styles.langTxt, lang === c && styles.langTxtActive]}>{c.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Divider />
          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Notifications push</Text>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ true: colors.accent, false: colors.border }}
              testID="settings-notifications-switch"
            />
          </View>
        </View>

        {/* About */}
        <Text style={styles.section}>À propos</Text>
        <View style={styles.group}>
          <Row icon="document-text-outline" label="Conditions générales" onPress={() => {}} testID="settings-terms" />
          <Divider />
          <Row icon="shield-checkmark-outline" label="Politique de confidentialité" onPress={() => {}} testID="settings-privacy" />
          <Divider />
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.version}>{APP_VERSION}</Text>
          </View>
        </View>

        <Pressable style={styles.logout} onPress={logout} testID="settings-logout">
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutTxt}>Se déconnecter</Text>
        </Pressable>
        <Text style={styles.userMeta}>{user?.email || user?.phone || ''}</Text>
      </ScrollView>

      {/* Change password modal */}
      <Modal visible={pwOpen} transparent animationType="slide" onRequestClose={() => setPwOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Changer le mot de passe</Text>
            <TextInput style={styles.input} secureTextEntry placeholder="Mot de passe actuel" placeholderTextColor={colors.textMuted} value={current} onChangeText={setCurrent} testID="current-password-input" />
            <TextInput style={styles.input} secureTextEntry placeholder="Nouveau mot de passe" placeholderTextColor={colors.textMuted} value={next} onChangeText={setNext} testID="new-password-input" />
            {!!pwErr && <Text style={styles.error}>{pwErr}</Text>}
            {!!pwMsg && <Text style={styles.success}>{pwMsg}</Text>}
            <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={changePassword} testID="submit-password-btn">
              <Text style={styles.primaryTxt}>{saving ? 'Modification…' : 'Confirmer'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setPwOpen(false)}><Text style={styles.cancelTxt}>Annuler</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  section: { fontSize: fontSizes.sm, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.sm, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 15 },
  rowLabel: { flex: 1, fontSize: fontSizes.md, color: colors.textPrimary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 52 },
  langToggle: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 3 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  langBtnActive: { backgroundColor: colors.secondary },
  langTxt: { fontSize: fontSizes.xs, fontWeight: '800', color: colors.textSecondary },
  langTxtActive: { color: colors.textInverse },
  version: { fontSize: fontSizes.sm, color: colors.textMuted, fontWeight: '600' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: 15 },
  logoutTxt: { color: colors.danger, fontSize: fontSizes.md, fontWeight: '800' },
  userMeta: { textAlign: 'center', color: colors.textMuted, fontSize: fontSizes.xs, marginTop: spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 13, fontSize: fontSizes.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  error: { color: colors.danger, fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.sm },
  success: { color: colors.accent, fontSize: fontSizes.sm, fontWeight: '700', marginBottom: spacing.sm },
  primaryBtn: { backgroundColor: colors.secondary, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  primaryTxt: { color: colors.textInverse, fontSize: fontSizes.md, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelTxt: { color: colors.textMuted, fontSize: fontSizes.md, fontWeight: '600' },
});
