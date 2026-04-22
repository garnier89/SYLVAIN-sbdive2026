import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Image, Plus, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const CRUD = `${API}/api/admin/crud/banners`;

const positions = ['home_top', 'home_bottom', 'food_top', 'ride_top', 'checkout', 'wallet'];

const AdminBanners = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', subtitle: '', image_url: '', position: 'home_top', active: true });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(CRUD, { credentials: 'include' });
      const data = await res.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.title.trim()) { toast.error('Titre requis'); return; }
    try {
      const res = await fetch(CRUD, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('bad');
      const saved = await res.json();
      setBanners(prev => [saved, ...prev]);
      setShowForm(false);
      setForm({ title: '', subtitle: '', image_url: '', position: 'home_top', active: true });
      toast.success('Bannière ajoutée');
    } catch (e) { console.error(e); toast.error('Erreur lors de l\'ajout'); }
  };

  const toggleActive = async (banner) => {
    try {
      await fetch(`${CRUD}/${banner.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...banner, active: !banner.active }),
      });
      setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, active: !b.active } : b));
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette bannière ?')) return;
    try {
      await fetch(`${CRUD}/${id}`, { method: 'DELETE', credentials: 'include' });
      setBanners(prev => prev.filter(b => b.id !== id));
      toast.success('Bannière supprimée');
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  return (
    <div className="p-6" data-testid="admin-banners">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Bannières publicitaires</h1>
          <p className="text-sm text-gray-500 mt-1">{banners.length} bannière(s) configurée(s)</p>
        </div>
        <Button className="bg-[#3b82f6] text-white" onClick={() => setShowForm(!showForm)} data-testid="add-banner-btn">
          <Plus size={16} className="mr-1" /> Ajouter
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6" data-testid="banner-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Titre" value={form.title} onChange={e => setForm({...form, title: e.target.value})} data-testid="banner-title" />
            <Input placeholder="Sous-titre" value={form.subtitle} onChange={e => setForm({...form, subtitle: e.target.value})} />
            <Input placeholder="URL de l'image" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} />
            <select value={form.position} onChange={e => setForm({...form, position: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {positions.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ').toUpperCase()}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleAdd} className="bg-[#3b82f6] text-white" data-testid="save-banner-btn">Enregistrer</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : banners.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-400">Aucune bannière. Cliquez sur "Ajouter" pour en créer une.</div>
      ) : (
        <div className="grid gap-4">
          {banners.map(banner => (
            <div key={banner.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4" data-testid={`banner-${banner.id}`}>
              <div className="w-24 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                {banner.image_url ? (
                  <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <Image size={24} className="text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-800">{banner.title}</h3>
                <p className="text-sm text-gray-500">{banner.subtitle}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{(banner.position || '').replace(/_/g, ' ')}</Badge>
                  <Badge className={banner.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{banner.active ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => toggleActive(banner)} data-testid={`toggle-${banner.id}`}>
                  {banner.active ? 'Désactiver' : 'Activer'}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => handleDelete(banner.id)} data-testid={`delete-${banner.id}`}>
                  <Trash size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminBanners;
