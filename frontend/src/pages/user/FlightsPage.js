import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, AirplaneTilt, CheckCircle, X, ShieldCheck,
  ArrowRight, Clock, Suitcase, User, Lightning, Storefront, DownloadSimple, Ticket,
} from '@phosphor-icons/react';
import { flightsAPI } from '../../services/api';

const NAVY = '#0A2540';
const ORANGE = '#FF5000';
const money = (n, cur) => `${Number(n || 0).toFixed(2)} ${cur || '€'}`;
const border = '1px solid #E5E7EB';

const fmtTime = (s) => { try { return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
const fmtDur = (m) => `${Math.floor((m || 0) / 60)}h${String((m || 0) % 60).padStart(2, '0')}`;

const AIRPORTS = [
  ['FDF', 'Fort-de-France'], ['PTP', 'Pointe-à-Pitre'], ['CAY', 'Cayenne'], ['SXM', 'Saint-Martin'],
  ['ORY', 'Paris Orly'], ['CDG', 'Paris CDG'], ['MIA', 'Miami'], ['JFK', 'New York'],
  ['LHR', 'Londres'], ['MAD', 'Madrid'], ['PAP', 'Port-au-Prince'], ['SDQ', 'Saint-Domingue'],
];

const STATUS_LABELS = {
  confirmed: { label: 'Confirmé', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Annulé', cls: 'bg-slate-100 text-slate-500' },
};

const FlightsPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('live'); // live | sb
  const [step, setStep] = useState('search'); // search | book | done | mine
  const [mine, setMine] = useState([]);

  // ---- Mode SB (offres admin) ----
  const [airports, setAirports] = useState({ origins: [], destinations: [] });
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [flights, setFlights] = useState([]);
  const [flight, setFlight] = useState(null);
  const [passengers, setPassengers] = useState([{ name: '', type: 'adult' }]);

  // ---- Mode Live (Duffel) ----
  const [lOrigin, setLOrigin] = useState('FDF');
  const [lDest, setLDest] = useState('ORY');
  const [lDate, setLDate] = useState('');
  const [lReturn, setLReturn] = useState('');
  const [lPaxCount, setLPaxCount] = useState(1);
  const [lCabin, setLCabin] = useState('economy');
  const [lOffers, setLOffers] = useState([]);
  const [lReqId, setLReqId] = useState(null);
  const [lOffer, setLOffer] = useState(null);
  const [lPax, setLPax] = useState([{ title: 'mr', gender: 'm', given_name: '', family_name: '', born_on: '' }]);
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('+596');
  const [lDone, setLDone] = useState(null);

  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const loadFlights = () => flightsAPI.search({ origin: origin || undefined, destination: destination || undefined, date: date || undefined })
    .then((r) => setFlights(r.data.flights || [])).catch(() => {});
  const loadMine = () => flightsAPI.myBookings().then((r) => setMine(r.data.bookings || [])).catch(() => {});

  useEffect(() => { flightsAPI.airports().then((r) => setAirports(r.data || { origins: [], destinations: [] })).catch(() => {}); loadFlights(); }, []);

  // ===== Mode SB =====
  const openFlight = (f) => { setFlight(f); setPassengers([{ name: '', type: 'adult' }]); setStep('book'); };
  const setPax = (i, k, v) => setPassengers((arr) => arr.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPax = () => setPassengers((arr) => [...arr, { name: '', type: 'adult' }]);
  const removePax = (i) => setPassengers((arr) => arr.filter((_, idx) => idx !== i));
  const validPax = passengers.filter((p) => p.name.trim());
  const total = flight ? flight.price * Math.max(1, validPax.length) : 0;

  const book = async () => {
    if (validPax.length === 0) { toast.error('Saisissez au moins un passager'); return; }
    setBusy(true);
    try {
      await flightsAPI.book({ flight_id: flight.id, passengers: validPax });
      setStep('done'); loadMine();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec de la réservation'); }
    setBusy(false);
  };

  // ===== Mode Live (Duffel) =====
  const liveSearch = async () => {
    if (!lDate) { toast.error('Choisissez une date de départ'); return; }
    setBusy(true); setSearched(true);
    try {
      const r = await flightsAPI.liveSearch({
        origin: lOrigin, destination: lDest, date: lDate,
        return_date: lReturn || undefined, passengers: lPaxCount, cabin_class: lCabin,
      });
      setLOffers(r.data.offers || []);
      setLReqId(r.data.offer_request_id);
      if ((r.data.offers || []).length === 0) toast.info('Aucun vol trouvé pour ces critères');
    } catch (err) { toast.error(err?.response?.data?.detail || 'Recherche indisponible'); }
    setBusy(false);
  };

  const openLiveOffer = (o) => {
    setLOffer(o);
    setLPax(Array.from({ length: lPaxCount }, () => ({ title: 'mr', gender: 'm', given_name: '', family_name: '', born_on: '' })));
    setStep('book');
  };
  const setLP = (i, k, v) => setLPax((arr) => arr.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));

  const liveBookNow = async () => {
    for (const p of lPax) {
      if (!p.given_name.trim() || !p.family_name.trim() || !p.born_on) { toast.error('Complétez tous les passagers (nom, prénom, date de naissance)'); return; }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) { toast.error('E-mail de contact valide requis'); return; }
    if (!/^\+\d{6,15}$/.test(contactPhone)) { toast.error('Téléphone international requis (ex. +596696...)'); return; }
    setBusy(true);
    try {
      const r = await flightsAPI.liveBook({
        offer_request_id: lReqId, offer_id: lOffer.id,
        contact_email: contactEmail, contact_phone: contactPhone, passengers: lPax,
      });
      setLDone(r.data.booking); setStep('done'); loadMine();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec de la réservation'); }
    setBusy(false);
  };

  const downloadEticket = async (id, pnr) => {
    try {
      const r = await flightsAPI.eticket(id);
      const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `eticket-${pnr || id}.pdf`; document.body.appendChild(a); a.click();
      a.remove(); window.URL.revokeObjectURL(url);
    } catch { toast.error('E-billet indisponible'); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler ce vol ?')) return;
    try { const r = await flightsAPI.cancel(id); toast.success(r.data.refunded > 0 ? `Annulé · remboursé ${money(r.data.refunded)}` : 'Annulé'); loadMine(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };

  const switchMode = (m) => { setMode(m); setStep('search'); setSearched(false); };
  const liveTotal = lOffer ? Number(lOffer.total_amount) : 0;

  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-28" data-testid="flights-page">
      <header className="sticky top-0 z-30 px-4 py-3.5 flex items-center gap-3 text-white" style={{ background: NAVY }}>
        <button onClick={() => (step === 'search' ? navigate(-1) : setStep('search'))} aria-label="Retour" data-testid="flights-back-btn" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Work Sans, sans-serif' }}><AirplaneTilt size={20} weight="fill" /> Billets d'avion</h1>
          <p className="text-[11px] text-white/70 -mt-0.5">Agence de voyage SB</p>
        </div>
        <button onClick={() => { setStep('mine'); loadMine(); }} data-testid="flights-mine-btn" className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10">Mes vols</button>
      </header>

      {/* MODE TOGGLE */}
      {step === 'search' && (
        <div className="px-4 pt-3">
          <div className="flex bg-white rounded-full p-1 shadow-sm" style={{ border }}>
            <button onClick={() => switchMode('live')} data-testid="flights-mode-live"
              className="flex-1 py-2 rounded-full text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
              style={mode === 'live' ? { background: ORANGE, color: '#fff' } : { color: '#64748B' }}>
              <Lightning size={16} weight="fill" /> Vols en direct
            </button>
            <button onClick={() => switchMode('sb')} data-testid="flights-mode-sb"
              className="flex-1 py-2 rounded-full text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
              style={mode === 'sb' ? { background: NAVY, color: '#fff' } : { color: '#64748B' }}>
              <Storefront size={16} weight="fill" /> Offres SB
            </button>
          </div>
        </div>
      )}

      {/* ===================== MODE LIVE (Duffel) ===================== */}
      {mode === 'live' && step === 'search' && (
        <div className="p-4 space-y-3" data-testid="flights-live-search">
          <datalist id="airport-list">
            {AIRPORTS.map(([c, n]) => <option key={c} value={c}>{`${c} — ${n}`}</option>)}
          </datalist>
          <div className="bg-white rounded-2xl p-3 space-y-2" style={{ border }}>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-600">Départ (code)
                <input list="airport-list" value={lOrigin} onChange={(e) => setLOrigin(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="FDF" data-testid="live-origin" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1 uppercase font-bold" style={{ border }} /></label>
              <label className="block text-xs font-semibold text-gray-600">Arrivée (code)
                <input list="airport-list" value={lDest} onChange={(e) => setLDest(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="ORY" data-testid="live-destination" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1 uppercase font-bold" style={{ border }} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-600">Aller
                <input type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} data-testid="live-date" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
              <label className="block text-xs font-semibold text-gray-600">Retour (option)
                <input type="date" value={lReturn} onChange={(e) => setLReturn(e.target.value)} data-testid="live-return" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-600">Passagers
                <select value={lPaxCount} onChange={(e) => setLPaxCount(Number(e.target.value))} data-testid="live-pax-count" className="w-full min-h-[44px] px-2 rounded-lg text-gray-900 mt-1" style={{ border }}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} passager{n > 1 ? 's' : ''}</option>)}
                </select></label>
              <label className="block text-xs font-semibold text-gray-600">Classe
                <select value={lCabin} onChange={(e) => setLCabin(e.target.value)} data-testid="live-cabin" className="w-full min-h-[44px] px-2 rounded-lg text-gray-900 mt-1" style={{ border }}>
                  <option value="economy">Économique</option><option value="premium_economy">Premium</option>
                  <option value="business">Affaires</option><option value="first">Première</option>
                </select></label>
            </div>
            <button onClick={liveSearch} disabled={busy} data-testid="live-search-btn" className="w-full min-h-[44px] rounded-lg font-bold text-white disabled:opacity-50" style={{ background: ORANGE }}>
              {busy ? 'Recherche…' : 'Rechercher les vols réels'}
            </button>
            <p className="text-[10px] text-gray-400 text-center">Vols en temps réel · e-billet PNR généré après paiement SB Pay</p>
          </div>

          {busy && <p className="text-sm text-gray-400 text-center py-6">Recherche des meilleures offres…</p>}
          {!busy && searched && lOffers.length === 0 && <p className="text-sm text-gray-400">Aucun vol trouvé.</p>}
          {lOffers.map((o) => {
            const s0 = o.slices[0] || {};
            return (
              <button key={o.id} onClick={() => openLiveOffer(o)} data-testid={`live-offer-${o.id}`} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm" style={{ border }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {o.airline_logo && <img src={o.airline_logo} alt="" className="w-5 h-5 object-contain" />}
                    <p className="font-bold text-gray-900 text-sm">{o.airline}</p>
                  </div>
                  <span className="font-black" style={{ color: NAVY }}>{money(o.total_amount, o.total_currency)}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="text-center"><p className="font-black text-gray-900">{s0.origin_code}</p><p className="text-[10px] text-gray-400">{fmtTime(s0.departing_at)}</p></div>
                  <div className="flex-1 flex items-center gap-1 text-gray-300"><div className="flex-1 border-t border-dashed" /><ArrowRight size={14} /><div className="flex-1 border-t border-dashed" /></div>
                  <div className="text-center"><p className="font-black text-gray-900">{s0.destination_code}</p><p className="text-[10px] text-gray-400">{fmtTime(s0.arriving_at)}</p></div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={11} /> {fmtDur(s0.duration_min)} · {s0.stops === 0 ? 'Direct' : `${s0.stops} escale(s)`}</span>
                  {o.slices.length > 1 && <span className="text-[10px] text-gray-400">Aller-retour</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {mode === 'live' && step === 'book' && lOffer && (
        <div className="p-4 space-y-4" data-testid="live-book">
          {lOffer.slices.map((sl, si) => (
            <div key={si} className="bg-white rounded-2xl p-3" style={{ border }}>
              <p className="text-[11px] font-bold text-gray-400 mb-1">{si === 0 ? 'ALLER' : 'RETOUR'}</p>
              <div className="flex items-center justify-between"><p className="font-bold text-gray-900">{lOffer.airline}</p><span className="font-black" style={{ color: NAVY }}>{money(lOffer.total_amount, lOffer.total_currency)}</span></div>
              <div className="flex items-center gap-2 mt-2">
                <div className="text-center"><p className="font-black text-gray-900">{sl.origin_code}</p><p className="text-[10px] text-gray-400">{fmtTime(sl.departing_at)}</p></div>
                <div className="flex-1 flex items-center gap-1 text-gray-300"><div className="flex-1 border-t border-dashed" /><AirplaneTilt size={14} /><div className="flex-1 border-t border-dashed" /></div>
                <div className="text-center"><p className="font-black text-gray-900">{sl.destination_code}</p><p className="text-[10px] text-gray-400">{fmtTime(sl.arriving_at)}</p></div>
              </div>
            </div>
          ))}

          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border }}>
            <p className="font-bold text-gray-900 flex items-center gap-2"><User size={18} style={{ color: ORANGE }} /> Passagers</p>
            {lPax.map((p, i) => (
              <div key={i} className="space-y-2 pb-2 border-b last:border-b-0" data-testid={`live-pax-${i}`}>
                <div className="flex gap-2">
                  <select value={p.title} onChange={(e) => setLP(i, 'title', e.target.value)} data-testid={`live-pax-title-${i}`} className="min-h-[44px] px-2 rounded-lg text-sm" style={{ border }}>
                    <option value="mr">M.</option><option value="mrs">Mme</option><option value="ms">Mlle</option>
                  </select>
                  <input value={p.given_name} onChange={(e) => setLP(i, 'given_name', e.target.value)} placeholder="Prénom" data-testid={`live-pax-given-${i}`} className="flex-1 min-h-[44px] px-3 rounded-lg text-sm" style={{ border }} />
                  <input value={p.family_name} onChange={(e) => setLP(i, 'family_name', e.target.value)} placeholder="Nom" data-testid={`live-pax-family-${i}`} className="flex-1 min-h-[44px] px-3 rounded-lg text-sm" style={{ border }} />
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 text-[11px] font-semibold text-gray-500">Date de naissance
                    <input type="date" value={p.born_on} onChange={(e) => setLP(i, 'born_on', e.target.value)} data-testid={`live-pax-born-${i}`} className="w-full min-h-[44px] px-3 rounded-lg text-sm text-gray-900 mt-0.5" style={{ border }} /></label>
                  <label className="text-[11px] font-semibold text-gray-500">Genre
                    <select value={p.gender} onChange={(e) => setLP(i, 'gender', e.target.value)} data-testid={`live-pax-gender-${i}`} className="block min-h-[44px] px-2 rounded-lg text-sm mt-0.5" style={{ border }}>
                      <option value="m">H</option><option value="f">F</option>
                    </select></label>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-2" style={{ border }}>
            <p className="font-bold text-gray-900 text-sm">Contact</p>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="E-mail" type="email" data-testid="live-contact-email" className="w-full min-h-[44px] px-3 rounded-lg text-sm" style={{ border }} />
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+596696..." data-testid="live-contact-phone" className="w-full min-h-[44px] px-3 rounded-lg text-sm" style={{ border }} />
          </div>
        </div>
      )}

      {/* ===================== MODE SB (offres admin) ===================== */}
      {mode === 'sb' && step === 'search' && (
        <div className="p-4 space-y-3" data-testid="flights-search">
          <div className="bg-white rounded-2xl p-3 space-y-2" style={{ border }}>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-600">Départ
                <select value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="flights-origin" className="w-full min-h-[44px] px-2 rounded-lg text-gray-900 mt-1" style={{ border }}>
                  <option value="">Toutes</option>
                  {airports.origins.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></label>
              <label className="block text-xs font-semibold text-gray-600">Arrivée
                <select value={destination} onChange={(e) => setDestination(e.target.value)} data-testid="flights-destination" className="w-full min-h-[44px] px-2 rounded-lg text-gray-900 mt-1" style={{ border }}>
                  <option value="">Toutes</option>
                  {airports.destinations.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></label>
            </div>
            <label className="block text-xs font-semibold text-gray-600">Date (optionnel)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="flights-date" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
            <button onClick={loadFlights} data-testid="flights-search-btn" className="w-full min-h-[44px] rounded-lg font-bold text-white" style={{ background: ORANGE }}>Rechercher</button>
          </div>
          {flights.length === 0 && <p className="text-sm text-gray-400">Aucun vol trouvé.</p>}
          {flights.map((f) => (
            <button key={f.id} onClick={() => openFlight(f)} data-testid={`flight-card-${f.id}`} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm" style={{ border }}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900">{f.airline}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{f.cabin_label}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="text-center"><p className="font-black text-gray-900">{f.origin_code || f.origin}</p><p className="text-[10px] text-gray-400">{fmtTime(f.departure_at)}</p></div>
                <div className="flex-1 flex items-center gap-1 text-gray-300"><div className="flex-1 border-t border-dashed" /><ArrowRight size={14} /><div className="flex-1 border-t border-dashed" /></div>
                <div className="text-center"><p className="font-black text-gray-900">{f.destination_code || f.destination}</p><p className="text-[10px] text-gray-400">{fmtTime(f.arrival_at)}</p></div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={11} /> {fmtDur(f.duration_min)} · {f.stops === 0 ? 'Direct' : `${f.stops} escale(s)`}</span>
                <span className="font-black" style={{ color: NAVY }}>{money(f.price)}</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{f.seats_available} siège(s) dispo</p>
            </button>
          ))}
        </div>
      )}

      {mode === 'sb' && step === 'book' && flight && (
        <div className="p-4 space-y-4" data-testid="flight-book">
          <div className="bg-white rounded-2xl p-3" style={{ border }}>
            <div className="flex items-center justify-between"><p className="font-bold text-gray-900">{flight.airline} {flight.flight_number}</p><span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{flight.cabin_label}</span></div>
            <div className="flex items-center gap-2 mt-2">
              <div className="text-center"><p className="font-black text-gray-900">{flight.origin}</p><p className="text-[10px] text-gray-400">{fmtTime(flight.departure_at)}</p></div>
              <div className="flex-1 flex items-center gap-1 text-gray-300"><div className="flex-1 border-t border-dashed" /><AirplaneTilt size={14} /><div className="flex-1 border-t border-dashed" /></div>
              <div className="text-center"><p className="font-black text-gray-900">{flight.destination}</p><p className="text-[10px] text-gray-400">{fmtTime(flight.arrival_at)}</p></div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1"><Suitcase size={12} /> {flight.baggage || 'Bagage selon tarif'}</p>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border }}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900 flex items-center gap-2"><User size={18} style={{ color: ORANGE }} /> Passagers</p>
              <button onClick={addPax} data-testid="flight-add-pax" className="text-xs font-bold" style={{ color: ORANGE }}>+ Ajouter</button>
            </div>
            {passengers.map((p, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`flight-pax-row-${i}`}>
                <input value={p.name} onChange={(e) => setPax(i, 'name', e.target.value)} placeholder={`Nom passager ${i + 1}`} data-testid={`flight-pax-name-${i}`} className="flex-1 min-h-[44px] px-3 rounded-lg text-sm" style={{ border }} />
                <select value={p.type} onChange={(e) => setPax(i, 'type', e.target.value)} data-testid={`flight-pax-type-${i}`} className="min-h-[44px] px-2 rounded-lg text-sm" style={{ border }}>
                  <option value="adult">Adulte</option><option value="child">Enfant</option><option value="infant">Bébé</option>
                </select>
                {passengers.length > 1 && <button onClick={() => removePax(i)} className="text-rose-500" aria-label="Retirer"><X size={18} /></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DONE */}
      {step === 'done' && (
        <div className="p-6 text-center" data-testid="flight-done">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><CheckCircle size={36} weight="fill" className="text-emerald-500" /></div>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Vol réservé ✈️</h2>
          {lDone?.pnr && (
            <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100">
              <Ticket size={18} style={{ color: ORANGE }} />
              <span className="font-black tracking-widest text-gray-900" data-testid="done-pnr">PNR {lDone.pnr}</span>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-3">Votre réservation est confirmée. Retrouvez-la dans « Mes vols ».</p>
          {lDone?.id && (
            <button onClick={() => downloadEticket(lDone.id, lDone.pnr)} data-testid="done-eticket-btn" className="mt-4 w-full min-h-[48px] rounded-xl font-bold text-white flex items-center justify-center gap-2" style={{ background: ORANGE }}>
              <DownloadSimple size={18} weight="bold" /> Télécharger l'e-billet
            </button>
          )}
          <button onClick={() => { setStep('mine'); loadMine(); setLDone(null); }} className="mt-3 w-full min-h-[48px] rounded-xl font-bold text-white" style={{ background: NAVY }} data-testid="flight-see-mine">Voir mes vols</button>
        </div>
      )}

      {/* MINE */}
      {step === 'mine' && (
        <div className="p-4 space-y-3" data-testid="flights-mine-list">
          {mine.length === 0 && <p className="text-sm text-gray-400">Aucun vol réservé.</p>}
          {mine.map((b) => {
            const st = STATUS_LABELS[b.status] || { label: b.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={b.id} className="bg-white rounded-2xl p-4" style={{ border }} data-testid={`flight-booking-${b.id}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900">{b.airline} {b.flight_number}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{b.origin} → {b.destination} · {fmtTime(b.departure_at)}</p>
                <p className="text-xs text-gray-500">{b.seats_count} passager(s) · {money(b.total_price, b.currency)}</p>
                {b.pnr && <p className="text-[11px] font-bold mt-1 tracking-widest" style={{ color: ORANGE }}>PNR {b.pnr}</p>}
                <div className="flex items-center gap-3 mt-2">
                  {b.source === 'duffel' && (
                    <button onClick={() => downloadEticket(b.id, b.pnr)} data-testid={`flight-eticket-${b.id}`} className="text-xs font-semibold flex items-center gap-1" style={{ color: NAVY }}>
                      <DownloadSimple size={14} weight="bold" /> E-billet
                    </button>
                  )}
                  {b.status === 'confirmed' && b.source !== 'duffel' && (
                    <button onClick={() => cancel(b.id)} data-testid={`flight-cancel-${b.id}`} className="text-xs font-semibold text-rose-600">Annuler</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CTA — mode SB */}
      {mode === 'sb' && step === 'book' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2"><ShieldCheck size={14} className="text-emerald-500" /> Paiement via SB Pay · annulation gratuite avant le départ</div>
          <button onClick={book} disabled={busy || validPax.length === 0}
            data-testid="flight-book-btn" className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg disabled:opacity-50" style={{ background: ORANGE }}>
            {busy ? 'Traitement…' : (validPax.length > 0 ? `Réserver ${validPax.length} place(s) · ${money(total)}` : 'Saisissez un passager')}
          </button>
        </div>
      )}

      {/* CTA — mode Live */}
      {mode === 'live' && step === 'book' && lOffer && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2"><ShieldCheck size={14} className="text-emerald-500" /> Paiement via SB Pay · e-billet PNR immédiat</div>
          <button onClick={liveBookNow} disabled={busy}
            data-testid="live-book-btn" className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg disabled:opacity-50" style={{ background: ORANGE }}>
            {busy ? 'Réservation…' : `Réserver · ${money(liveTotal, lOffer.total_currency)}`}
          </button>
        </div>
      )}
    </div>
  );
};

export default FlightsPage;
