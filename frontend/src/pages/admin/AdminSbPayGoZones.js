import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Globe, Trash, Plus, FloppyDisk } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminSbPayGoZones = () => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newZone, setNewZone] = useState({ country: 'FR', country_label: 'France', region: '', city: '', currency: 'EUR', enabled: false });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/sbpaygo/zones`, { credentials: 'include' });
      const data = await res.json();
      setZones(data.zones || []);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateZone = async (id, patch) => {
    try {
      const res = await fetch(`${API}/api/admin/sbpaygo/zones/${id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      setZones((arr) => arr.map((z) => z.id === id ? data.zone : z));
      toast.success('Zone mise à jour');
    } catch { toast.error('Échec de la sauvegarde'); }
  };

  const deleteZone = async (id) => {
    if (!window.confirm('Supprimer cette zone ?')) return;
    try {
      const res = await fetch(`${API}/api/admin/sbpaygo/zones/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('delete failed');
      setZones((arr) => arr.filter((z) => z.id !== id));
      toast.success('Zone supprimée');
    } catch { toast.error('Échec de la suppression'); }
  };

  const createZone = async () => {
    if (!newZone.country.trim() || !newZone.country_label.trim()) {
      toast.error('Pays + libellé requis'); return;
    }
    try {
      const res = await fetch(`${API}/api/admin/sbpaygo/zones`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newZone),
      });
      if (!res.ok) throw new Error('create failed');
      const data = await res.json();
      setZones((arr) => [...arr, data.zone]);
      setShowNew(false);
      setNewZone({ country: 'FR', country_label: 'France', region: '', city: '', currency: 'EUR', enabled: false });
      toast.success('Zone créée');
    } catch { toast.error('Échec de la création'); }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 max-w-5xl space-y-6" data-testid="admin-sbpaygo-zones">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe size={24} weight="duotone" className="text-indigo-600" />
            Zones SB PayGo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Activez SB PayGo par pays / région / ville. Les changements sont immédiatement visibles dans l'application client, chauffeur et marchand.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"
          data-testid="new-zone-btn"
        >
          <Plus size={14} weight="bold" /> Nouvelle zone
        </button>
      </div>

      {showNew && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 grid grid-cols-2 sm:grid-cols-6 gap-3" data-testid="new-zone-form">
          <input value={newZone.country} onChange={(e) => setNewZone({ ...newZone, country: e.target.value.toUpperCase() })} placeholder="FR" maxLength="2" className="col-span-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="new-zone-country" />
          <input value={newZone.country_label} onChange={(e) => setNewZone({ ...newZone, country_label: e.target.value })} placeholder="France" className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="new-zone-country-label" />
          <input value={newZone.region} onChange={(e) => setNewZone({ ...newZone, region: e.target.value })} placeholder="Région" className="col-span-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          <input value={newZone.city} onChange={(e) => setNewZone({ ...newZone, city: e.target.value })} placeholder="Ville" className="col-span-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          <select value={newZone.currency} onChange={(e) => setNewZone({ ...newZone, currency: e.target.value })} className="col-span-1 px-3 py-2 rounded-lg border border-gray-200 text-sm">
            <option value="EUR">EUR</option><option value="XOF">XOF</option><option value="USD">USD</option><option value="MAD">MAD</option>
          </select>
          <div className="col-span-2 flex items-center gap-2">
            <label className="inline-flex items-center cursor-pointer gap-2">
              <input type="checkbox" checked={newZone.enabled} onChange={(e) => setNewZone({ ...newZone, enabled: e.target.checked })} className="sr-only peer" />
              <div className="relative w-10 h-5 bg-gray-300 peer-checked:bg-emerald-500 rounded-full transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
              <span className="text-xs font-medium text-gray-700">Activée</span>
            </label>
          </div>
          <button onClick={createZone} className="col-span-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-1.5" data-testid="save-new-zone-btn">
            <FloppyDisk size={14} weight="bold" /> Créer
          </button>
          <button onClick={() => setShowNew(false)} className="col-span-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium">
            Annuler
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left">
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">Pays</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">Région</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">Ville</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">Devise</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase text-center">Activée</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase text-center"></th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id} className="border-b border-gray-100 last:border-0" data-testid={`zone-row-${z.id}`}>
                <td className="px-4 py-3 font-semibold text-gray-900">
                  <span className="inline-block w-6 text-xs text-gray-500 mr-1">{z.country}</span>
                  {z.country_label}
                </td>
                <td className="px-4 py-3">
                  <input defaultValue={z.region} onBlur={(e) => e.target.value !== z.region && updateZone(z.id, { region: e.target.value })} className="px-2 py-1 rounded border border-gray-200 text-xs w-full" />
                </td>
                <td className="px-4 py-3">
                  <input defaultValue={z.city} onBlur={(e) => e.target.value !== z.city && updateZone(z.id, { city: e.target.value })} className="px-2 py-1 rounded border border-gray-200 text-xs w-full" />
                </td>
                <td className="px-4 py-3">
                  <select defaultValue={z.currency} onChange={(e) => updateZone(z.id, { currency: e.target.value })} className="px-2 py-1 rounded border border-gray-200 text-xs">
                    <option value="EUR">EUR</option><option value="XOF">XOF</option><option value="USD">USD</option><option value="MAD">MAD</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={!!z.enabled} onChange={(e) => updateZone(z.id, { enabled: e.target.checked })} className="sr-only peer" data-testid={`zone-toggle-${z.id}`} />
                    <div className="relative w-10 h-5 bg-gray-300 peer-checked:bg-emerald-500 rounded-full transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => deleteZone(z.id)} className="text-rose-500 hover:text-rose-700" data-testid={`zone-delete-${z.id}`}>
                    <Trash size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500">
        💡 La propagation est <b>immédiate</b> : dès qu'une zone est activée/désactivée, les apps client et chauffeur dans cette zone affichent ou masquent SB PayGo au prochain chargement.
      </p>
    </div>
  );
};

export default AdminSbPayGoZones;
