import React, { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Warning, MagnifyingGlass, ChatCircleDots, CheckCircle, Clock, User } from '@phosphor-icons/react';

const AdminDisputes = () => {
  const [disputes, setDisputes] = useState([
    { id: 'dis_1', ride_id: 'ride_4521', user_name: 'Marie L.', driver_name: 'Jean D.', reason: 'Tarif incorrect - montant superieur a l\'estimation', status: 'open', created_at: '2026-04-17', amount: 8.50 },
    { id: 'dis_2', ride_id: 'ride_4498', user_name: 'Paul M.', driver_name: 'Amadou D.', reason: 'Chauffeur a fait un detour inutile', status: 'investigating', created_at: '2026-04-16', amount: 12.00 },
    { id: 'dis_3', ride_id: 'ride_4475', user_name: 'Sophie K.', driver_name: 'Claire P.', reason: 'Course annulee mais facturee', status: 'resolved', created_at: '2026-04-14', amount: 15.00 },
    { id: 'dis_4', ride_id: 'ride_4510', user_name: 'Ahmed B.', driver_name: 'Mohamed A.', reason: 'Vehicule different de celui annonce', status: 'open', created_at: '2026-04-17', amount: 0 },
  ]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);

  const statusColors = { open: 'bg-red-100 text-red-700', investigating: 'bg-amber-100 text-amber-700', resolved: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-500' };

  const updateStatus = (id, status) => {
    setDisputes(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status }));
  };

  const openCount = disputes.filter(d => d.status === 'open').length;
  const filtered = disputes.filter(d => (d.user_name || '').toLowerCase().includes(filter.toLowerCase()) || (d.reason || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-disputes">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dispute Management</h1>
          <p className="text-sm text-gray-500 mt-1">{openCount} litige(s) ouvert(s)</p>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                <td className="py-3 px-4 font-mono text-xs text-blue-600">#{d.ride_id.slice(-4)}</td>
                <td className="py-3 px-4 text-gray-800">{d.user_name}</td>
                <td className="py-3 px-4 text-gray-600">{d.driver_name}</td>
                <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate">{d.reason}</td>
                <td className="py-3 px-4 text-right font-medium">{d.amount > 0 ? `${d.amount.toFixed(2)}EUR` : '-'}</td>
                <td className="py-3 px-4 text-center"><Badge className={statusColors[d.status]}>{d.status}</Badge></td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {d.status === 'open' && <Button size="sm" className="bg-amber-500 text-white text-xs h-7" onClick={() => updateStatus(d.id, 'investigating')}>Investiguer</Button>}
                    {d.status === 'investigating' && <Button size="sm" className="bg-green-600 text-white text-xs h-7" onClick={() => updateStatus(d.id, 'resolved')}>Resoudre</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucun litige</div>}
      </div>
    </div>
  );
};

export default AdminDisputes;
