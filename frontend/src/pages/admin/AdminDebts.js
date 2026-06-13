import React, { useEffect, useState, useCallback } from 'react';
import {
  HandCoins, Users, Receipt, ArrowClockwise, CurrencyEur, BellRinging,
  XCircle, Wallet, CheckCircle, X,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';

const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const PRESETS = [
  { key: 'all', label: 'Tout' },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: '90d', label: '90 jours' },
];
const isoDay = (d) => d.toISOString().slice(0, 10);
const rangeFor = (p) => {
  if (p === 'all') return {};
  const days = { '7d': 7, '30d': 30, '90d': 90 }[p] || 30;
  return { date_from: isoDay(new Date(Date.now() - days * 86400000)), date_to: isoDay(new Date()) };
};

const KpiCard = ({ icon: Icon, label, value, accent, testid }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={testid}>
    <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-2`}>
      <Icon size={18} weight="fill" className="text-white" />
    </div>
    <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

const DetailModal = ({ uid, onClose, onChanged }) => {
  const [info, setInfo] = useState(null);
  const load = useCallback(() => adminAPI.debtsUser(uid).then((r) => setInfo(r.data)), [uid]);
  useEffect(() => { load(); }, [load]);

  const act = (fn, label) => fn(uid).then((r) => {
    toast.success(label);
    load(); onChanged();
  }).catch((e) => toast.error(e?.response?.data?.detail || 'Action impossible'));

  if (!info) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" data-testid="debt-detail-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{info.name}</h2>
            <p className="text-xs text-gray-500">{info.phone} {info.email && `· ${info.email}`}</p>
          </div>
          <button onClick={onClose} data-testid="debt-modal-close" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-rose-50 rounded-xl p-3"><p className="text-xs text-rose-500">Solde dû</p><p className="text-xl font-black text-rose-600">{money(info.unpaid_total)}</p></div>
          <div className="bg-emerald-50 rounded-xl p-3"><p className="text-xs text-emerald-500">Portefeuille</p><p className="text-xl font-black text-emerald-600">{money(info.wallet_balance)}</p></div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => act(adminAPI.debtsCollect, 'Encaissement effectué')} data-testid="debt-collect-btn"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
            <Wallet size={15} weight="fill" /> Encaisser (portefeuille)
          </button>
          <button onClick={() => act(adminAPI.debtsRemind, 'Relance envoyée')} data-testid="debt-remind-btn"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600">
            <BellRinging size={15} weight="fill" /> Relancer
          </button>
          <button onClick={() => { if (window.confirm('Annuler (effacer) toute la dette de ce client ? La plateforme absorbe la perte.')) act(adminAPI.debtsWaive, 'Dette annulée'); }} data-testid="debt-waive-btn"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100">
            <XCircle size={15} weight="fill" /> Annuler
          </button>
        </div>

        <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Dettes en cours ({info.unpaid.length})</h3>
        {info.unpaid.length === 0 ? <p className="text-sm text-emerald-600 mb-4">Aucune dette en cours 🎉</p> : (
          <div className="space-y-1.5 mb-4">
            {info.unpaid.map((d) => (
              <div key={d.id} className="flex justify-between items-center text-sm border border-gray-100 rounded-lg px-3 py-2">
                <div><span className="font-semibold text-gray-700">{money(d.amount)}</span> <span className="text-xs text-gray-400">· {d.reason === 'cancellation' ? 'Annulation' : 'Course impayée'}</span></div>
                <span className="text-[11px] text-gray-400">{new Date(d.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
            ))}
          </div>
        )}

        {info.history.length > 0 && (
          <>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Historique réglé</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {info.history.map((d) => (
                <div key={d.id} className="flex justify-between items-center text-xs text-gray-500 px-3 py-1">
                  <span className="inline-flex items-center gap-1"><CheckCircle size={12} weight="fill" className={d.waived ? 'text-rose-400' : 'text-emerald-500'} /> {money(d.amount)} {d.waived && '(annulée)'}</span>
                  <span>{d.paid_at ? new Date(d.paid_at).toLocaleDateString('fr-FR') : ''}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const AdminDebts = () => {
  const [preset, setPreset] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openUid, setOpenUid] = useState(null);

  const load = useCallback((p) => {
    setLoading(true);
    adminAPI.debtsOverview(rangeFor(p)).then((r) => setData(r.data)).catch(() => toast.error('Chargement impossible')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(preset); }, [preset, load]);

  const k = data?.kpis || {};
  return (
    <div className="p-6 max-w-5xl" data-testid="admin-debts">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
            <HandCoins size={22} className="text-rose-600" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dettes des clients</h1>
            <p className="text-sm text-gray-500">Soldes dus (annulations &amp; courses impayées) · recouvrement &amp; gestion</p>
          </div>
        </div>
        <button onClick={() => load(preset)} data-testid="debts-refresh" className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
          <ArrowClockwise size={18} />
        </button>
      </div>

      <div className="flex gap-2 mb-5">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} data-testid={`debts-preset-${p.key}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${preset === p.key ? 'bg-rose-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard icon={CurrencyEur} label="Total dû (en cours)" value={money(k.total_outstanding)} accent="bg-rose-500" testid="kpi-outstanding" />
            <KpiCard icon={Users} label="Clients endettés" value={k.debtors_count ?? 0} accent="bg-amber-500" testid="kpi-debtors" />
            <KpiCard icon={Receipt} label="Dettes en cours" value={k.unpaid_debts ?? 0} accent="bg-orange-500" testid="kpi-unpaid" />
            <KpiCard icon={CurrencyEur} label="Dette moyenne" value={money(k.avg_debt)} accent="bg-violet-500" testid="kpi-avg" />
            <KpiCard icon={CheckCircle} label="Recouvré (période)" value={money(k.recovered_period)} accent="bg-emerald-500" testid="kpi-recovered" />
            <KpiCard icon={XCircle} label="Annulé (période)" value={money(k.waived_period)} accent="bg-gray-400" testid="kpi-waived" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="debtors-table">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Clients endettés</h2>
            {(data?.debtors || []).length === 0 ? (
              <p className="text-sm text-emerald-600 inline-flex items-center gap-1"><CheckCircle size={15} weight="fill" /> Aucun client endetté 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="py-2 pr-2">Client</th>
                      <th className="py-2 pr-2 text-right">Solde dû</th>
                      <th className="py-2 pr-2 text-right">Dettes</th>
                      <th className="py-2 pr-2 text-right">Portefeuille</th>
                      <th className="py-2 pr-2">Depuis</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.debtors.map((d, i) => (
                      <tr key={d.user_id} className="border-b border-gray-50 last:border-0" data-testid={`debtor-${i}`}>
                        <td className="py-2.5 pr-2">
                          <p className="font-semibold text-gray-800">{d.name}</p>
                          <p className="text-[11px] text-gray-400">{d.phone}</p>
                        </td>
                        <td className="py-2.5 pr-2 text-right font-bold text-rose-600">{money(d.total)}</td>
                        <td className="py-2.5 pr-2 text-right text-gray-600">{d.count}</td>
                        <td className="py-2.5 pr-2 text-right text-gray-600">{money(d.wallet_balance)}</td>
                        <td className="py-2.5 pr-2 text-[11px] text-gray-400">{d.oldest ? new Date(d.oldest).toLocaleDateString('fr-FR') : ''}</td>
                        <td className="py-2.5 text-right">
                          <button onClick={() => setOpenUid(d.user_id)} data-testid={`debtor-manage-${i}`}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700">Gérer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {openUid && <DetailModal uid={openUid} onClose={() => setOpenUid(null)} onChanged={() => load(preset)} />}
    </div>
  );
};

export default AdminDebts;
