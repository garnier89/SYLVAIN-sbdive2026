import React, { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { CurrencyEur, MagnifyingGlass, Download, CheckCircle, Clock, ArrowUp, Calendar } from '@phosphor-icons/react';

const AdminSettlements = () => {
  const [settlements, setSettlements] = useState([
    { id: 's1', driver_name: 'Jean Dupont', period: '7-13 Avr 2026', rides: 28, gross: 523.00, commission: 78.45, net: 444.55, status: 'settled', settled_at: '2026-04-14' },
    { id: 's2', driver_name: 'Amadou Diallo', period: '7-13 Avr 2026', rides: 41, gross: 812.50, commission: 121.88, net: 690.63, status: 'settled', settled_at: '2026-04-14' },
    { id: 's3', driver_name: 'Sophie Martin', period: '14-20 Avr 2026', rides: 15, gross: 278.00, commission: 41.70, net: 236.30, status: 'pending', settled_at: null },
    { id: 's4', driver_name: 'Mohamed Ben Ali', period: '14-20 Avr 2026', rides: 33, gross: 612.25, commission: 91.84, net: 520.41, status: 'pending', settled_at: null },
    { id: 's5', driver_name: 'Claire Petit', period: '14-20 Avr 2026', rides: 22, gross: 398.00, commission: 59.70, net: 338.30, status: 'processing', settled_at: null },
  ]);
  const [filter, setFilter] = useState('');

  const totalPending = settlements.filter(s => s.status !== 'settled').reduce((sum, s) => sum + s.net, 0);
  const totalSettled = settlements.filter(s => s.status === 'settled').reduce((sum, s) => sum + s.net, 0);
  const totalCommission = settlements.reduce((sum, s) => sum + s.commission, 0);

  const settle = (id) => setSettlements(prev => prev.map(s => s.id === id ? { ...s, status: 'settled', settled_at: new Date().toISOString().split('T')[0] } : s));
  const filtered = settlements.filter(s => (s.driver_name || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-settlements">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Settlements / Versements</h1>
        <Button variant="outline"><Download size={16} className="mr-1" /> Exporter</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Total verse</p>
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
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Chauffeur</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Periode</th>
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
                <td className="py-3 px-4 text-right">{s.gross.toFixed(2)} EUR</td>
                <td className="py-3 px-4 text-right text-blue-600">{s.commission.toFixed(2)} EUR</td>
                <td className="py-3 px-4 text-right font-bold">{s.net.toFixed(2)} EUR</td>
                <td className="py-3 px-4 text-center">
                  <Badge className={s.status === 'settled' ? 'bg-green-100 text-green-700' : s.status === 'processing' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}>
                    {s.status === 'settled' ? 'Verse' : s.status === 'processing' ? 'En cours' : 'En attente'}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-center">
                  {s.status === 'pending' && <Button size="sm" className="bg-green-600 text-white text-xs" onClick={() => settle(s.id)}>Verser</Button>}
                  {s.status === 'settled' && <span className="text-xs text-gray-400">{s.settled_at}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminSettlements;
