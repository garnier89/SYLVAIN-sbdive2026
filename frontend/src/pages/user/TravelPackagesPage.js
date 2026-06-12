import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Suitcase, AirplaneTilt, Bed, CheckCircle, X, ShieldCheck,
  ArrowRight, Tag, User, CalendarBlank,
} from '@phosphor-icons/react';
import { travelPackagesAPI } from '../../services/api';

const NAVY = '#0A2540';
const ORANGE = '#FF5000';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const border = '1px solid #E5E7EB';
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); } catch { return s; } };

const STATUS_LABELS = {
  confirmed: { label: 'Confirmé', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Annulé', cls: 'bg-slate-100 text-slate-500' },
};

const TravelPackagesPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('list'); // list | book | done | mine
  const [packages, setPackages] = useState([]);
  const [pkg, setPkg] = useState(null);
  const [passengers, setPassengers] = useState([{ name: '', type: 'adult' }]);
  const [roomsCount, setRoomsCount] = useState(1);
  const [checkIn, setCheckIn] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);

  const loadList = () => travelPackagesAPI.list().then((r) => setPackages(r.data.packages || [])).catch(() => {});
  const loadMine = () => travelPackagesAPI.myBookings().then((r) => setMine(r.data.bookings || [])).catch(() => {});
  useEffect(() => { loadList(); }, []);

  const openPkg = (p) => {
    setPkg(p); setPassengers([{ name: '', type: 'adult' }]); setRoomsCount(1);
    setCheckIn((p.flight?.arrival_at || '').slice(0, 10)); setStep('book');
  };

  const validPax = passengers.filter((x) => x.name.trim());
  useEffect(() => {
    if (step === 'book' && pkg) {
      travelPackagesAPI.quote(pkg.id, { travelers: Math.max(1, validPax.length), rooms_count: roomsCount, check_in: checkIn || undefined })
        .then((r) => setQuote(r.data)).catch(() => setQuote(null));
    }
    // eslint-disable-next-line
  }, [step, pkg, passengers, roomsCount, checkIn]);

  const setPax = (i, k, v) => setPassengers((arr) => arr.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPax = () => setPassengers((arr) => [...arr, { name: '', type: 'adult' }]);
  const removePax = (i) => setPassengers((arr) => arr.filter((_, idx) => idx !== i));

  const book = async () => {
    if (validPax.length === 0) { toast.error('Saisissez au moins un voyageur'); return; }
    setBusy(true);
    try {
      await travelPackagesAPI.book(pkg.id, { passengers: validPax, rooms_count: roomsCount, check_in: checkIn || undefined });
      setStep('done'); loadMine();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec de la réservation'); }
    setBusy(false);
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler ce forfait (vol + hôtel) ?')) return;
    try { const r = await travelPackagesAPI.cancel(id); toast.success(r.data.refunded > 0 ? `Annulé · remboursé ${money(r.data.refunded)}` : 'Annulé'); loadMine(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-28" data-testid="travel-packages-page">
      <header className="sticky top-0 z-30 px-4 py-3.5 flex items-center gap-3 text-white" style={{ background: NAVY }}>
        <button onClick={() => (step === 'list' ? navigate(-1) : setStep('list'))} aria-label="Retour" data-testid="pkg-back-btn" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Work Sans, sans-serif' }}><Suitcase size={20} weight="fill" /> Forfaits Vol + Hôtel</h1>
          <p className="text-[11px] text-white/70 -mt-0.5">Packages voyage à prix réduit</p>
        </div>
        <button onClick={() => { setStep('mine'); loadMine(); }} data-testid="pkg-mine-btn" className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10">Mes voyages</button>
      </header>

      {/* LIST */}
      {step === 'list' && (
        <div className="p-4 space-y-3" data-testid="pkg-list">
          {packages.length === 0 && <p className="text-sm text-gray-400">Aucun forfait disponible pour le moment.</p>}
          {packages.map((p) => (
            <button key={p.id} onClick={() => openPkg(p)} data-testid={`pkg-card-${p.id}`} className="w-full text-left bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border }}>
              <div className="h-28 bg-gradient-to-br from-[#1D4ED8] to-[#0E7490] flex items-center justify-center relative">
                {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <Suitcase size={40} weight="duotone" className="text-white/70" />}
                {p.discount_pct > 0 && <span className="absolute top-2 right-2 text-[11px] font-black px-2 py-1 rounded-full bg-[#FF5000] text-white flex items-center gap-1"><Tag size={11} weight="fill" /> -{p.discount_pct}%</span>}
              </div>
              <div className="p-3">
                <p className="font-bold text-gray-900">{p.title}</p>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-1">
                  <span className="flex items-center gap-1"><AirplaneTilt size={12} /> {p.flight?.origin} → {p.flight?.destination}</span>
                  <span className="flex items-center gap-1"><Bed size={12} /> {p.nights} nuit(s)</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span>
                    {p.savings > 0 && <span className="text-xs text-gray-400 line-through mr-1">{money(p.base_total)}</span>}
                    <span className="font-black" style={{ color: NAVY }}>{money(p.final_total)}</span>
                    <span className="text-[10px] text-gray-400"> /pers. indic.</span>
                  </span>
                  {p.savings > 0 && <span className="text-[11px] font-bold text-emerald-600">Économisez {money(p.savings)}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* BOOK */}
      {step === 'book' && pkg && (
        <div className="p-4 space-y-4" data-testid="pkg-book">
          <div className="bg-white rounded-2xl p-3" style={{ border }}>
            <p className="font-bold text-gray-900">{pkg.title}</p>
            {pkg.description && <p className="text-xs text-gray-500 mt-1">{pkg.description}</p>}
            <div className="mt-2 rounded-lg bg-gray-50 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-gray-700"><AirplaneTilt size={14} style={{ color: NAVY }} /> {pkg.flight?.airline} · {pkg.flight?.origin} <ArrowRight size={11} /> {pkg.flight?.destination} · {fmtDate(pkg.flight?.departure_at)}</div>
              <div className="flex items-center gap-2 text-xs text-gray-700"><Bed size={14} style={{ color: NAVY }} /> {pkg.hotel?.name} ({pkg.hotel?.stars}★) · {pkg.room?.name} · {pkg.nights} nuit(s)</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border }}>
            <label className="block text-xs font-semibold text-gray-600">Arrivée à l'hôtel <CalendarBlank size={12} className="inline" />
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} data-testid="pkg-checkin" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
            <label className="block text-xs font-semibold text-gray-600">Chambres
              <input type="number" min={1} value={roomsCount} onChange={(e) => setRoomsCount(Math.max(1, Number(e.target.value)))} data-testid="pkg-rooms-count" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border }}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900 flex items-center gap-2"><User size={18} style={{ color: ORANGE }} /> Voyageurs</p>
              <button onClick={addPax} data-testid="pkg-add-pax" className="text-xs font-bold" style={{ color: ORANGE }}>+ Ajouter</button>
            </div>
            {passengers.map((p, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`pkg-pax-row-${i}`}>
                <input value={p.name} onChange={(e) => setPax(i, 'name', e.target.value)} placeholder={`Nom voyageur ${i + 1}`} data-testid={`pkg-pax-name-${i}`} className="flex-1 min-h-[44px] px-3 rounded-lg text-sm" style={{ border }} />
                <select value={p.type} onChange={(e) => setPax(i, 'type', e.target.value)} className="min-h-[44px] px-2 rounded-lg text-sm" style={{ border }}>
                  <option value="adult">Adulte</option><option value="child">Enfant</option><option value="infant">Bébé</option>
                </select>
                {passengers.length > 1 && <button onClick={() => removePax(i)} className="text-rose-500" aria-label="Retirer"><X size={18} /></button>}
              </div>
            ))}
          </div>

          {quote && (
            <div className="bg-white rounded-2xl p-4 text-sm" style={{ border }} data-testid="pkg-quote">
              <div className="flex justify-between text-gray-500"><span>Prix normal</span><span className="line-through">{money(quote.base_total)}</span></div>
              <div className="flex justify-between text-emerald-600 font-semibold"><span>Remise forfait -{quote.discount_pct}%</span><span>−{money(quote.savings)}</span></div>
              <div className="flex justify-between font-black text-base mt-1" style={{ color: NAVY }}><span>Total</span><span>{money(quote.final_total)}</span></div>
              {!quote.available && <p className="text-[11px] text-rose-600 mt-1">Plus de disponibilité (vol ou hôtel) sur ces dates.</p>}
            </div>
          )}
        </div>
      )}

      {/* DONE */}
      {step === 'done' && (
        <div className="p-6 text-center" data-testid="pkg-done">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><CheckCircle size={36} weight="fill" className="text-emerald-500" /></div>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Forfait réservé 🧳</h2>
          <p className="text-sm text-gray-500 mt-2">Vol + hôtel confirmés en une fois. Retrouvez tout dans « Mes voyages ».</p>
          <button onClick={() => { setStep('mine'); loadMine(); }} className="mt-6 w-full min-h-[48px] rounded-xl font-bold text-white" style={{ background: NAVY }} data-testid="pkg-see-mine">Voir mes voyages</button>
        </div>
      )}

      {/* MINE */}
      {step === 'mine' && (
        <div className="p-4 space-y-3" data-testid="pkg-mine-list">
          {mine.length === 0 && <p className="text-sm text-gray-400">Aucun voyage réservé.</p>}
          {mine.map((b) => {
            const st = STATUS_LABELS[b.status] || { label: b.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={b.id} className="bg-white rounded-2xl p-4" style={{ border }} data-testid={`pkg-booking-${b.id}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900">{b.title}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><AirplaneTilt size={12} /> {b.airline} · {b.origin} → {b.destination} · {fmtDate(b.departure_at)}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1"><Bed size={12} /> {b.hotel_name} · {b.check_in} → {b.check_out} ({b.nights} nuit(s))</p>
                <p className="text-xs text-gray-500">{b.travelers} voyageur(s) · {b.rooms_count} chambre(s)</p>
                <p className="text-sm font-bold mt-1" style={{ color: NAVY }}>{money(b.total_price)} <span className="text-[11px] font-normal text-emerald-600">(économie {money(b.savings)})</span></p>
                {b.status === 'confirmed' && (
                  <button onClick={() => cancel(b.id)} data-testid={`pkg-cancel-${b.id}`} className="mt-2 text-xs font-semibold text-rose-600">Annuler</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* sticky CTA */}
      {step === 'book' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2"><ShieldCheck size={14} className="text-emerald-500" /> Paiement unique SB Pay · vol + hôtel · annulation avant l'arrivée</div>
          <button onClick={book} disabled={busy || validPax.length === 0 || (quote && !quote.available)}
            data-testid="pkg-book-btn" className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg disabled:opacity-50" style={{ background: ORANGE }}>
            {busy ? 'Traitement…' : (quote ? `Réserver · ${money(quote.final_total)}` : 'Saisissez un voyageur')}
          </button>
        </div>
      )}
    </div>
  );
};

export default TravelPackagesPage;
