import React, { useState, useEffect, useRef } from 'react';
import { UsersThree, CheckCircle, Circle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { configAPI } from '../../services/api';

const API = process.env.REACT_APP_BACKEND_URL;

const PAYMENT_OPTIONS = [
  { id: 'cash', label: 'Espèces' },
  { id: 'card', label: 'CB (carte)' },
  { id: 'wallet', label: 'Portefeuille' },
  { id: 'sbpaygo', label: 'SB PayGo' },
];

const NUMBER_FIELDS = [
  { key: 'pool_percentage', label: 'Pool Percentage (% du 1er siège facturé par siège suppl.)' },
  { key: 'available_seats', label: 'Capacité max de passagers (sièges, hors chauffeur)' },
  { key: 'max_seats_per_booking', label: 'Sièges max réservables par commande' },
  { key: 'max_stops', label: "Nombre max d'arrêts / détour" },
  { key: 'share_discount_percent', label: 'Réduction covoiturage de base (%) à 2 passagers' },
];

const DEFAULTS = {
  enable_pool: true,
  pool_percentage: 90,
  available_seats: 4,
  max_seats_per_booking: 2,
  max_stops: 2,
  share_discount_percent: 30,
  eligible_vehicle_slugs: [],
  payment_methods: ['cash', 'card', 'wallet', 'sbpaygo'],
};

const AdminPoolConfig = () => {
  const [settings, setSettings] = useState(DEFAULTS);
  const [vtypes, setVtypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const rawRef = useRef({}); // preserve any other keys already stored in the pool doc

  useEffect(() => {
    (async () => {
      try {
        const vt = await configAPI.getVehicleTypes();
        setVtypes((vt.data || []).filter((v) => v.slug !== 'pool'));
      } catch { /* noop */ }
      try {
        const res = await fetch(`${API}/api/admin/service-config/pool`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const s = data.settings || {};
          rawRef.current = s;
          setSettings((prev) => ({
            ...prev,
            ...Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, s[k] !== undefined ? s[k] : prev[k]])),
            eligible_vehicle_slugs: Array.isArray(s.eligible_vehicle_slugs) ? s.eligible_vehicle_slugs : [],
            payment_methods: Array.isArray(s.payment_methods) && s.payment_methods.length ? s.payment_methods : DEFAULTS.payment_methods,
          }));
        }
      } catch { /* noop */ }
      setLoading(false);
    })();
  }, []);

  const set = (key, value) => setSettings((p) => ({ ...p, [key]: value }));

  const toggleVehicle = (slug) => setSettings((p) => {
    const has = p.eligible_vehicle_slugs.includes(slug);
    return { ...p, eligible_vehicle_slugs: has ? p.eligible_vehicle_slugs.filter((s) => s !== slug) : [...p.eligible_vehicle_slugs, slug] };
  });

  const togglePayment = (id) => setSettings((p) => {
    const has = p.payment_methods.includes(id);
    if (has && p.payment_methods.length === 1) return p; // keep at least one
    return { ...p, payment_methods: has ? p.payment_methods.filter((m) => m !== id) : [...p.payment_methods, id] };
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/service-config/pool`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ settings: { ...rawRef.current, ...settings } }),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success('Configuration Pool sauvegardée !');
    } catch { toast.error('Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500" data-testid="admin-pool-config-loading">Chargement…</div>;

  return (
    <div className="p-6" data-testid="admin-pool-config">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FF500015' }}>
          <UsersThree size={24} style={{ color: '#FF5000' }} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Configuration Pool (Course partagée)</h1>
          <p className="text-sm text-gray-500">Catégories de véhicules éligibles, moyens de paiement, capacité &amp; arrêts (parité V3Cube)</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-2xl space-y-6">
        {/* Activation */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Activer le Pool (Shared Ride)</label>
          <button data-testid="pool-enable-toggle" onClick={() => set('enable_pool', !settings.enable_pool)} className={`w-12 h-7 rounded-full relative transition-colors ${settings.enable_pool ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${settings.enable_pool ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Numeric fields */}
        {NUMBER_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">{f.label}</label>
            <Input type="number" value={settings[f.key]} data-testid={`pool-${f.key}`} onChange={(e) => set(f.key, parseFloat(e.target.value) || 0)} />
          </div>
        ))}

        {/* Eligible vehicle categories */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Catégories de véhicules éligibles au Pool</label>
          <p className="text-xs text-gray-400 mb-2">Aucune sélection = toutes les catégories sont éligibles.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="pool-eligible-vehicles">
            {vtypes.map((v) => {
              const active = settings.eligible_vehicle_slugs.includes(v.slug);
              return (
                <button key={v.slug} data-testid={`pool-vehicle-${v.slug}`} onClick={() => toggleVehicle(v.slug)}
                  className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left transition-colors ${active ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-200 bg-white'}`}>
                  {active ? <CheckCircle size={18} weight="fill" className="text-[#FF5000] shrink-0" /> : <Circle size={18} className="text-gray-300 shrink-0" />}
                  <span className="text-sm font-medium text-gray-800 truncate">{v.name_fr || v.name || v.slug}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Allowed payment methods */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Moyens de paiement autorisés pour le Pool</label>
          <div className="flex flex-wrap gap-2" data-testid="pool-payment-methods">
            {PAYMENT_OPTIONS.map((p) => {
              const active = settings.payment_methods.includes(p.id);
              return (
                <button key={p.id} data-testid={`pool-payment-${p.id}`} onClick={() => togglePayment(p.id)}
                  className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-[#FF5000] bg-[#FFF3EC] text-[#0B1426]' : 'border-gray-200 bg-white text-gray-500'}`}>
                  {active ? <CheckCircle size={16} weight="fill" className="text-[#FF5000]" /> : <Circle size={16} className="text-gray-300" />}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} data-testid="pool-save-btn" className="bg-[#3b82f6] text-white w-full">
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  );
};

export default AdminPoolConfig;
