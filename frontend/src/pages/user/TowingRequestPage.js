/**
 * TowingRequestPage — modern on-demand roadside assistance & towing.
 * Flow: problem type → location + vehicle + payment (live price) → request →
 * live tracking (simulated dispatch) → complete (wallet debit at completion).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Truck, Wrench, Lightning, GasPump, Key, SteeringWheel, Warning,
  MapPin, Crosshair, Phone, CheckCircle, Clock, ClockCounterClockwise, ShieldCheck, Star,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import TowingMap from '../../components/TowingMap';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;

const ICONS = { battery: Lightning, tire: Wrench, fuel: GasPump, lockout: Key, nostart: SteeringWheel, towing: Truck, accident: Warning };
const RED = '#EF4444';
const PAYMENTS = [
  { k: 'sbpay', l: 'SB Pay' },
  { k: 'cash', l: 'Espèces' },
  { k: 'card', l: 'Carte' },
];

const haversine = (a, b) => {
  if (!a || !b) return 0;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const TIMELINE = [
  { key: 'searching', label: 'Recherche d\'un dépanneur' },
  { key: 'en_route', label: 'Dépanneur en route' },
  { key: 'arrived', label: 'Dépanneur sur place' },
  { key: 'completed', label: 'Intervention terminée' },
];
const stepIndex = (s) => ({ searching: 0, en_route: 1, arrived: 2, completed: 3 }[s] ?? 0);

const TowingRequestPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [problemTypes, setProblemTypes] = useState([]);
  const [step, setStep] = useState('problem');
  const [problem, setProblem] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [dest, setDest] = useState(null);
  const [vehicle, setVehicle] = useState({ make: '', model: '', plate: '' });
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState('sbpay');
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/towing/problem-types`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => setProblemTypes(d.problem_types || [])).catch(() => {});
  }, []);

  const needsDest = !!problem?.needs_destination;
  const distanceKm = needsDest && pickup && dest ? Number(haversine(pickup, dest).toFixed(1)) : 0;

  // Live estimate
  const fetchEstimate = useCallback(async () => {
    if (!problem) return;
    try {
      const r = await fetch(`${API}/api/towing/estimate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ problem_type: problem.id, distance_km: distanceKm }),
      });
      if (r.ok) setEstimate(await r.json());
    } catch { /* ignore */ }
  }, [problem, distanceKm]);
  useEffect(() => { if (step === 'details') fetchEstimate(); }, [step, fetchEstimate]);

  const useMyPosition = () => {
    if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPickup({ address: 'Ma position actuelle', lat: pos.coords.latitude, lng: pos.coords.longitude }); toast.success('Position localisée'); },
      () => toast.error('Impossible de vous localiser'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const submit = async () => {
    if (!pickup) { toast.error('Indiquez la position de votre véhicule'); return; }
    if (needsDest && !dest) { toast.error('Indiquez la destination (garage)'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/towing/requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          problem_type: problem.id,
          pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
          dest_address: dest?.address, dest_lat: dest?.lat, dest_lng: dest?.lng,
          vehicle_make: vehicle.make, vehicle_model: vehicle.model, vehicle_plate: vehicle.plate,
          notes, payment_method: payment,
        }),
      });
      const data = await r.json();
      if (r.ok) { setRequest(data); setStep('tracking'); }
      else toast.error(data.detail || 'Échec de la demande');
    } catch { toast.error('Erreur réseau'); }
    finally { setSubmitting(false); }
  };

  // Poll the request while tracking
  useEffect(() => {
    if (step !== 'tracking' || !request) return;
    const poll = async () => {
      try {
        const r = await fetch(`${API}/api/towing/requests/${request.id}`, { credentials: 'include' });
        if (r.ok) setRequest(await r.json());
      } catch { /* ignore */ }
    };
    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [step, request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = async () => {
    setCompleting(true);
    try {
      const r = await fetch(`${API}/api/towing/requests/${request.id}/complete`, { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (r.ok) { clearInterval(pollRef.current); setDone({ ...request, total: data.total }); setStep('done'); }
      else toast.error(data.detail || 'Échec');
    } catch { toast.error('Erreur réseau'); }
    finally { setCompleting(false); }
  };

  const cancel = async () => {
    try {
      await fetch(`${API}/api/towing/requests/${request.id}/cancel`, { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    clearInterval(pollRef.current);
    resetFlow();
  };

  const resetFlow = () => {
    setStep('problem'); setProblem(null); setPickup(null); setDest(null);
    setVehicle({ make: '', model: '', plate: '' }); setNotes(''); setEstimate(null); setRequest(null); setDone(null);
  };

  const openHistory = async () => {
    setShowHistory(true);
    try {
      const r = await fetch(`${API}/api/towing/requests`, { credentials: 'include' });
      const d = await r.json();
      setHistory(Array.isArray(d) ? d : []);
    } catch { setHistory([]); }
  };

  // ── History ──
  if (showHistory) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="towing-history">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={() => setShowHistory(false)} data-testid="back-from-history"><ArrowLeft size={22} /></button>
          <h1 className="text-base font-bold">Mes dépannages</h1>
        </div>
        <div className="p-4 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-16 text-gray-400" data-testid="towing-history-empty">
              <ClockCounterClockwise size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Aucun dépannage</p>
            </div>
          ) : history.map((h) => {
            const Ic = ICONS[h.problem_type] || Truck;
            return (
              <div key={h.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`towing-history-${h.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Ic size={20} className="text-red-500" weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{h.problem_label}</p>
                    <p className="text-xs text-gray-500 truncate">{h.pickup_address}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{h.created_at ? new Date(h.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''} · {h.status === 'completed' ? 'Terminé' : h.status === 'cancelled' ? 'Annulé' : 'En cours'}</p>
                  </div>
                  <span className="font-bold text-gray-900 text-sm">{money(Number(h.total_price))}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Done ──
  if (step === 'done' && done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center" data-testid="towing-done">
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-5">
          <CheckCircle size={48} weight="fill" className="text-green-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Intervention terminée !</h1>
        <p className="text-sm text-gray-500 mt-2">Votre dépannage « {done.problem_label} » est terminé. Merci d'avoir utilisé SB Dépannage.</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full mt-5 flex justify-between text-sm">
          <span className="text-gray-500">Total payé</span>
          <span className="font-bold text-gray-900">{money(Number(done.total))}</span>
        </div>
        <button onClick={resetFlow} className="w-full mt-5 bg-red-500 text-white py-3.5 rounded-xl font-semibold text-sm" data-testid="towing-done-new">
          Nouvelle demande
        </button>
        <button onClick={() => navigate('/home')} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="towing-done-home">
          Retour à l'accueil
        </button>
      </div>
    );
  }

  // ── Tracking ──
  if (step === 'tracking' && request) {
    const live = request.live || {};
    const idx = stepIndex(request.status);
    const op = request.operator || {};
    const pickupPt = { lat: request.pickup_lat, lng: request.pickup_lng };
    const opPos = live.operator_position;
    const arrived = request.status === 'arrived';
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="towing-tracking">
        <div className="bg-red-500 px-4 pt-4 pb-4 flex items-center gap-3">
          <button onClick={cancel} className="text-white" data-testid="towing-cancel-btn"><ArrowLeft size={22} /></button>
          <div>
            <h1 className="text-base font-bold text-white">{request.problem_label}</h1>
            <p className="text-xs text-white/80">{request.status === 'searching' ? 'Recherche en cours…' : arrived ? 'Dépanneur sur place' : `Arrivée dans ~${live.eta_minutes} min`}</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <TowingMap pickup={pickupPt} operator={opPos} height={240} />

          {/* Timeline */}
          <div className="bg-white rounded-2xl p-4" data-testid="towing-timeline">
            {TIMELINE.map((t, i) => {
              const active = i <= idx;
              return (
                <div key={t.key} className="flex items-center gap-3 py-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-300'}`}>
                    {active ? <CheckCircle size={16} weight="fill" /> : <Clock size={14} />}
                  </div>
                  <span className={`text-sm ${active ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{t.label}</span>
                  {i === 1 && request.status === 'en_route' && <span className="ml-auto text-xs font-bold text-red-500">~{live.eta_minutes} min</span>}
                </div>
              );
            })}
          </div>

          {/* Operator card */}
          {request.status !== 'searching' && (
            <div className="bg-white rounded-2xl p-4" data-testid="towing-operator-card">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Truck size={24} className="text-blue-600" weight="fill" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{op.name}</p>
                  <p className="text-xs text-gray-500">{op.company} · {op.truck}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-xs"><Star size={12} weight="fill" className="text-amber-400" />{op.rating}</span>
                    <span className="text-[11px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{op.plate}</span>
                  </div>
                </div>
                <a href="tel:+33800111222" className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0" data-testid="towing-call-operator">
                  <Phone size={18} weight="fill" className="text-white" />
                </a>
              </div>
            </div>
          )}

          {/* Vehicle + total recap */}
          <div className="bg-white rounded-2xl p-4 space-y-2 text-sm" data-testid="towing-recap">
            <div className="flex justify-between"><span className="text-gray-500">Véhicule</span><span className="font-semibold text-gray-900">{[request.vehicle?.make, request.vehicle?.model, request.vehicle?.plate].filter(Boolean).join(' · ') || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total estimé</span><span className="font-bold text-gray-900">{money(Number(request.total_price))}</span></div>
          </div>

          <a href="tel:112" className="flex items-center justify-center gap-2 text-red-600 text-sm font-semibold py-2" data-testid="towing-sos">
            <Warning size={18} weight="fill" /> Appel d'urgence (112)
          </a>
        </div>

        {/* Sticky complete CTA */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={complete} disabled={!arrived || completing}
            className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-50 bg-red-500"
            data-testid="towing-complete-btn">
            {completing ? 'Validation…' : arrived ? `Intervention terminée · ${Number(request.total_price).toFixed(2)}€` : 'En attente du dépanneur…'}
          </button>
        </div>
      </div>
    );
  }

  // ── Details ──
  if (step === 'details' && problem) {
    const Ic = ICONS[problem.id] || Truck;
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="towing-details">
        <div className="bg-red-500 px-4 pt-4 pb-4 flex items-center gap-3">
          <button onClick={() => setStep('problem')} className="text-white" data-testid="back-to-problem"><ArrowLeft size={22} /></button>
          <div className="flex items-center gap-2 text-white">
            <Ic size={24} weight="fill" />
            <h1 className="text-base font-bold">{problem.label}</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Location */}
          <div className="bg-white rounded-2xl p-4 space-y-2" data-testid="towing-location-block">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Où est votre véhicule ?</p>
            <GooglePlacesInput placeholder="Adresse du véhicule" value={pickup?.address || ''} testId="towing-pickup-input"
              onSelect={(r) => setPickup({ address: r.address, lat: r.lat, lng: r.lng })} />
            <button onClick={useMyPosition} className="flex items-center gap-1.5 text-xs font-semibold text-red-600" data-testid="towing-my-position">
              <Crosshair size={15} /> Utiliser ma position actuelle
            </button>
          </div>

          {/* Destination (towing only) */}
          {needsDest && (
            <div className="bg-white rounded-2xl p-4 space-y-2" data-testid="towing-dest-block">
              <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Destination (garage)</p>
              <GooglePlacesInput placeholder="Adresse du garage / destination" value={dest?.address || ''} testId="towing-dest-input"
                onSelect={(r) => setDest({ address: r.address, lat: r.lat, lng: r.lng })} />
              {distanceKm > 0 && <p className="text-xs text-gray-500">Distance estimée : <b>{distanceKm} km</b></p>}
            </div>
          )}

          {/* Vehicle */}
          <div className="bg-white rounded-2xl p-4 space-y-2" data-testid="towing-vehicle-block">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Votre véhicule</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} placeholder="Marque" className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="vehicle-make" />
              <input value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} placeholder="Modèle" className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="vehicle-model" />
            </div>
            <input value={vehicle.plate} onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value.toUpperCase() })} placeholder="Plaque d'immatriculation" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="vehicle-plate" />
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl p-4" data-testid="towing-notes-block">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Précisions (optionnel) : modèle exact, situation…" className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none h-20" data-testid="towing-notes" />
          </div>

          {/* Payment */}
          <div className="bg-white rounded-2xl p-4" data-testid="towing-payment-block">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Paiement (à la fin de l'intervention)</p>
            <div className="flex gap-2">
              {PAYMENTS.map((pm) => (
                <button key={pm.k} onClick={() => setPayment(pm.k)} data-testid={`payment-${pm.k}`}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold ${payment === pm.k ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {pm.l}
                </button>
              ))}
            </div>
          </div>

          {/* Estimate */}
          {estimate && (
            <div className="bg-[#0B1426] text-white rounded-2xl p-4" data-testid="towing-estimate">
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/70 space-y-0.5">
                  <p>Forfait {problem.label} : {money(estimate.base_fee)}</p>
                  {estimate.distance_fee > 0 && <p>Remorquage {estimate.distance_km} km : {money(estimate.distance_fee)}</p>}
                  {estimate.is_night && <p className="text-amber-300">Majoration nuit (+30%) : {money(estimate.night_surcharge)}</p>}
                </div>
                <p className="text-3xl font-black" data-testid="towing-estimate-total">{money(estimate.total)}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <ShieldCheck size={16} className="text-green-500" />
            <span>Dépanneurs partenaires vérifiés · disponibles 24/7</span>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={submit} disabled={submitting}
            className="w-full py-4 rounded-xl font-bold text-white bg-red-500 disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="towing-request-btn">
            <Lightning size={20} weight="fill" /> {submitting ? 'Envoi…' : 'Demander un dépanneur'}
          </button>
        </div>
      </div>
    );
  }

  // ── Problem selection (default) ──
  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="towing-page">
      <div className="bg-gradient-to-br from-red-500 to-red-600 px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">Dépannage & Remorquage</h1>
          <button onClick={openHistory} className="text-white flex items-center gap-1.5 text-xs font-medium bg-white/15 px-3 py-1.5 rounded-full" data-testid="open-history-btn">
            <ClockCounterClockwise size={16} /> Historique
          </button>
        </div>
        <p className="text-sm text-white/85">Assistance routière 24/7 — un dépanneur arrive vers vous</p>
      </div>

      <div className="p-4">
        <p className="text-sm font-bold text-gray-700 mb-3">Quel est votre problème ?</p>
        <div className="grid grid-cols-2 gap-3" data-testid="problem-grid">
          {problemTypes.map((p) => {
            const Ic = ICONS[p.id] || Truck;
            return (
              <button key={p.id} onClick={() => { setProblem(p); setStep('details'); }}
                className="bg-white rounded-2xl p-4 border border-gray-100 text-left hover:border-red-300 hover:shadow-md transition-all"
                data-testid={`problem-${p.id}`}>
                <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-3">
                  <Ic size={24} className="text-red-500" weight="fill" />
                </div>
                <p className="font-bold text-gray-900 text-sm leading-tight">{p.label}</p>
                <p className="text-xs text-gray-500 mt-1">dès {Number(p.base_fee).toFixed(0)}€</p>
              </button>
            );
          })}
        </div>

        <button onClick={() => navigate('/towing-partners')} className="w-full mt-5 text-center text-sm font-semibold text-gray-500 py-3" data-testid="towing-directory-link">
          Voir l'annuaire des dépanneurs partenaires →
        </button>
      </div>
    </div>
  );
};

export default TowingRequestPage;
