/**
 * AdminDynamicPricing — V3Cube parity.
 *  • AI Dynamic Surge: règles par Lieu × Type de véhicule + plages de demande,
 *    activation automatique (statut ON), carte de chaleur temps réel.
 *  • Weather Surcharge: par Type de véhicule, multiplicateur par condition météo
 *    (OpenWeatherMap en direct).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Rocket, CloudRain, Plus, X, Trash, MapPin } from '@phosphor-icons/react';
import { adminAPI, configAPI } from '../../services/api';
import AdminGoogleMap from '../../components/admin/AdminGoogleMap';

const DEFAULT_CENTER = { lat: 14.6, lng: -61.07 };
const COND_LABELS = { Thunderstorm: 'Orage', Drizzle: 'Bruine', Rain: 'Pluie', Snow: 'Neige', Clouds: 'Nuageux', Clear: 'Dégagé', Mist: 'Brouillard' };

const StatusPill = ({ active }) => (
  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
    {active ? 'ON' : 'OFF'}
  </span>
);

const AdminDynamicPricing = () => {
  const [tab, setTab] = useState('surge');
  const [vehicleTypes, setVehicleTypes] = useState([]);

  useEffect(() => {
    configAPI.getVehicleTypes().then((r) => setVehicleTypes(r.data || [])).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-5xl" data-testid="admin-dynamic-pricing-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Tarification dynamique</h1>
      <p className="text-sm text-slate-500 mb-5">Règles de majoration par zone et par météo — activées automatiquement dès leur configuration.</p>

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

      {tab === 'surge' ? <SurgeTab vehicleTypes={vehicleTypes} /> : <WeatherTab vehicleTypes={vehicleTypes} />}
    </div>
  );
};

// ════════════════════════ AI DYNAMIC SURGE ════════════════════════
const SurgeTab = ({ vehicleTypes }) => {
  const [rules, setRules] = useState([]);
  const [locations, setLocations] = useState([]);
  const [heatmap, setHeatmap] = useState({ points: [], zones: [] });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    adminAPI.getSurge().then((r) => setRules(r.data || [])).catch(() => {});
    adminAPI.getSurgeLocations().then((r) => setLocations(r.data || [])).catch(() => {});
    adminAPI.getSurgeHeatmap().then((r) => setHeatmap(r.data || { points: [], zones: [] })).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    try { await adminAPI.toggleSurgeRule(id); load(); } catch { toast.error('Échec'); }
  };
  const remove = async (id) => {
    try { await adminAPI.deleteSurgeRule(id); toast.success('Règle supprimée'); load(); } catch { toast.error('Échec'); }
  };

  const mapCenter = heatmap.zones[0] ? { lat: heatmap.zones[0].lat, lng: heatmap.zones[0].lng } : DEFAULT_CENTER;

  return (
    <div className="space-y-5">
      {/* Heatmap card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="surge-heatmap-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold text-slate-900">Carte de chaleur de la demande (temps réel)</p>
            <p className="text-xs text-slate-500">Zones rouges/oranges = forte densité de courses en attente. {heatmap.points.length} demande(s) en cours.</p>
          </div>
        </div>
        <div className="h-[320px] rounded-lg overflow-hidden" data-testid="surge-heatmap">
          <AdminGoogleMap
            center={mapCenter}
            zoom={12}
            heatmapData={heatmap.points.map((p) => [p.lat, p.lng, p.weight || 1])}
            markers={heatmap.zones.map((z, i) => ({ id: `zone-${i}`, lat: z.lat, lng: z.lng, label: 'Z', color: '#F59E0B' }))}
          />
        </div>
      </div>

      {/* Rules list */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-slate-900">Règles de majoration</p>
          <button onClick={() => setShowForm(true)} data-testid="surge-add-btn"
            className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1"><Plus size={16} /> Ajouter</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b">
                <th className="py-2 pr-3">Lieu</th><th className="pr-3">Véhicule</th><th className="pr-3">Plages</th><th className="pr-3">Max</th><th className="pr-3">Aperçu</th><th className="pr-3">Statut</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-slate-400 py-6">Aucune règle</td></tr>
              ) : rules.map((r) => (
                <tr key={r.id} className="border-b last:border-0" data-testid={`surge-rule-${r.id}`}>
                  <td className="py-2.5 pr-3 font-medium text-slate-800">{r.location?.name}</td>
                  <td className="pr-3 text-slate-600">{r.vehicle_type === 'all' ? 'Tous' : r.vehicle_type}</td>
                  <td className="pr-3 text-slate-600">{r.total_ranges}</td>
                  <td className="pr-3 text-slate-600">x{r.max_surcharge}</td>
                  <td className="pr-3 text-[11px] text-slate-500">{r.ranges_preview}</td>
                  <td className="pr-3">
                    <button onClick={() => toggle(r.id)} data-testid={`surge-toggle-${r.id}`}>
                      <StatusPill active={r.status === 'active'} />
                    </button>
                  </td>
                  <td><button onClick={() => remove(r.id)} data-testid={`surge-delete-${r.id}`} className="text-slate-400 hover:text-rose-500"><Trash size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <SurgeForm vehicleTypes={vehicleTypes} locations={locations}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
};

const SurgeForm = ({ vehicleTypes, locations, onClose, onSaved }) => {
  const [useExisting, setUseExisting] = useState(locations.length > 0);
  const [locId, setLocId] = useState(locations[0]?.id || '');
  const [loc, setLoc] = useState({ name: '', lat: '', lng: '', radius_km: 5 });
  const [vehicleType, setVehicleType] = useState('all');
  const [ranges, setRanges] = useState([{ min_requests: 0, max_requests: 2, surcharge: 1.0 }]);
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);

  const setRange = (i, f, v) => setRanges((rs) => rs.map((r, idx) => (idx === i ? { ...r, [f]: v === '' ? '' : parseFloat(v) } : r)));

  const save = async () => {
    let location;
    if (useExisting) {
      const l = locations.find((x) => x.id === locId);
      if (!l) { toast.error('Choisissez un lieu'); return; }
      location = { name: l.name, lat: l.lat, lng: l.lng, radius_km: l.radius_km };
    } else {
      if (!loc.name || loc.lat === '' || loc.lng === '') { toast.error('Renseignez le lieu (nom, lat, lng)'); return; }
      location = { name: loc.name, lat: parseFloat(loc.lat), lng: parseFloat(loc.lng), radius_km: parseFloat(loc.radius_km) || 5 };
    }
    setSaving(true);
    try {
      if (!useExisting) await adminAPI.createSurgeLocation(location).catch(() => {});
      await adminAPI.createSurgeRule({ location, vehicle_type: vehicleType, ranges, status });
      toast.success('Règle créée et activée');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid="surge-form-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Ajouter une règle de surge</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>

        <label className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1"><MapPin size={12} /> Lieu</label>
        <div className="flex gap-2 my-1">
          <button onClick={() => setUseExisting(true)} className={`text-xs px-3 py-1 rounded-full ${useExisting ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`} data-testid="surge-loc-existing">Existant</button>
          <button onClick={() => setUseExisting(false)} className={`text-xs px-3 py-1 rounded-full ${!useExisting ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`} data-testid="surge-loc-new">Nouveau lieu</button>
        </div>
        {useExisting ? (
          <select value={locId} onChange={(e) => setLocId(e.target.value)} data-testid="surge-loc-select" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3">
            <option value="">Sélectionner un lieu</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.radius_km}km)</option>)}
          </select>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input placeholder="Nom" value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} data-testid="surge-loc-name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm col-span-2" />
            <input placeholder="Latitude" value={loc.lat} onChange={(e) => setLoc({ ...loc, lat: e.target.value })} data-testid="surge-loc-lat" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Longitude" value={loc.lng} onChange={(e) => setLoc({ ...loc, lng: e.target.value })} data-testid="surge-loc-lng" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Rayon (km)" value={loc.radius_km} onChange={(e) => setLoc({ ...loc, radius_km: e.target.value })} data-testid="surge-loc-radius" className="border border-slate-300 rounded-lg px-3 py-2 text-sm col-span-2" />
          </div>
        )}

        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Type de véhicule</label>
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} data-testid="surge-vehicle-select" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 mt-1">
          <option value="all">Tous les véhicules</option>
          {vehicleTypes.map((v) => <option key={v.slug} value={v.slug}>{v.name}</option>)}
        </select>

        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Plages de demande (nb demandes → multiplicateur)</label>
        <div className="space-y-2 my-2">
          {ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-2" data-testid={`surge-range-${i}`}>
              <input type="number" placeholder="min" value={r.min_requests} onChange={(e) => setRange(i, 'min_requests', e.target.value)} className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" data-testid={`surge-range-min-${i}`} />
              <span className="text-slate-400">→</span>
              <input type="number" placeholder="max (∞)" value={r.max_requests ?? ''} onChange={(e) => setRange(i, 'max_requests', e.target.value)} className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" data-testid={`surge-range-max-${i}`} />
              <span className="text-slate-400">x</span>
              <input type="number" step="0.1" placeholder="mult" value={r.surcharge} onChange={(e) => setRange(i, 'surcharge', e.target.value)} className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" data-testid={`surge-range-mult-${i}`} />
              <button onClick={() => setRanges((rs) => rs.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-rose-500"><X size={16} /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setRanges((rs) => [...rs, { min_requests: 0, max_requests: null, surcharge: 1.5 }])} className="text-sm font-semibold text-violet-600 flex items-center gap-1 mb-3" data-testid="surge-add-range"><Plus size={14} /> Ajouter une plage</button>

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-slate-700">Statut (activation automatique)</span>
          <button onClick={() => setStatus((s) => (s === 'active' ? 'inactive' : 'active'))} data-testid="surge-status-toggle"
            className={`relative w-14 h-8 rounded-full transition-colors ${status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${status === 'active' ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        <button onClick={save} disabled={saving} data-testid="surge-form-save" className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Ajouter la règle'}
        </button>
      </div>
    </div>
  );
};

// ════════════════════════ WEATHER SURCHARGE ════════════════════════
const WeatherTab = ({ vehicleTypes }) => {
  const [rules, setRules] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    adminAPI.getWeather().then((r) => setRules(r.data || [])).catch(() => {});
    adminAPI.getWeatherConditions().then((r) => setConditions(r.data?.conditions || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => { try { await adminAPI.toggleWeatherRule(id); load(); } catch { toast.error('Échec'); } };
  const remove = async (id) => { try { await adminAPI.deleteWeatherRule(id); toast.success('Supprimé'); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800" data-testid="weather-info">
        Le multiplicateur s'applique automatiquement selon la <b>météo réelle</b> (OpenWeatherMap) au point de prise en charge. Ex : Orage X=1,3 → tarif standard ×1,3.
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-slate-900">Surcharges météo par véhicule</p>
          <button onClick={() => setShowForm(true)} data-testid="weather-add-btn" className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1"><Plus size={16} /> Ajouter</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b">
                <th className="py-2 pr-3">Véhicule</th><th className="pr-3">Multiplicateurs</th><th className="pr-3">Statut</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-slate-400 py-6">Aucune surcharge</td></tr>
              ) : rules.map((r) => (
                <tr key={r.id} className="border-b last:border-0" data-testid={`weather-rule-${r.id}`}>
                  <td className="py-2.5 pr-3 font-medium text-slate-800">{r.vehicle_type === 'all' ? 'Tous' : r.vehicle_type}</td>
                  <td className="pr-3 text-[11px] text-slate-500">{Object.entries(r.conditions || {}).filter(([, v]) => v > 1).map(([k, v]) => `${COND_LABELS[k] || k}:x${v}`).join(', ') || '—'}</td>
                  <td className="pr-3"><button onClick={() => toggle(r.id)} data-testid={`weather-toggle-${r.id}`}><StatusPill active={r.status === 'active'} /></button></td>
                  <td><button onClick={() => remove(r.id)} data-testid={`weather-delete-${r.id}`} className="text-slate-400 hover:text-rose-500"><Trash size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <WeatherForm vehicleTypes={vehicleTypes} conditions={conditions}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
};

const WeatherForm = ({ vehicleTypes, conditions, onClose, onSaved }) => {
  const [vehicleType, setVehicleType] = useState('all');
  const [vals, setVals] = useState({});
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const conds = {};
    conditions.forEach((c) => { const v = parseFloat(vals[c]); if (!isNaN(v) && v > 0) conds[c] = v; });
    setSaving(true);
    try {
      await adminAPI.createWeatherRule({ vehicle_type: vehicleType, conditions: conds, status });
      toast.success('Surcharge créée et activée');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid="weather-form-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Ajouter une surcharge météo</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Type de véhicule</label>
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} data-testid="weather-vehicle-select" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4 mt-1">
          <option value="all">Tous les véhicules</option>
          {vehicleTypes.map((v) => <option key={v.slug} value={v.slug}>{v.name}</option>)}
        </select>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Multiplicateur par condition (vide ou 1 = aucun)</label>
        <div className="space-y-2 my-2">
          {conditions.map((c) => (
            <div key={c} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">{COND_LABELS[c] || c}</span>
              <input type="number" step="0.1" placeholder="1.0" value={vals[c] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [c]: e.target.value }))}
                data-testid={`weather-cond-${c}`} className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between my-4">
          <span className="text-sm font-semibold text-slate-700">Statut (activation auto)</span>
          <button onClick={() => setStatus((s) => (s === 'active' ? 'inactive' : 'active'))} data-testid="weather-status-toggle"
            className={`relative w-14 h-8 rounded-full transition-colors ${status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${status === 'active' ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
        <button onClick={save} disabled={saving} data-testid="weather-form-save" className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Ajouter la surcharge'}
        </button>
      </div>
    </div>
  );
};

export default AdminDynamicPricing;
