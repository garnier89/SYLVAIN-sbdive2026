/**
 * AdminDynamicPricing — V3Cube "AI Dynamic Surge" + "Weather Surcharge".
 * Configs câblées au calcul de tarif (/api/rides/estimate + création de course).
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Rocket, CloudRain, FloppyDisk, Plus, X } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

const Toggle = ({ checked, onChange, testId }) => (
  <button onClick={onChange} data-testid={testId}
    className={`relative w-14 h-8 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
    <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
  </button>
);

const Field = ({ label, children, hint }) => (
  <div>
    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

const AdminDynamicPricing = () => {
  const [tab, setTab] = useState('surge');
  const [surge, setSurge] = useState(null);
  const [weather, setWeather] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminAPI.getSurge().then((r) => setSurge(r.data)).catch(() => toast.error('Erreur surge'));
    adminAPI.getWeather().then((r) => setWeather(r.data)).catch(() => toast.error('Erreur météo'));
  }, []);

  const saveSurge = async () => {
    setSaving(true);
    try { await adminAPI.saveSurge(surge); toast.success('Tarification dynamique enregistrée'); }
    catch { toast.error('Échec'); } finally { setSaving(false); }
  };
  const saveWeather = async () => {
    setSaving(true);
    try { await adminAPI.saveWeather(weather); toast.success('Supplément météo enregistré'); }
    catch { toast.error('Échec'); } finally { setSaving(false); }
  };

  const setTier = (i, field, val) => setSurge((s) => ({ ...s, tiers: s.tiers.map((t, idx) => (idx === i ? { ...t, [field]: parseFloat(val) || 0 } : t)) }));
  const addTier = () => setSurge((s) => ({ ...s, tiers: [...(s.tiers || []), { min_ratio: 1, multiplier: 1.2 }] }));
  const removeTier = (i) => setSurge((s) => ({ ...s, tiers: s.tiers.filter((_, idx) => idx !== i) }));

  return (
    <div className="p-6 max-w-3xl" data-testid="admin-dynamic-pricing-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Tarification dynamique</h1>
      <p className="text-sm text-slate-500 mb-5">Majoration de prix selon la demande (AI Surge) et supplément en cas d'intempéries.</p>

      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('surge')} data-testid="pricing-tab-surge"
          className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${tab === 'surge' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
          <Rocket size={16} /> AI Dynamic Surge
        </button>
        <button onClick={() => setTab('weather')} data-testid="pricing-tab-weather"
          className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${tab === 'weather' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
          <CloudRain size={16} /> Weather Surcharge
        </button>
      </div>

      {tab === 'surge' && surge && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4" data-testid="surge-panel">
          <div className="flex items-center justify-between">
            <div><p className="font-semibold text-slate-900">Activer la majoration dynamique</p><p className="text-sm text-slate-500">Augmente le tarif quand la demande dépasse l'offre.</p></div>
            <Toggle checked={surge.enabled} onChange={() => setSurge((s) => ({ ...s, enabled: !s.enabled }))} testId="surge-enabled-toggle" />
          </div>
          <Field label="Mode">
            <select value={surge.mode} onChange={(e) => setSurge((s) => ({ ...s, mode: e.target.value }))}
              data-testid="surge-mode-select" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm">
              <option value="auto">Automatique (selon la demande)</option>
              <option value="manual">Manuel (multiplicateur fixe)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            {surge.mode === 'manual' && (
              <Field label="Multiplicateur fixe">
                <input type="number" step="0.1" value={surge.manual_multiplier}
                  onChange={(e) => setSurge((s) => ({ ...s, manual_multiplier: parseFloat(e.target.value) || 1 }))}
                  data-testid="surge-manual-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
              </Field>
            )}
            <Field label="Multiplicateur max">
              <input type="number" step="0.1" value={surge.max_multiplier}
                onChange={(e) => setSurge((s) => ({ ...s, max_multiplier: parseFloat(e.target.value) || 1 }))}
                data-testid="surge-max-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
            </Field>
            {surge.mode === 'auto' && (
              <Field label="Rayon de zone (km)">
                <input type="number" value={surge.radius_km}
                  onChange={(e) => setSurge((s) => ({ ...s, radius_km: parseFloat(e.target.value) || 1 }))}
                  data-testid="surge-radius-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
              </Field>
            )}
          </div>

          {surge.mode === 'auto' && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Paliers (ratio demande/chauffeurs → multiplicateur)</p>
              <div className="space-y-2">
                {(surge.tiers || []).map((t, i) => (
                  <div key={i} className="flex items-center gap-2" data-testid={`surge-tier-${i}`}>
                    <span className="text-xs text-slate-500">≥</span>
                    <input type="number" step="0.1" value={t.min_ratio} onChange={(e) => setTier(i, 'min_ratio', e.target.value)}
                      className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" data-testid={`surge-tier-ratio-${i}`} />
                    <span className="text-xs text-slate-500">→ x</span>
                    <input type="number" step="0.1" value={t.multiplier} onChange={(e) => setTier(i, 'multiplier', e.target.value)}
                      className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" data-testid={`surge-tier-mult-${i}`} />
                    <button onClick={() => removeTier(i)} className="p-1.5 text-slate-400 hover:text-rose-500"><X size={16} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addTier} className="text-sm font-semibold text-violet-600 flex items-center gap-1 mt-2" data-testid="surge-add-tier"><Plus size={14} /> Ajouter un palier</button>
            </div>
          )}

          <button onClick={saveSurge} disabled={saving} data-testid="surge-save-btn"
            className="px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold flex items-center gap-2 disabled:opacity-60">
            <FloppyDisk size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}

      {tab === 'weather' && weather && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4" data-testid="weather-panel">
          <div className="flex items-center justify-between">
            <div><p className="font-semibold text-slate-900">Activer le supplément météo</p><p className="text-sm text-slate-500">Ajoute un supplément quand les conditions sont défavorables.</p></div>
            <Toggle checked={weather.enabled} onChange={() => setWeather((w) => ({ ...w, enabled: !w.enabled }))} testId="weather-enabled-toggle" />
          </div>
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div><p className="font-semibold text-amber-800">Intempéries en cours</p><p className="text-xs text-amber-600">Interrupteur manuel : applique le supplément maintenant.</p></div>
            <Toggle checked={weather.active_now} onChange={() => setWeather((w) => ({ ...w, active_now: !w.active_now }))} testId="weather-active-toggle" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <select value={weather.type} onChange={(e) => setWeather((w) => ({ ...w, type: e.target.value }))}
                data-testid="weather-type-select" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm">
                <option value="percent">Pourcentage (%)</option>
                <option value="flat">Montant fixe (€)</option>
              </select>
            </Field>
            <Field label={weather.type === 'flat' ? 'Montant (€)' : 'Pourcentage (%)'}>
              <input type="number" value={weather.amount}
                onChange={(e) => setWeather((w) => ({ ...w, amount: parseFloat(e.target.value) || 0 }))}
                data-testid="weather-amount-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
            </Field>
          </div>
          <Field label="Libellé de la condition">
            <input value={weather.condition_label} onChange={(e) => setWeather((w) => ({ ...w, condition_label: e.target.value }))}
              data-testid="weather-label-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
          </Field>
          <button onClick={saveWeather} disabled={saving} data-testid="weather-save-btn"
            className="px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold flex items-center gap-2 disabled:opacity-60">
            <FloppyDisk size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminDynamicPricing;
