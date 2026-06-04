import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { parcelAPI, medicalAPI, driverAPI } from '@/api/endpoints';
import useRideSocket from '@/hooks/useRideSocket';

const PARCEL_NEXT: Record<string, string> = { accepted: 'arrived_pickup', arrived_pickup: 'picked_up', picked_up: 'in_transit' };
const PARCEL_LABEL: Record<string, string> = { pending: 'En attente', accepted: 'Acceptée', arrived_pickup: 'Arrivé au ramassage', picked_up: 'Colis récupéré', in_transit: 'En livraison', completed: 'Terminée' };
const PARCEL_NEXT_LABEL: Record<string, string> = { accepted: 'Je suis arrivé au ramassage', arrived_pickup: 'Colis récupéré', picked_up: 'Démarrer la livraison' };

const MEDTR_NEXT: Record<string, string> = { accepted: 'en_route_pickup', en_route_pickup: 'patient_onboard', patient_onboard: 'arrived', arrived: 'completed' };
const MEDTR_LABEL: Record<string, string> = { pending: 'En attente', accepted: 'Acceptée', en_route_pickup: 'En route', patient_onboard: 'Patient à bord', arrived: 'Arrivé à destination', completed: 'Terminée' };
const MEDTR_NEXT_LABEL: Record<string, string> = { accepted: 'En route vers le patient', en_route_pickup: 'Patient à bord', patient_onboard: "Arrivé à l'hôpital", arrived: 'Terminer la course' };

const fEuro = (v: any) => (typeof v === 'number' ? v.toFixed(2) : v ?? '--');

const Badge = ({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'red' | 'amber' }) => {
  const map: any = {
    blue: { bg: '#DBEAFE', fg: '#1D4ED8' },
    red: { bg: '#FEE2E2', fg: '#B91C1C' },
    amber: { bg: '#FEF3C7', fg: '#B45309' },
  };
  return (
    <View style={[styles.badge, { backgroundColor: map[tone].bg }]}>
      <Text style={[styles.badgeTxt, { color: map[tone].fg }]}>{label}</Text>
    </View>
  );
};

export default function DriverDeliveryJobsScreen() {
  const [tab, setTab] = useState<'available' | 'active'>('available');
  const [availParcels, setAvailParcels] = useState<any[]>([]);
  const [availTransports, setAvailTransports] = useState<any[]>([]);
  const [activeParcels, setActiveParcels] = useState<any[]>([]);
  const [activeTransports, setActiveTransports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ text: string; tone: 'success' | 'urgent' } | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ap, at, mp, mt] = await Promise.all([
        parcelAPI.driverAvailable(),
        medicalAPI.transportDriverAvailable(),
        parcelAPI.driverActive(),
        medicalAPI.transportDriverActive(),
      ]);
      setAvailParcels(ap.data || []);
      setAvailTransports(at.data || []);
      setActiveParcels(mp.data || []);
      setActiveTransports(mt.data || []);
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showBanner = useCallback((text: string, tone: 'success' | 'urgent') => {
    setBanner({ text, tone });
    Animated.timing(bannerAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(bannerAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setBanner(null));
    }, 4500);
  }, [bannerAnim]);

  // Live push of new missions broadcast to drivers
  const onSocket = useCallback((msg: any) => {
    if (msg?.type === 'new_parcel') {
      showBanner(`📦 Nouvelle livraison · ${fEuro(msg.fare)} €`, 'success');
      refresh();
    } else if (msg?.type === 'new_transport') {
      const urgent = msg.urgency && msg.urgency !== 'normal';
      showBanner(`🚑 Nouveau transport médical${urgent ? ' (URGENT)' : ''} · ${fEuro(msg.fare)} €`, urgent ? 'urgent' : 'success');
      refresh();
    }
  }, [refresh, showBanner]);

  useRideSocket({ enabled: true, onMessage: onSocket });

  const activeCount = activeParcels.length + activeTransports.length;
  const availableCount = availParcels.length + availTransports.length;

  // Broadcast live position while there are active deliveries (passenger live map)
  useEffect(() => {
    if (activeCount === 0) return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 25 },
          (pos) => { driverAPI.updateLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {}); }
        );
      } catch {}
    })();
    return () => { sub?.remove?.(); };
  }, [activeCount]);

  const acceptParcel = async (id: string) => { try { await parcelAPI.accept(id); setTab('active'); refresh(); } catch {} };
  const acceptTransport = async (id: string) => { try { await medicalAPI.acceptTransport(id); setTab('active'); refresh(); } catch {} };
  const advanceParcel = async (id: string, next: string) => { try { await parcelAPI.updateStatus(id, next); refresh(); } catch {} };
  const deliverLeg = async (id: string, index: number) => { try { await parcelAPI.deliverLeg(id, index); refresh(); } catch {} };
  const advanceTransport = async (id: string, next: string) => { try { await medicalAPI.updateTransportStatus(id, next); refresh(); } catch {} };
  const call = (phone?: string) => { if (phone) Linking.openURL(`tel:${phone}`); };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Livraisons & Transport</Text>
        <TouchableOpacity onPress={refresh} testID="jobs-refresh-btn">
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Live banner */}
      {banner && (
        <Animated.View
          style={[
            styles.banner,
            { backgroundColor: banner.tone === 'urgent' ? colors.danger : colors.accent, opacity: bannerAnim },
          ]}
        >
          <Text style={styles.bannerTxt}>{banner.text}</Text>
        </Animated.View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={styles.tab} onPress={() => setTab('available')} testID="tab-available">
          <Text style={[styles.tabTxt, tab === 'available' && styles.tabActive]}>
            Disponibles {availableCount > 0 ? `(${availableCount})` : ''}
          </Text>
          {tab === 'available' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setTab('active')} testID="tab-active">
          <Text style={[styles.tabTxt, tab === 'active' && styles.tabActive]}>
            En cours {activeCount > 0 ? `(${activeCount})` : ''}
          </Text>
          {tab === 'active' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 90, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primaryDark} />}
      >
        {/* ===== AVAILABLE ===== */}
        {tab === 'available' && (
          <>
            {availableCount === 0 && !loading && (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTxt}>Aucune mission disponible pour le moment.</Text>
              </View>
            )}
            {availParcels.map((p) => (
              <View key={p.id} style={styles.card} testID={`avail-parcel-${p.id}`}>
                <View style={styles.rowHead}>
                  <Ionicons name="cube" size={18} color="#14B8A6" />
                  <Text style={styles.cardTitle}>Colis{p.delivery_mode === 'multi' ? ` · ${p.stops?.length} dépôts` : ''}</Text>
                  <Text style={styles.fare}>{fEuro(p.fare)} €</Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  <Ionicons name="ellipse" size={9} color={colors.accent} /> {p.pickup_address || `${p.pickup_lat?.toFixed?.(3)}, ${p.pickup_lng?.toFixed?.(3)}`}
                </Text>
                <Text style={styles.metaMuted}>{p.total_distance_km} km · {p.vehicle_type === 'box' ? 'Box' : 'Moto'}</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => acceptParcel(p.id)} testID={`accept-parcel-${p.id}`}>
                  <Text style={styles.primaryBtnTxt}>Accepter</Text>
                </TouchableOpacity>
              </View>
            ))}
            {availTransports.map((t) => (
              <View key={t.id} style={styles.card} testID={`avail-transport-${t.id}`}>
                <View style={styles.rowHead}>
                  <Ionicons name="medkit" size={18} color={colors.danger} />
                  <Text style={styles.cardTitle}>{t.ambulance_name}</Text>
                  {t.urgency && t.urgency !== 'normal' && (
                    <Badge label={t.urgency === 'critical' ? 'Critique' : 'Urgent'} tone={t.urgency === 'critical' ? 'red' : 'amber'} />
                  )}
                  <Text style={styles.fare}>{fEuro(t.fare)} €</Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>Patient : {t.patient_name || '—'} · {t.distance_km} km</Text>
                <Text style={styles.metaMuted} numberOfLines={1}>→ {t.destination_name || 'Destination'}</Text>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.danger }]} onPress={() => acceptTransport(t.id)} testID={`accept-transport-${t.id}`}>
                  <Text style={styles.primaryBtnTxt}>Accepter le transport</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* ===== ACTIVE ===== */}
        {tab === 'active' && (
          <>
            {activeCount === 0 && !loading && (
              <View style={styles.empty}>
                <Ionicons name="checkmark-done-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTxt}>Aucune mission en cours.</Text>
              </View>
            )}
            {activeParcels.map((p) => (
              <View key={p.id} style={styles.card} testID={`active-parcel-${p.id}`}>
                <View style={styles.rowHead}>
                  <Ionicons name="cube" size={18} color="#14B8A6" />
                  <Text style={styles.cardTitle}>Colis{p.delivery_mode === 'multi' ? ` · ${p.stops?.length} dépôts` : ''}</Text>
                  <Badge label={PARCEL_LABEL[p.status] || p.status} />
                </View>
                {PARCEL_NEXT[p.status] && (
                  <TouchableOpacity style={styles.darkBtn} onPress={() => advanceParcel(p.id, PARCEL_NEXT[p.status])} testID={`parcel-advance-${p.id}`}>
                    <Text style={styles.darkBtnTxt}>{PARCEL_NEXT_LABEL[p.status]}</Text>
                    <Ionicons name="chevron-forward" size={15} color="#fff" />
                  </TouchableOpacity>
                )}
                {['picked_up', 'in_transit'].includes(p.status) && (
                  <View style={{ gap: spacing.sm }} testID={`parcel-legs-${p.id}`}>
                    {(p.legs || []).map((leg: any) => {
                      const phone = p.stops?.[leg.index]?.recipient_phone;
                      return (
                        <View key={leg.index} style={styles.leg}>
                          <Text style={styles.legTxt} numberOfLines={1}>
                            <Ionicons name="flag" size={12} color={colors.danger} /> Dépôt {leg.index + 1}{leg.recipient_name ? ` · ${leg.recipient_name}` : ''}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {phone && leg.status !== 'delivered' && (
                              <TouchableOpacity style={styles.callMini} onPress={() => call(phone)} testID={`call-recipient-${p.id}-${leg.index}`}>
                                <Ionicons name="call" size={15} color={colors.info} />
                              </TouchableOpacity>
                            )}
                            {leg.status === 'delivered' ? (
                              <Text style={styles.deliveredTxt}><Ionicons name="checkmark-circle" size={14} color={colors.accent} /> Livré</Text>
                            ) : (
                              <TouchableOpacity style={styles.greenMini} onPress={() => deliverLeg(p.id, leg.index)} testID={`deliver-leg-${p.id}-${leg.index}`}>
                                <Text style={styles.greenMiniTxt}>Marquer livré</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
            {activeTransports.map((t) => (
              <View key={t.id} style={styles.card} testID={`active-transport-${t.id}`}>
                <View style={styles.rowHead}>
                  <Ionicons name="medkit" size={18} color={colors.danger} />
                  <Text style={styles.cardTitle}>{t.ambulance_name}</Text>
                  <Badge label={MEDTR_LABEL[t.status] || t.status} />
                </View>
                <Text style={styles.meta} numberOfLines={1}>Patient : {t.patient_name || '—'} → {t.destination_name || 'Destination'}</Text>
                {t.patient_phone && (
                  <TouchableOpacity style={styles.callBtn} onPress={() => call(t.patient_phone)} testID={`call-patient-${t.id}`}>
                    <Ionicons name="call" size={15} color={colors.info} />
                    <Text style={styles.callBtnTxt}>Appeler le patient</Text>
                  </TouchableOpacity>
                )}
                {MEDTR_NEXT[t.status] && (
                  <TouchableOpacity style={[styles.darkBtn, { backgroundColor: colors.danger }]} onPress={() => advanceTransport(t.id, MEDTR_NEXT[t.status])} testID={`transport-advance-${t.id}`}>
                    <Text style={styles.darkBtnTxt}>{MEDTR_NEXT_LABEL[t.status]}</Text>
                    <Ionicons name="chevron-forward" size={15} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: { backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  title: { color: '#fff', fontSize: fontSizes.lg, fontWeight: '800' },
  banner: { paddingVertical: 10, paddingHorizontal: spacing.md },
  bannerTxt: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabTxt: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textMuted },
  tabActive: { color: colors.primaryDark },
  tabUnderline: { height: 2, backgroundColor: colors.primaryDark, width: '60%', marginTop: 6, borderRadius: 2 },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  cardTitle: { fontWeight: '700', fontSize: fontSizes.sm, color: colors.textPrimary, flexShrink: 1 },
  fare: { marginLeft: 'auto', fontWeight: '800', color: colors.primaryDark },
  meta: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2 },
  metaMuted: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  primaryBtn: { backgroundColor: colors.primaryDark, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: fontSizes.sm },
  darkBtn: { backgroundColor: colors.secondary, paddingVertical: 12, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: spacing.sm },
  darkBtnTxt: { color: '#fff', fontWeight: '700', fontSize: fontSizes.sm },
  leg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  legTxt: { fontSize: fontSizes.xs, color: colors.textSecondary, flexShrink: 1 },
  callMini: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  greenMini: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm },
  greenMiniTxt: { color: '#fff', fontWeight: '700', fontSize: fontSizes.xs },
  deliveredTxt: { color: colors.accent, fontWeight: '700', fontSize: fontSizes.xs },
  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFF6FF', paddingVertical: 12, borderRadius: radius.md, marginBottom: spacing.sm },
  callBtnTxt: { color: colors.info, fontWeight: '700', fontSize: fontSizes.sm },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTxt: { color: colors.textMuted, marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginLeft: 4 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
});
