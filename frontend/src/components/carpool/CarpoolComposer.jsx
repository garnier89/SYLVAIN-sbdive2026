import React, { useState, useMemo, useCallback } from 'react';
import {
  X, NavigationArrow, ArrowRight, Star, ShieldCheck, Sparkle, Armchair,
  CalendarBlank, CurrencyEur, MapPin, CheckCircle,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import GooglePlacesInput from '../GooglePlacesInput';
import { getCurrentLocation } from '../../lib/googleMaps';
import { carpoolAPI } from '../../services/api';

const money = (n) => `${Number(n || 0).toFixed(2)}€`;

// Distance à vol d'oiseau (Haversine) → base du prix conseillé.
const haversineKm = (a, b) => {
  if (!a?.lat || !b?.lat) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)) * 1.3 * 10) / 10; // ×1.3 ≈ route réelle
};

// Prix conseillé : base 1,5€ + 0,12€/km, arrondi à 0,50€ (couvre l'essence, pas du profit).
const suggestPrice = (km) => {
  if (!km) return null;
  const raw = 1.5 + km * 0.12;
  return Math.max(2, Math.round(raw * 2) / 2);
};

// Créneaux rapides : ce soir, demain matin, ce week-end (samedi 9h).
const quickSlots = () => {
  const now = new Date();
  const fmt = (d) => {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  };
  const tonight = new Date(now); tonight.setHours(18, 0, 0, 0);
  if (tonight <= now) tonight.setDate(tonight.getDate() + 1);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(8, 0, 0, 0);
  const sat = new Date(now); sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7)); sat.setHours(9, 0, 0, 0);
  return [
    { label: 'Ce soir 18h', value: fmt(tonight) },
    { label: 'Demain 8h', value: fmt(tomorrow) },
    { label: 'Samedi 9h', value: fmt(sat) },
  ];
};

const Sheet = ({ children, onClose, testid }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onClose} data-testid={testid}>
    <div className="bg-gray-50 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

/**
 * Composer innovant de publication de trajet (chauffeur).
 * - Adresses Google (autocomplétion) + « Ma position »
 * - Distance estimée → prix conseillé intelligent
 * - Sélecteur de places visuel, créneaux rapides
 * - Gain net en direct + aperçu de l'annonce telle que vue par les passagers
 */
export const PublishComposer = ({ onClose, onPublished, commissionPercent = 15, maxSeats = 8, driverName = 'Vous', prefill = null, requestId = null }) => {
  const [from, setFrom] = useState(prefill?.pickup_address || '');
  const [to, setTo] = useState(prefill?.dropoff_address || '');
  const [fromGeo, setFromGeo] = useState(prefill?.pickup_lat ? { lat: prefill.pickup_lat, lng: prefill.pickup_lng } : null);
  const [toGeo, setToGeo] = useState(prefill?.dropoff_lat ? { lat: prefill.dropoff_lat, lng: prefill.dropoff_lng } : null);
  const [when, setWhen] = useState(prefill?.departure_date || '');
  const [seats, setSeats] = useState(prefill?.seats_needed ? Math.min(maxSeats, prefill.seats_needed) : 3);
  const [price, setPrice] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const km = useMemo(() => haversineKm(fromGeo, toGeo), [fromGeo, toGeo]);
  const advised = useMemo(() => suggestPrice(km), [km]);
  const effPrice = price != null ? price : (advised || 10);
  const net = effPrice * (1 - commissionPercent / 100);
  const slots = useMemo(quickSlots, []);

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const loc = await getCurrentLocation();
      setFrom(loc.address || 'Ma position');
      setFromGeo({ lat: loc.lat, lng: loc.lng });
    } catch (e) {
      toast.error('Position indisponible. Saisissez l\'adresse manuellement.');
    }
    setLocating(false);
  }, []);

  const submit = async () => {
    if (!from.trim() || !to.trim() || !when) { toast.error('Renseignez départ, destination et date'); return; }
    setSaving(true);
    try {
      await carpoolAPI.create({
        pickup_address: from.trim(), dropoff_address: to.trim(), departure_date: when,
        available_seats: parseInt(seats) || 1, price_per_seat: parseFloat(effPrice) || 0,
        pickup_lat: fromGeo?.lat, pickup_lng: fromGeo?.lng,
        dropoff_lat: toGeo?.lat, dropoff_lng: toGeo?.lng,
        distance_km: km, notes: notes.trim(), request_id: requestId || undefined,
      });
      toast.success(requestId ? 'Trajet publié · passager prévenu 🚗' : 'Trajet publié !');
      onPublished();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de la publication'); }
    setSaving(false);
  };

  return (
    <Sheet onClose={onClose} testid="publish-modal">
      {/* En-tête gradient */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-500 text-white px-5 pt-5 pb-6 rounded-t-3xl relative">
        <button onClick={onClose} className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center" data-testid="publish-close"><X size={18} /></button>
        <div className="flex items-center gap-2 mb-1">
          <Sparkle size={18} weight="fill" />
          <span className="text-xs font-bold uppercase tracking-wide text-white/80">{requestId ? 'Répondre à une demande' : 'Nouveau trajet'}</span>
        </div>
        <h3 className="text-2xl font-black">Publiez en quelques taps</h3>
      </div>

      <div className="p-5 space-y-5 -mt-3 bg-gray-50 rounded-t-3xl">
        {/* Itinéraire */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-500 uppercase">Itinéraire</label>
            <button onClick={useMyLocation} disabled={locating} data-testid="publish-my-location" className="text-xs font-semibold text-emerald-600 flex items-center gap-1 disabled:opacity-50">
              <NavigationArrow size={13} weight="fill" /> {locating ? '...' : 'Ma position'}
            </button>
          </div>
          <GooglePlacesInput placeholder="Ville / point de départ" value={from} iconColor="#10b981" testId="publish-from"
            onChange={(v) => { setFrom(v); }} onSelect={(r) => { setFrom(r.address); setFromGeo({ lat: r.lat, lng: r.lng }); }} />
          <div className="flex items-center justify-center text-emerald-300"><ArrowRight size={16} className="rotate-90" /></div>
          <GooglePlacesInput placeholder="Destination" value={to} iconColor="#0d9488" testId="publish-to"
            onChange={(v) => { setTo(v); }} onSelect={(r) => { setTo(r.address); setToGeo({ lat: r.lat, lng: r.lng }); }} />
          {km != null && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-emerald-50 rounded-lg px-3 py-2" data-testid="publish-distance">
              <MapPin size={13} className="text-emerald-500" weight="fill" /> Distance estimée <b className="text-gray-700">≈ {km} km</b>
            </div>
          )}
        </div>

        {/* Quand */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5 mb-2"><CalendarBlank size={14} /> Quand partez-vous ?</label>
          <div className="flex gap-2 flex-wrap mb-3">
            {slots.map((s) => (
              <button key={s.value} onClick={() => setWhen(s.value)} data-testid={`publish-slot-${s.label}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${when === s.value ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} min={new Date().toISOString().slice(0, 16)}
            data-testid="publish-when" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {/* Places — sélecteur visuel */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5 mb-3"><Armchair size={14} /> Places disponibles</label>
          <div className="flex gap-2 flex-wrap" data-testid="publish-seats">
            {Array.from({ length: maxSeats }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => setSeats(n)} data-testid={`publish-seat-${n}`} aria-label={`${n} places`}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${n <= seats ? 'bg-emerald-500 text-white scale-100' : 'bg-gray-100 text-gray-300'}`}>
                <Armchair size={20} weight={n <= seats ? 'fill' : 'regular'} />
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2"><b className="text-gray-700">{seats}</b> place(s) proposée(s)</p>
        </div>

        {/* Prix conseillé */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5 mb-2"><CurrencyEur size={14} /> Prix par place</label>
          {advised != null && (
            <button onClick={() => setPrice(advised)} data-testid="publish-use-advised"
              className="w-full flex items-center justify-between bg-gradient-to-r from-amber-50 to-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Sparkle size={13} weight="fill" className="text-amber-500" /> Prix conseillé</span>
              <span className="text-lg font-black text-emerald-600">{money(advised)}</span>
            </button>
          )}
          <div className="flex items-center gap-3">
            <button onClick={() => setPrice(Math.max(0, (effPrice) - 0.5))} className="w-10 h-10 rounded-full border border-gray-200 text-xl font-bold" data-testid="publish-price-minus">−</button>
            <div className="flex-1 text-center">
              <span className="text-3xl font-black text-gray-900" data-testid="publish-price">{money(effPrice)}</span>
            </div>
            <button onClick={() => setPrice((effPrice) + 0.5)} className="w-10 h-10 rounded-full border border-gray-200 text-xl font-bold" data-testid="publish-price-plus">+</button>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs bg-emerald-50 rounded-lg px-3 py-2">
            <span className="text-gray-600">Vous gagnez (après {commissionPercent}% commission)</span>
            <b className="text-emerald-700" data-testid="publish-net">{money(net)}/place</b>
          </div>
        </div>

        {/* Note */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Note aux passagers (optionnel)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} data-testid="publish-notes"
            placeholder="Ex : non-fumeur, 1 bagage cabine max, animal accepté…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {/* Aperçu live de l'annonce */}
        {(from && to) && (
          <div data-testid="publish-preview">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Aperçu pour les passagers</p>
            <div className="bg-white rounded-2xl border-2 border-emerald-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center text-white font-bold">{(driverName || '?').charAt(0)}</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{driverName}</p>
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5"><Star size={11} weight="fill" className="text-amber-400" /> Nouveau ✦</span>
                  </div>
                </div>
                <div className="text-right"><p className="text-lg font-bold text-emerald-600">{money(effPrice)}</p><p className="text-[10px] text-gray-500">/ place</p></div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} className="text-emerald-500 flex-shrink-0" weight="fill" />
                <p className="font-semibold text-gray-800 truncate">{from} → {to}</p>
              </div>
              {notes && <p className="text-xs text-gray-500 mt-1.5 italic">“{notes}”</p>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <ShieldCheck size={14} className="text-emerald-500" /> Paiement séquestre SB Pay : sécurisé pour vous et vos passagers.
        </div>

        <button onClick={submit} disabled={saving} data-testid="publish-submit"
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 sticky bottom-3 shadow-lg shadow-emerald-200">
          {saving ? 'Publication…' : <><CheckCircle size={20} weight="fill" /> Publier le trajet</>}
        </button>
      </div>
    </Sheet>
  );
};

/**
 * Composer « Demande de trajet » (matching inversé) : le passager publie son besoin,
 * les chauffeurs le voient et proposent un trajet correspondant.
 */
export const RequestComposer = ({ onClose, onCreated }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromGeo, setFromGeo] = useState(null);
  const [toGeo, setToGeo] = useState(null);
  const [when, setWhen] = useState('');
  const [seats, setSeats] = useState(1);
  const [maxPrice, setMaxPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!from.trim() || !to.trim() || !when) { toast.error('Renseignez départ, destination et date'); return; }
    setSaving(true);
    try {
      await carpoolAPI.createRequest({
        pickup_address: from.trim(), dropoff_address: to.trim(), departure_date: when,
        seats_needed: parseInt(seats) || 1, max_price: maxPrice === '' ? null : parseFloat(maxPrice),
        pickup_lat: fromGeo?.lat, pickup_lng: fromGeo?.lng, dropoff_lat: toGeo?.lat, dropoff_lng: toGeo?.lng,
        notes: notes.trim(),
      });
      toast.success('Demande publiée ! Les chauffeurs vont la voir 🙌');
      onCreated();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    setSaving(false);
  };

  return (
    <Sheet onClose={onClose} testid="request-modal">
      <div className="bg-gradient-to-br from-sky-600 to-indigo-500 text-white px-5 pt-5 pb-6 rounded-t-3xl relative">
        <button onClick={onClose} className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center" data-testid="request-close"><X size={18} /></button>
        <div className="flex items-center gap-2 mb-1"><Sparkle size={18} weight="fill" /><span className="text-xs font-bold uppercase tracking-wide text-white/80">Matching inversé</span></div>
        <h3 className="text-2xl font-black">Pas de trajet ? Demandez-le</h3>
        <p className="text-xs text-white/80 mt-1">Publiez votre besoin, les chauffeurs vous proposent un trajet.</p>
      </div>
      <div className="p-5 space-y-4 -mt-3 bg-gray-50 rounded-t-3xl">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <GooglePlacesInput placeholder="Départ souhaité" value={from} iconColor="#0284c7" testId="request-from"
            onChange={setFrom} onSelect={(r) => { setFrom(r.address); setFromGeo({ lat: r.lat, lng: r.lng }); }} />
          <div className="flex items-center justify-center text-sky-300"><ArrowRight size={16} className="rotate-90" /></div>
          <GooglePlacesInput placeholder="Destination souhaitée" value={to} iconColor="#4f46e5" testId="request-to"
            onChange={setTo} onSelect={(r) => { setTo(r.address); setToGeo({ lat: r.lat, lng: r.lng }); }} />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Quand ?</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} min={new Date().toISOString().slice(0, 16)}
            data-testid="request-when" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Places</label>
            <input type="number" min="1" max="8" value={seats} onChange={(e) => setSeats(e.target.value)} data-testid="request-seats" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Budget max / place</label>
            <input type="number" min="0" step="0.5" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="€" data-testid="request-maxprice" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} data-testid="request-notes"
            placeholder="Note (optionnel)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={submit} disabled={saving} data-testid="request-submit"
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-500 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? 'Envoi…' : <><CheckCircle size={20} weight="fill" /> Publier ma demande</>}
        </button>
      </div>
    </Sheet>
  );
};
