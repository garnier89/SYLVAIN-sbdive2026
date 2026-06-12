import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Users, MapPin, Plus, X, SteeringWheel, Phone, CheckCircle, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { carpoolAPI } from '../../services/api';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};
const money = (n) => `${Number(n || 0).toFixed(2)}€`;

const RIDE_STATUS = {
  open: { label: 'Ouvert', cls: 'bg-emerald-100 text-emerald-700' },
  full: { label: 'Complet', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Terminé', cls: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Annulé', cls: 'bg-rose-100 text-rose-600' },
};
const PAX_STATUS = {
  booked: { label: 'Réservé', cls: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Terminé', cls: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Annulé', cls: 'bg-rose-100 text-rose-600' },
  refunded: { label: 'Remboursé', cls: 'bg-blue-100 text-blue-700' },
};

const CarPoolPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('search');
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [bookTrip, setBookTrip] = useState(null);
  const [maxSeats, setMaxSeats] = useState(4);
  const [mine, setMine] = useState({ as_driver: [], as_passenger: [] });
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    carpoolAPI.search().then((r) => setTrips(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTrips([])).finally(() => setLoading(false));
  }, []);
  const loadMine = useCallback(() => {
    carpoolAPI.myRides().then((r) => setMine(r.data || { as_driver: [], as_passenger: [] })).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    carpoolAPI.config().then((r) => setMaxSeats(r.data?.max_seats_per_booking || 4)).catch(() => {});
  }, [load]);
  useEffect(() => { if (tab === 'mine') loadMine(); }, [tab, loadMine]);

  const filtered = trips.filter((t) =>
    !search.trim() ||
    (t.pickup_address || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.dropoff_address || '').toLowerCase().includes(search.toLowerCase())
  );

  const doCancelBooking = async (id) => {
    if (!window.confirm('Annuler votre réservation ? Vous serez remboursé si le départ n\'est pas passé.')) return;
    setBusy(id);
    try {
      const r = await carpoolAPI.cancelBooking(id);
      toast.success(r.data.refunded > 0 ? `Annulé · remboursé ${money(r.data.refunded)}` : 'Réservation annulée');
      loadMine();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    setBusy(null);
  };
  const doComplete = async (id) => {
    if (!window.confirm('Terminer le trajet ? Le paiement (moins commission) sera crédité sur votre portefeuille.')) return;
    setBusy(id);
    try {
      const r = await carpoolAPI.complete(id);
      toast.success(`Trajet terminé · ${money(r.data.driver_credited)} crédités`);
      loadMine();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    setBusy(null);
  };
  const doCancelRide = async (id) => {
    if (!window.confirm('Annuler tout le trajet ? Tous les passagers seront remboursés.')) return;
    setBusy(id);
    try {
      const r = await carpoolAPI.cancelRide(id);
      toast.success(`Trajet annulé · ${money(r.data.refunded)} remboursés`);
      loadMine();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    setBusy(null);
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="carpool-page">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Covoiturage</h1>
          <p className="text-xs text-white/80">Voyagez à petit prix · paiement SB Pay sécurisé</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100">
        <button onClick={() => setTab('search')} data-testid="tab-search"
          className={`flex-1 py-3 text-sm font-bold ${tab === 'search' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-400'}`}>
          Rechercher
        </button>
        <button onClick={() => setTab('mine')} data-testid="tab-mine"
          className={`flex-1 py-3 text-sm font-bold ${tab === 'mine' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-400'}`}>
          Mes trajets
        </button>
      </div>

      {tab === 'search' && (
        <>
          <div className="px-4 pt-3">
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ville de départ ou destination..." className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-400" data-testid="search-input" />
            </div>
          </div>
          <button onClick={() => setShowPublish(true)} className="mx-4 mt-3 w-[calc(100%-32px)] bg-white border-2 border-dashed border-emerald-400 rounded-xl py-3 flex items-center justify-center gap-2 text-emerald-600 font-semibold text-sm" data-testid="publish-trip-btn">
            <Plus size={16} weight="bold" />Publier un trajet
          </button>

          <div className="px-4 mt-4">
            {loading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12" data-testid="carpool-empty">
                <SteeringWheel size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-400 text-sm">Aucun trajet disponible. Soyez le premier à en publier un !</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((t) => (
                  <div key={t.id} className="w-full bg-white rounded-2xl border border-gray-100 p-4" data-testid={`trip-${t.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center text-white font-bold">{(t.driver_name || '?').charAt(0)}</div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{t.driver_name}</p>
                          <p className="text-[11px] text-gray-400">{fmtDate(t.departure_date)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-600">{t.price_per_seat}€</p>
                        <p className="text-[10px] text-gray-500">/ place</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={14} className="text-emerald-500 flex-shrink-0" weight="fill" />
                      <p className="font-semibold text-gray-800 truncate">{t.pickup_address} → {t.dropoff_address}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="flex items-center gap-1 text-xs text-gray-500"><Users size={13} />{t.seats_left} place(s) restante(s)</span>
                      <button
                        onClick={() => setBookTrip(t)}
                        disabled={t.seats_left === 0}
                        data-testid={`book-trip-${t.id}`}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"
                      >
                        {t.seats_left === 0 ? 'Complet' : 'Réserver'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'mine' && (
        <div className="px-4 mt-4 space-y-5" data-testid="carpool-mine">
          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase mb-2">Je voyage (passager)</h2>
            {mine.as_passenger.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune réservation.</p>
            ) : mine.as_passenger.map((t) => {
              const me = (t.passengers || []).find((p) => PAX_STATUS[p.status]) || {};
              const st = PAX_STATUS[me.status] || RIDE_STATUS[t.status] || {};
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-4 mb-3" data-testid={`mine-pax-${t.id}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 text-sm truncate">{t.pickup_address} → {t.dropoff_address}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls || 'bg-gray-100 text-gray-500'}`}>{st.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(t.departure_date)} · {me.seats || 1} place(s) · {money(me.amount_paid)}</p>
                  <div className="flex items-center justify-between mt-2">
                    {t.driver_phone ? (
                      <a href={`tel:${t.driver_phone}`} data-testid={`call-driver-${t.id}`} className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        <Phone size={13} weight="fill" /> Appeler {t.driver_name}
                      </a>
                    ) : <span className="text-[11px] text-gray-400">{t.driver_name}</span>}
                    {me.status === 'booked' && t.status !== 'cancelled' && (
                      <button onClick={() => doCancelBooking(t.id)} disabled={busy === t.id} data-testid={`cancel-booking-${t.id}`} className="text-xs font-semibold text-rose-600 disabled:opacity-40">
                        Annuler (remboursé)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase mb-2">Je conduis (chauffeur)</h2>
            {mine.as_driver.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun trajet publié.</p>
            ) : mine.as_driver.map((t) => {
              const st = RIDE_STATUS[t.status] || {};
              const active = (t.passengers || []).filter((p) => p.status === 'booked');
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-4 mb-3" data-testid={`mine-driver-${t.id}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 text-sm truncate">{t.pickup_address} → {t.dropoff_address}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls || 'bg-gray-100 text-gray-500'}`}>{st.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(t.departure_date)} · {t.price_per_seat}€/place · {active.length} passager(s)</p>
                  {active.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {active.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2 py-1">
                          <span className="text-gray-700">{p.name} · {p.seats} place(s)</span>
                          {p.phone && <a href={`tel:${p.phone}`} className="text-emerald-600 font-semibold flex items-center gap-1"><Phone size={11} weight="fill" />{p.phone}</a>}
                        </div>
                      ))}
                    </div>
                  )}
                  {(t.status === 'open' || t.status === 'full') && (
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => doComplete(t.id)} disabled={busy === t.id} data-testid={`complete-ride-${t.id}`} className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold disabled:opacity-40">
                        Terminer (encaisser)
                      </button>
                      <button onClick={() => doCancelRide(t.id)} disabled={busy === t.id} data-testid={`cancel-ride-${t.id}`} className="flex-1 py-2 rounded-lg border border-rose-300 text-rose-600 text-xs font-bold disabled:opacity-40">
                        Annuler le trajet
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {showPublish && <PublishTripModal onClose={() => setShowPublish(false)} onPublished={() => { setShowPublish(false); load(); }} />}
      {bookTrip && <BookSeatModal trip={bookTrip} maxSeats={maxSeats} onClose={() => setBookTrip(null)} onBooked={() => { setBookTrip(null); load(); }} />}
    </div>
  );
};

const BookSeatModal = ({ trip, maxSeats, onClose, onBooked }) => {
  const cap = Math.min(trip.seats_left || 1, maxSeats || 1);
  const [seats, setSeats] = useState(1);
  const [saving, setSaving] = useState(false);
  const total = (trip.price_per_seat || 0) * seats;

  const confirm = async () => {
    setSaving(true);
    try {
      const r = await carpoolAPI.book(trip.id, seats);
      toast.success(`Place réservée · ${money(r.data.amount_paid)} (séquestre SB Pay)`);
      onBooked();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de la réservation'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onClose} data-testid="book-modal">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-900">Réserver</h3>
          <button onClick={onClose} className="text-gray-400" data-testid="book-close"><X size={22} /></button>
        </div>
        <p className="text-sm text-gray-600 mb-3">{trip.pickup_address} → {trip.dropoff_address}</p>
        <label className="text-xs font-semibold text-gray-500 uppercase">Nombre de places</label>
        <div className="flex items-center gap-3 mt-1 mb-4">
          <button onClick={() => setSeats((s) => Math.max(1, s - 1))} className="w-10 h-10 rounded-full border border-gray-200 text-xl font-bold" data-testid="book-seats-minus">−</button>
          <span className="text-2xl font-black w-10 text-center" data-testid="book-seats-count">{seats}</span>
          <button onClick={() => setSeats((s) => Math.min(cap, s + 1))} disabled={seats >= cap} className="w-10 h-10 rounded-full border border-gray-200 text-xl font-bold disabled:opacity-30" data-testid="book-seats-plus">+</button>
          <span className="text-xs text-gray-400 ml-2">max {cap}</span>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 mb-3">
          <span className="text-sm text-gray-600">Total (séquestre)</span>
          <span className="text-xl font-black text-emerald-600" data-testid="book-total">{money(total)}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-3">
          <ShieldCheck size={14} className="text-emerald-500" /> Montant bloqué en sécurité, reversé au chauffeur après le trajet · remboursable avant le départ.
        </div>
        <button onClick={confirm} disabled={saving} data-testid="book-confirm" className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? 'Réservation…' : <><CheckCircle size={18} weight="fill" /> Payer & réserver {money(total)}</>}
        </button>
      </div>
    </div>
  );
};

const PublishTripModal = ({ onClose, onPublished }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [when, setWhen] = useState('');
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState(10);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!from.trim() || !to.trim() || !when) { toast.error('Renseignez départ, destination et date'); return; }
    setSaving(true);
    try {
      await carpoolAPI.create({
        pickup_address: from.trim(), dropoff_address: to.trim(), departure_date: when,
        available_seats: parseInt(seats) || 1, price_per_seat: parseFloat(price) || 0,
      });
      toast.success('Trajet publié !');
      onPublished();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de la publication'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onClose} data-testid="publish-modal">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Publier un trajet</h3>
          <button onClick={onClose} className="text-gray-400" data-testid="publish-close"><X size={22} /></button>
        </div>
        <label className="text-xs font-semibold text-gray-500 uppercase">Ville de départ</label>
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Ex: Fort-de-France" data-testid="publish-from" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 mb-3 text-sm" />
        <label className="text-xs font-semibold text-gray-500 uppercase">Destination</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Ex: Le Marin" data-testid="publish-to" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 mb-3 text-sm" />
        <label className="text-xs font-semibold text-gray-500 uppercase">Date et heure</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} data-testid="publish-when" min={new Date().toISOString().slice(0, 16)} className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 mb-3 text-sm" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Places</label>
            <input type="number" min="1" max="8" value={seats} onChange={(e) => setSeats(e.target.value)} data-testid="publish-seats" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Prix / place (€)</label>
            <input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="publish-price" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>
        </div>
        <button onClick={submit} disabled={saving} data-testid="publish-submit" className="w-full py-3 rounded-xl bg-emerald-500 text-white font-semibold disabled:opacity-50">
          {saving ? 'Publication…' : 'Publier le trajet'}
        </button>
      </div>
    </div>
  );
};

export default CarPoolPage;
