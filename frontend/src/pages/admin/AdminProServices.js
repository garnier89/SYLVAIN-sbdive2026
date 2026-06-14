import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Sparkle, CheckCircle, XCircle, Clock, ShieldCheck, Wallet, Receipt, ArrowClockwise, Percent, FileText,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { proServicesAdminAPI } from '../../services/api';

const API = process.env.REACT_APP_BACKEND_URL;
const eur = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const VERTICAL_LABEL = { beauty: 'Beauté', trades: 'Métiers & Réparation' };

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
    <a href={`${API}${url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 underline">
      <FileText size={13} /> {label}
    </a>
  ) : <span className="text-xs text-gray-300">{label} —</span>
);

const AdminProServices = ({ vertical: verticalProp }) => {
  const params = useParams();
  const vertical = verticalProp || params.vertical || 'beauty';
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [counts, setCounts] = useState({});
  const [revenue, setRevenue] = useState(null);
  const [commission, setCommission] = useState(0.15);
  const [savingPct, setSavingPct] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, rev] = await Promise.all([
        proServicesAdminAPI.providers(vertical), proServicesAdminAPI.revenue(vertical),
      ]);
      setProviders(pr.data.providers || []); setCounts(pr.data.counts || {});
      setRevenue(rev.data); setCommission(rev.data.commission_pct ?? 0.15);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, [vertical]);
  useEffect(() => { load(); }, [load]);

  const verify = async (providerId, action) => {
    let reason = '';
    if (action === 'reject') reason = window.prompt('Motif du refus :', 'Documents non conformes') || '';
    try {
      await proServicesAdminAPI.verify(vertical, providerId, { action, reason });
      toast.success(action === 'approve' ? 'Prestataire validé' : 'Prestataire refusé');
      load();
    } catch { toast.error('Action échouée'); }
  };

  const saveCommission = async () => {
    setSavingPct(true);
    try {
      await proServicesAdminAPI.setSettings(vertical, { commission_pct: Number(commission) });
      toast.success('Commission mise à jour'); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec'); }
    finally { setSavingPct(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="admin-pro-services">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Sparkle size={24} weight="fill" className="text-pink-600" />
          <h1 className="text-xl font-black text-gray-900">Prestataires — {VERTICAL_LABEL[vertical] || vertical}</h1>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500" data-testid="pro-admin-refresh">
          <ArrowClockwise size={16} /> Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Kpi icon={Clock} label="En attente" value={counts.pending ?? 0} accent="bg-amber-500" testid="kpi-pending" />
        <Kpi icon={ShieldCheck} label="Validés" value={counts.approved ?? 0} accent="bg-emerald-500" testid="kpi-approved" />
        <Kpi icon={Receipt} label="Commission plateforme" value={eur(revenue?.commission)} accent="bg-pink-600" testid="kpi-commission" />
        <Kpi icon={Wallet} label="Versé aux prestataires" value={eur(revenue?.provider_payout)} accent="bg-indigo-500" testid="kpi-payout" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex items-center gap-3 flex-wrap" data-testid="commission-setting">
        <Percent size={20} className="text-pink-600" />
        <span className="text-sm font-semibold text-gray-700">Commission par prestation :</span>
        <input type="number" min="0" max="90" value={Math.round(commission * 100)}
          onChange={(e) => setCommission(Math.min(90, Math.max(0, Number(e.target.value))) / 100)}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" data-testid="commission-input" />
        <span className="text-sm text-gray-500">%</span>
        <button onClick={saveCommission} disabled={savingPct} className="bg-pink-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="commission-save">
          {savingPct ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <span className="text-xs text-gray-400 ml-auto">GMV : {eur(revenue?.gmv)} · {revenue?.count ?? 0} prestations</span>
      </div>

      <div className="space-y-3">
        {providers.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-400" data-testid="providers-empty">
            Aucun prestataire inscrit.
          </div>
        ) : providers.map((op) => {
          const st = STATUS[op.verification_status] || STATUS.pending;
          const docs = op.documents || {};
          return (
            <div key={op.id} className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={`provider-row-${op.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{op.name}</p>
                    {op.is_demo && <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">DÉMO</span>}
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`} data-testid={`status-${op.id}`}>
                      <st.Ic size={12} weight="fill" /> {st.l}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{(op.categories || []).join(', ')} · {op.city || '—'} · ⭐ {op.rating}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{op.completed_jobs ?? 0} prestations terminées</p>
                  {!op.is_demo && (
                    <div className="flex items-center gap-3 mt-2">
                      <DocLink url={docs.id_card} label="Identité" />
                      <DocLink url={docs.diploma} label="Diplôme" />
                      <DocLink url={docs.insurance} label="Assurance" />
                    </div>
                  )}
                  {op.verification_status === 'rejected' && op.rejection_reason && (
                    <p className="text-xs text-rose-500 mt-1">Motif : {op.rejection_reason}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {op.verification_status !== 'approved' && (
                    <button onClick={() => verify(op.id, 'approve')} className="bg-emerald-500 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1" data-testid={`approve-${op.id}`}>
                      <CheckCircle size={14} weight="fill" /> Valider
                    </button>
                  )}
                  {op.verification_status !== 'rejected' && (
                    <button onClick={() => verify(op.id, 'reject')} className="bg-white border border-rose-200 text-rose-600 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1" data-testid={`reject-${op.id}`}>
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

export default AdminProServices;
