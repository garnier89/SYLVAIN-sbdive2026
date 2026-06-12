import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { travelPackagesAPI } from '../../services/api';

const NAVY = '#0A2540';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-[#0A2540]';

const TABS = [
  { key: 'packages', label: 'Forfaits' },
  { key: 'bookings', label: 'Réservations' },
];

const Field = ({ label, children }) => (
  <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>{children}</label>
);

const emptyPkg = { title: '', description: '', image_url: '', flight_id: '', hotel_id: '', room_id: '', nights: 7, discount_pct: 10 };

const PackagesTab = () => {
  const [packages, setPackages] = useState([]);
  const [options, setOptions] = useState({ flights: [], hotels: [], rooms: [] });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyPkg);
  const load = useCallback(() => { travelPackagesAPI.adminPackages().then((r) => setPackages(r.data.packages || [])).catch(() => {}); }, []);
  useEffect(() => { load(); travelPackagesAPI.adminOptions().then((r) => setOptions(r.data || { flights: [], hotels: [], rooms: [] })).catch(() => {}); }, [load]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const roomsForHotel = options.rooms.filter((r) => r.hotel_id === form.hotel_id);
  const create = async () => {
    if (!form.title.trim() || !form.flight_id || !form.hotel_id || !form.room_id) { toast.error('Titre, vol, hôtel et chambre requis'); return; }
    try { await travelPackagesAPI.adminCreatePackage(form); toast.success('Forfait créé'); setForm(emptyPkg); setCreating(false); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const remove = async (p) => { if (!window.confirm(`Retirer « ${p.title} » ?`)) return; try { await travelPackagesAPI.adminDeletePackage(p.id); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="space-y-4 max-w-3xl" data-testid="admin-packages-tab">
      <button onClick={() => setCreating((c) => !c)} data-testid="pkg-add-toggle" className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>{creating ? 'Fermer' : '+ Composer un forfait'}</button>
      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3" data-testid="pkg-create-form">
          <div className="col-span-2"><Field label="Titre"><input className={inputCls} value={form.title} onChange={(e) => setF('title', e.target.value)} data-testid="pkg-form-title" /></Field></div>
          <div className="col-span-2"><Field label="Description"><textarea rows={2} className={inputCls} value={form.description} onChange={(e) => setF('description', e.target.value)} /></Field></div>
          <Field label="Vol"><select className={inputCls} value={form.flight_id} onChange={(e) => setF('flight_id', e.target.value)} data-testid="pkg-form-flight">
            <option value="">— choisir —</option>
            {options.flights.map((f) => <option key={f.id} value={f.id}>{f.airline} {f.flight_number} · {f.origin}→{f.destination} · {money(f.price)}</option>)}
          </select></Field>
          <Field label="Hôtel"><select className={inputCls} value={form.hotel_id} onChange={(e) => { setF('hotel_id', e.target.value); setF('room_id', ''); }} data-testid="pkg-form-hotel">
            <option value="">— choisir —</option>
            {options.hotels.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.city}) {h.stars}★</option>)}
          </select></Field>
          <Field label="Chambre"><select className={inputCls} value={form.room_id} onChange={(e) => setF('room_id', e.target.value)} disabled={!form.hotel_id} data-testid="pkg-form-room">
            <option value="">— choisir —</option>
            {roomsForHotel.map((r) => <option key={r.id} value={r.id}>{r.name} · {money(r.price_per_night)}/nuit</option>)}
          </select></Field>
          <Field label="Nuits"><input type="number" min="1" className={inputCls} value={form.nights} onChange={(e) => setF('nights', e.target.value)} data-testid="pkg-form-nights" /></Field>
          <Field label="Remise (%)"><input type="number" min="0" max="90" className={inputCls} value={form.discount_pct} onChange={(e) => setF('discount_pct', e.target.value)} data-testid="pkg-form-discount" /></Field>
          <Field label="Image (URL)"><input className={inputCls} value={form.image_url} onChange={(e) => setF('image_url', e.target.value)} /></Field>
          <div className="col-span-2"><button onClick={create} data-testid="pkg-create-save" className="px-5 py-2.5 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Créer le forfait</button></div>
        </div>
      )}
      <div className="space-y-3">
        {packages.map((p) => (
          <div key={p.id} className={`bg-white border rounded-xl p-4 ${p.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`} data-testid={`pkg-row-${p.id}`}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900">{p.title} {!p.active && <span className="text-xs font-normal text-slate-400">· inactif</span>}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">-{p.discount_pct}%</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {p.available ? `${p.flight?.airline} ${p.flight?.origin}→${p.flight?.destination} + ${p.hotel?.name} · ${p.nights} nuit(s)` : '⚠️ Vol ou hôtel indisponible'}
            </p>
            <p className="text-xs text-slate-600 mt-1">Prix indicatif : <span className="line-through text-slate-400">{money(p.base_total)}</span> <b>{money(p.final_total)}</b></p>
            <button onClick={() => remove(p)} data-testid={`pkg-remove-${p.id}`} className="mt-2 px-3 py-1.5 text-xs font-semibold text-rose-600 rounded-lg border border-rose-200">Retirer</button>
          </div>
        ))}
      </div>
    </div>
  );
};

const BookingsTab = () => {
  const [bookings, setBookings] = useState([]);
  useEffect(() => { travelPackagesAPI.adminBookings().then((r) => setBookings(r.data.bookings || [])).catch(() => {}); }, []);
  return (
    <div className="space-y-3 max-w-3xl" data-testid="admin-package-bookings-tab">
      {bookings.length === 0 && <p className="text-sm text-slate-400">Aucune réservation.</p>}
      {bookings.map((b) => (
        <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-4" data-testid={`admin-pkg-booking-${b.id}`}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-900">{b.title} <span className="text-xs font-normal text-slate-500">· {b.user_name}</span></p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{b.status}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{b.origin} → {b.destination} · {b.hotel_name} · {b.travelers} voyageur(s) · {money(b.total_price)}</p>
        </div>
      ))}
    </div>
  );
};

const AdminTravelPackages = () => {
  const [tab, setTab] = useState('packages');
  return (
    <div className="p-6" data-testid="admin-packages-page">
      <h1 className="text-2xl font-black text-slate-900 mb-1">Forfaits Vol + Hôtel</h1>
      <p className="text-sm text-slate-500 mb-5">Composez des packages voyage (vol + hôtel) à prix réduit pour booster les conversions.</p>
      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`pkg-admin-tab-${t.key}`}
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${tab === t.key ? 'text-white' : 'text-slate-600 bg-slate-100'}`}
            style={tab === t.key ? { background: NAVY } : {}}>{t.label}</button>
        ))}
      </div>
      {tab === 'packages' && <PackagesTab />}
      {tab === 'bookings' && <BookingsTab />}
    </div>
  );
};

export default AdminTravelPackages;
