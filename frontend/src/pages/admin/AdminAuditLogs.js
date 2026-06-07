/**
 * Admin Audit Logs page (V3Cube admin trace).
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClockClockwise, MagnifyingGlass, ArrowsClockwise } from '@phosphor-icons/react';
import { auditAPI } from '../../api/v3cubeAPI';

export default function AdminAuditLogs() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ action: '', actor_id: '', target_type: '' });
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
      const [d, a] = await Promise.all([
        auditAPI.logs({ ...cleanFilters, limit: 100 }),
        auditAPI.actions().catch(() => ({ items: [] })),
      ]);
      setItems(d.items || []);
      setTotal(d.total || 0);
      setActions(a.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally { setLoading(false); }
  };
  // load() reads `filters` but must run on mount only; manual reload via the filter button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6" data-testid="admin-audit-logs-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClockClockwise size={28} weight="duotone" className="text-amber-600" /> Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Trace exhaustive des actions sensibles ({total} entrées)</p>
        </div>
        <button onClick={load} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"><ArrowsClockwise size={16} /> Rafraîchir</button>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} className="border rounded px-3 py-2 text-sm" data-testid="filter-action">
          <option value="">— Toutes les actions —</option>
          {actions.map(a => <option key={a.action} value={a.action}>{a.action} ({a.count})</option>)}
        </select>
        <input value={filters.actor_id} onChange={e => setFilters(f => ({ ...f, actor_id: e.target.value }))} placeholder="Actor ID (user_xxx)" className="border rounded px-3 py-2 text-sm font-mono" />
        <input value={filters.target_type} onChange={e => setFilters(f => ({ ...f, target_type: e.target.value }))} placeholder="Target type (driver, user, ride…)" className="border rounded px-3 py-2 text-sm" />
        <button onClick={load} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2"><MagnifyingGlass size={16} /> Filtrer</button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr><th className="px-4 py-3 text-left">Date</th><th className="text-left">Acteur</th><th className="text-left">Action</th><th className="text-left">Cible</th><th className="text-left">IP</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="text-center text-gray-400 py-12">Chargement…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan="6" className="text-center text-gray-400 py-12">Aucune entrée pour ces filtres.</td></tr>}
            {items.map(it => (
              <tr key={it.id} className="border-t hover:bg-amber-50/30 cursor-pointer" onClick={() => setSelected(it)} data-testid={`audit-row-${it.id}`}>
                <td className="px-4 py-3 text-xs font-mono">{new Date(it.created_at).toLocaleString('fr-FR')}</td>
                <td className="text-xs font-mono">{it.actor_id?.slice(-10) || '—'}</td>
                <td><span className="bg-amber-100 text-amber-700 text-xs font-mono px-2 py-1 rounded">{it.action}</span></td>
                <td className="text-xs">{it.target_type ? `${it.target_type}: ${it.target_id?.slice(-10) || ''}` : '—'}</td>
                <td className="text-xs font-mono">{it.ip_address || '—'}</td>
                <td className="text-xs text-blue-600">Détails →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-3">{selected.action}</h2>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">{JSON.stringify(selected, null, 2)}</pre>
            <button onClick={() => setSelected(null)} className="mt-4 px-4 py-2 bg-amber-500 text-white rounded">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
