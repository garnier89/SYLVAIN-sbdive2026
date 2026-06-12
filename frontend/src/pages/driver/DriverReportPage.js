import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CurrencyEur, Coins, Money, CreditCard, Receipt, Wallet,
  XCircle, TrendUp, Car, CalendarBlank, FilePdf, FileCsv, LockSimple,
} from '@phosphor-icons/react';
import { driverAPI } from '../../services/api';

const fmt = (n) => `${(Number(n) || 0).toFixed(2)} €`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

const PRESETS = [
  { key: 'today', label: "Aujourd'hui", from: todayISO(), to: todayISO() },
  { key: 'week', label: '7 jours', from: daysAgoISO(7), to: todayISO() },
  { key: 'month', label: '30 jours', from: daysAgoISO(30), to: todayISO() },
  { key: 'all', label: 'Tout', from: '', to: '' },
];

const DriverReportPage = () => {
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');
  const [dlError, setDlError] = useState('');

  const load = useCallback(async (f, t) => {
    setLoading(true);
    try {
      const res = await driverAPI.getReport(f || undefined, t || undefined);
      setData(res.data);
    } catch (e) {
      console.error('report load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load('', ''); }, [load]);

  const applyPreset = (p) => {
    setPreset(p.key);
    setFrom(p.from);
    setTo(p.to);
    load(p.from, p.to);
  };

  const applyCustom = () => {
    setPreset('custom');
    load(from, to);
  };

  const downloadStatement = async (format) => {
    setDlError('');
    setDownloading(format);
    try {
      const res = await driverAPI.exportReport(format, from || undefined, to || undefined);
      const mime = format === 'csv' ? 'text/csv' : 'application/pdf';
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `releve_activite.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlError("Téléchargement indisponible pour votre compte. Contactez l'administrateur.");
    } finally {
      setDownloading('');
    }
  };

  const d = data || {};

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-24" data-testid="driver-report-page">
      {/* Header */}
      <div className="px-5 pt-6 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center flex-shrink-0" data-testid="report-back-btn" aria-label="Retour">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white truncate" data-testid="report-title">Mon rapport d'activité</h1>
          <p className="text-gray-500 text-xs">Filtrez par dates pour voir toute votre activité</p>
        </div>
      </div>

      {/* Presets */}
      <div className="flex gap-2 px-5 mt-2 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => applyPreset(p)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${preset === p.key ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-gray-800 text-gray-400'}`}
            data-testid={`report-preset-${p.key}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="mx-5 mt-3 bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2"><CalendarBlank size={16} className="text-amber-400" /><span className="text-gray-300 text-xs font-semibold">Période personnalisée</span></div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-gray-500 text-[11px]">Du</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full bg-gray-800 text-white text-sm rounded-lg px-2 py-2 border border-gray-700" data-testid="report-from-input" />
          </div>
          <div className="flex-1">
            <label className="text-gray-500 text-[11px]">Au</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full bg-gray-800 text-white text-sm rounded-lg px-2 py-2 border border-gray-700" data-testid="report-to-input" />
          </div>
          <button onClick={applyCustom} className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2 rounded-lg" data-testid="report-apply-btn">OK</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Global figure */}
          <div className="mx-5 mt-4 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-5 shadow-xl shadow-amber-500/20" data-testid="report-global-card">
            <p className="text-amber-100 text-sm font-medium">Chiffre global (brut)</p>
            <p className="text-4xl font-bold text-white mt-1" data-testid="report-gross">{fmt(d.gross)}</p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5"><Car size={16} className="text-amber-100" /><span className="text-amber-100 text-sm" data-testid="report-trips">{d.trips || 0} course(s)</span></div>
              <div className="flex items-center gap-1.5"><TrendUp size={16} className="text-amber-100" /><span className="text-amber-100 text-sm">Net {fmt(d.net)}</span></div>
            </div>
          </div>

          {/* Breakdown grid */}
          <div className="grid grid-cols-2 gap-3 px-5 mt-4">
            <StatCard testid="report-commission" icon={<Receipt size={18} className="text-rose-400" />} label="Commission plateforme" value={`- ${fmt(d.commission)}`} valueClass="text-rose-400" />
            <StatCard testid="report-net" icon={<CurrencyEur size={18} className="text-emerald-400" />} label="Revenu net" value={fmt(d.net)} valueClass="text-emerald-400" />
            <StatCard testid="report-cash" icon={<Money size={18} className="text-green-400" />} label="Espèces reçues" value={fmt(d.cash_received)} hint="Gardées en main" />
            <StatCard testid="report-card" icon={<CreditCard size={18} className="text-indigo-400" />} label="Paiements CB / SB Pay" value={fmt(d.card_received)} hint="Encaissé numérique" />
            <StatCard testid="report-cancellation" icon={<XCircle size={18} className="text-orange-400" />} label="Frais d'annulation" value={fmt(d.cancellation_fees)} hint="Non retirable" />
            <StatCard testid="report-balance" icon={<Wallet size={18} className="text-amber-400" />} label="Solde actuel" value={fmt(d.balance)} />
          </div>

          {/* Withdrawable highlight */}
          <div className="mx-5 mt-4 rounded-2xl bg-gray-900 border border-emerald-500/40 p-5" data-testid="report-withdrawable-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-300 text-xs uppercase tracking-wide font-semibold">Montant retirable</p>
                <p className="text-3xl font-bold text-white mt-1" data-testid="report-withdrawable">{fmt(d.withdrawable)}</p>
                <p className="text-gray-500 text-[11px] mt-1">
                  Réserve {fmt(d.reserve)} conservée · {fmt(d.pending_withdraw)} en attente
                </p>
                {Number(d.non_withdrawable) > 0 && (
                  <p className="text-gray-500 text-[11px]" data-testid="report-non-withdrawable">
                    {fmt(d.non_withdrawable)} non retirable (transferts reçus, cashback, remboursements)
                  </p>
                )}
              </div>
              <Coins size={40} weight="fill" className="text-emerald-500/70" />
            </div>
            <button onClick={() => navigate('/chauffeur/wallet')} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-3 rounded-xl" data-testid="report-go-wallet-btn">
              Aller au portefeuille
            </button>
          </div>

          {/* Download statement (gated: Taxi/VTC = allowed ; Particulier/Livreur = admin-authorized) */}
          <div className="mx-5 mt-4 rounded-2xl bg-gray-900 border border-gray-800 p-5" data-testid="report-download-card">
            <div className="flex items-center gap-2 mb-3">
              <Receipt size={18} className="text-amber-400" />
              <p className="text-white text-sm font-bold">Télécharger mon relevé</p>
            </div>
            {d.export_allowed ? (
              <>
                <div className="flex gap-2">
                  <button onClick={() => downloadStatement('pdf')} disabled={!!downloading}
                    className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-bold py-3 rounded-xl"
                    data-testid="report-download-pdf">
                    <FilePdf size={18} weight="fill" /> {downloading === 'pdf' ? '...' : 'PDF'}
                  </button>
                  <button onClick={() => downloadStatement('csv')} disabled={!!downloading}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold py-3 rounded-xl"
                    data-testid="report-download-csv">
                    <FileCsv size={18} weight="fill" /> {downloading === 'csv' ? '...' : 'CSV'}
                  </button>
                </div>
                <p className="text-gray-600 text-[11px] mt-2">Pour votre comptabilité et vos déclarations.</p>
                {dlError && <p className="text-rose-400 text-xs mt-2" data-testid="report-download-error">{dlError}</p>}
              </>
            ) : (
              <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 flex items-start gap-3" data-testid="report-download-locked">
                <LockSimple size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-400 text-xs leading-relaxed">
                  {d.export_reason || "Le téléchargement du relevé est réservé aux chauffeurs Taxi et VTC. Les comptes Particulier et Livreur nécessitent l'autorisation de l'administrateur."}
                </p>
              </div>
            )}
          </div>

          <p className="text-gray-600 text-[11px] text-center px-8 mt-4">
            Les espèces perçues vous appartiennent (déjà en votre possession). Seuls les
            paiements numériques nets de commission sont retirables.
          </p>
        </>
      )}
    </div>
  );
};

const StatCard = ({ icon, label, value, hint, valueClass = 'text-white', testid }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4" data-testid={testid}>
    <div className="flex items-center gap-1.5 mb-1.5">{icon}<span className="text-gray-400 text-xs">{label}</span></div>
    <p className={`font-bold text-lg ${valueClass}`}>{value}</p>
    {hint && <p className="text-gray-600 text-[10px] mt-0.5">{hint}</p>}
  </div>
);

export default DriverReportPage;
