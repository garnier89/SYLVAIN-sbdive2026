import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Toggle, CreditCard, Money, Wallet, DeviceMobile, Waves, Bank, FloppyDisk, Lightning } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const ICON_MAP = {
  Money, CreditCard, Wallet, DeviceMobile, Waves, Bank,
};

/**
 * Admin — Manage Payment Methods + Finance module.
 * - Toggle each method ON/OFF (visibility for clients).
 * - Store merchant_id + api_key per method.
 * - Toggle the whole Finance module ON/OFF.
 */
const AdminPaymentMethods = () => {
  const [methods, setMethods] = useState([]);
  const [financeMod, setFinanceMod] = useState({ enabled: true, sbpaygo_base_url: '' });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/payment-methods`, { credentials: 'include' });
      const data = await res.json();
      setMethods(data.methods || []);
      setFinanceMod(data.finance_module || { enabled: true, sbpaygo_base_url: '' });
    } catch (e) {
      console.error(e);
      toast.error('Erreur de chargement');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateMethod = async (id, patch) => {
    setSavingId(id);
    try {
      const res = await fetch(`${API}/api/admin/payment-methods/${id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      setMethods((arr) => arr.map((m) => m.id === id ? data.method : m));
      toast.success('Méthode mise à jour');
    } catch (e) {
      toast.error('Échec de la sauvegarde');
    } finally { setSavingId(null); }
  };

  const updateFinanceModule = async (patch) => {
    setSavingId('finance');
    try {
      const res = await fetch(`${API}/api/admin/finance/module`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      setFinanceMod(data.finance_module);
      toast.success('Module Finance mis à jour');
    } catch (e) {
      toast.error('Échec de la sauvegarde');
    } finally { setSavingId(null); }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 max-w-4xl space-y-8" data-testid="admin-payment-methods">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Options de paiement</h1>
          <p className="text-sm text-gray-500 mt-1">Activez/désactivez les moyens de paiement et configurez les clés API.</p>
        </div>
      </div>

      {/* Finance module */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5" data-testid="finance-module-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Lightning size={20} weight="duotone" className="text-indigo-600" />
              <h2 className="text-base font-bold text-gray-900">Module Finance (SB PayGo)</h2>
            </div>
            <p className="text-xs text-gray-600">
              Quand activé, les clients et chauffeurs voient l'entrée <b>Finance / SB PayGo</b> dans leur menu latéral
              et peuvent se connecter à sbpaygo.com via SSO depuis leur compte sbdrivevtc.com.
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!financeMod.enabled}
              onChange={(e) => updateFinanceModule({ enabled: e.target.checked })}
              className="sr-only peer"
              data-testid="finance-module-toggle"
            />
            <div className="relative w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full peer transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
          </label>
        </div>
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-700 mb-1">URL SB PayGo (SSO base)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={financeMod.sbpaygo_base_url || ''}
              onChange={(e) => setFinanceMod({ ...financeMod, sbpaygo_base_url: e.target.value })}
              placeholder="https://sbpaygo.com"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
              data-testid="sbpaygo-url-input"
            />
            <button
              onClick={() => updateFinanceModule({ sbpaygo_base_url: financeMod.sbpaygo_base_url })}
              disabled={savingId === 'finance'}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-60"
              data-testid="save-sbpaygo-url-btn"
            >
              <FloppyDisk size={14} weight="bold" /> Enregistrer
            </button>
          </div>
        </div>
      </div>

      {/* Payment methods table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left">
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">Méthode</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">Merchant ID</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase">API Key</th>
              <th className="px-4 py-2.5 text-xs font-bold text-gray-600 uppercase text-center">Activé</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => {
              const Icon = ICON_MAP[m.icon] || CreditCard;
              return (
                <tr key={m.id} className="border-b border-gray-100 last:border-0" data-testid={`pm-row-${m.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Icon size={18} weight="duotone" className="text-gray-700" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{m.label}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{m.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      defaultValue={m.merchant_id}
                      onBlur={(e) => e.target.value !== m.merchant_id && updateMethod(m.id, { merchant_id: e.target.value })}
                      placeholder={m.needs_redirect ? 'merchant-id-xxx' : '—'}
                      disabled={!m.needs_redirect}
                      className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                      data-testid={`pm-merchant-${m.id}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="password"
                      defaultValue={m.api_key}
                      onBlur={(e) => e.target.value !== m.api_key && updateMethod(m.id, { api_key: e.target.value })}
                      placeholder={m.needs_redirect ? '••••••••••' : '—'}
                      disabled={!m.needs_redirect}
                      className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                      data-testid={`pm-apikey-${m.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!m.enabled}
                        onChange={(e) => updateMethod(m.id, { enabled: e.target.checked })}
                        disabled={savingId === m.id}
                        className="sr-only peer"
                        data-testid={`pm-toggle-${m.id}`}
                      />
                      <div className="relative w-10 h-5 bg-gray-300 peer-checked:bg-emerald-500 rounded-full peer transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        💡 Astuce : les champs <b>Merchant ID</b> et <b>API Key</b> ne sont éditables que pour les méthodes
        nécessitant une redirection externe (Orange Money, MTN Money, Wave, SB PayGo). Espèces, Carte et Portefeuille SB
        utilisent l'infrastructure native de l'app.
      </p>
    </div>
  );
};

export default AdminPaymentMethods;
