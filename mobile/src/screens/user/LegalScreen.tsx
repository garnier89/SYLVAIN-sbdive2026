import React from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { colors, fontSizes, spacing } from '@/theme';

const APP_NAME = 'SB Drive';
const CONTACT_EMAIL = 'contact@sbdrive.app';
const LAST_UPDATE = 'juin 2026';

const baseCss = `
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px 18px 48px; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #1A2233; line-height: 1.6; font-size: 15px; background: #FFFFFF; }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px; color: #0B1426; }
    .meta { font-size: 12px; color: #8A93A6; margin-bottom: 22px; }
    h2 { font-size: 16px; font-weight: 800; margin: 26px 0 8px; color: #0B1426; }
    p, li { font-size: 14.5px; color: #2A3346; }
    ul { padding-left: 20px; margin: 6px 0; }
    a { color: #FF5000; text-decoration: none; }
    .lead { color: #4A5468; }
  </style>
`;

const TERMS_HTML = `
<!DOCTYPE html><html lang="fr"><head>${baseCss}</head><body>
<h1>Conditions Générales d'Utilisation</h1>
<div class="meta">${APP_NAME} — Dernière mise à jour : ${LAST_UPDATE}</div>
<p class="lead">Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'accès et l'utilisation de l'application ${APP_NAME} et des services associés. En créant un compte ou en utilisant l'application, vous acceptez sans réserve les présentes CGU.</p>

<h2>1. Objet</h2>
<p>${APP_NAME} est une plateforme de mise en relation proposant des services de transport, de livraison et de prestations à la demande. ${APP_NAME} agit en qualité d'intermédiaire technique entre les utilisateurs et les prestataires indépendants.</p>

<h2>2. Création de compte</h2>
<p>L'utilisation des services nécessite la création d'un compte personnel. Vous vous engagez à fournir des informations exactes et à jour, et à préserver la confidentialité de vos identifiants. Vous êtes responsable de toute activité réalisée depuis votre compte.</p>

<h2>3. Utilisation des services</h2>
<ul>
  <li>Les prestations sont assurées par des prestataires indépendants, non salariés de ${APP_NAME}.</li>
  <li>Les prix affichés sont des estimations pouvant varier selon les conditions réelles (distance, durée, demande).</li>
  <li>Vous vous engagez à utiliser l'application de manière loyale et conforme à la loi.</li>
</ul>

<h2>4. Paiements</h2>
<p>Les paiements sont effectués via les moyens proposés dans l'application (carte bancaire, portefeuille électronique, espèces le cas échéant). Certaines réservations peuvent nécessiter une empreinte de garantie (caution) restituée à l'issue de la prestation.</p>

<h2>5. Annulation</h2>
<p>Des frais d'annulation peuvent s'appliquer selon le service et le délai d'annulation. Les conditions spécifiques sont indiquées avant la confirmation de chaque commande.</p>

<h2>6. Responsabilité</h2>
<p>${APP_NAME} met en œuvre les moyens raisonnables pour assurer la disponibilité et la qualité du service mais ne saurait être tenue responsable des prestations réalisées par les prestataires indépendants ni des interruptions indépendantes de sa volonté.</p>

<h2>7. Données personnelles</h2>
<p>Le traitement de vos données est décrit dans notre Politique de confidentialité, accessible depuis les réglages de l'application.</p>

<h2>8. Modification des CGU</h2>
<p>${APP_NAME} se réserve le droit de modifier les présentes CGU. Toute modification substantielle vous sera notifiée dans l'application.</p>

<h2>9. Contact</h2>
<p>Pour toute question relative aux présentes CGU : <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
</body></html>
`;

const PRIVACY_HTML = `
<!DOCTYPE html><html lang="fr"><head>${baseCss}</head><body>
<h1>Politique de Confidentialité</h1>
<div class="meta">${APP_NAME} — Dernière mise à jour : ${LAST_UPDATE}</div>
<p class="lead">La présente Politique de confidentialité décrit comment ${APP_NAME} collecte, utilise et protège vos données personnelles, conformément au Règlement Général sur la Protection des Données (RGPD).</p>

<h2>1. Données collectées</h2>
<ul>
  <li><strong>Identité :</strong> nom, prénom, e-mail, numéro de téléphone.</li>
  <li><strong>Localisation :</strong> position GPS pour fournir les services de transport et de livraison.</li>
  <li><strong>Transactions :</strong> historique des commandes et des paiements.</li>
  <li><strong>Données techniques :</strong> identifiants d'appareil, logs de connexion.</li>
</ul>

<h2>2. Finalités</h2>
<ul>
  <li>Fournir, personnaliser et améliorer les services.</li>
  <li>Assurer la mise en relation avec les prestataires.</li>
  <li>Gérer les paiements et prévenir la fraude.</li>
  <li>Vous envoyer des notifications relatives à vos commandes.</li>
</ul>

<h2>3. Partage des données</h2>
<p>Vos données peuvent être partagées avec les prestataires concernés (uniquement les informations nécessaires à la prestation), nos prestataires de paiement et, le cas échéant, les autorités compétentes sur requête légale. ${APP_NAME} ne vend jamais vos données personnelles.</p>

<h2>4. Conservation</h2>
<p>Vos données sont conservées pendant la durée nécessaire aux finalités décrites et conformément aux obligations légales applicables.</p>

<h2>5. Vos droits</h2>
<p>Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition au traitement de vos données. Vous pouvez exercer ces droits à tout moment en nous contactant.</p>

<h2>6. Sécurité</h2>
<p>${APP_NAME} met en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données contre tout accès non autorisé, perte ou altération.</p>

<h2>7. Contact</h2>
<p>Pour toute question ou pour exercer vos droits : <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
</body></html>
`;

export default function LegalScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const type = route.params?.type === 'privacy' ? 'privacy' : 'terms';
  const title = type === 'privacy' ? 'Politique de confidentialité' : 'Conditions générales';
  const html = type === 'privacy' ? PRIVACY_HTML : TERMS_HTML;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} testID="legal-back">
          <Ionicons name="arrow-back" size={24} color={colors.textInverse} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        testID="legal-webview"
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800' },
  web: { flex: 1, backgroundColor: colors.surface },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
