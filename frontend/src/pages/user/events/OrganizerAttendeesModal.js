import React from 'react';
import { X } from '@phosphor-icons/react';
import { fmtPrice, fmtMoney } from './eventsShared';

const SBox = ({ label, value }) => (
  <div className="bg-gray-50 rounded-xl py-2"><p className="text-base font-extrabold text-gray-900">{value}</p><p className="text-[9px] text-gray-400">{label}</p></div>
);

/** Participants list + CSV export for one event. */
const OrganizerAttendeesModal = ({ data, onClose }) => {
  const exportCsv = () => {
    const rows = [['Billet', 'Catégorie', 'Quantité', 'Total', 'Statut', 'Date']];
    data.tickets.forEach((t) => rows.push([t.id, t.tier_name, t.quantity, t.total_price, t.status, t.purchased_at]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `participants-${data.event?.id || 'event'}.csv`;
    a.click();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" data-testid="attendees-modal">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 truncate">{data.title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <SBox label="Commandes" value={data.stats.orders} />
          <SBox label="Places" value={data.stats.seats} />
          <SBox label="Recette nette" value={fmtMoney(data.stats.net)} />
        </div>
        <button onClick={exportCsv} className="w-full mb-3 border border-gray-200 text-gray-700 text-sm font-bold py-2 rounded-lg" data-testid="export-csv-btn">Exporter en CSV</button>
        <div className="divide-y max-h-64 overflow-y-auto">
          {data.tickets.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">Aucun participant</p> :
            data.tickets.map((t) => (
              <div key={t.id} className="flex justify-between items-center py-2 text-sm">
                <span className="text-gray-700">{t.tier_name} × {t.quantity}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{fmtPrice(t.total_price)}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.status === 'valid' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default OrganizerAttendeesModal;
