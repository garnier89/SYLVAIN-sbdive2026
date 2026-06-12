import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Storefront, MagnifyingGlass, Star, CheckCircle, XCircle, PencilSimple, X, FloppyDisk, SealPercent, Lightning, Plus, Trash, FileCsv, Wallet } from '@phosphor-icons/react';
import { ImageUpload } from '../../components/ImageUpload';
import { adminAPI } from '../../services/api';
import { CreditModal } from './users/AdminUserModals';
import CsvImportModal from '../../components/admin/CsvImportModal';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const MERCHANT_CSV_HEADERS = ['name', 'email', 'phone', 'store_name', 'store_type', 'address', 'description'];
const MERCHANT_CSV_EXAMPLE = {
  name: 'Marie Durand', email: 'marie@boutique.com', phone: '+596696000002',
  store_name: 'Burger Palace', store_type: 'restaurant', address: 'Fort-de-France', description: 'Burgers maison',
};

const EMPTY_MERCHANT = {
  name: '', email: '', password: '', phone: '',
  store_name: '', store_type: 'restaurant', address: '', description: '',
};

const AddMerchantModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState(EMPTY_MERCHANT);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.store_name.trim()) {
      toast.error('Nom, email, mot de passe et nom de boutique sont requis');
      return;
    }
    setSaving(true);
    try {
      await adminAPI.createMerchant(form);
      toast.success('Boutique créée ✅');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de la création');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[2800] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="add-merchant-modal">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Storefront size={18} className="text-orange-500" />Nouvelle boutique</h3>
          <button onClick={onClose} className="text-gray-400" data-testid="add-merchant-close"><X size={22} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">Compte propriétaire</p>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nom du propriétaire *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex : Marie Durand" data-testid="add-merchant-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email *</label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@exemple.com" data-testid="add-merchant-email" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Téléphone</label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+596…" data-testid="add-merchant-phone" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Mot de passe * (min. 6)</label>
            <Input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="••••••" data-testid="add-merchant-password" />
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase pt-2 border-t border-gray-100">Boutique</p>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nom de la boutique *</label>
            <Input value={form.store_name} onChange={(e) => set('store_name', e.target.value)} placeholder="Ex : Burger Palace" data-testid="add-merchant-store-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
              <select value={form.store_type} onChange={(e) => set('store_type', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="add-merchant-type">
                <option value="restaurant">Restaurant</option>
                <option value="grocery">Épicerie</option>
                <option value="pharmacy">Pharmacie</option>
                <option value="shop">Boutique</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Adresse</label>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Ville, rue…" data-testid="add-merchant-address" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Courte description" data-testid="add-merchant-description" />
          </div>
        </div>
        <div className="p-4 border-t border-gray-100">
          <Button onClick={submit} disabled={saving} className="w-full bg-orange-500 hover:bg-orange-600 text-white" data-testid="add-merchant-submit">
            <Plus size={16} weight="bold" className="mr-2" />{saving ? 'Création…' : 'Créer la boutique'}
          </Button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">Un e-mail d'invitation (identifiant + mot de passe + lien) sera envoyé au marchand.</p>
        </div>
      </div>
    </div>
  );
};

const AdminStores = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditSaving, setCreditSaving] = useState(false);

  const openWallet = async (store) => {
    if (!store.user_id) { toast.error('Compte propriétaire introuvable'); return; }
    try {
      const r = await adminAPI.getUser(store.user_id);
      setCreditTarget({ ...r.data, name: r.data.name || store.owner_name || store.store_name, role: 'marchand' });
    } catch {
      setCreditTarget({ id: store.user_id, name: store.owner_name || store.store_name, wallet_balance: 0, role: 'marchand' });
    }
  };

  const saveCredit = async (signedAmount, noteText) => {
    setCreditSaving(true);
    try {
      const r = await adminAPI.creditUserWallet(creditTarget.id, signedAmount, noteText);
      toast.success(`Solde mis à jour : ${r.data.new_balance.toFixed(2)} €`);
      setCreditTarget(null);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
    setCreditSaving(false);
  };

  const deleteStore = async (store) => {
    if (!window.confirm(`Supprimer définitivement « ${store.store_name} » et son compte propriétaire ?`)) return;
    try {
      await adminAPI.deleteMerchant(store.id);
      toast.success('Boutique supprimée');
      loadStores();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de la suppression');
    }
  };

  useEffect(() => { loadStores(); }, [statusFilter]);

  const loadStores = async () => {
    try {
      const res = await fetch(`${API}/api/admin/merchants?status=${statusFilter}`, { credentials: 'include' });
      const data = await res.json();
      setStores(Array.isArray(data) ? data : data.merchants || []);
      if (typeof data.pending_count === 'number') setPendingCount(data.pending_count);
    } catch (err) { console.error('Failed to load stores:', err); }
    finally { setLoading(false); }
  };

  const setApproval = async (storeId, action) => {
    try {
      const res = await fetch(`${API}/api/admin/merchants/${storeId}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action }),
      });
      if (res.ok) { toast.success(action === 'approve' ? 'Boutique validée ✅' : 'Demande refusée'); loadStores(); }
      else toast.error('Échec de l\'action');
    } catch { toast.error('Erreur réseau'); }
  };

  const toggleStatus = async (storeId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await fetch(`${API}/api/admin/merchants/${storeId}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      loadStores();
    } catch (err) { console.error('Toggle status error:', err); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/merchants/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          cuisine: editing.cuisine || '',
          discount_pct: Number(editing.discount_pct) || 0,
          delivery_fee: Number(editing.delivery_fee) || 0,
          eta_min: Number(editing.eta_min) || 30,
          image_url: editing.image_url || '',
          flash_discount: { ...editing.flash, pct: Number(editing.flash?.pct) || 0 },
        }),
      });
      if (res.ok) { toast.success('Marchand mis à jour'); setEditing(null); loadStores(); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const ADM_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const toggleAdmDay = (i) => setEditing((e) => {
    const days = (e.flash.days || []).includes(i) ? e.flash.days.filter((d) => d !== i) : [...(e.flash.days || []), i];
    return { ...e, flash: { ...e.flash, days } };
  });

  const filtered = stores.filter(s =>
    (s.store_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-6" data-testid="admin-stores">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Manage Stores</h1>
          <p className="text-sm text-gray-500 mt-1">{stores.length} marchands enregistrés</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowImport(true)} variant="outline" className="border-gray-300" data-testid="import-merchants-btn">
            <FileCsv size={16} className="mr-1.5" /> Importer CSV
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="add-merchant-btn">
            <Plus size={16} weight="bold" className="mr-1.5" /> Ajouter une boutique
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1" data-testid="store-status-filter">
          {[{ id: 'all', label: 'Tous' }, { id: 'pending', label: 'En attente' }, { id: 'approved', label: 'Validés' }].map((t) => (
            <button key={t.id} onClick={() => setStatusFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              data-testid={`store-filter-${t.id}`}>
              {t.label}{t.id === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Rechercher par nom ou catégorie..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} data-testid="store-search" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Nom</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Cuisine</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Réduction</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Livraison</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Note</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(store => (
              <tr key={store.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`store-row-${store.id}`}>
                <td className="py-3 px-4 font-medium text-gray-800">{store.store_name}</td>
                <td className="py-3 px-4 text-gray-600">{store.cuisine || '—'}</td>
                <td className="py-3 px-4 text-center">
                  {store.discount_pct > 0
                    ? <Badge className="bg-red-100 text-red-700">{store.discount_pct}%</Badge>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-3 px-4 text-center text-gray-600">{(store.delivery_fee ?? 2.5).toFixed(2)} €</td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star size={14} weight="fill" className="text-amber-400" />
                    <span>{store.rating || '5.0'}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  {store.approval_status === 'pending'
                    ? <Badge className="bg-amber-100 text-amber-700">En attente</Badge>
                    : store.approval_status === 'rejected'
                      ? <Badge className="bg-red-100 text-red-700">Refusé</Badge>
                      : <Badge className={store.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>{store.status === 'suspended' ? 'Suspendu' : 'Validé'}</Badge>}
                </td>
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  {store.approval_status === 'pending' ? (
                    <>
                      <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white h-7 px-2 mr-1" onClick={() => setApproval(store.id, 'approve')} data-testid={`store-approve-${store.id}`}>
                        <CheckCircle size={14} className="mr-1" /> Valider
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 h-7 px-2" onClick={() => setApproval(store.id, 'reject')} data-testid={`store-reject-${store.id}`}>
                        Refuser
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ ...store, cuisine: store.cuisine || '', discount_pct: store.discount_pct || 0, delivery_fee: store.delivery_fee ?? 2.5, eta_min: store.eta_min || 30, image_url: store.image_url || '', flash: store.flash_discount || { enabled: false, pct: 20, start_time: '14:00', end_time: '17:00', days: [] } })} data-testid={`store-edit-${store.id}`}>
                        <PencilSimple size={16} className="text-blue-500" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(store.id, store.status || 'active')} data-testid={`store-toggle-${store.id}`}>
                        {store.status === 'suspended' ? <CheckCircle size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openWallet(store)} data-testid={`store-wallet-${store.id}`} title="Créditer / Débiter le portefeuille">
                        <Wallet size={16} weight="fill" className="text-emerald-500" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteStore(store)} data-testid={`store-delete-${store.id}`}>
                        <Trash size={16} className="text-red-500" />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucun marchand trouvé</div>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[2800] bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="store-editor">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Storefront size={18} className="text-orange-500" />{editing.store_name}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400"><X size={22} /></button>
            </div>
            <div className="p-4 space-y-3">
              <ImageUpload label="Logo / photo de la boutique" value={editing.image_url} onChange={(url) => setEditing({ ...editing, image_url: url })} testId="store-logo-upload" />
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Type de cuisine</label>
                <Input value={editing.cuisine} onChange={(e) => setEditing({ ...editing, cuisine: e.target.value })} placeholder="Ex : Italien, Japonais…" data-testid="edit-cuisine" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><SealPercent size={14} className="text-red-500" /> Réduction (%)</label>
                <Input type="number" step="1" min="0" max="90" value={editing.discount_pct} onChange={(e) => setEditing({ ...editing, discount_pct: e.target.value })} data-testid="edit-discount" />
                <p className="text-[11px] text-gray-400 mt-1">Affiché en badge rouge et appliqué au total du panier.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Frais de livraison (€)</label>
                  <Input type="number" step="0.5" min="0" value={editing.delivery_fee} onChange={(e) => setEditing({ ...editing, delivery_fee: e.target.value })} data-testid="edit-delivery" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Délai (min)</label>
                  <Input type="number" step="5" min="1" value={editing.eta_min} onChange={(e) => setEditing({ ...editing, eta_min: e.target.value })} data-testid="edit-eta" />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editing.flash?.enabled} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, enabled: e.target.checked } })} className="w-4 h-4 text-amber-500 rounded" data-testid="edit-flash-enabled" />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1"><Lightning size={14} weight="fill" className="text-amber-500" /> Réduction flash</span>
                </label>
                {editing.flash?.enabled && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" min="0" max="90" placeholder="%" value={editing.flash.pct} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, pct: e.target.value } })} data-testid="edit-flash-pct" />
                      <Input type="time" value={editing.flash.start_time} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, start_time: e.target.value } })} data-testid="edit-flash-start" />
                      <Input type="time" value={editing.flash.end_time} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, end_time: e.target.value } })} data-testid="edit-flash-end" />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {ADM_DAYS.map((d, i) => (
                        <button key={d} type="button" onClick={() => toggleAdmDay(i)} data-testid={`edit-flash-day-${i}`}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${(editing.flash.days || []).includes(i) ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100">
              <Button onClick={saveSettings} disabled={saving} className="w-full bg-orange-500 hover:bg-orange-600 text-white" data-testid="save-store-btn">
                <FloppyDisk size={16} weight="fill" className="mr-2" />{saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {showAdd && <AddMerchantModal onClose={() => setShowAdd(false)} onCreated={loadStores} />}
      {showImport && (
        <CsvImportModal
          title="Importer des boutiques (CSV)"
          label="Importez plusieurs marchands d'un coup. Chaque boutique est créée validée et active."
          accent="orange"
          templateHeaders={MERCHANT_CSV_HEADERS}
          templateExample={MERCHANT_CSV_EXAMPLE}
          templateName="modele-marchands.csv"
          onImport={(csv) => adminAPI.importMerchants(csv).then((r) => r.data)}
          onClose={() => setShowImport(false)}
          onDone={loadStores}
          testIdPrefix="import-merchants"
        />
      )}

      <CreditModal target={creditTarget} saving={creditSaving} onClose={() => setCreditTarget(null)} onSubmit={saveCredit} />
    </div>
  );
};

export default AdminStores;
