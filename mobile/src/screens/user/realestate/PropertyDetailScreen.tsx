import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Image, Linking, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { realEstateAPI } from '@/api/endpoints';
import { useAuth } from '@/contexts/AuthContext';

const { width } = Dimensions.get('window');

const fmtPrice = (p: number, type: string, period?: string) => {
  const v = Number(p || 0).toLocaleString('fr-FR');
  return type === 'rent' ? `${v} € /${period || 'mois'}` : `${v} €`;
};

export default function PropertyDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = route.params || {};
  const { user } = useAuth();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [offer, setOffer] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    realEstateAPI
      .get(id)
      .then((r) => setListing(r.data))
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [id]);

  const isOwner = listing && user && listing.user_id === user.id;
  const images: string[] = (listing?.images || []).filter(Boolean);

  const submitInquiry = async () => {
    setSending(true);
    try {
      await realEstateAPI.createInquiry(id, {
        message: message.trim(),
        offer_amount: offer ? parseFloat(offer) : undefined,
      });
      setSent(true);
      setMessage('');
      setOffer('');
      setTimeout(() => setContactOpen(false), 1200);
    } catch {
      /* surfaced silently; keep modal open */
    }
    setSending(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </SafeAreaView>
    );
  }
  if (!listing) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()} hitSlop={12}><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
          <Text style={styles.headerTitle}>Annonce</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.empty}>Annonce introuvable.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} testID="property-back"><Ionicons name="arrow-back" size={24} color={colors.textInverse} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Détails</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Image carousel */}
        <View>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setActiveImg(Math.round(e.nativeEvent.contentOffset.x / width))}
              testID="property-carousel"
            >
              {images.map((img, i) => (
                <Image key={i} source={{ uri: img }} style={{ width, height: 260 }} />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.carouselEmpty, { width, height: 260 }]}>
              <Ionicons name="home" size={56} color={colors.textMuted} />
            </View>
          )}
          {images.length > 1 && (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, activeImg === i && styles.dotActive]} />
              ))}
            </View>
          )}
          {listing.is_featured && (
            <View style={styles.featuredTag}><Ionicons name="star" size={12} color="#fff" /><Text style={styles.featuredTxt}>Sponsorisé</Text></View>
          )}
        </View>

        <View style={styles.content}>
          <Text style={styles.price} testID="property-price">{fmtPrice(listing.price, listing.listing_type, listing.rent_period)}</Text>
          <Text style={styles.title} testID="property-title">{listing.title}</Text>
          <Text style={styles.loc}><Ionicons name="location-outline" size={14} color={colors.textMuted} /> {listing.address || listing.city || '—'}</Text>

          {/* Badges */}
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: listing.listing_type === 'rent' ? '#DBEAFE' : '#DCFCE7' }]}>
              <Text style={[styles.badgeTxt, { color: listing.listing_type === 'rent' ? colors.info : colors.accent }]}>
                {listing.listing_type === 'rent' ? 'Location' : 'Vente'}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.badgeTxt, { color: colors.textSecondary }]}>
                {listing.category === 'residential' ? 'Résidentiel' : listing.category === 'commercial' ? 'Commercial' : 'Terrain'}
              </Text>
            </View>
            {listing.furnished && (
              <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}><Text style={[styles.badgeTxt, { color: colors.warning }]}>Meublé</Text></View>
            )}
          </View>

          {/* Specs grid */}
          <View style={styles.specsGrid}>
            {listing.bedrooms != null && <Spec icon="bed-outline" label="Chambres" value={listing.bedrooms} />}
            {listing.bathrooms != null && <Spec icon="water-outline" label="SDB" value={listing.bathrooms} />}
            {listing.area_sqm != null && <Spec icon="resize-outline" label="Surface" value={`${listing.area_sqm} m²`} />}
            {listing.property_subtype && <Spec icon="business-outline" label="Type" value={listing.property_subtype} />}
          </View>

          {!!listing.description && (
            <>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.desc}>{listing.description}</Text>
            </>
          )}

          {(listing.amenities || []).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Équipements</Text>
              <View style={styles.amenities}>
                {listing.amenities.map((a: string, i: number) => (
                  <View key={i} style={styles.amenity}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                    <Text style={styles.amenityTxt}>{a}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {listing.lat != null && listing.lng != null && (
            <>
              <Text style={styles.sectionTitle}>Localisation</Text>
              <View style={styles.mapWrap}>
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={{ flex: 1 }}
                  initialRegion={{ latitude: listing.lat, longitude: listing.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
                  pointerEvents="none"
                >
                  <Marker coordinate={{ latitude: listing.lat, longitude: listing.lng }} />
                </MapView>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Contact bar */}
      <View style={styles.contactBar}>
        {listing.owner_phone && (
          <Pressable
            style={styles.callBtn}
            onPress={() => Linking.openURL(`tel:${listing.owner_phone}`)}
            testID="property-call-btn"
          >
            <Ionicons name="call" size={20} color={colors.secondary} />
          </Pressable>
        )}
        {isOwner ? (
          <Pressable style={[styles.primaryBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => nav.navigate('MyProperties')} testID="property-manage-btn">
            <Text style={[styles.primaryBtnTxt, { color: colors.textPrimary }]}>Gérer mon annonce</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryBtn} onPress={() => { setSent(false); setContactOpen(true); }} testID="property-offer-btn">
            <Text style={styles.primaryBtnTxt}>{listing.listing_type === 'rent' ? 'Contacter' : 'Faire une offre'}</Text>
          </Pressable>
        )}
      </View>

      {/* Contact / offer modal */}
      <Modal visible={contactOpen} transparent animationType="slide" onRequestClose={() => setContactOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {sent ? (
              <View style={styles.sentBox} testID="inquiry-sent">
                <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
                <Text style={styles.sentTxt}>Demande envoyée au propriétaire !</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>{listing.listing_type === 'rent' ? 'Contacter le propriétaire' : 'Faire une offre'}</Text>
                {listing.listing_type === 'sale' && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Montant de l'offre (€)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={offer}
                      onChangeText={setOffer}
                      placeholder={String(listing.price)}
                      placeholderTextColor={colors.textMuted}
                      testID="inquiry-offer-input"
                    />
                  </View>
                )}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Message</Text>
                  <TextInput
                    style={[styles.input, { height: 88, textAlignVertical: 'top' }]}
                    multiline
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Bonjour, je suis intéressé(e) par votre bien…"
                    placeholderTextColor={colors.textMuted}
                    testID="inquiry-message-input"
                  />
                </View>
                <Pressable
                  style={[styles.primaryBtn, sending && { opacity: 0.6 }]}
                  disabled={sending}
                  onPress={submitInquiry}
                  testID="inquiry-submit-btn"
                >
                  <Text style={styles.primaryBtnTxt}>{sending ? 'Envoi…' : 'Envoyer'}</Text>
                </Pressable>
                <Pressable style={styles.cancelBtn} onPress={() => setContactOpen(false)}>
                  <Text style={styles.cancelTxt}>Annuler</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Spec({ icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <View style={styles.specBox}>
      <Ionicons name={icon} size={18} color={colors.secondary} />
      <Text style={styles.specValue}>{value}</Text>
      <Text style={styles.specLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.secondary },
  headerTitle: { color: colors.textInverse, fontSize: fontSizes.xl, fontWeight: '800', flex: 1, textAlign: 'center' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl },
  carouselEmpty: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  featuredTag: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.warning, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  featuredTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  content: { padding: spacing.lg },
  price: { fontSize: fontSizes.xxl, fontWeight: '900', color: colors.secondary },
  title: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
  loc: { fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  badgeTxt: { fontSize: fontSizes.xs, fontWeight: '800' },
  specsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  specBox: { flexGrow: 1, minWidth: 72, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.md, ...shadow.sm },
  specValue: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  specLabel: { fontSize: fontSizes.xs, color: colors.textMuted },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  desc: { fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 21 },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amenity: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  amenityTxt: { fontSize: fontSizes.xs, color: colors.textPrimary },
  mapWrap: { height: 180, borderRadius: radius.lg, overflow: 'hidden', ...shadow.sm },
  contactBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  callBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { flex: 1, height: 52, borderRadius: radius.md, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  primaryBtnTxt: { color: colors.textInverse, fontSize: fontSizes.md, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSizes.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelTxt: { color: colors.textMuted, fontSize: fontSizes.md, fontWeight: '600' },
  sentBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  sentTxt: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
});
