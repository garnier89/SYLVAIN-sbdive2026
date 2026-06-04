/**
 * AdminTaxiConfigs — V3Cube: Rental Packages, Personal Driver, Taxi Bid Service,
 * Manage Ride Profiles. Configs câblées au Taxi Hub client + au flux d'enchères.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Clock, UserCircle, Gavel, SlidersHorizontal, FloppyDisk, Plus, X } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

const TABS = [
  { key: 'rental_packages', label: 'Forfaits Location', icon: Clock },
  { key: 'personal_driver', label: 'Chauffeur Privé', icon: UserCircle },
  { key: 'taxi_bid', label: 'Enchères Taxi', icon: Gavel },
  { key: 'ride_profiles', label: 'Profils de course', icon: SlidersHorizontal },
];

const Toggle = ({ checked, onChange, testId }) => (
  <button onClick={onChange} data-testid={testId}
    className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const AdminTaxiConfigs = () => {
  const [tab, setTab] = useState('rental_packages');
  const [cfg, setCfg] = useState({});
  const [saving, setSaving] = useState(false);

  const load = (key) => adminAPI.getTaxiConfig(key).then((r) => setCfg((c) => ({ ...c, [key]: r.data }))).catch(() => toast.error('Erreur de chargement'));
  useEffect(() => { TABS.forEach((t) => load(t.key)); }, []);

  const save = async (key) => {
    setSaving(true);
    try { await adminAPI.saveTaxiConfig(key, cfg[key]); toast.success('Configuration enregistrée'); }
    catch { toast.error('Échec'); } finally { setSaving(false); }
  };

  const cur = cfg[tab];

  return (
    <div className="p-6 max-w-3xl" data-testid="admin-taxi-configs-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Configurations Taxi</h1>
      <p className="text-sm text-slate-500 mb-5">Forfaits, chauffeur privé, enchères et profils de course.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => {
          const I = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} data-testid={`taxi-cfg-tab-${t.key}`}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${tab === t.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              <I size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {!cur ? <p className="text-slate-500" data-testid="taxi-cfg-loading">Chargement…</p> : (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4" data-testid={`taxi-cfg-panel-${tab}`}>
          {tab === 'rental_packages' && (
            <>
              <p className="font-semibold text-slate-900">Forfaits de location (durée · km · prix)</p>
              {(cur.packages || []).map((p, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-center" data-testid={`rental-pkg-${i}`}>
                  <input value={p.label} onChange={(e) => setCfg((c) => ({ ...c, rental_packages: { ...cur, packages: cur.packages.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x) } }))} placeholder="Label" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="number" value={p.hours} onChange={(e) => setCfg((c) => ({ ...c, rental_packages: { ...cur, packages: cur.packages.map((x, idx) => idx === i ? { ...x, hours: parseFloat(e.target.value) || 0 } : x) } }))} placeholder="Heures" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="number" value={p.km} onChange={(e) => setCfg((c) => ({ ...c, rental_packages: { ...cur, packages: cur.packages.map((x, idx) => idx === i ? { ...x, km: parseFloat(e.target.value) || 0 } : x) } }))} placeholder="Km" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  <div className="flex items-center gap-1">
                    <input type="number" value={p.price} onChange={(e) => setCfg((c) => ({ ...c, rental_packages: { ...cur, packages: cur.packages.map((x, idx) => idx === i ? { ...x, price: parseFloat(e.target.value) || 0 } : x) } }))} placeholder="€" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full" data-testid={`rental-pkg-price-${i}`} />
                    <button onClick={() => setCfg((c) => ({ ...c, rental_packages: { ...cur, packages: cur.packages.filter((_, idx) => idx !== i) } }))} className="p-1 text-slate-400 hover:text-rose-500"><X size={16} /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => setCfg((c) => ({ ...c, rental_packages: { ...cur, packages: [...(cur.packages || []), { slug: `pkg_${Date.now()}`, label: '', hours: 1, km: 10, price: 18 }] } }))} className="text-sm font-semibold text-violet-600 flex items-center gap-1" data-testid="rental-add-pkg"><Plus size={14} /> Ajouter un forfait</button>
            </>
          )}

          {tab === 'personal_driver' && (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">Activer le Chauffeur Privé</p>
                <Toggle checked={cur.enabled} onChange={() => setCfg((c) => ({ ...c, personal_driver: { ...cur, enabled: !cur.enabled } }))} testId="pd-enabled-toggle" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Tarif horaire (€)</label>
                <input type="number" value={cur.hourly_rate} onChange={(e) => setCfg((c) => ({ ...c, personal_driver: { ...cur, hourly_rate: parseFloat(e.target.value) || 0 } }))} data-testid="pd-rate-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Durées proposées (heures, séparées par virgule)</label>
                <input value={(cur.durations || []).join(', ')} onChange={(e) => setCfg((c) => ({ ...c, personal_driver: { ...cur, durations: e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter(Boolean) } }))} data-testid="pd-durations-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
            </>
          )}

          {tab === 'taxi_bid' && (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">Activer le service d'enchères</p>
                <Toggle checked={cur.enabled} onChange={() => setCfg((c) => ({ ...c, taxi_bid: { ...cur, enabled: !cur.enabled } }))} testId="bid-enabled-toggle" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Expiration des offres (sec)</label>
                  <input type="number" value={cur.offer_ttl_seconds} onChange={(e) => setCfg((c) => ({ ...c, taxi_bid: { ...cur, offer_ttl_seconds: parseInt(e.target.value, 10) || 0 } }))} data-testid="bid-ttl-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Incrément minimum (€)</label>
                  <input type="number" value={cur.min_increment} onChange={(e) => setCfg((c) => ({ ...c, taxi_bid: { ...cur, min_increment: parseFloat(e.target.value) || 0 } }))} data-testid="bid-min-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Augmentations suggérées (€, séparées par virgule)</label>
                <input value={(cur.suggested_increases || []).join(', ')} onChange={(e) => setCfg((c) => ({ ...c, taxi_bid: { ...cur, suggested_increases: e.target.value.split(',').map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x)) } }))} data-testid="bid-suggested-input" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
            </>
          )}

          {tab === 'ride_profiles' && (
            <>
              <p className="font-semibold text-slate-900 mb-2">Options de course disponibles côté client</p>
              {[
                { k: 'allow_book_for_other', l: 'Réserver pour un proche' },
                { k: 'allow_female_driver', l: 'Demander une conductrice' },
                { k: 'allow_handicap', l: 'Accessibilité PMR' },
                { k: 'allow_pets', l: 'Animaux autorisés' },
              ].map((o) => (
                <div key={o.k} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-slate-800">{o.l}</span>
                  <Toggle checked={cur[o.k]} onChange={() => setCfg((c) => ({ ...c, ride_profiles: { ...cur, [o.k]: !cur[o.k] } }))} testId={`profile-${o.k}-toggle`} />
                </div>
              ))}
            </>
          )}

          <button onClick={() => save(tab)} disabled={saving} data-testid={`taxi-cfg-save-${tab}`}
            className="px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold flex items-center gap-2 disabled:opacity-60 mt-2">
            <FloppyDisk size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminTaxiConfigs;
