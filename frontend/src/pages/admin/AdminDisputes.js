import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const CRUD = `${API}/api/admin/crud/disputes`;

const statusColors = {
  open: 'bg-red-100 text-red-700',
  investigating: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

const AdminDisputes = () => {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(CRUD, { credentials: 'include' });
      setDisputes(await r.json() || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const updateStatus = async (d, status) => {
    try {
      const updated = { ...d, status };
      await fetch(`${CRUD}/${d.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updated),
      });
      setDisputes(prev => prev.map(x => x.id === d.id ? updated : x));
      toast.success('Statut mis à jour');
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const openCount = disputes.filter(d => d.status === 'open').length;
  const filtered = disputes.filter(d =>
    (d.user_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (d.reason || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-6" data-testid="admin-disputes">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestion des litiges</h1>
          <p className="text-sm text-gray-500 mt-1">{openCount} litige(s) ouvert(s)</p>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Course</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Client</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Chauffeur</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Motif</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Montant</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`dispute-${d.id}`}>
                  <td className="py-3 px-4 font-mono text-xs text-blue-600">#{(d.ride_id || '').slice(-4)}</td>
                  <td className="py-3 px-4 text-gray-800">{d.user_name}</td>
                  <td className="py-3 px-4 text-gray-600">{d.driver_name}</td>
                  <td className="py-3 px-4 text-gray-600 max-w-[260px] truncate">{d.reason}</td>
                  <td className="py-3 px-4 text-right font-medium">{(d.amount > 0) ? `${d.amount.toFixed(2)} EUR` : '-'}</td>
                  <td className="py-3 px-4 text-center"><Badge className={statusColors[d.status] || ''}>{d.status}</Badge></td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {d.status === 'open' && <Button size="sm" className="bg-amber-500 text-white text-xs h-7" onClick={() => updateStatus(d, 'investigating')} data-testid={`invest-${d.id}`}>Investiguer</Button>}
                      {d.status === 'investigating' && <Button size="sm" className="bg-green-600 text-white text-xs h-7" onClick={() => updateStatus(d, 'resolved')} data-testid={`resolve-${d.id}`}>Résoudre</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">Aucun litige</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminDisputes;
