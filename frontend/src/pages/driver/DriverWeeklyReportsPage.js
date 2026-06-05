import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePdf, DownloadSimple, Receipt, CheckCircle, XCircle, CaretLeft } from '@phosphor-icons/react';
import { driverAPI } from '../../services/api';
import { DriverBottomNav } from './DriverEarningsPage';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const money = (n) => `${Number(n || 0).toFixed(2)} €`;

const Row = ({ label, value, strong, accent }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
    <span className="text-gray-400 text-sm">{label}</span>
    <span className={`text-sm ${strong ? 'font-bold' : ''} ${accent || 'text-white'}`}>{value}</span>
  </div>
);

const DriverWeeklyReportsPage = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, h] = await Promise.allSettled([
          driverAPI.getWeeklyReport(),
          driverAPI.getWeeklyReportHistory(),
        ]);
        if (c.status === 'fulfilled') setCurrent(c.value.data);
        if (h.status === 'fulfilled') setHistory(h.value.data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR'); } catch { return iso; } };
  const downloadCurrent = () => window.open(`${API_URL}/api/driver/weekly-reports/current/pdf`, '_blank');
  const downloadArchived = (id) => window.open(`${API_URL}/api/driver/weekly-reports/${id}/pdf`, '_blank');

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const r = current?.report;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-reports-page">
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate('/chauffeur/earnings')} className="text-gray-400" data-testid="reports-back-btn"><CaretLeft size={22} /></button>
        <h1 className="text-2xl font-bold text-white">Mes rapports hebdo</h1>
      </div>

      {/* Current week */}
      <div className="mx-5 rounded-2xl bg-gray-900 border border-gray-800 p-5" data-testid="current-week-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Semaine précédente</p>
            <p className="text-white font-semibold">{current?.week || '—'}</p>
          </div>
          <Receipt size={26} className="text-amber-500" weight="duotone" />
        </div>
        {current?.has_activity && r ? (
          <>
            <Row label="Courses terminées" value={r.completed} strong />
            <Row label="Courses annulées" value={r.cancelled} />
            <Row label="Chiffre d'affaires brut" value={money(r.gross)} strong />
            <Row label="— espèces" value={money(r.cash)} />
            <Row label="— carte (CB)" value={money(r.card)} />
            <Row label="— portefeuille" value={money(r.wallet)} />
            <Row label="Commission" value={`- ${money(r.commission)}`} accent="text-red-400" />
            <Row label="Revenu net" value={money(r.net)} strong />
            <Row label="Montant non retirable" value={money(r.non_withdrawable)} />
            <Row label="Virement à effectuer" value={money(r.transfer)} strong accent="text-green-400" />
            <button onClick={downloadCurrent} className="mt-4 w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl" data-testid="download-current-pdf-btn">
              <FilePdf size={18} weight="fill" /> Télécharger le PDF
            </button>
          </>
        ) : (
          <p className="text-gray-500 text-sm text-center py-6">Aucune activité enregistrée sur la semaine précédente.</p>
        )}
      </div>

      {/* History */}
      <div className="px-5 mt-6">
        <h3 className="text-white font-bold text-base mb-3">Historique</h3>
        {history.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <Receipt size={40} className="text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Aucun rapport envoyé pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3" data-testid={`report-history-${h.id}`}>
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <FilePdf size={18} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">Semaine {h.week}</p>
                  <p className="text-xs flex items-center gap-1">
                    {h.status === 'sent'
                      ? <span className="text-green-400 flex items-center gap-1"><CheckCircle size={12} weight="fill" /> Envoyé</span>
                      : <span className="text-gray-500 flex items-center gap-1"><XCircle size={12} weight="fill" /> Non envoyé</span>}
                    <span className="text-gray-600"> · {fmtDate(h.created_at)}</span>
                  </p>
                </div>
                <button onClick={() => downloadArchived(h.id)} className="text-amber-500 flex items-center gap-1 text-xs font-medium" data-testid={`download-history-pdf-${h.id}`}>
                  <DownloadSimple size={16} /> PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DriverBottomNav active="earnings" navigate={navigate} />
    </div>
  );
};

export default DriverWeeklyReportsPage;
