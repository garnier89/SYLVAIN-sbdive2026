/**
 * TransportPublicPage — brique "Transports publics" (données simulées).
 *
 * Accessible depuis la liste complète des taxis (TaxiModeGrid). Affiche les
 * arrêts proches, les lignes (bus / tram / BRT / ferry) et les prochains
 * passages, avec un bouton de bascule "Continuer en VTC" (cross-sell).
 *
 * ⚠️ Données SIMULÉES tant que la clé Navitia/GTFS n'est pas branchée.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Bus, Train, Boat, MapPin, NavigationArrow, Clock,
  Lightning, ArrowsClockwise, CaretRight, Ticket, CarProfile, Scales, PersonSimpleWalk,
} from '@phosphor-icons/react';
import { transportAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import JourneyMap from './transport/JourneyMap';

const API = process.env.REACT_APP_BACKEND_URL;

const MODE_ICON = { bus: Bus, tram: Train, brt: Bus, metro: Train, ferry: Boat };
const MODE_LABEL = { bus: 'Bus', tram: 'Tram', brt: 'BRT', metro: 'Métro', ferry: 'Navette' };

const localMins = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const etaLabel = (m) => (m <= 0 ? "à l'instant" : m === 1 ? 'dans 1 min' : `dans ${m} min`);

const TransportPublicPage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [now, setNow] = useState('');
  const [coords, setCoords] = useState(null);
  const [compare, setCompare] = useState({}); // line_id -> { loading, open, data }
  // Journey planner (origin → destination, with transfers)
  const [jFrom, setJFrom] = useState(null);
  const [jTo, setJTo] = useState(null);
  const [journey, setJourney] = useState(null); // { loading, plan, vtc }

  const fetchNearby = useCallback(async (lat, lng) => {
    setLoading(true);
    try {
      const r = await transportAPI.nearby({ lat, lng, mins: localMins() });
      setStops(r.data.stops || []);
      setFallback(!!r.data.fallback);
      setNow(r.data.now || '');
    } catch (e) {
      toast.error('Impossible de charger les transports proches');
    } finally {
      setLoading(false);
    }
  }, []);

  const locate = useCallback((announce = false) => {
    if (!navigator.geolocation) { fetchNearby(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setJFrom((prev) => prev || { address: 'Ma position actuelle', lat: latitude, lng: longitude });
        fetchNearby(latitude, longitude);
        if (announce) toast.success('Position actualisée');
      },
      () => { fetchNearby(); if (announce) toast.error('Localisation indisponible'); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, [fetchNearby]);

  useEffect(() => { locate(false); }, [locate]);

  // Bus vs VTC — fetch a VTC estimate for the line's trip (this stop → terminus).
  const toggleCompare = useCallback(async (stop, ln) => {
    const cur = compare[ln.line_id];
    if (cur?.open) { setCompare((c) => ({ ...c, [ln.line_id]: { ...cur, open: false } })); return; }
    if (cur?.data !== undefined) { setCompare((c) => ({ ...c, [ln.line_id]: { ...cur, open: true } })); return; }
    setCompare((c) => ({ ...c, [ln.line_id]: { loading: true, open: true } }));
    try {
      const r = await fetch(`${API}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: stop.lat, pickup_lng: stop.lng, pickup_address: stop.name,
          dropoff_lat: ln.dest_lat, dropoff_lng: ln.dest_lng, dropoff_address: ln.destination,
          vehicle_type: 'sb', payment_method: 'cash',
        }),
      });
      const data = r.ok ? await r.json() : null;
      setCompare((c) => ({ ...c, [ln.line_id]: { loading: false, open: true, data } }));
    } catch (e) {
      setCompare((c) => ({ ...c, [ln.line_id]: { loading: false, open: true, data: null } }));
    }
  }, [compare]);

  // Journey planner: when both points are set, fetch the bus itinerary + VTC estimate.
  useEffect(() => {
    if (!jFrom?.lat || !jTo?.lat) { setJourney(null); return; }
    let cancelled = false;
    (async () => {
      setJourney({ loading: true });
      try {
        const [jr, est] = await Promise.all([
          transportAPI.journey({ from_lat: jFrom.lat, from_lng: jFrom.lng, to_lat: jTo.lat, to_lng: jTo.lng, mins: localMins() }),
          fetch(`${API}/api/rides/estimate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
              pickup_lat: jFrom.lat, pickup_lng: jFrom.lng, pickup_address: jFrom.address || 'Départ',
              dropoff_lat: jTo.lat, dropoff_lng: jTo.lng, dropoff_address: jTo.address || 'Destination',
              vehicle_type: 'sb', payment_method: 'cash',
            }),
          }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (cancelled) return;
        setJourney({ loading: false, plan: jr.data, vtc: est });
      } catch (e) {
        if (!cancelled) setJourney({ loading: false, plan: null, vtc: null });
      }
    })();
    return () => { cancelled = true; };
  }, [jFrom, jTo]);

  return (
    <div className="mobile-container min-h-screen bg-[#F8F9FA] pb-32" data-testid="transport-public-page">
      {/* Header */}
      <div className="bg-[#0B1426] text-white px-5 pt-12 pb-6">
        <button onClick={() => navigate(-1)} className="mb-4" data-testid="transport-back"><ArrowLeft size={24} /></button>
        <p className="text-xs tracking-[0.2em] uppercase font-bold text-[#FF5000]">SB Drive · Mobilité</p>
        <h1 className="text-3xl font-black tracking-tight mt-1">Transports publics</h1>
        <p className="text-sm text-white/60 mt-1">Arrêts proches & prochains passages{now ? ` · ${now}` : ''}</p>
        <div className="flex gap-2 mt-4">
          <button onClick={() => locate(true)} className="flex-1 bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold active:scale-[0.98] transition-transform" data-testid="transport-locate-btn">
            <NavigationArrow size={16} weight="fill" className="text-[#FF5000]" /> Ma position
          </button>
          <button onClick={() => fetchNearby(coords?.lat, coords?.lng)} className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-center" data-testid="transport-refresh-btn" title="Actualiser">
            <ArrowsClockwise size={16} />
          </button>
        </div>
      </div>

      <div className="px-5 -mt-3">
        {/* Journey planner — real trip (origin → destination) with transfers */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 mb-3 shadow-sm" data-testid="journey-planner">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
            <Scales size={13} className="text-[#3730A3]" /> Comparer un trajet (Bus vs VTC)
          </p>
          <div className="space-y-2">
            <div className="border-l-4 border-[#0B1426] pl-2">
              <label className="text-[10px] tracking-wide uppercase font-bold text-slate-500 flex items-center gap-1"><MapPin size={10} /> Départ</label>
              <GooglePlacesInput value={jFrom?.address || ''} onSelect={setJFrom} placeholder="Point de départ" testId="journey-from-input" />
            </div>
            <div className="border-l-4 border-[#FF5000] pl-2">
              <label className="text-[10px] tracking-wide uppercase font-bold text-slate-500 flex items-center gap-1"><MapPin size={10} className="text-[#FF5000]" /> Destination</label>
              <GooglePlacesInput value={jTo?.address || ''} onSelect={setJTo} placeholder="Où allez-vous ?" testId="journey-to-input" />
            </div>
          </div>

          {journey?.loading && (
            <div className="p-4 text-center"><div className="w-5 h-5 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
          )}

          {journey && !journey.loading && (() => {
            const plan = journey.plan;
            const vtc = journey.vtc;
            const busFound = plan?.found;
            const busMin = busFound ? plan.total_min : null;
            const vtcMin = vtc?.duration_mins;
            return (
              <div className="mt-3" data-testid="journey-result">
                <div className="grid grid-cols-2 divide-x divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] overflow-hidden">
                  <div className="p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#3730A3]"><Bus size={12} weight="duotone" /> Bus</div>
                    {busFound ? (
                      <>
                        <p className="text-base font-black text-[#0B1426] mt-1" data-testid="journey-bus-min">~{busMin} min</p>
                        <p className="text-[11px] font-bold text-[#0B1426]">{money(plan.total_fare)}</p>
                        <p className="text-[9px] text-slate-400">{plan.transfers === 0 ? 'direct' : `${plan.transfers} correspondance${plan.transfers > 1 ? 's' : ''}`}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-2">Aucun itinéraire</p>
                    )}
                  </div>
                  <div className="p-2.5 text-center bg-[#FFF6F1]">
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#FF5000]"><CarProfile size={12} weight="duotone" /> VTC</div>
                    {vtc ? (
                      <>
                        <p className="text-base font-black text-[#0B1426] mt-1">~{vtcMin} min</p>
                        <p className="text-[11px] font-bold text-[#0B1426]">{money(vtc.estimated_fare)}</p>
                        <p className="text-[9px] text-slate-400">porte à porte</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-2">—</p>
                    )}
                  </div>
                </div>

                {busFound && vtc && (
                  <div className="bg-[#0B1426] px-3 py-2 rounded-lg mt-2 flex items-center gap-2" data-testid="journey-verdict">
                    <Lightning size={13} weight="fill" className="text-[#FF5000] flex-shrink-0" />
                    <p className="text-[11px] text-white/90 leading-snug">
                      {busMin - vtcMin > 0
                        ? <>Le VTC vous fait gagner <span className="font-black text-[#FF5000]">~{busMin - vtcMin} min</span></>
                        : <>Le bus reste <span className="font-black text-emerald-400">{money(Math.max(0, vtc.estimated_fare - plan.total_fare))} moins cher</span></>}
                      {vtc.estimated_fare > plan.total_fare ? <> · surcoût VTC <span className="font-bold">{money(vtc.estimated_fare - plan.total_fare)}</span></> : null}
                    </p>
                  </div>
                )}

                {/* Bus itinerary legs */}
                {busFound && (
                  <JourneyMap plan={plan} />
                )}
                {busFound && (
                  <div className="mt-3 space-y-1.5" data-testid="journey-legs">
                    {plan.legs.map((leg, i) => (
                      <div key={i} className="flex items-center gap-2" data-testid={`journey-leg-${i}`}>
                        {leg.type === 'walk' ? (
                          <>
                            <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><PersonSimpleWalk size={15} className="text-slate-500" /></span>
                            <p className="text-[11px] text-slate-600 flex-1">Marche jusqu'à <span className="font-semibold">{leg.to}</span> · {leg.minutes} min</p>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-black text-white px-1.5 py-1 rounded-md flex-shrink-0 min-w-[30px] text-center" style={{ backgroundColor: leg.color }}>{leg.code}</span>
                            <p className="text-[11px] text-slate-600 flex-1"><span className="font-semibold text-[#0B1426]">{leg.from}</span> → <span className="font-semibold text-[#0B1426]">{leg.to}</span> · {leg.stops} arrêt{leg.stops > 1 ? 's' : ''} · {leg.minutes} min</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => navigate('/course?mode=standard')} data-testid="journey-book-vtc-btn"
                  className="w-full mt-3 py-2.5 text-xs font-black bg-[#FF5000] text-[#0B1426] rounded-lg active:scale-[0.99] transition-transform">
                  Réserver ce trajet en VTC →
                </button>
              </div>
            );
          })()}
        </div>

        {fallback && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3" data-testid="transport-fallback-note">
            <p className="text-xs text-amber-700">Aucun arrêt à proximité immédiate — affichage du réseau le plus proche.</p>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
        ) : stops.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 text-center" data-testid="transport-empty">
            <Bus size={36} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Aucun arrêt de transport public trouvé.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stops.map((s) => {
              const SIcon = MODE_ICON[s.type] || Bus;
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-[#E2E8F0] p-4 shadow-sm"
                  data-testid={`transport-stop-${s.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-[#EEF2FF] flex items-center justify-center flex-shrink-0">
                        <SIcon size={20} weight="duotone" className="text-[#3730A3]" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-[#0B1426] text-sm leading-tight truncate">{s.name}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <MapPin size={11} />
                          {s.distance_m != null ? `${s.distance_m} m` : (s.zone || '')}
                          {s.zone && s.distance_m != null ? ` · ${s.zone}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lines + departures */}
                  <div className="mt-3 space-y-2">
                    {(s.lines || []).length === 0 && (
                      <p className="text-xs text-slate-400">Pas de passage prévu pour le moment.</p>
                    )}
                    {(s.lines || []).map((ln) => {
                      const cmp = compare[ln.line_id];
                      const wait = ln.departures?.[0]?.eta_min ?? 0;
                      const busMin = wait + (ln.ride_min || 0);
                      const canCompare = ln.ride_min > 0 && ln.dest_lat != null && ln.dest_lng != null;
                      const vtc = cmp?.data;
                      return (
                      <div key={ln.line_id} className="py-2 border-t border-gray-100 first:border-t-0" data-testid={`transport-line-${ln.line_id}`}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] font-black text-white px-2 py-1 rounded-md flex-shrink-0 min-w-[34px] text-center" style={{ backgroundColor: ln.color }}>
                            {ln.code}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#0B1426] truncate">{ln.name}</p>
                            <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                              <CaretRight size={9} /> {ln.destination || MODE_LABEL[ln.mode] || ''}
                            </p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {(ln.departures || []).slice(0, 3).map((d, i) => (
                              <span key={i} data-testid={`transport-dep-${ln.line_id}-${i}`}
                                className={`text-[10px] font-bold px-1.5 py-1 rounded-md ${i === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}
                                title={etaLabel(d.eta_min)}>
                                <Clock size={9} className="inline mr-0.5" weight="bold" />{d.eta_min <= 0 ? 'now' : `${d.eta_min}′`}
                              </span>
                            ))}
                            {(ln.departures || []).length === 0 && (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </div>
                        </div>

                        {/* Fare + compare trigger */}
                        <div className="flex items-center justify-between mt-1.5 pl-[44px]">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B1426] bg-amber-50 px-2 py-0.5 rounded-md" data-testid={`transport-fare-${ln.line_id}`}>
                            <Ticket size={11} weight="fill" className="text-amber-500" /> Ticket {money(ln.fare)}
                          </span>
                          {canCompare && (
                            <button onClick={() => toggleCompare(s, ln)} data-testid={`compare-vtc-${ln.line_id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3730A3] active:scale-95 transition-transform">
                              <Scales size={12} weight="bold" /> {cmp?.open ? 'Masquer' : 'Bus vs VTC'}
                            </button>
                          )}
                        </div>

                        {/* Comparison card */}
                        {cmp?.open && (
                          <div className="mt-2 ml-[44px] rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid={`comparison-${ln.line_id}`}>
                            {cmp.loading ? (
                              <div className="p-3 text-center"><div className="w-4 h-4 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
                            ) : !vtc ? (
                              <p className="p-3 text-[11px] text-slate-400 text-center">Comparaison indisponible pour le moment.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 divide-x divide-[#E2E8F0]">
                                  <div className="p-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#3730A3]"><Bus size={12} weight="duotone" /> Bus</div>
                                    <p className="text-sm font-black text-[#0B1426] mt-1">~{busMin} min</p>
                                    <p className="text-[11px] font-bold text-[#0B1426]">{money(ln.fare)}</p>
                                    <p className="text-[9px] text-slate-400">{wait > 0 ? `${wait} min d'attente` : 'départ imminent'}</p>
                                  </div>
                                  <div className="p-2.5 text-center bg-[#FFF6F1]">
                                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#FF5000]"><CarProfile size={12} weight="duotone" /> VTC</div>
                                    <p className="text-sm font-black text-[#0B1426] mt-1">~{vtc.duration_mins} min</p>
                                    <p className="text-[11px] font-bold text-[#0B1426]">{money(vtc.estimated_fare)}</p>
                                    <p className="text-[9px] text-slate-400">porte à porte</p>
                                  </div>
                                </div>
                                <div className="bg-[#0B1426] px-3 py-2 flex items-center gap-2" data-testid={`verdict-${ln.line_id}`}>
                                  <Lightning size={13} weight="fill" className="text-[#FF5000] flex-shrink-0" />
                                  <p className="text-[11px] text-white/90 leading-snug">
                                    {busMin - vtc.duration_mins > 0
                                      ? <>Le VTC vous fait gagner <span className="font-black text-[#FF5000]">~{busMin - vtc.duration_mins} min</span></>
                                      : <>Le bus reste <span className="font-black text-emerald-400">{money(Math.max(0, vtc.estimated_fare - ln.fare))} moins cher</span></>}
                                    {vtc.estimated_fare > ln.fare ? <> · surcoût VTC <span className="font-bold">{money(vtc.estimated_fare - ln.fare)}</span></> : null}
                                  </p>
                                </div>
                                <button onClick={() => navigate('/course?mode=standard')} data-testid={`book-vtc-${ln.line_id}`}
                                  className="w-full py-2 text-[11px] font-black bg-[#FF5000] text-[#0B1426] active:scale-[0.99] transition-transform">
                                  Réserver ce trajet en VTC →
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky cross-sell CTA — Continuer en VTC */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-[#E2E8F0] p-4">
        <button
          onClick={() => navigate('/course?mode=standard')}
          data-testid="continue-vtc-btn"
          className="w-full py-4 font-black text-lg flex items-center justify-center gap-2 rounded-xl active:scale-[0.98] transition-transform"
          style={{ backgroundColor: '#FF5000', color: '#0B1426' }}>
          <Lightning size={20} weight="fill" /> Continuer en VTC
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-2">Horaires simulés à des fins de démonstration.</p>
      </div>
    </div>
  );
};

export default TransportPublicPage;
