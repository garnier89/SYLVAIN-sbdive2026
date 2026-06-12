/**
 * Admin — Sécurité & Fraude.
 * Tableau de bord anti-fraude : alertes, risque wallet, blocage de comptes.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldWarning, ArrowsClockwise, Prohibit, CheckCircle, LockSimpleOpen, Warning } from '@phosphor-icons/react';
import { fraudAPI } from '../../services/api';

const SEV_STYLES = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const Card = ({ label, value, accent, testId }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-4" data-testid={testId}>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-2xl font-extrabold ${accent}`}>{value}</p>
  </div>
);

export default function AdminFraud() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [risk, setRisk] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('alerts');
  const [cbOpen, setCbOpen] = useState(false);
  const [cb, setCb] = useState({ email: '', amount: '', reason: '' });
  const [cbBusy, setCbBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, a, r] = await Promise.all([
        fraudAPI.summary(),
        fraudAPI.alerts({ resolved: false }),
        fraudAPI.walletRisk(),
      ]);
      setSummary(s.data);
      setAlerts(a.data.items || []);
      setRisk(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de chargement');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const resolve = async (id) => {
    try { await fraudAPI.resolveAlert(id, 'Traité'); toast.success('Alerte résolue'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const block = async (userId, name) => {
    const reason = window.prompt(`Bloquer ${name || 'cet utilisateur'} ? Indiquez la raison :`, 'Activité frauduleuse suspectée');
    if (reason === null) return;
    try { await fraudAPI.blockUser(userId, reason); toast.success('Utilisateur bloqué'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const unblock = async (userId) => {
    try { await fraudAPI.unblockUser(userId); toast.success('Utilisateur débloqué'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const submitChargeback = async () => {
    if (!cb.email || !cb.amount) { toast.error('E-mail et montant requis'); return; }
    setCbBusy(true);
    try {
      const r = await fraudAPI.declareChargeback({ email: cb.email.trim(), amount: parseFloat(cb.amount), reason: cb.reason });
      toast.success(`Chargeback enregistré · solde ${r.data.new_balance} EUR${r.data.auto_blocked ? ' · compte bloqué (récidive)' : ''}`);
      setCbOpen(false); setCb({ email: '', amount: '', reason: '' }); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
    finally { setCbBusy(false); }
  };

  return (
    <div className="p-6" data-testid="admin-fraud-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldWarning size={28} weight="duotone" className="text-red-600" /> Sécurité &amp; Fraude
        </h1>
        <button onClick={load} disabled={loading} data-testid="fraud-refresh-btn"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50">
          <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      <div className="mb-5">
        <button onClick={() => setCbOpen(true)} data-testid="declare-chargeback-btn"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
          <ShieldWarning size={16} weight="fill" /> Déclarer un chargeback
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card label="Alertes ouvertes" value={summary.open_alerts} accent="text-gray-900" testId="fraud-stat-open" />
          <Card label="Critiques" value={summary.critical} accent="text-red-600" testId="fraud-stat-critical" />
          <Card label="Élevées" value={summary.high} accent="text-orange-600" testId="fraud-stat-high" />
          <Card label="Comptes bloqués" value={summary.blocked_users} accent="text-rose-600" testId="fraud-stat-blocked" />
          <Card label="Événements aujourd'hui" value={summary.events_today} accent="text-gray-900" testId="fraud-stat-today" />
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {[{ k: 'alerts', l: `Alertes (${alerts.length})` }, { k: 'risk', l: 'Risque Wallet' }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`fraud-tab-${t.k}`}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === t.k ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'alerts' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" data-testid="fraud-alerts-table">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
              <CheckCircle size={32} className="text-emerald-400" /> Aucune alerte ouverte 🎉
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Gravité</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Utilisateur</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-t border-gray-50" data-testid={`fraud-alert-${a.id}`}>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${SEV_STYLES[a.severity] || SEV_STYLES.low}`}>{a.severity}</span></td>
                    <td className="p-3 font-mono text-xs">{a.event_type}</td>
                    <td className="p-3">
                      {a.user_name || a.user_id || '—'}
                      {a.user_blocked && <span className="ml-1 text-rose-600 text-xs">(bloqué)</span>}
                    </td>
                    <td className="p-3 text-gray-600 max-w-xs">{a.description}{a.amount != null && <span className="font-semibold"> · {a.amount} EUR</span>}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {a.user_id && !a.user_blocked && (
                        <button onClick={() => block(a.user_id, a.user_name)} data-testid={`fraud-block-${a.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-semibold mr-2">
                          <Prohibit size={13} /> Bloquer
                        </button>
                      )}
                      <button onClick={() => resolve(a.id)} data-testid={`fraud-resolve-${a.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-semibold">
                        <CheckCircle size={13} /> Résoudre
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'risk' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" data-testid="fraud-risk-table">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Utilisateur</th>
                <th className="text-right p-3">Transferts sortants (7j)</th>
                <th className="text-right p-3">Nb transferts</th>
                <th className="text-right p-3">Remboursements</th>
                <th className="text-right p-3">Dépôts</th>
                <th className="text-right p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {risk.map((r) => (
                <tr key={r.user_id} className="border-t border-gray-50" data-testid={`fraud-risk-${r.user_id}`}>
                  <td className="p-3">
                    <span className="flex items-center gap-1">
                      {(r.transfer_out > 1000 || r.transfer_count > 15) && <Warning size={14} className="text-orange-500" />}
                      {r.user_name || r.user_id}
                      {r.is_blocked && <span className="ml-1 text-rose-600 text-xs">(bloqué)</span>}
                    </span>
                  </td>
                  <td className="p-3 text-right font-semibold">{r.transfer_out} EUR</td>
                  <td className="p-3 text-right">{r.transfer_count}</td>
                  <td className="p-3 text-right">{r.refunds} EUR</td>
                  <td className="p-3 text-right">{r.deposits} EUR</td>
                  <td className="p-3 text-right">
                    {r.is_blocked ? (
                      <button onClick={() => unblock(r.user_id)} data-testid={`fraud-unblock-${r.user_id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                        <LockSimpleOpen size={13} /> Débloquer
                      </button>
                    ) : (
                      <button onClick={() => block(r.user_id, r.user_name)} data-testid={`fraud-risk-block-${r.user_id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-semibold">
                        <Prohibit size={13} /> Bloquer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {risk.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Aucune activité wallet sur 7 jours</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {cbOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="chargeback-modal">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <ShieldWarning size={20} weight="fill" className="text-red-600" /> Déclarer un chargeback
            </h3>
            <p className="text-xs text-gray-500 mb-4">Le portefeuille du client sera débité du montant. Au 2ᵉ chargeback, le compte est bloqué automatiquement.</p>
            <label className="text-xs font-semibold text-gray-600">E-mail du client</label>
            <input value={cb.email} onChange={(e) => setCb({ ...cb, email: e.target.value })} data-testid="chargeback-email"
              placeholder="client@example.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" />
            <label className="text-xs font-semibold text-gray-600">Montant (EUR)</label>
            <input value={cb.amount} onChange={(e) => setCb({ ...cb, amount: e.target.value })} data-testid="chargeback-amount"
              type="number" placeholder="50" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 mt-1" />
            <label className="text-xs font-semibold text-gray-600">Motif (optionnel)</label>
            <input value={cb.reason} onChange={(e) => setCb({ ...cb, reason: e.target.value })} data-testid="chargeback-reason"
              placeholder="Litige carte bancaire" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 mt-1" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCbOpen(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold">Annuler</button>
              <button onClick={submitChargeback} disabled={cbBusy} data-testid="chargeback-submit"
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                {cbBusy ? 'Traitement…' : 'Enregistrer le chargeback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
