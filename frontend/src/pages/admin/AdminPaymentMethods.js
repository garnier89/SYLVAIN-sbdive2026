import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Toggle, CreditCard, Money, Wallet, DeviceMobile, Waves, Bank, FloppyDisk, Lightning, Gift, SlidersHorizontal } from '@phosphor-icons/react';

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
  const [cashback, setCashback] = useState(null);
  const [reserve, setReserve] = useState(null);
  const [sla, setSla] = useState(null);
  const [contactless, setContactless] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/payment-methods`, { credentials: 'include' });
      const data = await res.json();
      setMethods(data.methods || []);
      setFinanceMod(data.finance_module || { enabled: true, sbpaygo_base_url: '' });
      const cb = await fetch(`${API}/api/admin/cashback`, { credentials: 'include' });
      if (cb.ok) setCashback(await cb.json());
      const rv = await fetch(`${API}/api/admin/wallet-reserve-config`, { credentials: 'include' });
      if (rv.ok) setReserve(await rv.json());
      const sl = await fetch(`${API}/api/payouts/admin/sla-config`, { credentials: 'include' });
      if (sl.ok) setSla(await sl.json());
      const cl = await fetch(`${API}/api/contactless/admin/config`, { credentials: 'include' });
      if (cl.ok) setContactless(await cl.json());
    } catch (e) {
      console.error(e);
      toast.error('Erreur de chargement');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const saveSla = async (patch) => {
    setSavingId('sla');
    try {
      const res = await fetch(`${API}/api/payouts/admin/sla-config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
      setSla(await res.json());
      toast.success('Délais mis à jour');
    } catch (e) {
      toast.error('Échec de la sauvegarde');
    } finally { setSavingId(null); }
  };

  const saveReserve = async (patch) => {
    setSavingId('reserve');
    try {
      const res = await fetch(`${API}/api/admin/wallet-reserve-config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
      setReserve(await res.json());
      toast.success('Réserve mise à jour');
    } catch (e) {
      toast.error('Échec de la sauvegarde');
    } finally { setSavingId(null); }
  };

  const saveContactless = async (patch) => {
    setSavingId('contactless');
    try {
      const res = await fetch(`${API}/api/contactless/admin/config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
      setContactless(await res.json());
      toast.success('Paiement sans contact mis à jour');
    } catch (e) {
      toast.error('Échec de la sauvegarde');
    } finally { setSavingId(null); }
  };

  const saveCashback = async (patch) => {
    setSavingId('cashback');
    try {
      const res = await fetch(`${API}/api/admin/cashback`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
      setCashback(await res.json());
      toast.success('Cashback mis à jour');
    } catch (e) {
      toast.error('Échec de la sauvegarde');
    } finally { setSavingId(null); }
  };

  const toggleCashbackMethod = (m) => {
    const cur = cashback.methods || [];
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m];
    saveCashback({ methods: next.length ? next : ['sbpay'] });
  };

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

      {/* Cashback SB Pay */}
      {cashback && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5" data-testid="cashback-config-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Gift size={20} weight="duotone" className="text-emerald-600" />
                <h2 className="text-base font-bold text-gray-900">Cashback SB Pay</h2>
              </div>
              <p className="text-xs text-gray-600">
                Crédite automatiquement un % du montant payé sur le solde SB Pay du client, pour tous les services
                (courses, livraisons, marketplace, pharmacie). Les paiements en espèces sont exclus.
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!cashback.enabled}
                onChange={(e) => saveCashback({ enabled: e.target.checked })}
                disabled={savingId === 'cashback'}
                className="sr-only peer"
                data-testid="cashback-enabled-toggle"
              />
              <div className="relative w-11 h-6 bg-gray-300 peer-checked:bg-emerald-600 rounded-full peer transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Taux (%)</label>
              <input
                type="number" min="0" max="50" step="0.5"
                defaultValue={cashback.rate_pct}
                onBlur={(e) => Number(e.target.value) !== cashback.rate_pct && saveCashback({ rate_pct: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                data-testid="cashback-rate-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Montant min. (€)</label>
              <input
                type="number" min="0" step="1"
                defaultValue={cashback.min_amount}
                onBlur={(e) => Number(e.target.value) !== cashback.min_amount && saveCashback({ min_amount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                data-testid="cashback-min-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Plafond / transaction (€, 0 = aucun)</label>
              <input
                type="number" min="0" step="1"
                defaultValue={cashback.max_per_tx}
                onBlur={(e) => Number(e.target.value) !== cashback.max_per_tx && saveCashback({ max_per_tx: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                data-testid="cashback-max-input"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-700 mb-2">Moyens de paiement éligibles</label>
            <div className="flex gap-2">
              {[{ id: 'sbpay', label: 'SB Pay' }, { id: 'card', label: 'Carte' }].map((opt) => {
                const active = (cashback.methods || []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleCashbackMethod(opt.id)}
                    disabled={savingId === 'cashback'}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}
                    data-testid={`cashback-method-${opt.id}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Wallet reserve (SB Pay floors) */}
      {reserve && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5" data-testid="reserve-config-card">
          <div className="flex items-center gap-2 mb-1">
            <Bank size={20} weight="duotone" className="text-amber-600" />
            <h2 className="text-base font-bold text-gray-900">Réserve portefeuille SB Pay</h2>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            Montant non-retirable crédité automatiquement à l'activation d'un compte chauffeur/marchand et
            conservé en permanence (plancher de solde). Les chauffeurs en Afrique ont un plancher réduit.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: 'driver_europe', label: 'Chauffeur Europe/DOM-TOM (€)' },
              { k: 'driver_africa', label: 'Chauffeur Afrique (€)' },
              { k: 'merchant', label: 'Marchand (€)' },
              { k: 'withdraw_min', label: 'Retrait minimum (€)' },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
                <input
                  type="number" min="0" step="1"
                  defaultValue={reserve[f.k]}
                  onBlur={(e) => Number(e.target.value) !== reserve[f.k] && saveReserve({ [f.k]: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  data-testid={`reserve-${f.k}-input`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Withdrawal SLA / délais */}
      {sla && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5" data-testid="sla-config-card">
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal size={20} weight="duotone" className="text-sky-600" />
            <h2 className="text-base font-bold text-gray-900">Délais de versement (retraits)</h2>
          </div>
          <p className="text-xs text-gray-600 mb-4">Délais estimés affichés au chauffeur/marchand, par zone et rôle. Le retrait express (Europe/DOM-TOM) accélère le versement contre des frais.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { zone: 'europe', k: 'driver_hours', label: 'EU/DOM-TOM chauffeur (h)' },
              { zone: 'europe', k: 'merchant_hours', label: 'EU/DOM-TOM marchand (h)' },
              { zone: 'africa', k: 'driver_hours', label: 'Afrique chauffeur (h)' },
              { zone: 'africa', k: 'merchant_hours', label: 'Afrique marchand (h)' },
            ].map((f) => (
              <div key={`${f.zone}-${f.k}`}>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
                <input type="number" min="1" step="1" defaultValue={sla[f.zone]?.[f.k]}
                  onBlur={(e) => Number(e.target.value) !== sla[f.zone]?.[f.k] && saveSla({ [f.zone]: { [f.k]: Number(e.target.value) } })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  data-testid={`sla-${f.zone}-${f.k}-input`} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-end gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!sla.express?.enabled}
                onChange={(e) => saveSla({ express: { enabled: e.target.checked } })}
                data-testid="sla-express-enabled" />
              Express activé
            </label>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Express (h)</label>
              <input type="number" min="1" step="1" defaultValue={sla.express?.hours}
                onBlur={(e) => Number(e.target.value) !== sla.express?.hours && saveSla({ express: { hours: Number(e.target.value) } })}
                className="w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="sla-express-hours-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Frais express (€)</label>
              <input type="number" min="0" step="0.5" defaultValue={sla.express?.fee}
                onBlur={(e) => Number(e.target.value) !== sla.express?.fee && saveSla({ express: { fee: Number(e.target.value) } })}
                className="w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="sla-express-fee-input" />
            </div>
          </div>
        </div>
      )}

      {/* Paiement sans contact (Phase D) */}
      {contactless && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5" data-testid="contactless-config-card">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={20} weight="duotone" className="text-violet-600" />
              <h2 className="text-base font-bold text-gray-900">Paiement sans contact (QR / code)</h2>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!contactless.enabled}
                onChange={(e) => saveContactless({ enabled: e.target.checked })}
                disabled={savingId === 'contactless'}
                data-testid="contactless-enabled-toggle" />
              Activé
            </label>
          </div>
          <p className="text-xs text-gray-600 mb-4">Le chauffeur/marchand génère un QR + code 6 chiffres ; le client paie via SB Pay ou carte. La commission est prélevée sur le montant ; le net est crédité au bénéficiaire.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Commission (%)</label>
              <input type="number" min="0" max="90" step="0.5" defaultValue={contactless.commission_percent}
                onBlur={(e) => Number(e.target.value) !== contactless.commission_percent && saveContactless({ commission_percent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="contactless-commission-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Expiration (min)</label>
              <input type="number" min="1" step="1" defaultValue={contactless.expiry_minutes}
                onBlur={(e) => Number(e.target.value) !== contactless.expiry_minutes && saveContactless({ expiry_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="contactless-expiry-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Montant max (€)</label>
              <input type="number" min="1" step="1" defaultValue={contactless.max_amount}
                onBlur={(e) => Number(e.target.value) !== contactless.max_amount && saveContactless({ max_amount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="contactless-max-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Min carte (€)</label>
              <input type="number" min="0" step="0.5" defaultValue={contactless.min_card}
                onBlur={(e) => Number(e.target.value) !== contactless.min_card && saveContactless({ min_card: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="contactless-mincard-input" />
            </div>
          </div>
        </div>
      )}

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
