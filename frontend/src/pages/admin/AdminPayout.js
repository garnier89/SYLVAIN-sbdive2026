import React, { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { CurrencyDollar, MagnifyingGlass, Download, Calendar, ArrowUp, ArrowDown } from '@phosphor-icons/react';

const AdminPayout = () => {
  const [dateRange, setDateRange] = useState('this_week');
  const [filter, setFilter] = useState('');

  const payouts = [
    { id: 'pay_001', driver_name: 'Jean Dupont', amount: 347.50, rides: 28, status: 'paid', period: '7-13 Avr 2026', paid_at: '2026-04-14' },
    { id: 'pay_002', driver_name: 'Amadou Diallo', amount: 523.00, rides: 41, status: 'paid', period: '7-13 Avr 2026', paid_at: '2026-04-14' },
    { id: 'pay_003', driver_name: 'Sophie Martin', amount: 189.75, rides: 15, status: 'pending', period: '14-20 Avr 2026', paid_at: null },
    { id: 'pay_004', driver_name: 'Mohamed Ben Ali', amount: 412.25, rides: 33, status: 'pending', period: '14-20 Avr 2026', paid_at: null },
    { id: 'pay_005', driver_name: 'Claire Petit', amount: 278.00, rides: 22, status: 'processing', period: '14-20 Avr 2026', paid_at: null },
  ];

  const statusColors = {
    paid: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  };

  const totalPending = payouts.filter(p => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

  const filtered = payouts.filter(p => p.driver_name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-payout">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payout Report</h1>
          <p className="text-sm text-gray-500 mt-1">Gestion des versements chauffeurs</p>
        </div>
        <Button variant="outline" data-testid="export-btn">
          <Download size={16} className="mr-1" /> Exporter
        </Button>
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
                <td className="py-3 px-4 text-right font-bold">{p.amount.toFixed(2)}€</td>
                <td className="py-3 px-4 text-center">
                  <Badge className={statusColors[p.status] || ''}>{p.status}</Badge>
                </td>
                <td className="py-3 px-4 text-center">
                  {p.status === 'pending' && (
                    <Button size="sm" className="bg-green-600 text-white text-xs">Payer</Button>
                  )}
                  {p.status === 'paid' && (
                    <span className="text-xs text-gray-400">{p.paid_at}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPayout;
