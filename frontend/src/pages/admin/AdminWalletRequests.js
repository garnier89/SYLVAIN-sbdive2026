import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const CRUD = `${API}/api/admin/crud/wallet_requests`;

const AdminWalletRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(CRUD, { credentials: 'include' });
      setRequests(await r.json() || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const updateStatus = async (r, status) => {
    try {
      const updated = { ...r, status };
      await fetch(`${CRUD}/${r.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updated),
      });
      setRequests(prev => prev.map(x => x.id === r.id ? updated : x));
      toast.success(status === 'approved' ? 'Demande approuvée' : 'Demande refusée');
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const pendingTotal = requests.filter(r => r.status === 'pending').reduce((s, r) => s + (r.amount || 0), 0);
  const filtered = requests.filter(r => (r.user_name || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-wallet-requests">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Demandes portefeuille</h1>
          <p className="text-sm text-gray-500 mt-1">{pendingCount} demande(s) en attente — {pendingTotal.toFixed(2)} EUR</p>
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
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Utilisateur</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Type</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Méthode</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Montant</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`wr-${r.id}`}>
                  <td className="py-3 px-4 font-medium text-gray-800">{r.user_name}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={r.type === 'withdrawal' ? 'text-blue-600' : 'text-orange-600'}>
                      {r.type === 'withdrawal' ? 'Retrait' : 'Remboursement'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{r.method}</td>
                  <td className="py-3 px-4 text-right font-bold">{(r.amount || 0).toFixed(2)} EUR</td>
                  <td className="py-3 px-4 text-center">
                    <Badge className={
                      r.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      r.status === 'approved' ? 'bg-green-100 text-green-700' :
                      'bg-red-100 text-red-700'}>
                      {r.status === 'pending' ? 'En attente' : r.status === 'approved' ? 'Approuvé' : 'Refusé'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{(r.created_at || '').slice(0, 10)}</td>
                  <td className="py-3 px-4 text-center">
                    {r.status === 'pending' && (
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" className="bg-green-600 text-white text-xs h-7" onClick={() => updateStatus(r, 'approved')} data-testid={`approve-${r.id}`}>Approuver</Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 text-xs h-7" onClick={() => updateStatus(r, 'rejected')} data-testid={`reject-${r.id}`}>Refuser</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">Aucune demande</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminWalletRequests;
