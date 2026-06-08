import React, { useState, useEffect } from 'react';
import { couponAPI } from '../../services/api';
import { Gear, Power, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';

const AdminPromocodes = () => {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [menuId, setMenuId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'Percentage', discount_value: 10,
    max_discount: 10, usage_limit: 100, per_user_limit: 1,
    service_type: 'All', expiry_date: '',
  });

  useEffect(() => { loadCodes(); }, []);

  const loadCodes = async () => {
    try {
      const r = await couponAPI.adminList();
      setCodes(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleReset = () => { setSearch(''); setStatusFilter(''); };

  const handleToggle = async (c) => {
    setMenuId(null);
    try {
      const r = await couponAPI.adminToggle(c.id);
      toast.success(r.data?.status === 'active' ? 'Code activé' : 'Code désactivé');
      loadCodes();
    } catch (e) { console.error(e); toast.error('Action impossible'); }
  };

  const handleDelete = async (c) => {
    setMenuId(null);
    if (!window.confirm(`Supprimer le code « ${c.code} » ?`)) return;
    try {
      await couponAPI.adminDelete(c.id);
      toast.success('Code supprimé');
      setSelected(prev => prev.filter(id => id !== c.id));
      loadCodes();
    } catch (e) { console.error(e); toast.error('Suppression impossible'); }
  };

  const handleBulkApply = async () => {
    if (!bulkAction) { toast.error('Choisissez une action'); return; }
    if (selected.length === 0) { toast.error('Sélectionnez au moins un code'); return; }
    if (bulkAction === 'delete' && !window.confirm(`Supprimer ${selected.length} code(s) ?`)) return;
    try {
      const r = await couponAPI.adminBulk(bulkAction, selected);
      toast.success(`${r.data?.affected ?? 0} code(s) traité(s)`);
      setSelected([]);
      setBulkAction('');
      loadCodes();
    } catch (e) { console.error(e); toast.error('Action groupée impossible'); }
  };

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Aucun code à exporter'); return; }
    const headers = ['Code', 'Type', 'Valeur', 'Remise max', 'Limite usage', 'Utilisé', 'Service', 'Expiration', 'Statut'];
    const rows = filtered.map(c => [
      c.code, c.discount_type, c.discount_value, c.max_discount,
      c.usage_limit, c.used || 0, c.service_type, c.expiry_date || '', c.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `promocodes_${new Date().toISOString().slice(0, 10)}.csv`);
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  };

  const filtered = codes.filter(c => {
    if (search && !(c.code || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && (c.status || 'active') !== statusFilter) return false;
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every(c => selected.includes(c.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(prev => prev.filter(id => !filtered.some(c => c.id === id)));
    else setSelected(prev => Array.from(new Set([...prev, ...filtered.map(c => c.id)])));
  };
  const toggleSelectOne = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAdd = async () => {
    if (!form.code.trim()) { toast.error('Code requis'); return; }
    try {
      await couponAPI.adminCreate(form);
      toast.success('Code promo créé');
      setShowForm(false);
      setForm({
        code: '', description: '', discount_type: 'Percentage', discount_value: 10,
        max_discount: 10, usage_limit: 100, per_user_limit: 1,
        service_type: 'All', expiry_date: '',
      });
      loadCodes();
    } catch (e) { console.error(e); toast.error('Erreur lors de la création'); }
  };

  return (
    <div className="p-6" data-testid="admin-promocodes">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>PromoCode</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="font-bold text-gray-700 text-sm">Search:</span>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>All</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder=""
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 outline-none focus:border-blue-400" data-testid="search-input" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option value="">Select Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button onClick={handleReset} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="ml-auto bg-[#17a2b8] text-white px-4 py-2 rounded text-sm font-bold hover:bg-[#138496] transition-colors" data-testid="add-promo-btn" onClick={() => setShowForm(true)}>
          ADD PROMO CODE
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()} data-testid="promo-form">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Nouveau code promo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Code</label>
                <input value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="SUMMER20" className="w-full border rounded px-3 py-2 text-sm font-mono" data-testid="promo-code-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Type</label>
                <select value={form.discount_type} onChange={e => setForm({...form, discount_type: e.target.value})} className="w-full border rounded px-3 py-2 text-sm">
                  <option value="Percentage">Pourcentage (%)</option>
                  <option value="Flat">Montant fixe (EUR)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Valeur</label>
                <input type="number" value={form.discount_value} onChange={e => setForm({...form, discount_value: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Remise max (EUR)</label>
                <input type="number" value={form.max_discount} onChange={e => setForm({...form, max_discount: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Limite usage total</label>
                <input type="number" value={form.usage_limit} onChange={e => setForm({...form, usage_limit: parseInt(e.target.value) || 0})} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Limite par utilisateur</label>
                <input type="number" value={form.per_user_limit} onChange={e => setForm({...form, per_user_limit: parseInt(e.target.value) || 1})} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Service</label>
                <select value={form.service_type} onChange={e => setForm({...form, service_type: e.target.value})} className="w-full border rounded px-3 py-2 text-sm">
                  <option value="All">Tous</option>
                  <option value="Ride">Course</option>
                  <option value="Food">Livraison</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Date expiration</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Description</label>
                <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Code été -20%" className="w-full border rounded px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold border rounded hover:bg-gray-50">Annuler</button>
              <button onClick={handleAdd} className="px-4 py-2 text-sm font-bold text-white bg-[#17a2b8] rounded hover:bg-[#138496]" data-testid="save-promo-btn">Créer</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action & Export */}
      <div className="flex items-center gap-3 mb-4">
        <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none" data-testid="bulk-action-select">
          <option value="">Select Action</option>
          <option value="activate">Activate</option>
          <option value="deactivate">Deactivate</option>
          <option value="delete">Delete</option>
        </select>
        <button onClick={handleBulkApply} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40" disabled={!bulkAction || selected.length === 0} data-testid="bulk-apply-btn">
          APPLIQUER{selected.length > 0 ? ` (${selected.length})` : ''}
        </button>
        <button onClick={handleExport} className="ml-auto border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="promo-table">
              <thead>
                <tr className="border-t border-b border-gray-200 bg-white">
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700"><input type="checkbox" className="rounded border-gray-300" checked={allSelected} onChange={toggleSelectAll} data-testid="select-all-checkbox" /></th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Promo Code</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Discount</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Validity</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Promocode Type</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Expiry Date</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Usage Limit</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Used</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">System Type</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-gray-400">No promo codes found</td></tr>
                ) : filtered.map((c, i) => (
                  <tr key={c.id || i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`promo-row-${i}`}>
                    <td className="py-3 px-3"><input type="checkbox" className="rounded border-gray-300" checked={selected.includes(c.id)} onChange={() => toggleSelectOne(c.id)} data-testid={`promo-checkbox-${i}`} /></td>
                    <td className="py-3 px-3 text-sm text-gray-800 font-mono font-medium">{c.code}</td>
                    <td className="py-3 px-3 text-sm text-gray-700">{c.discount_type === 'Flat' ? `${c.discount_value || 0} €` : `${c.discount_value || 0}%`}</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.validity || 'Permanent'}</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.discount_type || 'Percentage'}</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.expiry_date || '-'}</td>
                    <td className="py-3 px-3 text-sm text-gray-700">{c.usage_limit ? c.usage_limit : 'Unlimited'}</td>
                    <td className="py-3 px-3">
                      <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded">{c.used || 0}</span>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.service_type || 'All'}</td>
                    <td className="py-3 px-3" data-testid={`promo-status-${i}`}>
                      {(c.status || 'active') === 'active' ? (
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-200 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </td>
                    <td className="py-3 px-3 relative">
                      <button onClick={() => setMenuId(menuId === c.id ? null : c.id)} className="text-gray-400 hover:text-gray-600 transition-colors" data-testid={`promo-action-${i}`}>
                        <Gear size={18} />
                      </button>
                      {menuId === c.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                          <div className="absolute right-3 top-9 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44" data-testid={`promo-menu-${i}`}>
                            <button onClick={() => handleToggle(c)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" data-testid={`promo-toggle-${i}`}>
                              <Power size={16} /> {(c.status || 'active') === 'active' ? 'Désactiver' : 'Activer'}
                            </button>
                            <button onClick={() => handleDelete(c)} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" data-testid={`promo-delete-${i}`}>
                              <Trash size={16} /> Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4">Showing 1 to {filtered.length} of {filtered.length} entries</p>

          {/* Notes */}
          <div className="mt-6 border border-gray-200 rounded p-4 bg-gray-50">
            <p className="font-bold text-gray-800 text-sm mb-2">Notes:</p>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>Coupon module will list all coupons on this page.</li>
              <li>Administrator can Activate / Deactivate / Delete any coupon.</li>
              <li>Administrator can export data in XLS format.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminPromocodes;
