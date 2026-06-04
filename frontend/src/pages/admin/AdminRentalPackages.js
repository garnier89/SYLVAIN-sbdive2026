/**
 * AdminRentalPackages — V3Cube "Manage Rental Packages".
 * Vue par Type de véhicule avec compteur Add/View(N) ; modale pour gérer
 * (ajouter/supprimer) les forfaits (durée · km · prix) d'un véhicule.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { MagnifyingGlass, ArrowsClockwise, Plus, X, Trash } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

const AdminRentalPackages = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [manage, setManage] = useState(null); // vehicle being managed

  const load = useCallback(() => {
    setLoading(true);
    adminAPI.getRentalVehicles().then((r) => setVehicles(r.data || [])).catch(() => toast.error('Erreur')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = vehicles.filter((v) => !search.trim() || v.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 max-w-4xl" data-testid="admin-rental-packages-page">
      <h1 className="text-2xl font-bold text-slate-900">Forfaits de location</h1>
      <p className="text-sm text-slate-500 mb-5">Gérez les forfaits de location (durée · km · prix) par type de véhicule.</p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex items-center gap-3">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un véhicule…"
            data-testid="rental-search" className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <button onClick={load} data-testid="rental-refresh" className="p-2.5 rounded-lg bg-violet-100 text-violet-600"><ArrowsClockwise size={18} /></button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b">
              <th className="py-3 px-4">Type de véhicule</th><th className="px-4">Lieu</th><th className="px-4 text-right">Forfaits</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center text-slate-400 py-6" data-testid="rental-loading">Chargement…</td></tr>
            ) : filtered.map((v) => (
              <tr key={v.slug} className="border-b last:border-0" data-testid={`rental-vehicle-${v.slug}`}>
                <td className="py-3 px-4 font-medium text-slate-800">{v.name}</td>
                <td className="px-4 text-slate-500">Tous les lieux</td>
                <td className="px-4 text-right">
                  <button onClick={() => setManage(v)} data-testid={`rental-addview-${v.slug}`}
                    className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">Ajouter / Voir ({v.count})</button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-6">Aucun véhicule</td></tr>}
          </tbody>
        </table>
      </div>

      {manage && <ManagePackagesModal vehicle={manage} onClose={() => { setManage(null); load(); }} />}
    </div>
  );
};

const ManagePackagesModal = ({ vehicle, onClose }) => {
  const [packages, setPackages] = useState([]);
  const [form, setForm] = useState({ hours: 2, km: 20, price: 36 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminAPI.getRentalPackages(vehicle.slug).then((r) => setPackages(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [vehicle.slug]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.price) { toast.error('Prix requis'); return; }
    try {
      await adminAPI.createRentalPackage({ vehicle_type: vehicle.slug, hours: form.hours, km: form.km, price: form.price });
      toast.success('Forfait ajouté'); setForm({ hours: 2, km: 20, price: 36 }); load();
    } catch { toast.error('Échec'); }
  };
  const remove = async (id) => { try { await adminAPI.deleteRentalPackage(id); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid="rental-manage-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Forfaits — {vehicle.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>

        {loading ? <p className="text-slate-400">Chargement…</p> : packages.length === 0 ? (
          <p className="text-slate-400 text-sm mb-4" data-testid="rental-empty">Aucun forfait pour ce véhicule.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {packages.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5" data-testid={`rental-pkg-row-${p.id}`}>
                <span className="text-sm font-medium text-slate-800">{p.hours}h · {p.km} km · <b>{p.price} €</b></span>
                <button onClick={() => remove(p.id)} data-testid={`rental-pkg-del-${p.id}`} className="text-slate-400 hover:text-rose-500"><Trash size={16} /></button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Ajouter un forfait</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <input type="number" placeholder="Heures" value={form.hours} onChange={(e) => setForm({ ...form, hours: parseFloat(e.target.value) || 0 })} data-testid="rental-form-hours" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input type="number" placeholder="Km" value={form.km} onChange={(e) => setForm({ ...form, km: parseFloat(e.target.value) || 0 })} data-testid="rental-form-km" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input type="number" placeholder="Prix €" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} data-testid="rental-form-price" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={add} data-testid="rental-form-add" className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold flex items-center justify-center gap-1"><Plus size={16} /> Ajouter le forfait</button>
      </div>
    </div>
  );
};

export default AdminRentalPackages;
