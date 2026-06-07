import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Sparkle, Plus, PencilSimple, Trash, Power, X } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

const CRITERIA = [
  { v: 'first_ride', l: 'Première course' },
  { v: 'trip_count', l: 'Nombre de courses atteint' },
  { v: 'inactive_user', l: 'Utilisateur inactif' },
  { v: 'every_trip', l: 'Chaque course' },
];
const CRIT_LABEL = Object.fromEntries(CRITERIA.map((c) => [c.v, c.l]));

const EMPTY = {
  title: '', eligibility_criteria: 'first_ride', trip_count_threshold: 5,
  inactive_days: 30, discount_type: 'flat', discount_amount: 5, max_discount: 0,
  service_type: 'all', status: 'active',
};

const PromoModal = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!(initial && initial.id);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { toast.error('Titre requis'); return; }
    if (!(form.discount_amount > 0)) { toast.error('Montant de remise requis'); return; }
    setSaving(true);
    try {
      if (isEdit) await adminAPI.updateAutoPromotion(initial.id, form);
      else await adminAPI.createAutoPromotion(form);
      toast.success(isEdit ? 'Promotion mise à jour' : 'Promotion créée');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec');
    } finally { setSaving(false); }
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white';
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()} data-testid="auto-promo-modal">
      <div className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-gray-900">{isEdit ? 'Modifier la promotion' : 'Nouvelle promotion auto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="auto-promo-close"><X size={22} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Titre</label>
            <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Offre première course" data-testid="auto-promo-title" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Critère d&apos;éligibilité</label>
            <select className={inputCls} value={form.eligibility_criteria} onChange={(e) => set('eligibility_criteria', e.target.value)} data-testid="auto-promo-criteria">
              {CRITERIA.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          {form.eligibility_criteria === 'trip_count' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Seuil de courses (N)</label>
              <input type="number" className={inputCls} value={form.trip_count_threshold} onChange={(e) => set('trip_count_threshold', parseInt(e.target.value, 10) || 0)} data-testid="auto-promo-threshold" />
            </div>
          )}
          {form.eligibility_criteria === 'inactive_user' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Jours d&apos;inactivité</label>
              <input type="number" className={inputCls} value={form.inactive_days} onChange={(e) => set('inactive_days', parseInt(e.target.value, 10) || 0)} data-testid="auto-promo-inactive-days" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type de remise</label>
              <select className={inputCls} value={form.discount_type} onChange={(e) => set('discount_type', e.target.value)} data-testid="auto-promo-discount-type">
                <option value="flat">Montant fixe (€)</option>
                <option value="percentage">Pourcentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{form.discount_type === 'percentage' ? 'Pourcentage' : 'Montant (€)'}</label>
              <input type="number" className={inputCls} value={form.discount_amount} onChange={(e) => set('discount_amount', parseFloat(e.target.value) || 0)} data-testid="auto-promo-amount" />
            </div>
          </div>
          {form.discount_type === 'percentage' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Remise max (€, 0 = illimitée)</label>
              <input type="number" className={inputCls} value={form.max_discount} onChange={(e) => set('max_discount', parseFloat(e.target.value) || 0)} data-testid="auto-promo-max" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Service</label>
              <select className={inputCls} value={form.service_type} onChange={(e) => set('service_type', e.target.value)} data-testid="auto-promo-service">
                <option value="all">Tous</option>
                <option value="ride">Course (VTC)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Statut</label>
              <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)} data-testid="auto-promo-status">
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
              </select>
            </div>
          </div>
        </div>
        <button onClick={save} disabled={saving} className="w-full mt-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3 disabled:opacity-50 transition-colors" data-testid="auto-promo-save">
          {saving ? 'Enregistrement…' : (isEdit ? 'Mettre à jour' : 'Créer la promotion')}
        </button>
      </div>
    </div>
  );
};

const AdminAutoPromotions = () => {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {} | promo

  const load = useCallback(async () => {
    try {
      const r = await adminAPI.listAutoPromotions();
      setPromos(r.data || []);
    } catch {
      toast.error('Échec du chargement');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let alive = true;
    adminAPI.listAutoPromotions()
      .then((r) => { if (alive) setPromos(r.data || []); })
      .catch(() => toast.error('Échec du chargement'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const toggle = async (p) => {
    try { await adminAPI.toggleAutoPromotion(p.id); await load(); }
    catch { toast.error('Échec'); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Supprimer « ${p.title} » ?`)) return;
    try { await adminAPI.deleteAutoPromotion(p.id); toast.success('Supprimée'); await load(); }
    catch { toast.error('Échec'); }
  };

  const fmtDiscount = (p) => p.discount_type === 'percentage'
    ? `${p.discount_amount}%${p.max_discount > 0 ? ` (max ${p.max_discount}€)` : ''}`
    : `${p.discount_amount} €`;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="admin-auto-promotions-page">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Sparkle size={26} weight="fill" className="text-emerald-600" />
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Promotions automatiques (IA)</h1>
            <p className="text-sm text-gray-500">Remises auto-appliquées au tarif selon le profil du client — sans code.</p>
          </div>
        </div>
        <button onClick={() => setModal(EMPTY)} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5 py-2.5 transition-colors" data-testid="auto-promo-add-btn">
          <Plus size={18} weight="bold" />Nouvelle promotion
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-10" data-testid="auto-promo-loading">Chargement…</p>
      ) : promos.length === 0 ? (
        <div className="text-center text-gray-400 py-16 bg-white rounded-2xl border border-dashed border-gray-200" data-testid="auto-promo-empty">
          Aucune promotion automatique. Cliquez sur « Nouvelle promotion » pour en créer une.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Titre</th>
                <th className="text-left px-4 py-3">Critère</th>
                <th className="text-left px-4 py-3">Remise</th>
                <th className="text-left px-4 py-3">Usage</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {promos.map((p, i) => (
                <tr key={p.id} className="hover:bg-gray-50" data-testid={`auto-promo-row-${i}`}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{p.title}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {CRIT_LABEL[p.eligibility_criteria] || p.eligibility_criteria}
                    {p.eligibility_criteria === 'trip_count' && ` (≥ ${p.trip_count_threshold})`}
                    {p.eligibility_criteria === 'inactive_user' && ` (${p.inactive_days} j)`}
                  </td>
                  <td className="px-4 py-3 font-medium text-emerald-700">{fmtDiscount(p)}</td>
                  <td className="px-4 py-3 text-gray-600">{p.usage_count || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`} data-testid={`auto-promo-status-${i}`}>
                      {p.status === 'active' ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => toggle(p)} title="Activer/Désactiver" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" data-testid={`auto-promo-toggle-${i}`}><Power size={17} /></button>
                      <button onClick={() => setModal(p)} title="Modifier" className="p-1.5 rounded-lg hover:bg-gray-100 text-blue-600" data-testid={`auto-promo-edit-${i}`}><PencilSimple size={17} /></button>
                      <button onClick={() => remove(p)} title="Supprimer" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" data-testid={`auto-promo-delete-${i}`}><Trash size={17} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <PromoModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
};

export default AdminAutoPromotions;
