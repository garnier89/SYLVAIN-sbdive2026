import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { parcelAPI, medicalAPI, driverAPI, orderAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  ArrowLeft, Package, FirstAid, MapPin, FlagCheckered, CheckCircle, CaretRight, ArrowsClockwise, Phone, ForkKnife,
} from '@phosphor-icons/react';

const FOOD_NEXT = { ready: 'picked_up', picked_up: 'delivered' };
const FOOD_LABEL = { accepted: 'Acceptée', preparing: 'En préparation', ready: 'À récupérer', picked_up: 'En livraison' };
const FOOD_NEXT_LABEL = { ready: 'Commande récupérée', picked_up: 'Marquer livré' };

const PARCEL_NEXT = { accepted: 'arrived_pickup', arrived_pickup: 'picked_up', picked_up: 'in_transit' };
const PARCEL_LABEL = { pending: 'En attente', accepted: 'Acceptée', arrived_pickup: 'Arrivé au ramassage', picked_up: 'Colis récupéré', in_transit: 'En livraison', completed: 'Terminée' };
const PARCEL_NEXT_LABEL = { accepted: 'Je suis arrivé au ramassage', arrived_pickup: 'Colis récupéré', picked_up: 'Démarrer la livraison' };

const MEDTR_NEXT = { accepted: 'en_route_pickup', en_route_pickup: 'patient_onboard', patient_onboard: 'arrived', arrived: 'completed' };
const MEDTR_LABEL = { pending: 'En attente', accepted: 'Acceptée', en_route_pickup: 'En route', patient_onboard: 'Patient à bord', arrived: 'Arrivé à destination', completed: 'Terminée' };
const MEDTR_NEXT_LABEL = { accepted: 'En route vers le patient', en_route_pickup: 'Patient à bord', patient_onboard: "Arrivé à l'hôpital", arrived: 'Terminer la course' };

const StatusBadge = ({ label }) => (
  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{label}</span>
);

const DeliveryJobsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on } = useWebSocket(user?.id);
  const [tab, setTab] = useState('available');
  const [availParcels, setAvailParcels] = useState([]);
  const [availTransports, setAvailTransports] = useState([]);
  const [availFood, setAvailFood] = useState([]);
  const [activeParcels, setActiveParcels] = useState([]);
  const [activeTransports, setActiveTransports] = useState([]);
  const [activeFood, setActiveFood] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [ap, at, mp, mt, af, actf] = await Promise.all([
        parcelAPI.driverAvailable(), medicalAPI.transportDriverAvailable(),
        parcelAPI.driverActive(), medicalAPI.transportDriverActive(),
        orderAPI.availableDeliveries().catch(() => ({ data: [] })),
        orderAPI.driverActiveOrders().catch(() => ({ data: [] })),
      ]);
      setAvailParcels(ap.data || []); setAvailTransports(at.data || []);
      setActiveParcels(mp.data || []); setActiveTransports(mt.data || []);
      setAvailFood(af.data || []); setActiveFood(actf.data || []);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Live push: new parcel / medical transport missions broadcast to drivers
  useEffect(() => {
    const unsubP = on('new_parcel', (msg) => {
      toast.success(`📦 Nouvelle livraison disponible · ${msg.fare?.toFixed?.(2) ?? msg.fare} €`, { duration: 6000 });
      refresh();
    });
    const unsubT = on('new_transport', (msg) => {
      const urgent = msg.urgency && msg.urgency !== 'normal';
      toast[urgent ? 'error' : 'success'](`🚑 Nouveau transport médical${urgent ? ' (URGENT)' : ''} · ${msg.fare?.toFixed?.(2) ?? msg.fare} €`, { duration: 7000 });
      refresh();
    });
    const unsubF = on('new_order', (msg) => {
      toast.success(`🍔 Nouvelle commande à livrer · ${msg.total?.toFixed?.(2) ?? msg.total} €`, { duration: 6000 });
      refresh();
    });
    const unsubD = on('new_delivery_offer', (msg) => {
      const tag = msg.delivery_speed === 'express' ? '⚡ Express' : (msg.priority ? '⭐ Prioritaire' : '🍔');
      toast.success(`${tag} · Livraison à prendre · ${msg.earning?.toFixed?.(2) ?? msg.earning} €`, { duration: 7000 });
      refresh();
    });
    return () => { unsubP(); unsubT(); unsubF(); unsubD(); };
  }, [on, refresh]);

  const activeCount = activeParcels.length + activeTransports.length + activeFood.length;

  // Broadcast live position while the driver has active deliveries (passenger live map)
  useEffect(() => {
    if (activeCount === 0 || !navigator.geolocation) return;
    const send = () => navigator.geolocation.getCurrentPosition(
      (pos) => driverAPI.updateLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {}),
      () => {}, { enableHighAccuracy: true, maximumAge: 8000 }
    );
    send();
    const t = setInterval(send, 10000);
    return () => clearInterval(t);
  }, [activeCount]);

  const acceptParcel = async (id) => { try { await parcelAPI.accept(id); toast.success('Colis accepté'); setTab('active'); refresh(); } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } };
  const claimFood = async (id) => { try { await orderAPI.claim(id); toast.success('Commande acceptée'); setTab('active'); refresh(); } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } };
  const advanceFood = async (id, next) => { try { await orderAPI.updateStatus(id, next); if (next === 'delivered') toast.success('Commande livrée'); refresh(); } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } };
  const acceptTransport = async (id) => { try { await medicalAPI.acceptTransport(id); toast.success('Transport accepté'); setTab('active'); refresh(); } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } };
  const advanceParcel = async (id, next) => { try { await parcelAPI.updateStatus(id, next); refresh(); } catch { toast.error('Échec'); } };
  const deliverLeg = async (id, index) => { try { const r = await parcelAPI.deliverLeg(id, index); if (r.data.all_delivered) toast.success('Toutes les livraisons effectuées !'); refresh(); } catch { toast.error('Échec'); } };
  const advanceTransport = async (id, next) => { try { await medicalAPI.updateTransportStatus(id, next); if (next === 'completed') toast.success('Course terminée'); refresh(); } catch { toast.error('Échec'); } };

  const availableCount = availParcels.length + availTransports.length + availFood.length;

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="delivery-jobs-page">
      <div className="bg-[#0B1426] px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/chauffeur/home')} className="text-white" data-testid="jobs-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-lg flex-1">Livraisons & Transport</h1>
        <button onClick={refresh} className="text-white" data-testid="jobs-refresh-btn"><ArrowsClockwise size={20} /></button>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-[52px] z-10">
        <button onClick={() => setTab('available')} data-testid="tab-available"
          className={`flex-1 py-3 text-sm font-semibold ${tab === 'available' ? 'text-[#FF5000] border-b-2 border-[#FF5000]' : 'text-gray-400'}`}>
          Disponibles {availableCount > 0 && `(${availableCount})`}
        </button>
        <button onClick={() => setTab('active')} data-testid="tab-active"
          className={`flex-1 py-3 text-sm font-semibold ${tab === 'active' ? 'text-[#FF5000] border-b-2 border-[#FF5000]' : 'text-gray-400'}`}>
          En cours {activeCount > 0 && `(${activeCount})`}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {loading && <p className="text-center text-gray-400 py-8">Chargement...</p>}

        {/* ===== AVAILABLE ===== */}
        {!loading && tab === 'available' && (
          <>
            {availableCount === 0 && <p className="text-center text-gray-400 py-10" data-testid="no-available">Aucune mission disponible pour le moment.</p>}
            {availParcels.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`avail-parcel-${p.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Package size={18} weight="duotone" className="text-teal-500" />
                  <span className="font-bold text-sm">Colis {p.delivery_mode === 'multi' ? `· ${p.stops?.length} dépôts` : ''}</span>
                  <span className="ml-auto font-bold text-[#FF5000]">{p.fare?.toFixed(2)} €</span>
                </div>
                <p className="text-xs text-gray-500 truncate"><MapPin size={11} className="inline text-green-500" /> {p.pickup_address || `${p.pickup_lat?.toFixed(3)}, ${p.pickup_lng?.toFixed(3)}`}</p>
                <p className="text-xs text-gray-400">{p.total_distance_km} km · {p.vehicle_type === 'box' ? 'Box' : 'Moto'}</p>
                <button onClick={() => acceptParcel(p.id)} data-testid={`accept-parcel-${p.id}`} className="w-full mt-3 bg-[#FF5000] text-white py-2.5 rounded-xl text-sm font-semibold">Accepter</button>
              </div>
            ))}
            {availTransports.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`avail-transport-${t.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <FirstAid size={18} weight="duotone" className="text-red-500" />
                  <span className="font-bold text-sm">{t.ambulance_name}</span>
                  {t.urgency !== 'normal' && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.urgency === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{t.urgency === 'critical' ? 'Critique' : 'Urgent'}</span>}
                  <span className="ml-auto font-bold text-[#FF5000]">{t.fare?.toFixed(2)} €</span>
                </div>
                <p className="text-xs text-gray-500 truncate">Patient : {t.patient_name || '—'} · {t.distance_km} km</p>
                <p className="text-xs text-gray-400 truncate">→ {t.destination_name || 'Destination'}</p>
                <button onClick={() => acceptTransport(t.id)} data-testid={`accept-transport-${t.id}`} className="w-full mt-3 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold">Accepter le transport</button>
              </div>
            ))}
            {availFood.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`avail-food-${o.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ForkKnife size={18} weight="duotone" className="text-orange-500" />
                  <span className="font-bold text-sm truncate">{o.merchant?.name || 'Restaurant'}</span>
                  {o.delivery_speed === 'express' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700" data-testid={`badge-express-${o.id}`}>⚡ EXPRESS</span>}
                  {o.delivery_speed === 'priority' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700" data-testid={`badge-priority-${o.id}`}>⭐ PRIORITAIRE</span>}
                  {o.grouped && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700" data-testid={`badge-grouped-${o.id}`}>🌱 LOT GROUPÉ</span>}
                  <span className="ml-auto font-bold text-[#FF5000]">{o.earning?.toFixed?.(2) ?? o.earning} €</span>
                </div>
                <p className="text-xs text-gray-500 truncate"><MapPin size={11} className="inline text-green-500" /> {o.merchant?.address || 'Restaurant'}</p>
                <p className="text-xs text-gray-500 truncate"><FlagCheckered size={11} className="inline text-red-500" /> {o.delivery_address}</p>
                <p className="text-xs text-gray-400">{o.items_count} article(s) · Total {o.total?.toFixed?.(2) ?? o.total} €</p>
                <button onClick={() => claimFood(o.id)} data-testid={`accept-food-${o.id}`} className="w-full mt-3 bg-[#FF5000] text-white py-2.5 rounded-xl text-sm font-semibold">Accepter la livraison</button>
              </div>
            ))}
          </>
        )}
        {!loading && tab === 'active' && (
          <>
            {activeCount === 0 && <p className="text-center text-gray-400 py-10" data-testid="no-active">Aucune mission en cours.</p>}
            {activeParcels.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`active-parcel-${p.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Package size={18} weight="duotone" className="text-teal-500" />
                  <span className="font-bold text-sm">Colis {p.delivery_mode === 'multi' ? `· ${p.stops?.length} dépôts` : ''}</span>
                  <span className="ml-auto"><StatusBadge label={PARCEL_LABEL[p.status]} /></span>
                </div>
                {/* advance overall status until picked_up */}
                {PARCEL_NEXT[p.status] && (
                  <button onClick={() => advanceParcel(p.id, PARCEL_NEXT[p.status])} data-testid={`parcel-advance-${p.id}`}
                    className="w-full mb-3 bg-[#0B1426] text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                    {PARCEL_NEXT_LABEL[p.status]} <CaretRight size={15} />
                  </button>
                )}
                {/* per-leg delivery after picked up / in transit */}
                {['picked_up', 'in_transit'].includes(p.status) && (
                  <div className="space-y-2" data-testid={`parcel-legs-${p.id}`}>
                    {(p.legs || []).map((leg) => {
                      const phone = p.stops?.[leg.index]?.recipient_phone;
                      return (
                        <div key={leg.index} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2">
                          <span className="text-xs text-gray-700"><FlagCheckered size={12} className="inline text-red-500" /> Dépôt {leg.index + 1}{leg.recipient_name ? ` · ${leg.recipient_name}` : ''}</span>
                          <div className="flex items-center gap-2">
                            {phone && leg.status !== 'delivered' && (
                              <a href={`tel:${phone}`} data-testid={`call-recipient-${p.id}-${leg.index}`} className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center" title="Appeler le destinataire"><Phone size={15} weight="fill" /></a>
                            )}
                            {leg.status === 'delivered' ? (
                              <span className="text-[11px] font-bold text-green-600 flex items-center gap-1"><CheckCircle size={14} weight="fill" /> Livré</span>
                            ) : (
                              <button onClick={() => deliverLeg(p.id, leg.index)} data-testid={`deliver-leg-${p.id}-${leg.index}`} className="text-[11px] font-bold text-white bg-green-600 px-3 py-1.5 rounded-lg">Marquer livré</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {activeTransports.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`active-transport-${t.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <FirstAid size={18} weight="duotone" className="text-red-500" />
                  <span className="font-bold text-sm">{t.ambulance_name}</span>
                  <span className="ml-auto"><StatusBadge label={MEDTR_LABEL[t.status]} /></span>
                </div>
                <p className="text-xs text-gray-500 mb-3">Patient : {t.patient_name || '—'} → {t.destination_name || 'Destination'}</p>
                {t.patient_phone && (
                  <a href={`tel:${t.patient_phone}`} data-testid={`call-patient-${t.id}`} className="w-full mb-2 flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 py-2.5 rounded-xl text-sm font-semibold">
                    <Phone size={15} weight="fill" /> Appeler le patient
                  </a>
                )}
                {MEDTR_NEXT[t.status] && (
                  <button onClick={() => advanceTransport(t.id, MEDTR_NEXT[t.status])} data-testid={`transport-advance-${t.id}`}
                    className="w-full bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                    {MEDTR_NEXT_LABEL[t.status]} <CaretRight size={15} />
                  </button>
                )}
              </div>
            ))}
            {activeFood.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`active-food-${o.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ForkKnife size={18} weight="duotone" className="text-orange-500" />
                  <span className="font-bold text-sm truncate">{o.merchant_name || 'Restaurant'}</span>
                  <span className="ml-auto"><StatusBadge label={FOOD_LABEL[o.status] || o.status} /></span>
                </div>
                <p className="text-xs text-gray-500 truncate"><MapPin size={11} className="inline text-green-500" /> {o.merchant_address || 'Restaurant'}</p>
                <p className="text-xs text-gray-500 mb-3 truncate"><FlagCheckered size={11} className="inline text-red-500" /> {o.delivery_address}</p>
                {FOOD_NEXT[o.status] ? (
                  <button onClick={() => advanceFood(o.id, FOOD_NEXT[o.status])} data-testid={`food-advance-${o.id}`}
                    className="w-full bg-[#0B1426] text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                    {FOOD_NEXT_LABEL[o.status]} <CaretRight size={15} />
                  </button>
                ) : (
                  <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-2" data-testid={`food-waiting-${o.id}`}>
                    En attente de préparation par le restaurant…
                  </p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default DeliveryJobsPage;
