import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, AirplaneTilt, MapPin, CheckCircle, X, ShieldCheck,
  ArrowRight, Clock, Suitcase, User,
} from '@phosphor-icons/react';
import { flightsAPI } from '../../services/api';

const NAVY = '#0A2540';
const ORANGE = '#FF5000';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const border = '1px solid #E5E7EB';

const fmtTime = (s) => { try { return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
const fmtDur = (m) => `${Math.floor((m || 0) / 60)}h${String((m || 0) % 60).padStart(2, '0')}`;

const STATUS_LABELS = {
  confirmed: { label: 'Confirmé', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Annulé', cls: 'bg-slate-100 text-slate-500' },
};

const FlightsPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('search'); // search | book | done | mine
  const [airports, setAirports] = useState({ origins: [], destinations: [] });
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [flights, setFlights] = useState([]);
  const [flight, setFlight] = useState(null);
  const [passengers, setPassengers] = useState([{ name: '', type: 'adult' }]);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);

  const loadFlights = () => flightsAPI.search({ origin: origin || undefined, destination: destination || undefined, date: date || undefined })
    .then((r) => setFlights(r.data.flights || [])).catch(() => {});
  const loadMine = () => flightsAPI.myBookings().then((r) => setMine(r.data.bookings || [])).catch(() => {});

  useEffect(() => { flightsAPI.airports().then((r) => setAirports(r.data || { origins: [], destinations: [] })).catch(() => {}); loadFlights(); }, []);

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

  const cancel = async (id) => {
    if (!window.confirm('Annuler ce vol ?')) return;
    try { const r = await flightsAPI.cancel(id); toast.success(r.data.refunded > 0 ? `Annulé · remboursé ${money(r.data.refunded)}` : 'Annulé'); loadMine(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };

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

      {/* SEARCH */}
      {step === 'search' && (
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

      {/* BOOK */}
      {step === 'book' && flight && (
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
          <p className="text-sm text-gray-500 mt-2">Votre réservation est confirmée. Retrouvez-la dans « Mes vols ».</p>
          <button onClick={() => { setStep('mine'); loadMine(); }} className="mt-6 w-full min-h-[48px] rounded-xl font-bold text-white" style={{ background: NAVY }} data-testid="flight-see-mine">Voir mes vols</button>
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
                <p className="text-xs text-gray-500">{b.seats_count} passager(s) · {money(b.total_price)}</p>
                {b.status === 'confirmed' && (
                  <button onClick={() => cancel(b.id)} data-testid={`flight-cancel-${b.id}`} className="mt-2 text-xs font-semibold text-rose-600">Annuler</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* sticky CTA for book step */}
      {step === 'book' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2"><ShieldCheck size={14} className="text-emerald-500" /> Paiement via SB Pay · annulation gratuite avant le départ</div>
          <button onClick={book} disabled={busy || validPax.length === 0}
            data-testid="flight-book-btn" className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg disabled:opacity-50" style={{ background: ORANGE }}>
            {busy ? 'Traitement…' : (validPax.length > 0 ? `Réserver ${validPax.length} place(s) · ${money(total)}` : 'Saisissez un passager')}
          </button>
        </div>
      )}
    </div>
  );
};

export default FlightsPage;
