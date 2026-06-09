import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Users, Calendar, MapPin, Plus, X, SteeringWheel } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const CarPoolPage = () => {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [booking, setBooking] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/carpool/rides`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTrips(Array.isArray(d) ? d : []))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = trips.filter((t) =>
    !search.trim() ||
    (t.pickup_address || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.dropoff_address || '').toLowerCase().includes(search.toLowerCase())
  );

  const seatsLeft = (t) => Math.max(0, (t.available_seats || 0) - (t.passengers || []).length);

  const book = async (t) => {
    setBooking(t.id);
    try {
      const r = await fetch(`${API}/api/carpool/rides/${t.id}/book`, { method: 'POST', credentials: 'include' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || 'Échec de la réservation');
      toast.success('Place réservée !');
      load();
    } catch (e) {
      toast.error(e.message || 'Échec de la réservation');
    } finally {
      setBooking(null);
    }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="carpool-page">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Covoiturage</h1>
          <p className="text-xs text-white/80">Voyagez à petit prix entre villes</p>
        </div>
      </div>

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
            {filtered.map((t) => {
              const left = seatsLeft(t);
              return (
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
                    <span className="flex items-center gap-1 text-xs text-gray-500"><Users size={13} />{left} place(s) restante(s)</span>
                    <button
                      onClick={() => book(t)}
                      disabled={left === 0 || booking === t.id}
                      data-testid={`book-trip-${t.id}`}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"
                    >
                      {left === 0 ? 'Complet' : booking === t.id ? '…' : 'Réserver'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showPublish && <PublishTripModal onClose={() => setShowPublish(false)} onPublished={() => { setShowPublish(false); load(); }} />}
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
      const r = await fetch(`${API}/api/carpool/rides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_address: from.trim(),
          dropoff_address: to.trim(),
          departure_date: when,
          available_seats: parseInt(seats) || 1,
          price_per_seat: parseFloat(price) || 0,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success('Trajet publié !');
      onPublished();
    } catch {
      toast.error('Échec de la publication');
    } finally {
      setSaving(false);
    }
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
