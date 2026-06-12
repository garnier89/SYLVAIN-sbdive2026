import React, { useEffect, useState } from 'react';
import { UsersThree, FloppyDisk, CheckCircle, Circle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { carpoolAPI } from '../../services/api';

const NUMBER_FIELDS = [
  { key: 'commission_percent', label: 'Commission plateforme (%)', hint: 'Prélevée sur chaque place, au reversement du chauffeur', min: 0, max: 100, step: 0.5 },
  { key: 'max_seats_per_booking', label: 'Places max par réservation', min: 1, max: 8, step: 1 },
  { key: 'max_seats_per_ride', label: 'Places max par trajet publié', min: 1, max: 8, step: 1 },
  { key: 'auto_release_hours', label: 'Libération auto du séquestre (heures après départ)', hint: 'Si le chauffeur n\'a pas clôturé le trajet', min: 1, max: 168, step: 1 },
];

const DEFAULTS = {
  enabled: true, commission_percent: 15, max_seats_per_booking: 4,
  max_seats_per_ride: 8, auto_release_hours: 12, currency: 'EUR',
};

const AdminCarpoolConfig = () => {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    carpoolAPI.adminGetConfig()
      .then((r) => setCfg({ ...DEFAULTS, ...(r.data || {}) }))
      .catch(() => toast.error('Chargement de la config impossible'))
      .finally(() => setLoading(false));
  }, []);

  const setField = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: !!cfg.enabled,
        commission_percent: parseFloat(cfg.commission_percent) || 0,
        max_seats_per_booking: parseInt(cfg.max_seats_per_booking) || 1,
        max_seats_per_ride: parseInt(cfg.max_seats_per_ride) || 1,
        auto_release_hours: parseInt(cfg.auto_release_hours) || 12,
        currency: cfg.currency || 'EUR',
      };
      const r = await carpoolAPI.adminSetConfig(payload);
      setCfg({ ...DEFAULTS, ...(r.data || {}) });
      toast.success('Configuration covoiturage enregistrée');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l\'enregistrement');
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-6 max-w-2xl" data-testid="admin-carpool-config">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><UsersThree size={22} className="text-emerald-600" weight="fill" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuration Covoiturage</h1>
          <p className="text-sm text-gray-500">Paiement sécurisé en séquestre (escrow) · SB Pay</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mt-5 space-y-5">
        {/* Toggle activation */}
        <button onClick={() => setField('enabled', !cfg.enabled)} data-testid="carpool-enabled-toggle" className="flex items-center gap-2">
          {cfg.enabled ? <CheckCircle size={22} className="text-emerald-500" weight="fill" /> : <Circle size={22} className="text-gray-300" />}
          <span className={`text-sm font-semibold ${cfg.enabled ? 'text-emerald-700' : 'text-gray-400'}`}>{cfg.enabled ? 'Covoiturage activé' : 'Covoiturage désactivé'}</span>
        </button>

        {NUMBER_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-sm font-medium text-gray-700 block mb-1">{f.label}</label>
            {f.hint && <p className="text-xs text-gray-400 mb-1.5">{f.hint}</p>}
            <Input
              type="number" min={f.min} max={f.max} step={f.step}
              value={cfg[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              data-testid={`carpool-field-${f.key}`}
              className="max-w-[200px]"
            />
          </div>
        ))}

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Devise</label>
          <Input value={cfg.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase().slice(0, 3))} data-testid="carpool-field-currency" className="max-w-[120px]" />
        </div>

        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800">
          💡 Avec une commission de <b>{cfg.commission_percent}%</b>, sur une place à 20€ le chauffeur reçoit <b>{(20 * (1 - (parseFloat(cfg.commission_percent) || 0) / 100)).toFixed(2)}€</b> et la plateforme <b>{(20 * (parseFloat(cfg.commission_percent) || 0) / 100).toFixed(2)}€</b>.
        </div>

        <Button onClick={save} disabled={saving} data-testid="carpool-config-save" className="bg-emerald-600 hover:bg-emerald-700">
          <FloppyDisk size={18} className="mr-2" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
};

export default AdminCarpoolConfig;
