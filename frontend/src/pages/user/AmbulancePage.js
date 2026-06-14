/**
 * AmbulancePage — SB Urgences (/urgences).
 * One-tap emergency: type d'urgence + position → ambulance dispatchée
 * immédiatement (dispatch simulé) → suivi temps réel (carte + ETA) → clôturé.
 * Numéros d'urgence (15 / 112 / 18) mis en avant. Aucun débit (prise en charge).
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Phone, MapPin, CheckCircle, Clock, CircleNotch, ClockCounterClockwise,
  Heartbeat, Wind, Pulse, Brain, Warning, Drop, Fire, FirstAid, Ambulance, Crosshair, Wallet, Money,
} from '@phosphor-icons/react';
import AmbulanceMap from '../../components/AmbulanceMap';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const AMB = `${API}/api/ambulance`;
const TYPE_ICON = { cardiac: Heartbeat, breathing: Wind, unconscious: Pulse, brain: Brain, stroke: Brain, accident: Warning, bleeding: Drop, burn: Fire, other: FirstAid };
const TIMELINE = [
  { key: 'received', label: 'Demande reçue' },
  { key: 'en_route', label: 'Ambulance en route' },
  { key: 'arrived', label: 'Équipe sur place' },
];
const stepIndex = (s) => (s === 'searching' ? 0 : s === 'arrived' || s === 'completed' ? 2 : 1);

const AmbulancePage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState({ emergency_types: [], emergency_numbers: [] });
  const [step, setStep] = useState('form'); // form | tracking | done | history
  const [etype, setEtype] = useState('');
  const [pickup, setPickup] = useState({ address: '', lat: null, lng: null });
  const [patient, setPatient] = useState({ name: '', phone: '', symptoms: '' });
  const [payment, setPayment] = useState('sbpay');
  const [notifyContacts, setNotifyContacts] = useState(true);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [history, setHistory] = useState([]);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch(`${AMB}/emergency-types`).then(r => r.json()).then(setCfg).catch(() => {});
  }, []);

  const locate = () => {
    if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPickup({ address: 'Ma position actuelle', lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); toast.success('Position localisée'); },
      () => { setLocating(false); toast.error('Impossible de vous localiser'); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submit = async () => {
    if (!etype) { toast.error("Sélectionnez le type d'urgence"); return; }
    if (pickup.lat === null) { toast.error('Partagez votre position'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${AMB}/requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          emergency_type: etype, pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          patient_name: patient.name, patient_phone: patient.phone, symptoms: patient.symptoms, payment_method: payment,
          notify_contacts: notifyContacts,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setRequest(d); setStep('tracking');
        if (notifyContacts && d.family_notified > 0) toast.success(`${d.family_notified} proche(s) prévenu(s) avec votre position`);
      } else toast.error(d.detail || 'Échec de la demande');
    } catch { toast.error('Erreur réseau'); } finally { setSubmitting(false); }
  };

  // Poll live state while tracking.
  useEffect(() => {
    if (step !== 'tracking' || !request) return;
    const poll = async () => {
      try {
        const r = await fetch(`${AMB}/requests/${request.id}`, { credentials: 'include' });
        if (r.ok) setRequest(await r.json());
      } catch { /* */ }
    };
    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [step, request?.id]);

  const complete = async () => {
    setCompleting(true);
    try {
      const r = await fetch(`${AMB}/requests/${request.id}/complete`, { method: 'POST', credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        clearInterval(pollRef.current);
        if (d.balance != null) toast.success(`Intervention réglée · solde ${money(Number(d.balance))}`);
        setStep('done');
      } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); } finally { setCompleting(false); }
  };
  const cancel = async () => {
    clearInterval(pollRef.current);
    try { await fetch(`${AMB}/requests/${request.id}/cancel`, { method: 'POST', credentials: 'include' }); } catch { /* */ }
    setRequest(null); setStep('form');
  };
  const openHistory = async () => {
    setStep('history');
    try { const r = await fetch(`${AMB}/requests`, { credentials: 'include' }); setHistory(await r.json()); } catch { /* */ }
  };

  // ── Done ──
  if (step === 'done') {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center" data-testid="ambulance-done">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5"><CheckCircle size={48} weight="fill" className="text-emerald-500" /></div>
        <h1 className="text-xl font-bold text-gray-900">Prise en charge terminée</h1>
        <p className="text-sm text-gray-500 mt-2">L'équipe médicale a pris en charge le patient. Prenez soin de vous.</p>
        <button onClick={() => { setRequest(null); setEtype(''); setStep('form'); }} className="w-full mt-6 bg-red-500 text-white py-3.5 rounded-xl font-semibold text-sm" data-testid="done-back">Retour</button>
        <button onClick={openHistory} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="done-history">Voir mes urgences</button>
      </div>
    );
  }

  // ── History ──
  if (step === 'history') {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="ambulance-history">
        <Header title="Mes urgences" onBack={() => setStep('form')} />
        <div className="p-4 space-y-3">
          {history.length === 0 ? <Empty text="Aucune demande d'urgence" /> : history.map(o => (
            <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`amb-hist-${o.id}`}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900 text-sm">{o.emergency_label}</p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${o.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : o.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
                  {o.status === 'completed' ? 'Terminé' : o.status === 'cancelled' ? 'Annulé' : 'En cours'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{o.crew?.name} · {o.crew?.vehicle}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Tracking ──
  if (step === 'tracking' && request) {
    const live = request.live || {};
    const idx = stepIndex(request.status);
    const crew = request.crew || {};
    const pickupPt = { lat: request.pickup_lat, lng: request.pickup_lng };
    const ambPos = live.ambulance_position;
    const arrived = request.status === 'arrived';
    const searching = request.status === 'searching';
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="ambulance-tracking">
        <div className="bg-red-600 px-4 pt-4 pb-4 flex items-center gap-3">
          <button onClick={cancel} className="text-white" data-testid="ambulance-cancel-btn"><ArrowLeft size={22} /></button>
          <div>
            <h1 className="text-base font-bold text-white">{request.emergency_label}</h1>
            <p className="text-xs text-white/80" data-testid="ambulance-eta">{searching ? 'Recherche d\'une ambulance…' : arrived ? 'Équipe sur place' : `Ambulance en route · ~${live.eta_minutes} min`}</p>
          </div>
        </div>

        {/* Emergency call bar */}
        <a href="tel:15" className="flex items-center justify-center gap-2 bg-red-700 text-white text-sm font-bold py-2.5 active:bg-red-800" data-testid="ambulance-call-15">
          <Phone size={18} weight="fill" className="animate-pulse" /> Urgence vitale ? Appelez le 15 (SAMU) · 112
        </a>

        <div className="p-4 space-y-4">
          <AmbulanceMap pickup={pickupPt} ambulance={ambPos} height={240} />

          {/* Timeline */}
          <div className="bg-white rounded-2xl p-4" data-testid="ambulance-timeline">
            {TIMELINE.map((t, i) => {
              const active = i <= idx;
              return (
                <div key={t.key} className="flex items-center gap-3 py-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-300'}`}>
                    {active ? <CheckCircle size={16} weight="fill" /> : <Clock size={14} />}
                  </div>
                  <span className={`text-sm ${active ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{t.label}</span>
                  {i === 1 && !arrived && !searching && <span className="ml-auto text-xs font-bold text-red-500">~{live.eta_minutes} min</span>}
                </div>
              );
            })}
          </div>

          {/* Crew card */}
          {searching ? (
            <div className="bg-white rounded-2xl p-5 flex items-center gap-3" data-testid="ambulance-searching">
              <CircleNotch size={22} className="animate-spin text-red-500" />
              <p className="text-sm text-gray-600">Nous cherchons une ambulance disponible près de vous…</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4" data-testid="ambulance-crew-card">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Ambulance size={24} className="text-emerald-600" weight="fill" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{crew.name}</p>
                  <p className="text-xs text-gray-500">{crew.company} · {crew.vehicle}</p>
                  <span className="text-[11px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-1">{crew.plate}</span>
                </div>
                <a href="tel:15" className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0" data-testid="ambulance-call-crew">
                  <Phone size={18} weight="fill" className="text-white" />
                </a>
              </div>
            </div>
          )}

          {/* Patient recap */}
          <div className="bg-white rounded-2xl p-4 space-y-2 text-sm" data-testid="ambulance-recap">
            <div className="flex justify-between"><span className="text-gray-500">Patient</span><span className="font-semibold text-gray-900">{request.patient_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Position</span><span className="font-semibold text-gray-900 truncate ml-2">{request.pickup_address || `${pickupPt.lat?.toFixed(4)}, ${pickupPt.lng?.toFixed(4)}`}</span></div>
            {request.symptoms && <div className="flex justify-between"><span className="text-gray-500">Symptômes</span><span className="font-semibold text-gray-900 truncate ml-2">{request.symptoms}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Frais d'intervention ({request.payment_method === 'cash' ? 'espèces' : 'SB Pay'})</span><span className="font-bold text-gray-900" data-testid="ambulance-total">{money(Number(request.total_price))}</span></div>
          </div>
        </div>

        {/* Sticky complete CTA */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={complete} disabled={!arrived || completing}
            className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-50 bg-red-500" data-testid="ambulance-complete-btn">
            {completing ? 'Validation…' : arrived ? `Patient pris en charge — clôturer · ${money(Number(request.total_price))}` : 'En attente de l\'ambulance…'}
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="ambulance-page">
      <div className="bg-gradient-to-br from-red-600 to-red-500 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">SB Urgences — Ambulance</h1>
          <button onClick={openHistory} className="text-white" data-testid="my-requests-btn"><ClockCounterClockwise size={22} /></button>
        </div>
        <p className="text-xs text-white/90">Urgence vitale ? Appelez immédiatement :</p>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {cfg.emergency_numbers.map(n => (
            <a key={n.id} href={`tel:${n.number}`} className="bg-white/15 rounded-xl py-2.5 text-center active:bg-white/25" data-testid={`call-${n.number}`}>
              <p className="text-white font-black text-lg leading-none">{n.number}</p>
              <p className="text-white/80 text-[10px] mt-1">{n.label}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Position */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Votre position</p>
          <button onClick={locate} disabled={locating} className={`w-full flex items-center gap-3 p-3 rounded-xl border ${pickup.lat !== null ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`} data-testid="ambulance-locate-btn">
            {locating ? <CircleNotch size={18} className="animate-spin text-red-500" /> : <Crosshair size={18} weight="fill" className={pickup.lat !== null ? 'text-emerald-600' : 'text-red-500'} />}
            <span className={`text-sm ${pickup.lat !== null ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}>{pickup.lat !== null ? 'Position localisée ✓' : (locating ? 'Localisation…' : 'Partager ma position GPS')}</span>
          </button>
          <input value={pickup.address} onChange={e => setPickup({ ...pickup, address: e.target.value })} placeholder="Précisez l'adresse / étage / repère (optionnel)" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-2" data-testid="ambulance-address" />
        </div>

        {/* Emergency type */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Nature de l'urgence</p>
          <div className="grid grid-cols-2 gap-2" data-testid="emergency-type-grid">
            {cfg.emergency_types.map(t => {
              const Icon = TYPE_ICON[t.id] || FirstAid;
              const on = etype === t.id;
              return (
                <button key={t.id} onClick={() => setEtype(t.id)} className={`flex flex-col gap-1 p-3 rounded-xl border text-left ${on ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} data-testid={`etype-${t.id}`}>
                  <div className="flex items-center gap-2">
                    <Icon size={20} weight={on ? 'fill' : 'duotone'} className={on ? 'text-red-600' : 'text-gray-400'} />
                    <span className={`text-xs font-semibold leading-tight ${on ? 'text-red-700' : 'text-gray-700'}`}>{t.label}</span>
                  </div>
                  {t.base_fee != null && <span className="text-[10px] text-gray-400 ml-7">Intervention {money(Number(t.base_fee))}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Paiement des frais d'intervention</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPayment('sbpay')} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${payment === 'sbpay' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600'}`} data-testid="ambulance-pay-sbpay"><Wallet size={16} /> SB Pay</button>
            <button onClick={() => setPayment('cash')} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${payment === 'cash' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600'}`} data-testid="ambulance-pay-cash"><Money size={16} /> Espèces</button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Les frais ne sont débités qu'à la clôture de l'intervention.</p>
        </div>

        {/* Notify emergency contacts */}
        <button onClick={() => setNotifyContacts(v => !v)} className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left" data-testid="ambulance-notify-toggle">
          <div className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors ${notifyContacts ? 'bg-red-500 justify-end' : 'bg-gray-200 justify-start'}`}>
            <div className="w-5 h-5 rounded-full bg-white shadow" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Prévenir mes proches</p>
            <p className="text-[11px] text-gray-500">Vos contacts du cercle Famille reçoivent une alerte + votre position en direct.</p>
          </div>
        </button>

        {/* Patient */}
        <div className="bg-white rounded-2xl p-4 space-y-2">
          <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-1">Patient</p>
          <input value={patient.name} onChange={e => setPatient({ ...patient, name: e.target.value })} placeholder="Nom du patient (sinon vous)" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="ambulance-patient-name" />
          <input value={patient.phone} onChange={e => setPatient({ ...patient, phone: e.target.value })} placeholder="Téléphone de contact" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="ambulance-patient-phone" />
          <textarea value={patient.symptoms} onChange={e => setPatient({ ...patient, symptoms: e.target.value })} placeholder="Décrivez les symptômes (optionnel)" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none h-16" data-testid="ambulance-symptoms" />
        </div>

        <button onClick={() => navigate('/espace-ambulancier')} className="w-full text-center text-sm font-semibold text-red-600 py-2 flex items-center justify-center gap-1.5" data-testid="ambulance-operator-link">
          <Ambulance size={16} weight="fill" /> Vous êtes ambulancier ? Espace partenaire →
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
        <button onClick={submit} disabled={submitting} className="w-full py-4 rounded-xl font-bold text-white bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2" data-testid="ambulance-request-btn">
          {submitting ? <CircleNotch size={18} className="animate-spin" /> : <Ambulance size={20} weight="fill" />}{submitting ? 'Envoi…' : 'Demander une ambulance maintenant'}
        </button>
      </div>
    </div>
  );
};

const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="ambulance-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold truncate">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-400">{text}</div>
);

export default AmbulancePage;
