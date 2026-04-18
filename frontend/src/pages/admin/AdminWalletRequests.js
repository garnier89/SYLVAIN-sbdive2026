import React, { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Wallet, MagnifyingGlass, ArrowUp, ArrowDown, CheckCircle, Clock } from '@phosphor-icons/react';

const AdminWalletRequests = () => {
  const [requests, setRequests] = useState([
    { id: 'wr_1', user_name: 'Jean Dupont', type: 'withdrawal', amount: 150.00, status: 'pending', date: '2026-04-17', method: 'Virement bancaire' },
    { id: 'wr_2', user_name: 'Amadou Diallo', type: 'withdrawal', amount: 347.50, status: 'pending', date: '2026-04-17', method: 'Virement bancaire' },
    { id: 'wr_3', user_name: 'Sophie Martin', type: 'withdrawal', amount: 89.00, status: 'approved', date: '2026-04-16', method: 'PayPal' },
    { id: 'wr_4', user_name: 'Marie L.', type: 'refund', amount: 23.50, status: 'pending', date: '2026-04-17', method: 'Portefeuille' },
    { id: 'wr_5', user_name: 'Claire Petit', type: 'withdrawal', amount: 210.00, status: 'approved', date: '2026-04-15', method: 'Virement bancaire' },
  ]);
  const [filter, setFilter] = useState('');

  const updateStatus = (id, status) => setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const pendingTotal = requests.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
  const filtered = requests.filter(r => (r.user_name || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-wallet-requests">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Wallet Requests</h1>
          <p className="text-sm text-gray-500 mt-1">{pendingCount} demande(s) en attente — {pendingTotal.toFixed(2)} EUR</p>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Utilisateur</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Type</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Methode</th>
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
                <td className="py-3 px-4 text-right font-bold">{r.amount.toFixed(2)} EUR</td>
                <td className="py-3 px-4 text-center">
                  <Badge className={r.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}>
                    {r.status === 'pending' ? 'En attente' : 'Approuve'}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-gray-500 text-xs">{r.date}</td>
                <td className="py-3 px-4 text-center">
                  {r.status === 'pending' && (
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" className="bg-green-600 text-white text-xs h-7" onClick={() => updateStatus(r.id, 'approved')}>Approuver</Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-200 text-xs h-7" onClick={() => updateStatus(r.id, 'rejected')}>Refuser</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucune demande</div>}
      </div>
    </div>
  );
};

export default AdminWalletRequests;
