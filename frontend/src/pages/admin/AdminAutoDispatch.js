import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Lightning, Timer, MapTrifold, Users, FloppyDisk, ChartBar } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
const PALETTES = ['Expert', 'Confirme', 'Standard', 'Debutant'];

const AdminAutoDispatch = () => {
  const [cfg, setCfg] = useState(null);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    try {
      const [c, s] = await Promise.all([
        fetch(`${API}/api/admin/auto-dispatch/config`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/admin/auto-dispatch/stats`, { credentials: 'include' }).then(r => r.json()),
      ]);
      setCfg(c.config);
      setStats(s);
    } catch (e) { toast.error('Erreur chargement'); }
  };

  useEffect(() => {
    loadAll();
    const i = setInterval(loadAll, 10000);
    return () => clearInterval(i);
  }, []);

  const togglePalette = (tier, p) => {
    const key = `${tier}_palettes`;
    const cur = cfg[key] || [];
    const next = cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p];
    setCfg({ ...cfg, [key]: next });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/auto-dispatch/config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error('Erreur sauvegarde');
      const d = await res.json();
      setCfg(d.config);
      toast.success('Configuration enregistrée');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (!cfg) return <div className="p-6 text-gray-400 text-sm">Chargement...</div>;

  const setNum = (k, v) => {
    const n = parseInt(v) || 0;
    // Enforce a minimum 10s for the auto-cancel field to avoid instant cancellations
    const minVal = k === 'auto_cancel_after_seconds' ? 10 : 0;
    setCfg({ ...cfg, [k]: Math.max(minVal, n) });
  };

  return (
    <div className="p-6 space-y-5" data-testid="admin-auto-dispatch">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Lightning size={26} weight="fill" className="text-amber-500" /> Auto-dispatch
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Escalade automatique des courses non acceptées vers les chauffeurs prioritaires.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Activé</span>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })}
            className="data-[state=checked]:bg-emerald-500"
            data-testid="enabled-toggle"
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sans escalade" value={stats?.tier_0_no_escalation} color="bg-emerald-100 text-emerald-700" testId="stat-tier-0" />
        <StatCard label="Tier 1 (prio)" value={stats?.tier_1_priority} color="bg-blue-100 text-blue-700" testId="stat-tier-1" />
        <StatCard label="Tier 2 (tous)" value={stats?.tier_2_all} color="bg-amber-100 text-amber-700" testId="stat-tier-2" />
        <StatCard label="Auto-annulées" value={stats?.tier_minus_1_cancelled} color="bg-rose-100 text-rose-700" testId="stat-tier-cancelled" />
      </div>

      {/* Timing Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Timer size={18} weight="fill" className="text-blue-500" /> Délais d'escalade
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NumberField
              label="1er palier (secondes)"
              hint="Délai avant de notifier les palettes prioritaires"
              value={cfg.first_escalation_seconds}
              onChange={(v) => setNum('first_escalation_seconds', v)}
              testId="first-escalation-input"
            />
            <NumberField
              label="2e palier (secondes)"
              hint="Délai avant d'élargir aux autres palettes"
              value={cfg.second_escalation_seconds}
              onChange={(v) => setNum('second_escalation_seconds', v)}
              testId="second-escalation-input"
            />
            <NumberField
              label="Auto-annulation (secondes)"
              hint="Délai avant d'annuler automatiquement"
              value={cfg.auto_cancel_after_seconds}
              onChange={(v) => setNum('auto_cancel_after_seconds', v)}
              testId="auto-cancel-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* Radius Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <MapTrifold size={18} weight="fill" className="text-emerald-500" /> Rayon de recherche
          </h2>
          <NumberField
            label="Rayon de base (km)"
            hint="Le 2e palier double automatiquement ce rayon"
            value={cfg.radius_km}
            onChange={(v) => setNum('radius_km', v)}
            testId="radius-input"
          />
        </CardContent>
      </Card>

      {/* Palettes Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Users size={18} weight="fill" className="text-purple-500" /> Palettes éligibles
          </h2>
          <div className="space-y-3">
            <PaletteRow
              title={`Tier 1 — après ${cfg.first_escalation_seconds}s`}
              palettes={cfg.first_palettes}
              onToggle={(p) => togglePalette('first', p)}
              testIdPrefix="first"
            />
            <PaletteRow
              title={`Tier 2 — après ${cfg.second_escalation_seconds}s (rayon élargi)`}
              palettes={cfg.second_palettes}
              onToggle={(p) => togglePalette('second', p)}
              testIdPrefix="second"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="bg-[#FF4500] hover:bg-orange-600 text-white"
          data-testid="save-config-btn"
        >
          <FloppyDisk size={16} weight="fill" className="mr-2" />
          {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
        </Button>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, testId }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid={testId}>
    <div className="flex items-center justify-between mb-2">
      <ChartBar size={16} className="text-gray-400" />
      <Badge className={`${color} border-0 text-[10px]`}>24h</Badge>
    </div>
    <p className="text-2xl font-bold text-gray-900 tabular-nums">{value ?? '—'}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </div>
);

const NumberField = ({ label, hint, value, onChange, testId }) => (
  <div>
    <label className="text-xs font-semibold text-gray-700 mb-1 block">{label}</label>
    <Input
      type="number"
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white"
      data-testid={testId}
    />
    {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
  </div>
);

const PaletteRow = ({ title, palettes, onToggle, testIdPrefix }) => (
  <div className="bg-gray-50 rounded-lg p-3">
    <p className="text-xs font-semibold text-gray-600 mb-2">{title}</p>
    <div className="flex flex-wrap gap-2">
      {PALETTES.map(p => {
        const on = palettes?.includes(p);
        return (
          <button
            key={p}
            onClick={() => onToggle(p)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              on ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            }`}
            data-testid={`${testIdPrefix}-palette-${p.toLowerCase()}-btn`}
          >
            {on ? '✓ ' : ''}{p}
          </button>
        );
      })}
    </div>
  </div>
);

export default AdminAutoDispatch;
