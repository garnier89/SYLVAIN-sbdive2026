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
    </div>
  );
}
