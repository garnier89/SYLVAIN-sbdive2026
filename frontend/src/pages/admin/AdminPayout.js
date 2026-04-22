import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MagnifyingGlass, Download } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const CRUD = `${API}/api/admin/crud/payouts`;

const statusColors = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};

const AdminPayout = () => {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(CRUD, { credentials: 'include' });
      const d = await r.json();
      setPayouts(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const markPaid = async (p) => {
    try {
      const updates = { ...p, status: 'paid', paid_at: new Date().toISOString().slice(0, 10) };
      await fetch(`${CRUD}/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updates),
      });
      setPayouts(prev => prev.map(x => x.id === p.id ? updates : x));
      toast.success('Versement payé');
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const totalPending = payouts.filter(p => p.status !== 'paid').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
  const filtered = payouts.filter(p => (p.driver_name || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-payout">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rapport des versements</h1>
          <p className="text-sm text-gray-500 mt-1">Gestion des versements aux chauffeurs</p>
        </div>
        <Button variant="outline" data-testid="export-btn"><Download size={16} className="mr-1" /> Exporter</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Total versé</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{totalPaid.toFixed(2)}€</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">En attente</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{totalPending.toFixed(2)}€</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Chauffeurs</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{payouts.length}</p>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher un chauffeur..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} data-testid="payout-search" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Chauffeur</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Période</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Courses</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-600">Montant</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`payout-row-${p.id}`}>
                  <td className="py-3 px-4 font-medium text-gray-800">{p.driver_name}</td>
                  <td className="py-3 px-4 text-gray-600">{p.period}</td>
                  <td className="py-3 px-4 text-center">{p.rides}</td>
                  <td className="py-3 px-4 text-right font-bold">{(p.amount || 0).toFixed(2)}€</td>
                  <td className="py-3 px-4 text-center"><Badge className={statusColors[p.status] || ''}>{p.status}</Badge></td>
                  <td className="py-3 px-4 text-center">
                    {p.status === 'pending' && (<Button size="sm" className="bg-green-600 text-white text-xs" onClick={() => markPaid(p)} data-testid={`pay-${p.id}`}>Payer</Button>)}
                    {p.status === 'paid' && <span className="text-xs text-gray-400">{p.paid_at}</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Aucun versement</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminPayout;
