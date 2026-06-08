import React from 'react';
import { Button } from '../../../components/ui/button';
import { FileCsv, FilePdf } from '@phosphor-icons/react';
import { exportAnalyticsCSV, exportAnalyticsPDF } from './exportAnalytics';

/** Dashboard header: live clock + timezone, period selector, CSV/PDF export. */
const DashboardHeader = ({ currentTime, period, setPeriod, breakdown }) => (
  <div className="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-sm text-gray-500">{"Vue d'ensemble de la plateforme SB Drive VTC"}</p>
    </div>
    <div className="flex items-center gap-4">
      <div className="text-right bg-white border border-gray-200 rounded-xl px-4 py-2" data-testid="live-clock-card">
        <p className="text-lg font-bold text-gray-900 tabular-nums" data-testid="live-clock">
          {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <p className="text-xs text-gray-500">
          {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <p className="text-[10px] text-blue-500 font-medium">
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
      </div>
      <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
        {['today', 'week', 'month'].map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-[#3b82f6] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            data-testid={`period-${p}`}>
            {p === 'today' ? "Aujourd'hui" : p === 'week' ? 'Semaine' : 'Mois'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!breakdown}
          className="h-9 text-xs gap-1.5 border-gray-200"
          onClick={() => exportAnalyticsCSV(breakdown, period)}
          data-testid="export-csv-btn">
          <FileCsv size={16} className="text-green-600" /> CSV
        </Button>
        <Button size="sm" variant="outline" disabled={!breakdown}
          className="h-9 text-xs gap-1.5 border-gray-200"
          onClick={() => exportAnalyticsPDF(breakdown, period)}
          data-testid="export-pdf-btn">
          <FilePdf size={16} className="text-red-500" /> PDF
        </Button>
      </div>
    </div>
  </div>
);

export default DashboardHeader;
