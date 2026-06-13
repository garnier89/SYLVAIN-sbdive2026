import React, { useState, useEffect, useCallback } from 'react';
import { CircleNotch, Receipt, DownloadSimple, CheckCircle, ArrowLeft } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ferryAPI } from '../../services/api';

const fmtEur = (n) => `${(Number(n) || 0).toFixed(2)} €`;
const thisMonth = () => new Date().toISOString().slice(0, 7); // YYYY-MM

const AdminFerrySettlements = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    ferryAPI.adminSettlements(month)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Échec du chargement des règlements'))
      .finally(() => setLoading(false));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const companies = data?.companies || [];
  const totalPlatformOwes = companies.reduce((s, c) => s + (c.pending_platform_owes || 0), 0);
  const totalCompanyOwes = companies.reduce((s, c) => s + (c.pending_company_owes || 0), 0);

  const settleCompany = async (c) => {
    if (!c.pending_tickets) return;
    if (!window.confirm(`Marquer comme réglés les ${c.pending_tickets} billet(s) en attente de « ${c.company_name} » pour ${month} ?`)) return;
    setSettling(c.company_id);
    try {
      const r = await ferryAPI.settleBatch({ company_id: c.company_id, month });
      toast.success(`${r.data.settled} billet(s) réglé(s)`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } finally { setSettling(''); }
  };

  const exportCsv = () => {
    const header = ['Compagnie', 'Billets', 'CA (EUR)', 'Commission SB Drive (EUR)', 'Revenu compagnie (EUR)',
      'SB Drive doit (EUR)', 'Compagnie doit (EUR)', 'Net dû compagnie (EUR)', 'Déjà réglé (EUR)', 'Billets en attente'];
    const lines = companies.map((c) => [
      `"${(c.company_name || '').replace(/"/g, '""')}"`, c.tickets,
      (c.gross || 0).toFixed(2), (c.commission || 0).toFixed(2), (c.company_revenue || 0).toFixed(2),
      (c.pending_platform_owes || 0).toFixed(2), (c.pending_company_owes || 0).toFixed(2),
      (c.net_due_to_company || 0).toFixed(2), (c.settled_amount || 0).toFixed(2), c.pending_tickets,
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reglements-ferry-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto" data-testid="admin-ferry-settlements-page">
      <button onClick={() => navigate('/admin/ferry')} className="text-sm text-sky-600 font-semibold flex items-center gap-1 mb-2" data-testid="settlements-back-btn">
        <ArrowLeft size={15} /> SB Ferry — Lignes
      </button>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
          <Receipt size={26} weight="fill" className="text-sky-600" /> Règlements compagnies
        </h1>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="settlements-month"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={exportCsv} disabled={companies.length === 0} data-testid="settlements-export-csv"
            className="flex items-center gap-1.5 bg-emerald-600 text-white font-bold text-sm px-3 py-2 rounded-lg disabled:opacity-50">
            <DownloadSimple size={16} weight="bold" /> Export CSV
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">Relevé mensuel par compagnie : commissions encaissées (cash) et reversements dus (SB Pay/carte). « Marquer réglé » solde tous les billets en attente du mois.</p>

      <div className="grid grid-cols-2 gap-2 mb-6">
        <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700 font-semibold">SB Drive doit aux compagnies (en attente)</p><p className="text-xl font-extrabold text-amber-800" data-testid="settlements-total-platform-owes">{fmtEur(totalPlatformOwes)}</p></div>
        <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700 font-semibold">Compagnies doivent à SB Drive (en attente)</p><p className="text-xl font-extrabold text-emerald-800" data-testid="settlements-total-company-owes">{fmtEur(totalCompanyOwes)}</p></div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><CircleNotch size={28} className="animate-spin text-sky-500" /></div>
      ) : companies.length === 0 ? (
        <p className="text-center text-gray-400 py-12" data-testid="settlements-empty">Aucune vente sur {month}.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100" data-testid="settlements-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-3 py-2 font-semibold">Compagnie</th>
                <th className="text-right px-3 py-2 font-semibold">Billets</th>
                <th className="text-right px-3 py-2 font-semibold">CA</th>
                <th className="text-right px-3 py-2 font-semibold">Commission</th>
                <th className="text-right px-3 py-2 font-semibold">Net dû</th>
                <th className="text-right px-3 py-2 font-semibold">Réglé</th>
                <th className="text-right px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((c) => (
                <tr key={c.company_id} data-testid={`settlements-row-${c.company_id}`}>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{c.company_name}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{c.tickets}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{fmtEur(c.gross)}</td>
                  <td className="px-3 py-2.5 text-right text-sky-700 font-semibold">{fmtEur(c.commission)}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${c.net_due_to_company >= 0 ? 'text-amber-700' : 'text-emerald-700'}`} data-testid={`settlements-net-${c.company_id}`}>
                    {c.net_due_to_company >= 0 ? fmtEur(c.net_due_to_company) : `−${fmtEur(Math.abs(c.net_due_to_company))}`}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-400">{fmtEur(c.settled_amount)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {c.pending_tickets > 0 ? (
                      <button onClick={() => settleCompany(c)} disabled={settling === c.company_id} data-testid={`settlements-settle-${c.company_id}`}
                        className="inline-flex items-center gap-1 bg-sky-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-60">
                        {settling === c.company_id ? <CircleNotch size={13} className="animate-spin" /> : <CheckCircle size={13} weight="fill" />} Marquer réglé ({c.pending_tickets})
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-600 font-semibold flex items-center justify-end gap-1"><CheckCircle size={13} weight="fill" /> À jour</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3">Net dû : montant positif = SB Drive reverse à la compagnie (billets SB Pay/carte). Montant négatif = la compagnie reverse la commission à SB Drive (billets espèces).</p>
    </div>
  );
};

export default AdminFerrySettlements;
