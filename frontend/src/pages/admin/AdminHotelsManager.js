import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { hotelsAPI } from '../../services/api';

const NAVY = '#0A2540';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-[#0A2540]';

const TABS = [
  { key: 'hotels', label: 'Hôtels & chambres' },
  { key: 'bookings', label: 'Réservations' },
];

const Field = ({ label, children }) => (
  <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>{children}</label>
);

const emptyHotel = { name: '', city: '', address: '', stars: 3, description: '', amenities: '', image_url: '' };
const emptyRoom = { name: '', capacity: 2, beds: '', price_per_night: 0, deposit_amount: 0, total_units: 1, amenities: '', image_url: '' };

const RoomsManager = ({ hotelId }) => {
  const [rooms, setRooms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyRoom);
  const [edits, setEdits] = useState({});
  const load = useCallback(() => { hotelsAPI.adminRooms(hotelId).then((r) => setRooms(r.data.rooms || [])).catch(() => {}); }, [hotelId]);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const create = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    const payload = { ...form, amenities: form.amenities ? form.amenities.split(',').map((s) => s.trim()).filter(Boolean) : [] };
    try { await hotelsAPI.adminCreateRoom(hotelId, payload); toast.success('Chambre ajoutée'); setForm(emptyRoom); setCreating(false); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const setEdit = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const valOf = (m, k) => (edits[m.id]?.[k] !== undefined ? edits[m.id][k] : m[k]);
  const save = async (m) => {
    const e = edits[m.id]; if (!e) return;
    try { await hotelsAPI.adminUpdateRoom(m.id, e); toast.success('Enregistré'); setEdits((x) => ({ ...x, [m.id]: undefined })); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const remove = async (m) => { if (!window.confirm(`Retirer ${m.name} ?`)) return; try { await hotelsAPI.adminDeleteRoom(m.id); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3" data-testid={`hotel-rooms-manager-${hotelId}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700">Chambres</p>
        <button onClick={() => setCreating((c) => !c)} data-testid={`room-add-toggle-${hotelId}`} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: NAVY }}>{creating ? 'Fermer' : '+ Chambre'}</button>
      </div>
      {creating && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2 mt-2" data-testid={`room-create-form-${hotelId}`}>
          <Field label="Nom"><input className={inputCls} value={form.name} onChange={(e) => setF('name', e.target.value)} data-testid={`room-form-name-${hotelId}`} /></Field>
          <Field label="Capacité"><input type="number" className={inputCls} value={form.capacity} onChange={(e) => setF('capacity', e.target.value)} /></Field>
          <Field label="Lits"><input className={inputCls} value={form.beds} onChange={(e) => setF('beds', e.target.value)} /></Field>
          <Field label="Prix / nuit (€)"><input type="number" className={inputCls} value={form.price_per_night} onChange={(e) => setF('price_per_night', e.target.value)} data-testid={`room-form-price-${hotelId}`} /></Field>
          <Field label="Caution (€)"><input type="number" className={inputCls} value={form.deposit_amount} onChange={(e) => setF('deposit_amount', e.target.value)} data-testid={`room-form-deposit-${hotelId}`} /></Field>
          <Field label="Unités (stock)"><input type="number" className={inputCls} value={form.total_units} onChange={(e) => setF('total_units', e.target.value)} data-testid={`room-form-units-${hotelId}`} /></Field>
          <Field label="Équipements (séparés par ,)"><input className={inputCls} value={form.amenities} onChange={(e) => setF('amenities', e.target.value)} /></Field>
          <div className="col-span-2"><button onClick={create} data-testid={`room-create-save-${hotelId}`} className="px-4 py-2 text-xs font-bold text-white rounded-lg" style={{ background: NAVY }}>Créer la chambre</button></div>
        </div>
      )}
      <div className="space-y-2 mt-2">
        {rooms.map((m) => (
          <div key={m.id} className={`bg-white border rounded-lg p-3 ${m.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`} data-testid={`room-row-${m.id}`}>
            <p className="font-semibold text-sm text-slate-900">{m.name} <span className="text-xs font-normal text-slate-500">· {m.capacity} pers. · {m.beds}</span></p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Field label="€/nuit"><input type="number" className={inputCls} value={valOf(m, 'price_per_night')} onChange={(e) => setEdit(m.id, 'price_per_night', e.target.value)} data-testid={`room-price-${m.id}`} /></Field>
              <Field label="Caution €"><input type="number" className={inputCls} value={valOf(m, 'deposit_amount') ?? 0} onChange={(e) => setEdit(m.id, 'deposit_amount', e.target.value)} data-testid={`room-deposit-${m.id}`} /></Field>
              <Field label="Unités"><input type="number" className={inputCls} value={valOf(m, 'total_units')} onChange={(e) => setEdit(m.id, 'total_units', e.target.value)} data-testid={`room-units-${m.id}`} /></Field>
            </div>
            <div className="flex gap-2 mt-2">
              {edits[m.id] && <button onClick={() => save(m)} data-testid={`room-save-${m.id}`} className="px-3 py-1.5 text-xs font-bold text-white rounded-lg" style={{ background: NAVY }}>Enregistrer</button>}
              <button onClick={() => remove(m)} data-testid={`room-remove-${m.id}`} className="px-3 py-1.5 text-xs font-semibold text-rose-600 rounded-lg border border-rose-200">Retirer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const HotelsTab = () => {
  const [hotels, setHotels] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyHotel);
  const [expanded, setExpanded] = useState(null);
  const load = useCallback(() => { hotelsAPI.adminHotels().then((r) => setHotels(r.data.hotels || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const create = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    const payload = { ...form, amenities: form.amenities ? form.amenities.split(',').map((s) => s.trim()).filter(Boolean) : [] };
    try { await hotelsAPI.adminCreateHotel(payload); toast.success('Hôtel ajouté'); setForm(emptyHotel); setCreating(false); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const remove = async (h) => { if (!window.confirm(`Retirer ${h.name} ?`)) return; try { await hotelsAPI.adminDeleteHotel(h.id); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="space-y-4 max-w-3xl" data-testid="admin-hotels-tab">
      <button onClick={() => setCreating((c) => !c)} data-testid="hotel-add-toggle" className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>{creating ? 'Fermer' : '+ Ajouter un hôtel'}</button>
      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3" data-testid="hotel-create-form">
          <Field label="Nom"><input className={inputCls} value={form.name} onChange={(e) => setF('name', e.target.value)} data-testid="hotel-form-name" /></Field>
          <Field label="Ville"><input className={inputCls} value={form.city} onChange={(e) => setF('city', e.target.value)} data-testid="hotel-form-city" /></Field>
          <Field label="Adresse"><input className={inputCls} value={form.address} onChange={(e) => setF('address', e.target.value)} /></Field>
          <Field label="Étoiles (0-5)"><input type="number" min="0" max="5" className={inputCls} value={form.stars} onChange={(e) => setF('stars', e.target.value)} /></Field>
          <Field label="Équipements (séparés par ,)"><input className={inputCls} value={form.amenities} onChange={(e) => setF('amenities', e.target.value)} /></Field>
          <Field label="Image (URL)"><input className={inputCls} value={form.image_url} onChange={(e) => setF('image_url', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setF('description', e.target.value)} /></Field></div>
          <div className="col-span-2"><button onClick={create} data-testid="hotel-create-save" className="px-5 py-2.5 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Créer l'hôtel</button></div>
        </div>
      )}
      <div className="space-y-3">
        {hotels.map((h) => (
          <div key={h.id} className={`bg-white border rounded-xl p-4 ${h.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`} data-testid={`hotel-row-${h.id}`}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900">{h.name} <span className="text-xs font-normal text-slate-500">· {h.city} · {h.stars}★ · {h.room_count} chambre(s)</span></p>
              <div className="flex gap-2">
                <button onClick={() => setExpanded(expanded === h.id ? null : h.id)} data-testid={`hotel-expand-${h.id}`} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200">{expanded === h.id ? 'Masquer' : 'Chambres'}</button>
                <button onClick={() => remove(h)} data-testid={`hotel-remove-${h.id}`} className="px-3 py-1.5 text-xs font-semibold text-rose-600 rounded-lg border border-rose-200">Retirer</button>
              </div>
            </div>
            {expanded === h.id && <RoomsManager hotelId={h.id} />}
          </div>
        ))}
      </div>
    </div>
  );
};

const BookingsTab = () => {
  const [bookings, setBookings] = useState([]);
  const [damage, setDamage] = useState({});
  const load = useCallback(() => { hotelsAPI.adminBookings().then((r) => setBookings(r.data.bookings || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const checkout = async (b) => {
    const fees = Math.max(0, Number(damage[b.id] || 0));
    if (!window.confirm(`Clôturer le séjour de ${b.user_name} ?` + (b.deposit_held_amount > 0 ? `\nCaution ${money(b.deposit_held_amount)} restituée${fees ? ` moins ${money(fees)} de dommages` : ''}.` : ''))) return;
    try {
      const r = await hotelsAPI.adminCheckout(b.id, { damage_fees: fees });
      toast.success(r.data.deposit_refunded > 0 ? `Séjour clôturé · caution restituée ${money(r.data.deposit_refunded)}` : 'Séjour clôturé');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };
  return (
    <div className="space-y-3 max-w-3xl" data-testid="admin-hotel-bookings-tab">
      {bookings.length === 0 && <p className="text-sm text-slate-400">Aucune réservation.</p>}
      {bookings.map((b) => (
        <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-4" data-testid={`admin-hotel-booking-${b.id}`}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-900">{b.hotel_name} <span className="text-xs font-normal text-slate-500">· {b.user_name}</span></p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{b.status}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{b.room_name} · {b.rooms_count} ch. · {b.check_in} → {b.check_out} ({b.nights} nuit(s)) · {money(b.total_price)}</p>
          {b.deposit_amount > 0 && (
            <p className="text-[11px] mt-1 font-semibold">
              {b.deposit_status === 'held' && <span className="text-amber-600">Caution bloquée : {money(b.deposit_held_amount)}</span>}
              {b.deposit_status === 'released' && <span className="text-emerald-600">Caution restituée : {money(b.deposit_refunded)}{b.damage_fees > 0 ? ` (− ${money(b.damage_fees)} dommages)` : ''}</span>}
            </p>
          )}
          {b.status === 'confirmed' && (
            <div className="flex items-center gap-2 mt-2">
              {b.deposit_held_amount > 0 && (
                <input type="number" min={0} max={b.deposit_held_amount} placeholder="Dommages €"
                  value={damage[b.id] || ''} onChange={(e) => setDamage((d) => ({ ...d, [b.id]: e.target.value }))}
                  data-testid={`hotel-damage-${b.id}`}
                  className="w-28 px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none" />
              )}
              <button onClick={() => checkout(b)} data-testid={`hotel-checkout-${b.id}`}
                className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg" style={{ background: NAVY }}>
                {b.deposit_held_amount > 0 ? 'Clôturer & restituer caution' : 'Clôturer le séjour'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const AdminHotelsManager = () => {
  const [tab, setTab] = useState('hotels');
  return (
    <div className="p-6" data-testid="admin-hotels-page">
      <h1 className="text-2xl font-black text-slate-900 mb-1">Hôtels (réservation)</h1>
      <p className="text-sm text-slate-500 mb-5">Gérez vos hôtels, chambres (stock & tarifs) et consultez les réservations.</p>
      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`hotel-admin-tab-${t.key}`}
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${tab === t.key ? 'text-white' : 'text-slate-600 bg-slate-100'}`}
            style={tab === t.key ? { background: NAVY } : {}}>{t.label}</button>
        ))}
      </div>
      {tab === 'hotels' && <HotelsTab />}
      {tab === 'bookings' && <BookingsTab />}
    </div>
  );
};

export default AdminHotelsManager;
