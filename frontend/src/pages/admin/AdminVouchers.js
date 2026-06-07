import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Ticket, Plus, PencilSimple, Trash, Power, X } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

const EMPTY = {
  code: '', title: '', discount_type: 'fixed', value: 10, max_discount: 0,
  min_order_amount: 0, total_quota: 0, per_user_limit: 1,
  valid_from: '', valid_until: '', status: 'active',
};

const VoucherModal = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!(initial && initial.id);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.code.trim()) { toast.error('Code requis'); return; }
    if (!(form.value > 0)) { toast.error('Valeur de remise requise'); return; }
    setSaving(true);
    try {
      if (isEdit) await adminAPI.updateVoucher(initial.id, form);
      else await adminAPI.createVoucher(form);
      toast.success(isEdit ? 'Voucher mis à jour' : 'Voucher créé');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec');
    } finally { setSaving(false); }
  };

  const cls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white';
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()} data-testid="voucher-modal">
      <div className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-gray-900">{isEdit ? 'Modifier le voucher' : 'Nouveau voucher'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="voucher-close"><X size={22} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Code</label>
              <input className={`${cls} uppercase`} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="WELCOME10" data-testid="voucher-code" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Titre</label>
              <input className={cls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Bon de bienvenue" data-testid="voucher-title" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type de remise</label>
              <select className={cls} value={form.discount_type} onChange={(e) => set('discount_type', e.target.value)} data-testid="voucher-discount-type">
                <option value="fixed">Montant fixe (€)</option>
                <option value="percentage">Pourcentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{form.discount_type === 'percentage' ? 'Pourcentage' : 'Montant (€)'}</label>
              <input type="number" className={cls} value={form.value} onChange={(e) => set('value', parseFloat(e.target.value) || 0)} data-testid="voucher-value" />
            </div>
          </div>
          {form.discount_type === 'percentage' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Remise max (€, 0 = illimitée)</label>
              <input type="number" className={cls} value={form.max_discount} onChange={(e) => set('max_discount', parseFloat(e.target.value) || 0)} data-testid="voucher-max" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Montant min (€)</label>
              <input type="number" className={cls} value={form.min_order_amount} onChange={(e) => set('min_order_amount', parseFloat(e.target.value) || 0)} data-testid="voucher-min" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Quota total (0=∞)</label>
              <input type="number" className={cls} value={form.total_quota} onChange={(e) => set('total_quota', parseInt(e.target.value, 10) || 0)} data-testid="voucher-quota" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Par client (0=∞)</label>
              <input type="number" className={cls} value={form.per_user_limit} onChange={(e) => set('per_user_limit', parseInt(e.target.value, 10) || 0)} data-testid="voucher-per-user" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Valable du</label>
              <input type="date" className={cls} value={form.valid_from || ''} onChange={(e) => set('valid_from', e.target.value)} data-testid="voucher-valid-from" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Valable jusqu&apos;au</label>
              <input type="date" className={cls} value={form.valid_until || ''} onChange={(e) => set('valid_until', e.target.value)} data-testid="voucher-valid-until" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Statut</label>
            <select className={cls} value={form.status} onChange={(e) => set('status', e.target.value)} data-testid="voucher-status">
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>
        </div>
        <button onClick={save} disabled={saving} className="w-full mt-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3 disabled:opacity-50 transition-colors" data-testid="voucher-save">
          {saving ? 'Enregistrement…' : (isEdit ? 'Mettre à jour' : 'Créer le voucher')}
        </button>
      </div>
    </div>
  );
};

const AdminVouchers = () => {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await adminAPI.listVouchers();
      setVouchers(r.data || []);
    } catch {
      toast.error('Échec du chargement');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let alive = true;
    adminAPI.listVouchers()
      .then((r) => { if (alive) setVouchers(r.data || []); })
      .catch(() => toast.error('Échec du chargement'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const toggle = async (v) => {
    try { await adminAPI.toggleVoucher(v.id); await load(); } catch { toast.error('Échec'); }
  };
  const remove = async (v) => {
    if (!window.confirm(`Supprimer le voucher « ${v.code} » ?`)) return;
    try { await adminAPI.deleteVoucher(v.id); toast.success('Supprimé'); await load(); } catch { toast.error('Échec'); }
  };

  const fmtVal = (v) => v.discount_type === 'percentage'
    ? `${v.value}%${v.max_discount > 0 ? ` (max ${v.max_discount}€)` : ''}`
    : `${v.value} €`;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" data-testid="admin-vouchers-page">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Ticket size={26} weight="fill" className="text-emerald-600" />
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Vouchers</h1>
            <p className="text-sm text-gray-500">Bons à code, appliqués au paiement (montant fixe ou %, quota & validité).</p>
          </div>
        </div>
        <button onClick={() => setModal(EMPTY)} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5 py-2.5 transition-colors" data-testid="voucher-add-btn">
          <Plus size={18} weight="bold" />Nouveau voucher
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-10" data-testid="voucher-loading">Chargement…</p>
      ) : vouchers.length === 0 ? (
        <div className="text-center text-gray-400 py-16 bg-white rounded-2xl border border-dashed border-gray-200" data-testid="voucher-empty">
          Aucun voucher. Cliquez sur « Nouveau voucher » pour en créer un.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Remise</th>
                <th className="text-left px-4 py-3">Min</th>
                <th className="text-left px-4 py-3">Quota</th>
                <th className="text-left px-4 py-3">Validité</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vouchers.map((v, i) => (
                <tr key={v.id} className="hover:bg-gray-50" data-testid={`voucher-row-${i}`}>
                  <td className="px-4 py-3"><span className="font-mono font-bold text-gray-900">{v.code}</span><div className="text-xs text-gray-400">{v.title}</div></td>
                  <td className="px-4 py-3 font-medium text-emerald-700">{fmtVal(v)}</td>
                  <td className="px-4 py-3 text-gray-600">{v.min_order_amount > 0 ? `${v.min_order_amount} €` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{v.used_count || 0}{v.total_quota > 0 ? ` / ${v.total_quota}` : ''}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{v.valid_until ? `→ ${v.valid_until}` : 'Illimitée'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${v.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`} data-testid={`voucher-status-${i}`}>
                      {v.status === 'active' ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => toggle(v)} title="Activer/Désactiver" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" data-testid={`voucher-toggle-${i}`}><Power size={17} /></button>
                      <button onClick={() => setModal(v)} title="Modifier" className="p-1.5 rounded-lg hover:bg-gray-100 text-blue-600" data-testid={`voucher-edit-${i}`}><PencilSimple size={17} /></button>
                      <button onClick={() => remove(v)} title="Supprimer" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" data-testid={`voucher-delete-${i}`}><Trash size={17} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <VoucherModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
};

export default AdminVouchers;
