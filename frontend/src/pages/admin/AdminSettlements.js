import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MagnifyingGlass, Download } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const CRUD = `${API}/api/admin/crud/settlements`;

const AdminSettlements = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(CRUD, { credentials: 'include' });
      setRows(await r.json() || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const settle = async (s) => {
    try {
      const updates = { ...s, status: 'settled', settled_at: new Date().toISOString().slice(0, 10) };
      await fetch(`${CRUD}/${s.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updates),
      });
      setRows(prev => prev.map(x => x.id === s.id ? updates : x));
      toast.success('Versement effectué');
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const totalPending = rows.filter(s => s.status !== 'settled').reduce((sum, s) => sum + (s.net || 0), 0);
  const totalSettled = rows.filter(s => s.status === 'settled').reduce((sum, s) => sum + (s.net || 0), 0);
  const totalCommission = rows.reduce((sum, s) => sum + (s.commission || 0), 0);
  const filtered = rows.filter(s => (s.driver_name || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-settlements">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Versements (Settlements)</h1>
        <Button variant="outline"><Download size={16} className="mr-1" /> Exporter</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Total versé</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{totalSettled.toFixed(2)} EUR</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">En attente</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{totalPending.toFixed(2)} EUR</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Commission SB Drive</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{totalCommission.toFixed(2)} EUR</p>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher un chauffeur..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Chauffeur</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Période</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Courses</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Brut</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Commission</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Net</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`settlement-${s.id}`}>
                  <td className="py-3 px-4 font-medium text-gray-800">{s.driver_name}</td>
                  <td className="py-3 px-4 text-gray-600">{s.period}</td>
                  <td className="py-3 px-4 text-center">{s.rides}</td>
                  <td className="py-3 px-4 text-right">{(s.gross || 0).toFixed(2)} EUR</td>
                  <td className="py-3 px-4 text-right text-blue-600">{(s.commission || 0).toFixed(2)} EUR</td>
                  <td className="py-3 px-4 text-right font-bold">{(s.net || 0).toFixed(2)} EUR</td>
                  <td className="py-3 px-4 text-center">
                    <Badge className={s.status === 'settled' ? 'bg-green-100 text-green-700' : s.status === 'processing' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}>
                      {s.status === 'settled' ? 'Versé' : s.status === 'processing' ? 'En cours' : 'En attente'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {s.status === 'pending' && <Button size="sm" className="bg-green-600 text-white text-xs" onClick={() => settle(s)} data-testid={`settle-${s.id}`}>Verser</Button>}
                    {s.status === 'settled' && <span className="text-xs text-gray-400">{s.settled_at}</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-gray-400">Aucun versement</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminSettlements;
