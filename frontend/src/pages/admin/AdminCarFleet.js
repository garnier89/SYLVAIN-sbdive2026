import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { carRentalAPI } from '../../services/api';

const NAVY = '#0A2540';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-[#0A2540]';

const TABS = [
  { key: 'fleet', label: 'Flotte' },
  { key: 'rentals', label: 'Locations' },
];

const CATS = [
  { v: 'economy', l: 'Économique' },
  { v: 'suv', l: 'SUV' },
  { v: 'luxury', l: 'Premium' },
  { v: 'van', l: 'Van' },
];

const Field = ({ label, children }) => (
  <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>{children}</label>
);

const emptyCar = { name: '', make: '', model: '', year: 2024, category: 'economy', transmission: 'manual', seats: 5, fuel: 'Essence', price_per_day: 0, price_per_hour: 0, deposit_amount: 0, location_name: 'Agence', plate: '', image_url: '' };

// Clôture admin avec état des lieux (retour) : photos obligatoires (≥2) + frais dommages.
const ReturnClose = ({ rental, onClosed }) => {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dmg, setDmg] = useState('');
  const [busy, setBusy] = useState(false);

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        const r = await carRentalAPI.adminUploadImage(f);
        if (r.data?.url) setPhotos((p) => [...p, r.data.url]);
      }
    } catch { toast.error("Échec de l'upload"); }
    setUploading(false);
    e.target.value = '';
  };

  const close = async () => {
    if (photos.length < 2) { toast.error('Au moins 2 photos de retour requises'); return; }
    const fee = Number(dmg || 0);
    if (!window.confirm(fee ? `Clôturer et retenir ${fee}€ de dommages ? Le reste de la caution est restitué.` : 'Clôturer et restituer toute la caution ?')) return;
    setBusy(true);
    try {
      const res = await carRentalAPI.adminReturn(rental.id, { damage_fees: fee, return_photos: photos });
      toast.success(`Clôturée · caution restituée ${res.data.deposit_refunded}€`);
      onClosed();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3" data-testid={`car-close-row-${rental.id}`}>
      <p className="text-xs font-bold text-amber-800">📸 État des lieux (retour) — obligatoire (≥2 photos)</p>
      {photos.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              <img src={p} alt="" className="w-14 h-14 rounded-lg object-cover" />
              <button onClick={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center" aria-label="Retirer">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <label className="px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer bg-white border border-amber-300 text-amber-800">
          {uploading ? 'Envoi…' : '+ Photos de retour'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} data-testid={`car-return-input-${rental.id}`} />
        </label>
        <input type="number" min="0" placeholder="Frais dommages (€)" value={dmg} onChange={(e) => setDmg(e.target.value)} data-testid={`car-damage-${rental.id}`} className={`${inputCls} max-w-[160px]`} />
        <button onClick={close} disabled={busy || photos.length < 2} data-testid={`car-close-${rental.id}`} className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-50" style={{ background: NAVY }}>Clôturer & restituer caution</button>
      </div>
    </div>
  );
};

const FleetTab = () => {
  const [cars, setCars] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyCar);
  const [edits, setEdits] = useState({});
  const load = useCallback(() => { carRentalAPI.adminFleet().then((r) => setCars(r.data.cars || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const create = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try { await carRentalAPI.adminCreateCar(form); toast.success('Voiture ajoutée'); setForm(emptyCar); setCreating(false); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const setEdit = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const valOf = (m, k) => (edits[m.id]?.[k] !== undefined ? edits[m.id][k] : m[k]);
  const save = async (m) => {
    const e = edits[m.id]; if (!e) return;
    try { await carRentalAPI.adminUpdateCar(m.id, e); toast.success('Enregistré'); setEdits((x) => ({ ...x, [m.id]: undefined })); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const remove = async (m) => { if (!window.confirm(`Retirer ${m.name} de la flotte ?`)) return; try { await carRentalAPI.adminDeleteCar(m.id); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="space-y-4 max-w-3xl" data-testid="admin-car-fleet-tab">
      <button onClick={() => setCreating((c) => !c)} data-testid="car-add-toggle" className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>{creating ? 'Fermer' : '+ Ajouter une voiture'}</button>
      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3" data-testid="car-create-form">
          <Field label="Nom"><input className={inputCls} value={form.name} onChange={(e) => setF('name', e.target.value)} data-testid="car-form-name" /></Field>
          <Field label="Marque"><input className={inputCls} value={form.make} onChange={(e) => setF('make', e.target.value)} /></Field>
          <Field label="Modèle"><input className={inputCls} value={form.model} onChange={(e) => setF('model', e.target.value)} /></Field>
          <Field label="Année"><input type="number" className={inputCls} value={form.year} onChange={(e) => setF('year', e.target.value)} /></Field>
          <Field label="Catégorie"><select className={inputCls} value={form.category} onChange={(e) => setF('category', e.target.value)}>{CATS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Field>
          <Field label="Boîte"><select className={inputCls} value={form.transmission} onChange={(e) => setF('transmission', e.target.value)}><option value="manual">Manuelle</option><option value="automatic">Automatique</option></select></Field>
          <Field label="Places"><input type="number" className={inputCls} value={form.seats} onChange={(e) => setF('seats', e.target.value)} /></Field>
          <Field label="Carburant"><input className={inputCls} value={form.fuel} onChange={(e) => setF('fuel', e.target.value)} /></Field>
          <Field label="Prix / jour (€)"><input type="number" className={inputCls} value={form.price_per_day} onChange={(e) => setF('price_per_day', e.target.value)} data-testid="car-form-ppd" /></Field>
          <Field label="Prix / heure (€)"><input type="number" className={inputCls} value={form.price_per_hour} onChange={(e) => setF('price_per_hour', e.target.value)} /></Field>
          <Field label="Caution (€)"><input type="number" className={inputCls} value={form.deposit_amount} onChange={(e) => setF('deposit_amount', e.target.value)} data-testid="car-form-deposit" /></Field>
          <Field label="Lieu / agence"><input className={inputCls} value={form.location_name} onChange={(e) => setF('location_name', e.target.value)} /></Field>
          <Field label="Plaque"><input className={inputCls} value={form.plate} onChange={(e) => setF('plate', e.target.value)} /></Field>
          <Field label="Image (URL)"><input className={inputCls} value={form.image_url} onChange={(e) => setF('image_url', e.target.value)} /></Field>
          <div className="col-span-2"><button onClick={create} data-testid="car-create-save" className="px-5 py-2.5 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Créer</button></div>
        </div>
      )}
      <div className="space-y-3">
        {cars.map((m) => (
          <div key={m.id} className={`bg-white border rounded-xl p-4 ${m.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`} data-testid={`car-row-${m.id}`}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900">{m.name} <span className="text-xs font-normal text-slate-500">· {m.model} · {m.plate}</span></p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{m.status}{!m.active ? ' · inactif' : ''}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Field label="€/jour"><input type="number" className={inputCls} value={valOf(m, 'price_per_day')} onChange={(e) => setEdit(m.id, 'price_per_day', e.target.value)} data-testid={`car-ppd-${m.id}`} /></Field>
              <Field label="€/heure"><input type="number" className={inputCls} value={valOf(m, 'price_per_hour')} onChange={(e) => setEdit(m.id, 'price_per_hour', e.target.value)} /></Field>
              <Field label="Caution"><input type="number" className={inputCls} value={valOf(m, 'deposit_amount')} onChange={(e) => setEdit(m.id, 'deposit_amount', e.target.value)} /></Field>
            </div>
            <div className="flex gap-2 mt-3">
              {edits[m.id] && <button onClick={() => save(m)} data-testid={`car-save-${m.id}`} className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Enregistrer</button>}
              <button onClick={() => remove(m)} data-testid={`car-remove-${m.id}`} className="px-4 py-2 text-sm font-semibold text-rose-600 rounded-lg border border-rose-200">Retirer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RentalsTab = () => {
  const [data, setData] = useState({ rentals: [], pending_license_count: 0 });
  const load = useCallback(() => { carRentalAPI.adminRentals().then((r) => setData(r.data || { rentals: [] })).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (id, approve) => {
    try { await carRentalAPI.adminReviewLicense(id, { approve }); toast.success(approve ? 'Permis validé' : 'Refusé & remboursé'); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };

  return (
    <div className="space-y-3 max-w-3xl" data-testid="admin-car-rentals-tab">
      <p className="text-sm text-slate-500">Permis en attente : <b data-testid="car-pending-count">{data.pending_license_count}</b></p>
      {data.rentals.length === 0 && <p className="text-sm text-slate-400">Aucune location.</p>}
      {data.rentals.map((r) => (
        <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4" data-testid={`admin-car-rental-${r.id}`}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-900">{r.car_name} <span className="text-xs font-normal text-slate-500">· {r.user_name}</span></p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.status}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{r.days} j · {money(r.base_price)} · caution {money(r.deposit_amount)}</p>
          <div className="flex gap-2 mt-2 flex-wrap items-center">
            {r.license_doc_url && <a href={r.license_doc_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 underline">Permis</a>}
            {r.id_doc_url && <a href={r.id_doc_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 underline">Pièce d'identité</a>}
            {(r.pickup_photos?.length > 0) && r.status !== 'returned' && (
              <span className="text-xs text-slate-500">· Retrait :{' '}
                {r.pickup_photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer" className="text-emerald-600 underline ml-1">photo {i + 1}</a>)}
              </span>
            )}
          </div>
          {r.license_status === 'pending' && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => review(r.id, true)} data-testid={`car-approve-${r.id}`} className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: '#16a34a' }}>Valider le permis</button>
              <button onClick={() => review(r.id, false)} data-testid={`car-reject-${r.id}`} className="px-4 py-2 text-sm font-semibold text-rose-600 rounded-lg border border-rose-200">Refuser</button>
            </div>
          )}
          {r.status === 'active' && (
            <ReturnClose rental={r} onClosed={load} />
          )}
          {r.status === 'returned' && (
            <div className="mt-2">
              <p className="text-[11px] text-slate-500">Caution restituée : {money(r.deposit_refunded)}{r.damage_fees ? ` · ${money(r.damage_fees)} dommages retenus` : ''}</p>
              {(r.pickup_photos?.length || r.return_photos?.length) ? (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(r.pickup_photos || []).map((p, i) => <a key={`p${i}`} href={p} target="_blank" rel="noreferrer"><img src={p} alt="retrait" className="w-12 h-12 rounded object-cover ring-1 ring-emerald-300" /></a>)}
                  {(r.return_photos || []).map((p, i) => <a key={`r${i}`} href={p} target="_blank" rel="noreferrer"><img src={p} alt="retour" className="w-12 h-12 rounded object-cover ring-1 ring-amber-300" /></a>)}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const AdminCarFleet = () => {
  const [tab, setTab] = useState('fleet');
  return (
    <div className="p-6" data-testid="admin-car-page">
      <h1 className="text-2xl font-black text-slate-900 mb-1">Location voiture (self-drive)</h1>
      <p className="text-sm text-slate-500 mb-5">Flotte interne, tarifs, cautions et validation des permis.</p>
      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`car-admin-tab-${t.key}`}
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${tab === t.key ? 'text-white' : 'text-slate-600 bg-slate-100'}`}
            style={tab === t.key ? { background: NAVY } : {}}>{t.label}</button>
        ))}
      </div>
      {tab === 'fleet' && <FleetTab />}
      {tab === 'rentals' && <RentalsTab />}
    </div>
  );
};

export default AdminCarFleet;
