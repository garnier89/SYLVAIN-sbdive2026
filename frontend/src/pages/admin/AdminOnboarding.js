import React, { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import { toast } from 'sonner';
import { Car, Storefront, Users, CheckCircle, Clock, PaperPlaneTilt, ArrowsClockwise } from '@phosphor-icons/react';

const Stat = ({ label, value, sub, color, testid }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-4" data-testid={testid}>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
    {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const CohortSection = ({ kind, icon: Icon, accent, data, onReload }) => {
  const [busy, setBusy] = useState(false);
  const pending = data?.pending_list || [];

  const remind = async (payload, okMsg) => {
    setBusy(true);
    try {
      const res = await adminAPI.remindOnboarding({ kind, ...payload });
      const { sent, failed } = res.data;
      toast.success(`${okMsg} — ${sent} envoyé(s)${failed ? `, ${failed} échec(s)` : ''}`);
      onReload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de la relance');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid={`onboarding-${kind}-section`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Icon size={22} weight="duotone" style={{ color: accent }} />
          {kind === 'driver' ? 'Chauffeurs' : 'Marchands'} invités
        </h2>
        {pending.length > 0 && (
          <button onClick={() => remind({ all: true }, 'Relance groupée')} disabled={busy}
            className="flex items-center gap-1.5 text-sm font-bold text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            style={{ backgroundColor: accent }}
            data-testid={`remind-all-${kind}-btn`}>
            <ArrowsClockwise size={15} weight="bold" /> Relancer tous ({pending.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Invités" value={data?.total ?? 0} testid={`${kind}-total`} />
        <Stat label="Activés" value={data?.activated ?? 0} color="text-emerald-600" testid={`${kind}-activated`} />
        <Stat label="En attente" value={data?.pending ?? 0} color="text-amber-600" testid={`${kind}-pending`} />
        <Stat label="Taux d'activation" value={`${data?.activation_rate ?? 0}%`} color="text-blue-600" testid={`${kind}-rate`} />
      </div>

      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${data?.activation_rate ?? 0}%`, backgroundColor: accent }} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {pending.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400" data-testid={`${kind}-no-pending`}>
            <CheckCircle size={28} className="mx-auto mb-2 text-emerald-400" />
            Tous les comptes invités sont activés 🎉
          </div>
        ) : pending.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3" data-testid={`pending-${kind}-${p.id}`}>
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <Clock size={16} className="text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {kind === 'merchant' ? (p.store_name || p.name) : p.name}
                {p.company_name && <span className="ml-2 text-[10px] font-medium text-gray-400">{p.company_name}</span>}
              </p>
              <p className="text-xs text-gray-500 truncate">{p.email || '—'}</p>
              {p.last_reminded_at && <p className="text-[10px] text-gray-400">Relancé le {new Date(p.last_reminded_at).toLocaleDateString('fr-FR')}</p>}
            </div>
            <button onClick={() => remind({ ids: [p.id] }, 'Relance envoyée')} disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-50 shrink-0"
              data-testid={`remind-${kind}-${p.id}-btn`}>
              <PaperPlaneTilt size={13} /> Relancer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminOnboarding = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await adminAPI.getOnboarding();
      setData(res.data);
    } catch (e) { toast.error('Échec du chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const d = data?.drivers, m = data?.merchants;
  const totalInvited = (d?.total || 0) + (m?.total || 0);
  const totalActivated = (d?.activated || 0) + (m?.activated || 0);
  const globalRate = totalInvited ? Math.round(totalActivated / totalInvited * 1000) / 10 : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8" data-testid="admin-onboarding-page">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users size={26} weight="duotone" className="text-orange-500" /> Onboarding partenaires
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Suivez l'activation des chauffeurs et marchands invités (1ʳᵉ course / 1ʳᵉ commande = activé) et relancez ceux qui n'ont pas encore démarré.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Chargement…</p>
      ) : (
        <>
          <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl border border-orange-100 p-5 flex items-center gap-6" data-testid="onboarding-global">
            <div>
              <p className="text-xs text-gray-500">Taux d'activation global</p>
              <p className="text-4xl font-bold text-orange-500">{globalRate}%</p>
            </div>
            <div className="text-sm text-gray-600">
              <p><b>{totalActivated}</b> activés sur <b>{totalInvited}</b> invités</p>
              <p className="text-gray-400">{totalInvited - totalActivated} en attente d'activation</p>
            </div>
          </div>

          <CohortSection kind="driver" icon={Car} accent="#DC2626" data={d} onReload={load} />
          <CohortSection kind="merchant" icon={Storefront} accent="#7C3AED" data={m} onReload={load} />
        </>
      )}
    </div>
  );
};

export default AdminOnboarding;
