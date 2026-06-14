import React, { useEffect, useState, useCallback } from 'react';
import {
  Ambulance, CheckCircle, XCircle, Clock, ShieldCheck, Wallet, Receipt, ArrowClockwise, Percent, FileText,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ambulanceAdminAPI } from '../../services/api';

const API = process.env.REACT_APP_BACKEND_URL;
const eur = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const STATUS = {
  approved: { l: 'Validé', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100', Ic: CheckCircle },
  pending: { l: 'En attente', cls: 'bg-amber-50 text-amber-600 border-amber-100', Ic: Clock },
  rejected: { l: 'Refusé', cls: 'bg-rose-50 text-rose-600 border-rose-100', Ic: XCircle },
};

const Kpi = ({ icon: Icon, label, value, accent, testid }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={testid}>
    <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-2`}>
      <Icon size={18} weight="fill" className="text-white" />
    </div>
    <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

const DocLink = ({ url, label }) => (
  url ? (
    <a href={`${API}${url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-red-600 underline">
      <FileText size={13} /> {label}
    </a>
  ) : <span className="text-xs text-gray-300">{label} —</span>
);

const AdminAmbulanceOperators = () => {
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState([]);
  const [counts, setCounts] = useState({});
  const [revenue, setRevenue] = useState(null);
  const [commission, setCommission] = useState(0.15);
  const [savingPct, setSavingPct] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ops, rev, set] = await Promise.all([
        ambulanceAdminAPI.operators(), ambulanceAdminAPI.revenue(), ambulanceAdminAPI.getSettings(),
      ]);
      setOperators(ops.data.operators || []); setCounts(ops.data.counts || {});
      setRevenue(rev.data); setCommission(rev.data.commission_pct ?? set.data.commission_pct ?? 0.15);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const verify = async (userId, action) => {
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('Motif du refus :', 'Documents non conformes') || '';
    }
    try {
      await ambulanceAdminAPI.verify(userId, { action, reason });
      toast.success(action === 'approve' ? 'Ambulancier validé' : 'Ambulancier refusé');
      load();
    } catch { toast.error('Action échouée'); }
  };

  const saveCommission = async () => {
    setSavingPct(true);
    try {
      await ambulanceAdminAPI.setSettings({ commission_pct: Number(commission) });
      toast.success('Commission mise à jour');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec'); }
    finally { setSavingPct(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="admin-ambulance-operators">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Ambulance size={24} weight="fill" className="text-red-600" />
          <h1 className="text-xl font-black text-gray-900">Ambulanciers partenaires</h1>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500" data-testid="amb-admin-refresh">
          <ArrowClockwise size={16} /> Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Kpi icon={Clock} label="En attente" value={counts.pending ?? 0} accent="bg-amber-500" testid="amb-kpi-pending" />
        <Kpi icon={ShieldCheck} label="Validés" value={counts.approved ?? 0} accent="bg-emerald-500" testid="amb-kpi-approved" />
        <Kpi icon={Receipt} label="Commission plateforme" value={eur(revenue?.commission)} accent="bg-red-600" testid="amb-kpi-commission" />
        <Kpi icon={Wallet} label="Versé aux ambulanciers" value={eur(revenue?.operator_payout)} accent="bg-indigo-500" testid="amb-kpi-payout" />
      </div>

      {/* Commission setting */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex items-center gap-3 flex-wrap" data-testid="amb-commission-setting">
        <Percent size={20} className="text-red-600" />
        <span className="text-sm font-semibold text-gray-700">Commission par intervention :</span>
        <input type="number" min="0" max="90" value={Math.round(commission * 100)}
          onChange={(e) => setCommission(Math.min(90, Math.max(0, Number(e.target.value))) / 100)}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" data-testid="amb-commission-input" />
        <span className="text-sm text-gray-500">%</span>
        <button onClick={saveCommission} disabled={savingPct} className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="amb-commission-save">
          {savingPct ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <span className="text-xs text-gray-400 ml-auto">GMV total : {eur(revenue?.gmv)} · {revenue?.count ?? 0} interventions</span>
      </div>

      {/* Operators list */}
      <div className="space-y-3">
        {operators.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-400" data-testid="amb-operators-empty">
            Aucun ambulancier inscrit pour le moment.
          </div>
        ) : operators.map((op) => {
          const st = STATUS[op.verification_status] || STATUS.pending;
          const docs = op.documents || {};
          return (
            <div key={op.user_id} className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={`amb-operator-row-${op.user_id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{op.company || op.name}</p>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`} data-testid={`amb-status-${op.user_id}`}>
                      <st.Ic size={12} weight="fill" /> {st.l}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{op.name} · {op.phone || '—'} · {op.plate || '—'} · {op.vehicle_type || '—'} · {op.city || '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{op.completed_jobs ?? 0} interventions terminées</p>
                  <div className="flex items-center gap-3 mt-2">
                    <DocLink url={docs.insurance} label="Assurance" />
                    <DocLink url={docs.license} label="Agrément" />
                    <DocLink url={docs.id_card} label="Identité" />
                  </div>
                  {op.verification_status === 'rejected' && op.rejection_reason && (
                    <p className="text-xs text-rose-500 mt-1">Motif : {op.rejection_reason}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {op.verification_status !== 'approved' && (
                    <button onClick={() => verify(op.user_id, 'approve')} className="bg-emerald-500 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1" data-testid={`amb-approve-${op.user_id}`}>
                      <CheckCircle size={14} weight="fill" /> Valider
                    </button>
                  )}
                  {op.verification_status !== 'rejected' && (
                    <button onClick={() => verify(op.user_id, 'reject')} className="bg-white border border-rose-200 text-rose-600 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1" data-testid={`amb-reject-${op.user_id}`}>
                      <XCircle size={14} weight="fill" /> Refuser
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminAmbulanceOperators;
