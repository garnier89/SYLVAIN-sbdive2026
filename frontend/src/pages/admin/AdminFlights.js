import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { flightsAPI } from '../../services/api';

const NAVY = '#0A2540';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-[#0A2540]';
const fmtTime = (s) => { try { return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };

const TABS = [
  { key: 'flights', label: 'Vols' },
  { key: 'bookings', label: 'Réservations' },
];

const CABINS = [
  { v: 'economy', l: 'Économique' },
  { v: 'premium', l: 'Premium' },
  { v: 'business', l: 'Affaires' },
  { v: 'first', l: 'Première' },
];

const Field = ({ label, children }) => (
  <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>{children}</label>
);

const emptyFlight = { airline: '', flight_number: '', origin: '', origin_code: '', destination: '', destination_code: '', departure_at: '', arrival_at: '', cabin_class: 'economy', price: 0, seats_total: 0, stops: 0, baggage: '' };

const FlightsTab = () => {
  const [flights, setFlights] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyFlight);
  const [edits, setEdits] = useState({});
  const load = useCallback(() => { flightsAPI.adminFlights().then((r) => setFlights(r.data.flights || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const create = async () => {
    if (!form.airline.trim() || !form.origin.trim() || !form.destination.trim()) { toast.error('Compagnie, départ et arrivée requis'); return; }
    try { await flightsAPI.adminCreateFlight(form); toast.success('Vol ajouté'); setForm(emptyFlight); setCreating(false); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const setEdit = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const valOf = (m, k) => (edits[m.id]?.[k] !== undefined ? edits[m.id][k] : m[k]);
  const save = async (m) => {
    const e = edits[m.id]; if (!e) return;
    try { await flightsAPI.adminUpdateFlight(m.id, e); toast.success('Enregistré'); setEdits((x) => ({ ...x, [m.id]: undefined })); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const remove = async (m) => { if (!window.confirm(`Retirer ${m.airline} ${m.flight_number} ?`)) return; try { await flightsAPI.adminDeleteFlight(m.id); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="space-y-4 max-w-3xl" data-testid="admin-flights-tab">
      <button onClick={() => setCreating((c) => !c)} data-testid="flight-add-toggle" className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>{creating ? 'Fermer' : '+ Ajouter un vol'}</button>
      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3" data-testid="flight-create-form">
          <Field label="Compagnie"><input className={inputCls} value={form.airline} onChange={(e) => setF('airline', e.target.value)} data-testid="flight-form-airline" /></Field>
          <Field label="N° de vol"><input className={inputCls} value={form.flight_number} onChange={(e) => setF('flight_number', e.target.value)} /></Field>
          <Field label="Ville départ"><input className={inputCls} value={form.origin} onChange={(e) => setF('origin', e.target.value)} data-testid="flight-form-origin" /></Field>
          <Field label="Code départ"><input className={inputCls} value={form.origin_code} onChange={(e) => setF('origin_code', e.target.value)} /></Field>
          <Field label="Ville arrivée"><input className={inputCls} value={form.destination} onChange={(e) => setF('destination', e.target.value)} data-testid="flight-form-destination" /></Field>
          <Field label="Code arrivée"><input className={inputCls} value={form.destination_code} onChange={(e) => setF('destination_code', e.target.value)} /></Field>
          <Field label="Départ (date/heure)"><input type="datetime-local" className={inputCls} value={form.departure_at} onChange={(e) => setF('departure_at', e.target.value)} data-testid="flight-form-dep" /></Field>
          <Field label="Arrivée (date/heure)"><input type="datetime-local" className={inputCls} value={form.arrival_at} onChange={(e) => setF('arrival_at', e.target.value)} data-testid="flight-form-arr" /></Field>
          <Field label="Classe"><select className={inputCls} value={form.cabin_class} onChange={(e) => setF('cabin_class', e.target.value)}>{CABINS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Field>
          <Field label="Escales"><input type="number" className={inputCls} value={form.stops} onChange={(e) => setF('stops', e.target.value)} /></Field>
          <Field label="Prix (€)"><input type="number" className={inputCls} value={form.price} onChange={(e) => setF('price', e.target.value)} data-testid="flight-form-price" /></Field>
          <Field label="Sièges (stock)"><input type="number" className={inputCls} value={form.seats_total} onChange={(e) => setF('seats_total', e.target.value)} data-testid="flight-form-seats" /></Field>
          <div className="col-span-2"><Field label="Bagages"><input className={inputCls} value={form.baggage} onChange={(e) => setF('baggage', e.target.value)} /></Field></div>
          <div className="col-span-2"><button onClick={create} data-testid="flight-create-save" className="px-5 py-2.5 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Créer le vol</button></div>
        </div>
      )}
      <div className="space-y-3">
        {flights.map((m) => (
          <div key={m.id} className={`bg-white border rounded-xl p-4 ${m.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`} data-testid={`flight-row-${m.id}`}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900">{m.airline} {m.flight_number} <span className="text-xs font-normal text-slate-500">· {m.origin} → {m.destination}</span></p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{m.seats_booked}/{m.seats_total} réservés{!m.active ? ' · inactif' : ''}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{fmtTime(m.departure_at)} → {fmtTime(m.arrival_at)}</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Prix (€)"><input type="number" className={inputCls} value={valOf(m, 'price')} onChange={(e) => setEdit(m.id, 'price', e.target.value)} data-testid={`flight-price-${m.id}`} /></Field>
              <Field label="Sièges"><input type="number" className={inputCls} value={valOf(m, 'seats_total')} onChange={(e) => setEdit(m.id, 'seats_total', e.target.value)} data-testid={`flight-seats-${m.id}`} /></Field>
            </div>
            <div className="flex gap-2 mt-3">
              {edits[m.id] && <button onClick={() => save(m)} data-testid={`flight-save-${m.id}`} className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Enregistrer</button>}
              <button onClick={() => remove(m)} data-testid={`flight-remove-${m.id}`} className="px-4 py-2 text-sm font-semibold text-rose-600 rounded-lg border border-rose-200">Retirer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BookingsTab = () => {
  const [bookings, setBookings] = useState([]);
  useEffect(() => { flightsAPI.adminBookings().then((r) => setBookings(r.data.bookings || [])).catch(() => {}); }, []);
  return (
    <div className="space-y-3 max-w-3xl" data-testid="admin-flight-bookings-tab">
      {bookings.length === 0 && <p className="text-sm text-slate-400">Aucune réservation.</p>}
      {bookings.map((b) => (
        <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-4" data-testid={`admin-flight-booking-${b.id}`}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-900">{b.airline} {b.flight_number} <span className="text-xs font-normal text-slate-500">· {b.user_name}</span></p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{b.status}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{b.origin} → {b.destination} · {fmtTime(b.departure_at)} · {b.seats_count} passager(s) · {money(b.total_price)}</p>
        </div>
      ))}
    </div>
  );
};

const AdminFlights = () => {
  const [tab, setTab] = useState('flights');
  return (
    <div className="p-6" data-testid="admin-flights-page">
      <h1 className="text-2xl font-black text-slate-900 mb-1">Billets d'avion (agence)</h1>
      <p className="text-sm text-slate-500 mb-5">Publiez des vols (horaires, prix, sièges) et consultez les réservations.</p>
      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`flight-admin-tab-${t.key}`}
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${tab === t.key ? 'text-white' : 'text-slate-600 bg-slate-100'}`}
            style={tab === t.key ? { background: NAVY } : {}}>{t.label}</button>
        ))}
      </div>
      {tab === 'flights' && <FlightsTab />}
      {tab === 'bookings' && <BookingsTab />}
    </div>
  );
};

export default AdminFlights;
