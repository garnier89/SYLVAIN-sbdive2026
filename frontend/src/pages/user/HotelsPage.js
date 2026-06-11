import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Bed, CaretRight, MapPin, Star, MagnifyingGlass, CheckCircle,
  Users, CalendarBlank, ShieldCheck,
} from '@phosphor-icons/react';
import { hotelsAPI } from '../../services/api';

const NAVY = '#0A2540';
const ORANGE = '#FF5000';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const border = '1px solid #E5E7EB';

const Stars = ({ n }) => (
  <span className="inline-flex items-center gap-0.5">
    {Array.from({ length: n || 0 }).map((_, i) => <Star key={i} size={12} weight="fill" className="text-amber-400" />)}
  </span>
);

const STATUS_LABELS = {
  confirmed: { label: 'Confirmée', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Annulée', cls: 'bg-slate-100 text-slate-500' },
  completed: { label: 'Terminée', cls: 'bg-slate-100 text-slate-600' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const HotelsPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('search'); // search | detail | done | mine
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState('');
  const [search, setSearch] = useState('');
  const [hotels, setHotels] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);
  const [roomsCount, setRoomsCount] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);

  const loadHotels = () => hotelsAPI.list({ city: city || undefined, search: search || undefined })
    .then((r) => setHotels(r.data.hotels || [])).catch(() => {});
  const loadMine = () => hotelsAPI.myBookings().then((r) => setMine(r.data.bookings || [])).catch(() => {});

  useEffect(() => { hotelsAPI.cities().then((r) => setCities(r.data.cities || [])).catch(() => {}); loadHotels(); }, []);
  useEffect(() => { if (step === 'search') loadHotels(); /* eslint-disable-next-line */ }, [city]);

  const openHotel = (h) => {
    hotelsAPI.detail(h.id, { check_in: checkIn || undefined, check_out: checkOut || undefined })
      .then((r) => { setHotel(r.data); setSelectedRoom(null); setStep('detail'); })
      .catch(() => toast.error('Impossible de charger cet hôtel'));
  };

  const refreshDetail = () => {
    if (!hotel) return;
    hotelsAPI.detail(hotel.id, { check_in: checkIn || undefined, check_out: checkOut || undefined })
      .then((r) => setHotel(r.data)).catch(() => {});
  };
  useEffect(() => { if (step === 'detail') refreshDetail(); /* eslint-disable-next-line */ }, [checkIn, checkOut]);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const d = (new Date(checkOut) - new Date(checkIn)) / 86400000;
    return d > 0 ? Math.round(d) : 0;
  }, [checkIn, checkOut]);

  const book = async () => {
    if (!selectedRoom) { toast.error('Choisissez une chambre'); return; }
    if (nights <= 0) { toast.error('Choisissez des dates valides'); return; }
    setBusy(true);
    try {
      await hotelsAPI.book({ room_id: selectedRoom.id, check_in: checkIn, check_out: checkOut, guests, rooms_count: roomsCount });
      setStep('done'); loadMine();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec de la réservation'); }
    setBusy(false);
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette réservation ?')) return;
    try { const r = await hotelsAPI.cancel(id); toast.success(r.data.refunded > 0 ? `Annulée · remboursé ${money(r.data.refunded)}` : 'Annulée'); loadMine(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-24" data-testid="hotels-page">
      <header className="sticky top-0 z-30 px-4 py-3.5 flex items-center gap-3 text-white" style={{ background: NAVY }}>
        <button onClick={() => (step === 'search' ? navigate(-1) : setStep('search'))} aria-label="Retour" data-testid="hotels-back-btn" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Work Sans, sans-serif' }}><Bed size={20} weight="fill" /> Hôtels</h1>
          <p className="text-[11px] text-white/70 -mt-0.5">Réservez votre séjour</p>
        </div>
        <button onClick={() => { setStep('mine'); loadMine(); }} data-testid="hotels-mine-btn" className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10">Mes séjours</button>
      </header>

      {/* SEARCH */}
      {step === 'search' && (
        <div className="p-4 space-y-3" data-testid="hotels-search">
          <div className="bg-white rounded-2xl p-3 space-y-2" style={{ border }}>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border }}>
              <MagnifyingGlass size={16} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadHotels()}
                placeholder="Rechercher un hôtel ou une ville" data-testid="hotels-search-input" className="flex-1 text-sm outline-none" />
              <button onClick={loadHotels} data-testid="hotels-search-btn" className="text-xs font-bold" style={{ color: ORANGE }}>OK</button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setCity('')} data-testid="hotels-city-all" className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${!city ? 'text-white' : 'bg-gray-100 text-gray-600'}`} style={!city ? { background: NAVY } : {}}>Toutes</button>
              {cities.map((c) => (
                <button key={c} onClick={() => setCity(c)} data-testid={`hotels-city-${c}`} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${city === c ? 'text-white' : 'bg-gray-100 text-gray-600'}`} style={city === c ? { background: NAVY } : {}}>{c}</button>
              ))}
            </div>
          </div>
          {hotels.length === 0 && <p className="text-sm text-gray-400">Aucun hôtel trouvé.</p>}
          {hotels.map((h) => (
            <button key={h.id} onClick={() => openHotel(h)} data-testid={`hotel-card-${h.id}`}
              className="w-full flex items-center gap-3 bg-white rounded-2xl p-3 text-left shadow-sm" style={{ border }}>
              <div className="w-24 h-20 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                {h.image_url ? <img src={h.image_url} alt="" className="w-full h-full object-cover" /> : <Bed size={32} weight="duotone" className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{h.name}</p>
                <Stars n={h.stars} />
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {h.city}</p>
                <p className="text-xs text-gray-500 mt-1">À partir de <b style={{ color: NAVY }}>{money(h.min_price)}</b><span className="text-[10px] text-gray-400">/nuit</span></p>
              </div>
              <CaretRight size={16} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* DETAIL */}
      {step === 'detail' && hotel && (
        <div className="p-4 space-y-4" data-testid="hotel-detail">
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border }}>
            <div className="h-36 bg-gray-100 flex items-center justify-center">
              {hotel.image_url ? <img src={hotel.image_url} alt="" className="w-full h-full object-cover" /> : <Bed size={48} weight="duotone" className="text-gray-300" />}
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between"><p className="font-bold text-gray-900">{hotel.name}</p><Stars n={hotel.stars} /></div>
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {hotel.address || hotel.city}</p>
              {hotel.description && <p className="text-xs text-gray-500 mt-2">{hotel.description}</p>}
              {hotel.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {hotel.amenities.map((a, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{a}</span>)}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border }}>
            <p className="font-bold text-gray-900 flex items-center gap-2"><CalendarBlank size={18} style={{ color: ORANGE }} /> Votre séjour</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-600">Arrivée
                <input type="date" min={todayStr()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} data-testid="hotel-checkin" className="w-full min-h-[44px] px-2 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
              <label className="block text-xs font-semibold text-gray-600">Départ
                <input type="date" min={checkIn || todayStr()} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} data-testid="hotel-checkout" className="w-full min-h-[44px] px-2 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-600">Voyageurs
                <input type="number" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))} data-testid="hotel-guests" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
              <label className="block text-xs font-semibold text-gray-600">Chambres
                <input type="number" min={1} value={roomsCount} onChange={(e) => setRoomsCount(Math.max(1, Number(e.target.value)))} data-testid="hotel-rooms-count" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
            </div>
            {nights > 0 && <p className="text-xs text-gray-500">{nights} nuit(s)</p>}
          </div>

          <div className="space-y-2" data-testid="hotel-rooms">
            <p className="font-bold text-gray-900">Chambres disponibles</p>
            {(hotel.rooms || []).map((r) => {
              const unavailable = nights > 0 && r.available_units < roomsCount;
              return (
                <button key={r.id} onClick={() => !unavailable && setSelectedRoom(r)} disabled={unavailable} data-testid={`hotel-room-${r.id}`}
                  className={`w-full text-left bg-white rounded-2xl p-3 border-2 transition-colors ${selectedRoom?.id === r.id ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-200'} ${unavailable ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-gray-900">{r.name}</p>
                    {selectedRoom?.id === r.id && <CheckCircle size={18} weight="fill" style={{ color: ORANGE }} />}
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5"><Users size={12} /> {r.capacity} pers. · {r.beds}</p>
                  {r.amenities?.length > 0 && <p className="text-[10px] text-gray-400 mt-1">{r.amenities.join(' · ')}</p>}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-black" style={{ color: NAVY }}>{money(r.price_per_night)}<span className="text-[10px] font-normal text-gray-400">/nuit</span></span>
                    {nights > 0 && (unavailable ? <span className="text-[11px] text-rose-600 font-semibold">Complet</span> : <span className="text-[11px] text-gray-500">{r.available_units} dispo · total {money(r.total_for_stay * roomsCount)}</span>)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* DONE */}
      {step === 'done' && (
        <div className="p-6 text-center" data-testid="hotel-done">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><CheckCircle size={36} weight="fill" className="text-emerald-500" /></div>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Réservation confirmée 🏨</h2>
          <p className="text-sm text-gray-500 mt-2">Votre séjour est réservé. Retrouvez les détails dans « Mes séjours ».</p>
          <button onClick={() => { setStep('mine'); loadMine(); }} className="mt-6 w-full min-h-[48px] rounded-xl font-bold text-white" style={{ background: NAVY }} data-testid="hotel-see-mine">Voir mes séjours</button>
        </div>
      )}

      {/* MINE */}
      {step === 'mine' && (
        <div className="p-4 space-y-3" data-testid="hotels-mine-list">
          {mine.length === 0 && <p className="text-sm text-gray-400">Aucun séjour réservé.</p>}
          {mine.map((b) => {
            const st = STATUS_LABELS[b.status] || { label: b.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={b.id} className="bg-white rounded-2xl p-4" style={{ border }} data-testid={`hotel-booking-${b.id}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900">{b.hotel_name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{b.room_name} · {b.rooms_count} chambre(s) · {b.guests} voyageur(s)</p>
                <p className="text-xs text-gray-500">{b.check_in} → {b.check_out} · {b.nights} nuit(s)</p>
                <p className="text-sm font-bold mt-1" style={{ color: NAVY }}>{money(b.total_price)}</p>
                {b.status === 'confirmed' && (
                  <button onClick={() => cancel(b.id)} data-testid={`hotel-cancel-${b.id}`} className="mt-2 text-xs font-semibold text-rose-600">Annuler</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* sticky CTA for detail step */}
      {step === 'detail' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2"><ShieldCheck size={14} className="text-emerald-500" /> Paiement via SB Pay · annulation gratuite avant l'arrivée</div>
          <button onClick={book} disabled={busy || !selectedRoom || nights <= 0}
            data-testid="hotel-book-btn" className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg disabled:opacity-50" style={{ background: ORANGE }}>
            {busy ? 'Traitement…' : (selectedRoom && nights > 0 ? `Réserver · ${money(selectedRoom.price_per_night * nights * roomsCount)}` : 'Choisissez chambre & dates')}
          </button>
        </div>
      )}
    </div>
  );
};

export default HotelsPage;
