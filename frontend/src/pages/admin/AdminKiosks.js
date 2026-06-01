/**
 * Admin page to manage SB Drive Tab kiosks (hotels/restaurants).
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, ArrowsClockwise, Link as LinkIcon } from '@phosphor-icons/react';
import kioskAPI from '../../api/kioskAPI';

const initialForm = {
  hotel_name: '',
  address: '',
  lat: 14.6161,
  lng: -61.0588,
  pin_code: '',
  language: 'fr',
  currency: 'EUR',
  image_url: '',
  pickup_label: '',
};

export default function AdminKiosks() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    setLoading(true);
    try {
      const data = await kioskAPI.adminList();
      setItems(data.items || []);
    } catch (e) {
      toast.error("Erreur de chargement");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(initialForm); setShowForm(true); };
  const openEdit = (k) => { setEditing(k); setForm({ ...initialForm, ...k }); setShowForm(true); };

  const save = async () => {
    if (!form.hotel_name || !form.address || !form.pin_code) {
      toast.error('Nom, adresse et PIN requis');
      return;
    }
    try {
      if (editing) {
        await kioskAPI.adminUpdate(editing.id, form);
        toast.success('Borne mise à jour');
      } else {
        await kioskAPI.adminCreate(form);
        toast.success('Borne créée');
      }
      setShowForm(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (k) => {
    if (!window.confirm(`Supprimer la borne "${k.hotel_name}" ?`)) return;
    await kioskAPI.adminDelete(k.id);
    toast.success('Borne supprimée');
    load();
  };

  const regenerate = async (k) => {
    if (!window.confirm('Régénérer le token va invalider le lien actuel. Continuer ?')) return;
    const res = await kioskAPI.adminRegenerateToken(k.id);
    toast.success('Token régénéré');
    navigator.clipboard?.writeText(`${window.location.origin}/kiosk?token=${res.session_token}`);
    load();
  };

  const copyUrl = (k) => {
    const url = `${window.location.origin}/kiosk?token=${k.session_token}`;
    navigator.clipboard?.writeText(url);
    toast.success('URL copiée — ouvrez-la sur la tablette');
  };

  return (
    <div className="p-6" data-testid="admin-kiosks-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bornes SB Drive Tab</h1>
          <p className="text-sm text-gray-500">Gérez les bornes tablettes installées chez vos partenaires (hôtels, restaurants).</p>
        </div>
        <button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2" data-testid="add-kiosk-btn">
          <Plus size={20} weight="bold" /> Nouvelle borne
        </button>
      </div>

      {loading ? <p>Chargement…</p> : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Partenaire</th>
                <th className="px-4 py-3">Adresse</th>
                <th className="px-4 py-3">PIN</th>
                <th className="px-4 py-3">Langue / Devise</th>
                <th className="px-4 py-3">Courses</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan="6" className="text-center text-gray-400 py-12">Aucune borne configurée.</td></tr>}
              {items.map(k => (
                <tr key={k.id} className="border-t hover:bg-orange-50/30" data-testid={`kiosk-row-${k.id}`}>
                  <td className="px-4 py-3 font-semibold">{k.hotel_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{k.address}</td>
                  <td className="px-4 py-3"><code className="bg-gray-100 px-2 py-1 rounded">{k.pin_code}</code></td>
                  <td className="px-4 py-3 text-sm">{k.language?.toUpperCase()} / {k.currency}</td>
                  <td className="px-4 py-3 text-sm">{k.total_bookings || 0}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => copyUrl(k)} className="p-2 hover:bg-orange-100 rounded text-orange-600" title="Copier URL borne" data-testid={`copy-url-${k.id}`}><LinkIcon size={18} /></button>
                    <button onClick={() => regenerate(k)} className="p-2 hover:bg-blue-100 rounded text-blue-600" title="Régénérer token"><ArrowsClockwise size={18} /></button>
                    <button onClick={() => openEdit(k)} className="p-2 hover:bg-amber-100 rounded text-amber-600" title="Modifier"><Pencil size={18} /></button>
                    <button onClick={() => remove(k)} className="p-2 hover:bg-red-100 rounded text-red-600" title="Supprimer"><Trash size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6" data-testid="kiosk-form-modal">
            <h2 className="text-xl font-bold mb-4">{editing ? 'Modifier la borne' : 'Nouvelle borne'}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Nom du partenaire *</label>
                <input value={form.hotel_name} onChange={e => setForm({ ...form, hotel_name: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="Ex: Hôtel Le Carbet" data-testid="form-hotel-name" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Adresse complète *</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="Ex: Ducos 97224, Martinique" data-testid="form-address" />
              </div>
              <div>
                <label className="text-sm font-medium">Latitude *</label>
                <input type="number" step="any" value={form.lat} onChange={e => setForm({ ...form, lat: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-3 py-2 mt-1" data-testid="form-lat" />
              </div>
              <div>
                <label className="text-sm font-medium">Longitude *</label>
                <input type="number" step="any" value={form.lng} onChange={e => setForm({ ...form, lng: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-3 py-2 mt-1" data-testid="form-lng" />
              </div>
              <div>
                <label className="text-sm font-medium">Code PIN (4-6 chiffres) *</label>
                <input value={form.pin_code} onChange={e => setForm({ ...form, pin_code: e.target.value.replace(/\D/g,'').slice(0,6) })} className="w-full border rounded px-3 py-2 mt-1 font-mono" placeholder="1234" data-testid="form-pin" />
              </div>
              <div>
                <label className="text-sm font-medium">Étiquette du point de prise en charge</label>
                <input value={form.pickup_label} onChange={e => setForm({ ...form, pickup_label: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="Ex: Réception Hôtel Le Carbet" />
              </div>
              <div>
                <label className="text-sm font-medium">Langue par défaut</label>
                <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} className="w-full border rounded px-3 py-2 mt-1">
                  <option value="fr">Français</option><option value="en">English</option><option value="es">Español</option><option value="pt">Português</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Devise</label>
                <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full border rounded px-3 py-2 mt-1">
                  <option value="EUR">EUR</option><option value="USD">USD</option><option value="XOF">XOF</option><option value="XAF">XAF</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">URL Image (carrousel accueil)</label>
                <input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="https://..." />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={save} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg" data-testid="form-save-btn">{editing ? 'Mettre à jour' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
