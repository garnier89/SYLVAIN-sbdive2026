/**
 * TaxiHubPage — Iter 86
 * Hub de réservation taxi unifié et moderne (16 modes V3Cube).
 * Design: "Swiss & High-Contrast" Tactical Bento Grid (cf. design_guidelines.json).
 * Prix live affiché dès que l'adresse est saisie. Chaque mode est spécifique.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, MapPin, FlagCheckered, CarProfile, UsersThree, Leaf, Motorcycle,
  Clock, MapTrifold, CalendarPlus, Key, Gavel, AirplaneTilt, PawPrint, UserPlus,
  Van, HandHeart, Briefcase, Wheelchair, Lightning, Plus, Minus,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import { corporateAPI } from '../../services/api';

const API = process.env.REACT_APP_BACKEND_URL;

// ── 16 modes configuration ───────────────────────────────────────────────
const MODES = [
  // Everyday
  { id: 'standard', cat: 'everyday', label: 'Taxi VTC', sub: 'Course standard', icon: CarProfile, color: '#0B1426', vehicle: 'sb', ride_type: 'instant', panel: null, badge: null, cta: 'Commander' },
  { id: 'pool', cat: 'everyday', label: 'Pool', sub: 'Partagé, -30%', icon: UsersThree, color: '#3B82F6', vehicle: 'pool', ride_type: 'instant', panel: null, badge: '-30%', cta: 'Commander Pool' },
  { id: 'electric', cat: 'everyday', label: 'Green', sub: '100% électrique', icon: Leaf, color: '#10B981', vehicle: 'electric', ride_type: 'instant', panel: null, badge: 'Eco', cta: 'Commander Green' },
  { id: 'moto', cat: 'everyday', label: 'Moto', sub: 'Rapide en ville', icon: Motorcycle, color: '#EF4444', vehicle: 'moto', ride_type: 'instant', panel: null, badge: 'Fast', cta: 'Commander Moto' },
  // Time & Distance
  { id: 'rental', cat: 'time', label: 'Mise à Dispo', sub: 'Forfait horaire', icon: Clock, color: '#F59E0B', vehicle: 'confort', ride_type: 'rental', panel: 'rental', badge: null, cta: 'Réserver' },
  { id: 'intercity', cat: 'time', label: 'Intercité', sub: 'Longue distance', icon: MapTrifold, color: '#8B5CF6', vehicle: 'confort', ride_type: 'intercity', panel: 'datetime', badge: null, cta: 'Planifier le voyage' },
  { id: 'book_later', cat: 'time', label: 'Plus Tard', sub: 'Programmer', icon: CalendarPlus, color: '#0EA5E9', vehicle: 'sb', ride_type: 'scheduled', panel: 'datetime', badge: null, cta: 'Planifier' },
  { id: 'moto_rental', cat: 'time', label: 'Loc Moto', sub: 'Moto à l\'heure', icon: Key, color: '#DC2626', vehicle: 'moto', ride_type: 'rental', panel: 'rental', badge: null, cta: 'Louer Moto' },
  // Specialty & Inclusive
  { id: 'bidding', cat: 'special', label: 'Enchères', sub: 'Proposez votre prix', icon: Gavel, color: '#EC4899', vehicle: 'sb', ride_type: 'instant', panel: 'bidding', badge: null, cta: 'Proposer un prix' },
  { id: 'airport', cat: 'special', label: 'Aéroport', sub: 'Suivi de vol', icon: AirplaneTilt, color: '#0EA5E9', vehicle: 'airport', ride_type: 'airport', panel: 'flight', badge: 'Fixe', cta: 'Réserver Aéroport' },
  { id: 'pets', cat: 'special', label: 'Animaux', sub: 'Pet friendly', icon: PawPrint, color: '#F97316', vehicle: 'pets', ride_type: 'instant', panel: 'pets', badge: null, cta: 'Commander' },
  { id: 'book_for_someone', cat: 'special', label: 'Pour un proche', sub: 'Réserver pour autrui', icon: UserPlus, color: '#14B8A6', vehicle: 'sb', ride_type: 'instant', panel: 'contact', badge: null, cta: 'Commander' },
  { id: 'tuktuk', cat: 'special', label: 'TukTuk', sub: 'Fun & local', icon: Van, color: '#84CC16', vehicle: 'tuktuk', ride_type: 'instant', panel: null, badge: null, cta: 'Commander TukTuk' },
  { id: 'assist', cat: 'special', label: 'Assistance', sub: 'Aide à la personne', icon: HandHeart, color: '#F43F5E', vehicle: 'assist', ride_type: 'instant', panel: 'assist', badge: null, cta: 'Demander Assistance' },
  { id: 'corporate', cat: 'special', label: 'Corporate', sub: 'Facturé entreprise', icon: Briefcase, color: '#334155', vehicle: 'confort', ride_type: 'corporate', panel: 'corporate', badge: null, cta: 'Commander Pro' },
  { id: 'access', cat: 'special', label: 'PMR', sub: 'Accès fauteuil', icon: Wheelchair, color: '#6366F1', vehicle: 'accessible', ride_type: 'instant', panel: null, badge: null, cta: 'Commander PMR' },
];

const CATS = [
  { key: 'everyday', title: 'Au quotidien' },
  { key: 'time', title: 'Temps & Distance' },
  { key: 'special', title: 'Spécialisé & Inclusif' },
];

const RENTAL_PACKAGES = [
  { slug: '2h_20km', label: '2h', km: 20, hours: 2 },
  { slug: '4h_40km', label: '4h', km: 40, hours: 4 },
  { slug: '8h_80km', label: '8h', km: 80, hours: 8 },
];

const ASSIST_OPTIONS = [
  { k: 'wheelchair', l: 'Fauteuil roulant' },
  { k: 'elderly', l: 'Personne âgée' },
  { k: 'medical', l: 'Sortie médicale' },
  { k: 'luggage', l: 'Aide bagages' },
];

const TaxiHubPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [modeId, setModeId] = useState(params.get('mode') || 'standard');
  const mode = useMemo(() => MODES.find((m) => m.id === modeId) || MODES[0], [modeId]);

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [rentalPkg, setRentalPkg] = useState('2h_20km');
  const [corpAccounts, setCorpAccounts] = useState([]);
  const [corpId, setCorpId] = useState('');
  const [petsCount, setPetsCount] = useState(1);
  const [petsSize, setPetsSize] = useState('small');
  const [assistNeeds, setAssistNeeds] = useState('wheelchair');
  const [bookForName, setBookForName] = useState('');
  const [bookForPhone, setBookForPhone] = useState('');
  const [biddingFare, setBiddingFare] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const needsDropoff = mode.ride_type !== 'rental';
  const isRental = mode.ride_type === 'rental';

  // default scheduled date
  useEffect(() => {
    if (mode.panel === 'datetime' && !scheduledAt) {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      setScheduledAt(d.toISOString().slice(0, 16));
    }
  }, [mode.panel, scheduledAt]);

  // load corporate accounts when corporate mode
  useEffect(() => {
    if (mode.id !== 'corporate') return;
    corporateAPI.my()
      .then((r) => {
        const items = r.data.items || [];
        setCorpAccounts(items);
        if (items.length && !corpId) setCorpId(items[0].join_code);
      })
      .catch((e) => console.warn('corp load:', e?.message || e));
  }, [mode.id, corpId]);

  // live estimate
  const fetchEstimate = useCallback(async () => {
    if (!pickup?.lat) { setEstimate(null); return; }
    if (needsDropoff && !dropoff?.lat) { setEstimate(null); return; }
    try {
      const dest = dropoff || pickup;
      const r = await fetch(`${API}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          dropoff_lat: dest.lat, dropoff_lng: dest.lng, dropoff_address: dest.address,
          vehicle_type: mode.vehicle, payment_method: 'cash',
        }),
      });
      if (r.ok) setEstimate(await r.json());
    } catch (e) { console.warn('estimate:', e?.message || e); }
  }, [pickup, dropoff, mode.vehicle, needsDropoff]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 350);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  // corporate discount preview
  const corpDiscount = useMemo(() => {
    if (mode.id !== 'corporate') return 0;
    const acc = corpAccounts.find((a) => a.join_code === corpId);
    return acc ? acc.discount_pct : 0;
  }, [mode.id, corpAccounts, corpId]);

  const displayPrice = useMemo(() => {
    if (!estimate?.estimated_fare) return null;
    let p = estimate.estimated_fare;
    if (corpDiscount) p = p * (1 - corpDiscount / 100);
    return p;
  }, [estimate, corpDiscount]);

  const ctaLabel = useMemo(() => {
    if (mode.id === 'rental' || mode.id === 'moto_rental') {
      const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg);
      return `${mode.cta} ${pkg?.label || ''}`.trim();
    }
    if (mode.id === 'book_for_someone' && bookForName) return `Commander pour ${bookForName}`;
    return mode.cta;
  }, [mode, rentalPkg, bookForName]);

  const buildPayload = () => {
    const dest = dropoff || pickup;
    const base = {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
      dropoff_lat: dest.lat, dropoff_lng: dest.lng, dropoff_address: dest.address,
      vehicle_type: mode.vehicle, payment_method: 'cash', ride_type: mode.ride_type,
    };
    if (mode.panel === 'datetime') base.scheduled_at = scheduledAt || null;
    if (mode.id === 'airport') base.flight_number = flightNumber || null;
    if (isRental) {
      const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg);
      base.rental_package = rentalPkg;
      base.rental_hours = pkg?.hours || 2;
    }
    if (mode.id === 'corporate') base.corporate_account_id = corpId || null;
    if (mode.id === 'pets') { base.pets_count = petsCount; base.pets_size = petsSize; }
    if (mode.id === 'assist') base.assist_needs = assistNeeds;
    if (mode.id === 'access') base.handicap_accessibility = true;
    if (mode.id === 'pool') base.pool_enabled = true;
    if (mode.id === 'book_for_someone') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    return base;
  };

  const onSubmit = async () => {
    if (!pickup?.lat) return toast.error('Choisissez un lieu de départ');
    if (needsDropoff && !dropoff?.lat) return toast.error('Choisissez une destination');

    // Bidding delegates to the dedicated negotiation page
    if (mode.id === 'bidding') {
      const q = new URLSearchParams({
        pickup: pickup.address, plat: pickup.lat, plng: pickup.lng,
        dropoff: dropoff.address, dlat: dropoff.lat, dlng: dropoff.lng,
      });
      if (biddingFare) q.set('fare', biddingFare);
      return navigate(`/taxi-bidding?${q.toString()}`);
    }
    if (mode.id === 'book_for_someone' && !bookForName) return toast.error('Indiquez le nom du passager');

    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/rides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPayload()),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      toast.success('Réservation enregistrée !');
      if (mode.panel === 'datetime') navigate('/scheduled-rides');
      else navigate(`/ride/${data.id}`);
    } catch (e) {
      toast.error('Échec : ' + (e.message || 'erreur'));
    } finally { setSubmitting(false); }
  };

  const Icon = mode.icon;

  return (
    <div className="mobile-container min-h-screen bg-[#F8F9FA] pb-40" data-testid="taxi-hub-page">
      {/* Header */}
      <div className="bg-[#0B1426] text-white px-5 pt-12 pb-6">
        <button onClick={() => navigate('/home')} className="mb-4" data-testid="taxi-hub-back"><ArrowLeft size={24} /></button>
        <p className="text-xs tracking-[0.2em] uppercase font-bold text-[#FFC107]">SB Drive · Se déplacer</p>
        <h1 className="text-3xl font-black tracking-tight mt-1">Comment voyagez-vous&nbsp;?</h1>
      </div>

      {/* Mode hub — Tactical Bento Grid */}
      <div className="px-5 -mt-3">
        {CATS.map((cat) => (
          <div key={cat.key} className="mb-5">
            <p className="text-[11px] tracking-[0.12em] uppercase font-bold text-slate-500 mb-2">{cat.title}</p>
            <div className={cat.key === 'everyday' ? 'grid grid-cols-2 gap-3' : cat.key === 'time' ? 'flex overflow-x-auto gap-3 pb-2 hide-scrollbar' : 'flex flex-wrap gap-2'}>
              {MODES.filter((m) => m.cat === cat.key).map((m) => {
                const active = m.id === modeId;
                const MIcon = m.icon;
                if (cat.key === 'special') {
                  return (
                    <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => setModeId(m.id)}
                      className={`px-3.5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 border transition-colors ${active ? 'text-white border-transparent' : 'bg-white text-[#0B1426] border-[#E2E8F0]'}`}
                      style={active ? { backgroundColor: m.color } : {}}>
                      <MIcon size={16} weight={active ? 'fill' : 'regular'} /> {m.label}
                    </button>
                  );
                }
                return (
                  <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => setModeId(m.id)}
                    className={`relative ${cat.key === 'everyday' ? 'aspect-[1.4]' : 'min-w-[136px]'} rounded-xl p-3 flex flex-col justify-between border text-left transition-all ${active ? 'text-white border-transparent shadow-lg' : 'bg-white text-[#0B1426] border-[#E2E8F0] hover:border-[#0B1426]'}`}
                    style={active ? { backgroundColor: m.color } : {}}>
                    {m.badge && <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-[#FFC107] text-[#0B1426]'}`}>{m.badge}</span>}
                    <MIcon size={26} weight={cat.key === 'everyday' ? 'duotone' : 'regular'} style={!active ? { color: m.color } : {}} />
                    <div>
                      <p className="font-bold text-sm leading-tight">{m.label}</p>
                      <p className={`text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{m.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Booking sheet */}
      <div className="px-5">
        <div className="bg-white rounded-2xl shadow-[0_-2px_24px_rgba(11,20,38,0.06)] p-4 border border-[#E2E8F0]">
          {/* Address entry */}
          <div className="mb-4" data-testid="address-block">
            <div className="border-l-4 border-[#0B1426] pl-3 py-1 mb-2">
              <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><MapPin size={11} /> Départ</label>
              <GooglePlacesInput value={pickup} onChange={setPickup} placeholder="Lieu de prise en charge" testId="pickup-address-input" />
            </div>
            {needsDropoff && (
              <div className="border-l-4 border-[#FFC107] pl-3 py-1">
                <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><FlagCheckered size={11} /> Destination</label>
                <GooglePlacesInput value={dropoff} onChange={setDropoff} placeholder="Où allez-vous ?" testId="dropoff-address-input" />
              </div>
            )}
          </div>

          {/* Live price card */}
          <AnimatePresence>
            {(displayPrice || isRental) && (
              <motion.div
                initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-[#0B1426] text-white p-4 rounded-xl flex items-center justify-between mb-4 relative overflow-hidden"
                data-testid="live-price-card">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFC107] to-transparent opacity-60" />
                <div>
                  <p className="text-[10px] tracking-[0.1em] uppercase text-[#FFC107] font-bold">{mode.label}</p>
                  {isRental ? (
                    <p className="text-xs text-white/60 mt-0.5">Forfait {RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.label}</p>
                  ) : (
                    <p className="text-xs text-white/60 mt-0.5">{estimate?.distance_km?.toFixed(1)} km · {estimate?.duration_mins} min</p>
                  )}
                  {corpDiscount > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">Remise entreprise -{corpDiscount}%</p>}
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black tracking-tighter" data-testid="live-price-value">
                    {isRental ? `${(RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.hours || 2) * 18}` : displayPrice?.toFixed(2)}<span className="text-lg"> €</span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dynamic mode-specific panels */}
          <AnimatePresence mode="wait">
            <motion.div key={mode.panel || 'none'} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              {mode.panel === 'datetime' && (
                <div data-testid="panel-datetime" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Date & heure</label>
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="datetime-input" />
                </div>
              )}
              {mode.panel === 'flight' && (
                <div data-testid="panel-flight" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">N° de vol (optionnel)</label>
                  <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} placeholder="AF1234" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="flight-number-input" />
                  <p className="text-[10px] text-slate-400 mt-1">Nous suivons votre vol pour ajuster la prise en charge.</p>
                </div>
              )}
              {mode.panel === 'rental' && (
                <div data-testid="panel-rental" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Forfait</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {RENTAL_PACKAGES.map((p) => (
                      <button key={p.slug} onClick={() => setRentalPkg(p.slug)} data-testid={`rental-pkg-${p.slug}`}
                        className={`p-3 rounded-lg border text-center ${rentalPkg === p.slug ? 'border-[#F59E0B] bg-amber-50' : 'border-[#E2E8F0]'}`}>
                        <p className="font-bold">{p.label}</p><p className="text-[10px] text-slate-400">{p.km} km</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {mode.panel === 'pets' && (
                <div data-testid="panel-pets" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Nombre d'animaux</label>
                  <div className="flex items-center gap-4 mt-1 mb-3">
                    <button onClick={() => setPetsCount(Math.max(1, petsCount - 1))} className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center" data-testid="pets-minus"><Minus size={16} /></button>
                    <span className="text-lg font-bold w-6 text-center" data-testid="pets-count">{petsCount}</span>
                    <button onClick={() => setPetsCount(petsCount + 1)} className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center" data-testid="pets-plus"><Plus size={16} /></button>
                  </div>
                  <div className="flex gap-2">
                    {[{ k: 'small', l: 'Petit' }, { k: 'large', l: 'Grand' }].map((s) => (
                      <button key={s.k} onClick={() => setPetsSize(s.k)} data-testid={`pets-size-${s.k}`}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium ${petsSize === s.k ? 'border-[#F97316] bg-orange-50' : 'border-[#E2E8F0]'}`}>{s.l}</button>
                    ))}
                  </div>
                </div>
              )}
              {mode.panel === 'assist' && (
                <div data-testid="panel-assist" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Type d'assistance</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {ASSIST_OPTIONS.map((o) => (
                      <button key={o.k} onClick={() => setAssistNeeds(o.k)} data-testid={`assist-${o.k}`}
                        className={`py-2 rounded-lg border text-sm font-medium ${assistNeeds === o.k ? 'border-[#F43F5E] bg-rose-50' : 'border-[#E2E8F0]'}`}>{o.l}</button>
                    ))}
                  </div>
                </div>
              )}
              {mode.panel === 'corporate' && (
                <div data-testid="panel-corporate" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Compte entreprise</label>
                  {corpAccounts.length > 0 ? (
                    <select value={corpId} onChange={(e) => setCorpId(e.target.value)} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="corporate-account-select">
                      {corpAccounts.map((a) => <option key={a.id} value={a.join_code}>{a.name} (-{a.discount_pct}%)</option>)}
                    </select>
                  ) : (
                    <button onClick={() => navigate('/corporate')} className="text-xs text-indigo-600 font-semibold mt-1" data-testid="join-corporate-link">Rejoindre une entreprise →</button>
                  )}
                </div>
              )}
              {mode.panel === 'contact' && (
                <div data-testid="panel-contact" className="mb-2 space-y-2">
                  <div>
                    <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Nom du passager</label>
                    <input value={bookForName} onChange={(e) => setBookForName(e.target.value)} placeholder="Ex: Marie" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="book-for-name-input" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Téléphone</label>
                    <input value={bookForPhone} onChange={(e) => setBookForPhone(e.target.value)} placeholder="+33..." className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="book-for-phone-input" />
                  </div>
                </div>
              )}
              {mode.panel === 'bidding' && (
                <div data-testid="panel-bidding" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Votre prix proposé (€)</label>
                  <input type="number" value={biddingFare} onChange={(e) => setBiddingFare(e.target.value)} placeholder={estimate?.estimated_fare ? `Suggéré: ${estimate.estimated_fare.toFixed(2)}` : '15.00'} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="bidding-fare-input" />
                  <p className="text-[10px] text-slate-400 mt-1">Les chauffeurs proches verront votre offre et pourront l'accepter.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky adaptive CTA */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-[#E2E8F0] p-4">
        <button onClick={onSubmit} disabled={submitting} data-testid="cta-book-button"
          className="w-full py-4 font-black text-lg flex items-center justify-center gap-2 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
          style={{ backgroundColor: '#FFC107', color: '#0B1426' }}>
          <Lightning size={20} weight="fill" /> {submitting ? 'Envoi…' : ctaLabel}
        </button>
      </div>
    </div>
  );
};

export default TaxiHubPage;
