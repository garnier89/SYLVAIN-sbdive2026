import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Trophy, Star, Plus, Trash, CaretDown, CaretUp,
  Car, Motorcycle, Bicycle, CurrencyEur, Clock, MapPin, Power, CalendarCheck, Globe
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ZoneScopePicker } from '../../components/admin/ZoneScopePicker';

const API = process.env.REACT_APP_BACKEND_URL;

// ============= TAB 1: REGARD VEHICULES =============
const RegardVehicles = ({ regards, setRegards }) => {
  const [expanded, setExpanded] = useState(regards[0]?.id || null);
  const icons = { Car, Motorcycle, Bicycle };
  const colors = { Car: '#3B82F6', Motorcycle: '#F59E0B', Bicycle: '#10B981' };
  const update = (id, field, value) => setRegards(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Regard Vehicules</h2>
        <p className="text-xs text-gray-500">Activez et configurez les bonus par type de vehicule</p>
      </div>
      {regards.map(regard => {
        const Icon = icons[regard.icon] || Car;
        const color = colors[regard.icon] || '#3B82F6';
        const isExp = expanded === regard.id;
        return (
          <div key={regard.id} className="border border-gray-200 rounded-xl overflow-hidden" data-testid={`regard-${regard.id}`}>
            <button onClick={() => setExpanded(isExp ? null : regard.id)} className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '15' }}>
                  <Icon size={22} style={{ color }} weight="duotone" />
                </div>
                <div className="text-left">
                  <span className="font-bold text-gray-800">{regard.type}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className={regard.active ? 'bg-green-100 text-green-700 text-[10px]' : 'bg-gray-100 text-gray-500 text-[10px]'}>
                      {regard.active ? 'ACTIF' : 'INACTIF'}
                    </Badge>
                    {regard.active && regard.zone && <span className="text-[10px] text-gray-400">{regard.zone}</span>}
                  </div>
                </div>
              </div>
              {isExp ? <CaretUp size={16} className="text-gray-400" /> : <CaretDown size={16} className="text-gray-400" />}
            </button>
            {isExp && (
              <div className="bg-white p-5 border-t border-gray-100">
                <div className="flex items-center justify-between mb-5 p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Power size={18} className={regard.active ? 'text-green-500' : 'text-gray-400'} />
                    <span className="text-sm font-bold text-gray-800">Activation du Regard {regard.type}</span>
                  </div>
                  <button onClick={() => update(regard.id, 'active', !regard.active)}
                    className={`w-14 h-8 rounded-full relative transition-colors ${regard.active ? 'bg-green-500' : 'bg-gray-300'}`}
                    data-testid={`toggle-${regard.id}`}>
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${regard.active ? 'left-[26px]' : 'left-1'}`} />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <Field label="Date de debut" icon={CalendarCheck}><Input type="date" value={regard.start_date} onChange={e => update(regard.id, 'start_date', e.target.value)} /></Field>
                  <Field label="Date de fin" icon={CalendarCheck}><Input type="date" value={regard.end_date} onChange={e => update(regard.id, 'end_date', e.target.value)} /></Field>
                  <Field label="Zone" icon={MapPin}>
                    <select value={regard.zone} onChange={e => update(regard.id, 'zone', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="Martinique">Martinique</option>
                      <option value="Guadeloupe">Guadeloupe</option>
                      <option value="Guyane">Guyane</option>
                      <option value="Reunion">Reunion</option>
                      <option value="Paris">Paris / Ile-de-France</option>
                      <option value="Fort-de-France">Fort-de-France</option>
                      <option value="Toutes">Toutes les zones</option>
                    </select>
                  </Field>
                  <Field label="Heure debut" icon={Clock}><Input type="time" value={regard.start_time} onChange={e => update(regard.id, 'start_time', e.target.value)} /></Field>
                  <Field label="Heure fin" icon={Clock}><Input type="time" value={regard.end_time} onChange={e => update(regard.id, 'end_time', e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Bonus par course (EUR)"><Input type="number" step="0.5" value={regard.bonus_per_trip} onChange={e => update(regard.id, 'bonus_per_trip', parseFloat(e.target.value) || 0)} /></Field>
                  <Field label="Courses minimum"><Input type="number" value={regard.min_trips} onChange={e => update(regard.id, 'min_trips', parseInt(e.target.value) || 0)} /></Field>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============= TAB 2: GARANTIE CA =============
const GuaranteeCA = ({ guarantees, setGuarantees }) => {
  const [expanded, setExpanded] = useState(guarantees[0]?.id || null);
  const update = (id, field, value) => setGuarantees(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));

  const addNew = () => setGuarantees(prev => [...prev, {
    id: `g_${Date.now()}`, name: 'Nouvelle garantie', active: false, start_hour: '08:00', end_hour: '20:00',
    min_revenue: 50, acceptance_rate: 80, max_cancellation: 10, zone: 'Toutes', start_date: '', end_date: '', description: '',
  }]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Garantie de Chiffre d&apos;Affaires</h2>
          <p className="text-xs text-gray-500">L&apos;application complete la difference si le chauffeur n&apos;atteint pas le CA minimum</p>
        </div>
        <Button variant="outline" onClick={addNew} data-testid="add-guarantee"><Plus size={14} className="mr-1" /> Ajouter</Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-2">
        <p className="text-sm text-amber-900 font-medium">Exemple : Garantie 59 EUR entre 12h-20h</p>
        <p className="text-xs text-amber-700 mt-1">Si un chauffeur fait 30 EUR entre 12h et 20h, l&apos;application complete les <b>29 EUR</b> manquants. Le chauffeur doit maintenir un taux d&apos;acceptation &ge;80% et un taux d&apos;annulation &le;10%.</p>
      </div>

      {guarantees.map(g => {
        const isExp = expanded === g.id;
        return (
          <div key={g.id} className="border border-gray-200 rounded-xl overflow-hidden" data-testid={`guarantee-${g.id}`}>
            <button onClick={() => setExpanded(isExp ? null : g.id)}
              className={`w-full flex items-center justify-between px-5 py-3 ${g.active ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' : 'bg-gray-50 text-gray-800'}`}>
              <div className="flex items-center gap-3">
                <CurrencyEur size={20} weight="bold" />
                <div className="text-left">
                  <span className="font-bold">{g.name}</span>
                  <span className="text-xs ml-2 opacity-75">{g.min_revenue} EUR min | {g.start_hour}-{g.end_hour}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={g.active ? 'bg-white/20 text-white text-[10px]' : 'bg-gray-200 text-gray-600 text-[10px]'}>{g.active ? 'ACTIF' : 'INACTIF'}</Badge>
                {isExp ? <CaretUp size={16} /> : <CaretDown size={16} />}
              </div>
            </button>
            {isExp && (
              <div className="bg-white p-5 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Input value={g.name} onChange={e => update(g.id, 'name', e.target.value)} className="max-w-xs" />
                  </div>
                  <button onClick={() => update(g.id, 'active', !g.active)}
                    className={`w-14 h-8 rounded-full relative transition-colors ${g.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${g.active ? 'left-[26px]' : 'left-1'}`} />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="CA Minimum (EUR)"><Input type="number" value={g.min_revenue} onChange={e => update(g.id, 'min_revenue', parseFloat(e.target.value) || 0)} /></Field>
                  <Field label="Heure debut"><Input type="time" value={g.start_hour} onChange={e => update(g.id, 'start_hour', e.target.value)} /></Field>
                  <Field label="Heure fin"><Input type="time" value={g.end_hour} onChange={e => update(g.id, 'end_hour', e.target.value)} /></Field>
                  <Field label="Taux d'acceptation min (%)"><Input type="number" value={g.acceptance_rate} onChange={e => update(g.id, 'acceptance_rate', parseInt(e.target.value) || 0)} /></Field>
                  <Field label="Taux d'annulation max (%)"><Input type="number" value={g.max_cancellation} onChange={e => update(g.id, 'max_cancellation', parseInt(e.target.value) || 0)} /></Field>
                  <Field label="Zone">
                    <select value={g.zone} onChange={e => update(g.id, 'zone', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="Martinique">Martinique</option><option value="Guadeloupe">Guadeloupe</option>
                      <option value="Paris">Paris</option><option value="Toutes">Toutes</option>
                    </select>
                  </Field>
                  <Field label="Date debut"><Input type="date" value={g.start_date} onChange={e => update(g.id, 'start_date', e.target.value)} /></Field>
                  <Field label="Date fin"><Input type="date" value={g.end_date} onChange={e => update(g.id, 'end_date', e.target.value)} /></Field>
                </div>
                <Button variant="outline" className="text-red-500 border-red-200 mt-4" onClick={() => setGuarantees(prev => prev.filter(x => x.id !== g.id))}>
                  <Trash size={14} className="mr-1" /> Supprimer
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============= TAB 3: POINTS CHAUFFEURS =============
const DriverPoints = ({ points, setPoints }) => {
  const updatePalette = (id, field, value) => setPoints(prev => ({ ...prev, palettes: prev.palettes.map(p => p.id === id ? { ...p, [field]: value } : p) }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Systeme de Points Chauffeurs</h2>
        <p className="text-xs text-gray-500">A l&apos;inscription, chaque chauffeur recoit des points. Les refus et annulations font perdre des points et la priorite sur les courses.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Regles de Points</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Field label="Points initiaux"><Input type="number" value={points.initial_points} onChange={e => setPoints(prev => ({...prev, initial_points: parseInt(e.target.value) || 0}))} /></Field>
            <Field label="Points / course acceptee"><Input type="number" value={points.points_per_ride_accepted} onChange={e => setPoints(prev => ({...prev, points_per_ride_accepted: parseInt(e.target.value) || 0}))} /></Field>
            <Field label="Points / course terminee"><Input type="number" value={points.points_per_ride_completed || 0} onChange={e => setPoints(prev => ({...prev, points_per_ride_completed: parseInt(e.target.value) || 0}))} /></Field>
            <Field label="Points perdus / refus"><Input type="number" value={points.points_lost_per_refuse} onChange={e => setPoints(prev => ({...prev, points_lost_per_refuse: parseInt(e.target.value) || 0}))} /></Field>
            <Field label="Points perdus / annulation"><Input type="number" value={points.points_lost_per_cancel} onChange={e => setPoints(prev => ({...prev, points_lost_per_cancel: parseInt(e.target.value) || 0}))} /></Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Palettes de Priorite</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setPoints(prev => ({...prev, palettes: [...prev.palettes, { id: `p_${Date.now()}`, name: 'Nouveau', min_points: 0, max_points: 50, priority_access: false, max_ride_amount: 30, color: '#8B5CF6' }]}))}>
              <Plus size={14} className="mr-1" /> Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {points.palettes.map(palette => (
              <div key={palette.id} className="border border-gray-200 rounded-xl p-4" data-testid={`palette-${palette.id}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: palette.color }} />
                  <span className="font-bold text-gray-800">{palette.name}</span>
                  <Badge className="text-[10px]">{palette.min_points}-{palette.max_points} pts</Badge>
                  {palette.priority_access ? <Badge className="bg-green-100 text-green-700 text-[10px]">PRIORITE</Badge> : <Badge className="bg-red-100 text-red-700 text-[10px]">PAS DE PRIORITE</Badge>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Field label="Nom" small><Input value={palette.name} onChange={e => updatePalette(palette.id, 'name', e.target.value)} className="h-8 text-xs" /></Field>
                  <Field label="Points min" small><Input type="number" value={palette.min_points} onChange={e => updatePalette(palette.id, 'min_points', parseInt(e.target.value) || 0)} className="h-8 text-xs" /></Field>
                  <Field label="Points max" small><Input type="number" value={palette.max_points} onChange={e => updatePalette(palette.id, 'max_points', parseInt(e.target.value) || 0)} className="h-8 text-xs" /></Field>
                  <Field label="Montant max course (EUR)" small><Input type="number" value={palette.max_ride_amount} onChange={e => updatePalette(palette.id, 'max_ride_amount', parseInt(e.target.value) || 0)} className="h-8 text-xs" /></Field>
                  <Field label="Priorite" small>
                    <button onClick={() => updatePalette(palette.id, 'priority_access', !palette.priority_access)}
                      className={`w-full h-8 rounded-lg text-xs font-bold ${palette.priority_access ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {palette.priority_access ? 'OUI' : 'NON'}
                    </button>
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============= TAB 4: BONUS SOUS-CATEGORIES =============
const SubCategoryBonus = ({ bonus, setBonus }) => {
  const upd = (k, v) => setBonus((p) => ({ ...p, [k]: v }));
  const rows = [
    { id: 'particulier', label: 'Particulier', desc: 'Chauffeur voiture sans Carte VTC/Taxi' },
    { id: 'vtc', label: 'VTC', desc: 'Chauffeur avec Carte VTC' },
    { id: 'taxi', label: 'Taxi (licence)', desc: 'Chauffeur avec licence Taxi (ADS)' },
  ];
  return (
    <div className="space-y-4" data-testid="subcat-bonus">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Bonus par sous-categorie</h2>
          <p className="text-xs text-gray-500">Prime fixe (EUR) creditee au chauffeur a la fin de chaque course, selon sa sous-categorie.</p>
        </div>
        <button onClick={() => upd('enabled', !bonus.enabled)} data-testid="subcat-bonus-toggle"
          className={`w-14 h-8 rounded-full relative transition-colors ${bonus.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
          <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${bonus.enabled ? 'left-[26px]' : 'left-1'}`} />
        </button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {rows.map((r) => (
          <div key={r.id} className="border border-gray-200 rounded-xl p-4" data-testid={`subcat-${r.id}`}>
            <p className="font-bold text-gray-800">{r.label}</p>
            <p className="text-[11px] text-gray-400 mb-3">{r.desc}</p>
            <Field label="Bonus / course (EUR)" small>
              <Input type="number" step="0.5" value={bonus[r.id] ?? 0}
                onChange={(e) => upd(r.id, parseFloat(e.target.value) || 0)}
                disabled={!bonus.enabled} className="h-9" data-testid={`subcat-input-${r.id}`} />
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
};

const Field = ({ label, icon: Icon, small, children }) => (
  <div>
    <label className={`${small ? 'text-[10px] text-gray-500' : 'text-xs font-bold text-gray-700'} block mb-1`}>
      {Icon && <Icon size={12} className="inline mr-1" />}{label}
    </label>
    {children}
  </div>
);

// ============= MAIN COMPONENT =============
const EMPTY_ZONE = { country: '', state: '', city: '' };
const zoneKeyOf = (z) => {
  if (!z?.country) return '';
  const p = [z.country];
  if (z.state) p.push(z.state);
  if (z.city) p.push(z.city);
  return p.join('|');
};
const zoneLabel = (z) => (!z?.country ? 'Global (toutes zones)' : [z.city, z.state, z.country].filter(Boolean).join(', '));

const AdminRewards = () => {
  const [tab, setTab] = useState('regard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regards, setRegards] = useState([]);
  const [guarantees, setGuarantees] = useState([]);
  const [points, setPoints] = useState({ initial_points: 100, points_per_ride_accepted: 2, points_per_ride_completed: 3, points_lost_per_refuse: 5, points_lost_per_cancel: 10, palettes: [] });
  const [subCatBonus, setSubCatBonus] = useState({ enabled: false, particulier: 0, vtc: 0, taxi: 0 });
  const [zone, setZone] = useState(EMPTY_ZONE);
  const [zones, setZones] = useState([]);

  const applyConfig = (data) => {
    setRegards(data.regard_vehicles || []);
    setGuarantees(data.guarantees || []);
    setPoints(data.points || {});
    setSubCatBonus(data.sub_category_bonus || { enabled: false, particulier: 0, vtc: 0, taxi: 0 });
  };

  const loadConfig = async (z) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (z?.country) { qs.set('country', z.country); if (z.state) qs.set('state', z.state); if (z.city) qs.set('city', z.city); }
      const res = await fetch(`${API}/api/admin/rewards/config${qs.toString() ? '?' + qs.toString() : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      applyConfig(await res.json());
    } catch (err) { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  };

  const loadZones = async () => {
    try {
      const res = await fetch(`${API}/api/admin/rewards/config/zones`, { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setZones(d.zones || []); }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      await loadConfig(EMPTY_ZONE);
      if (active) loadZones();
    })();
    return () => { active = false; };
  }, []);

  const onZoneChange = (z) => { setZone(z); loadConfig(z); };

  const currentZk = zoneKeyOf(zone);
  const hasOverride = !!currentZk && zones.some((zz) => zz.zone_key === currentZk);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { regard_vehicles: regards, guarantees, points, sub_category_bonus: subCatBonus };
      if (zone.country) payload._zone = zone;
      const res = await fetch(`${API}/api/admin/rewards/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success(zone.country ? `Barème enregistré pour ${zoneLabel(zone)}` : 'Configuration globale sauvegardée !');
      loadZones();
    } catch (err) { toast.error('Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };

  const deleteOverride = async () => {
    if (!window.confirm(`Supprimer le barème spécifique de ${zoneLabel(zone)} ? La zone reviendra à la config globale.`)) return;
    try {
      const res = await fetch(`${API}/api/admin/rewards/config/zone`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ _zone: zone }),
      });
      if (!res.ok) throw new Error();
      toast.success('Override supprimé');
      await loadConfig(zone);
      loadZones();
    } catch { toast.error('Erreur'); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500" data-testid="rewards-loading">Chargement...</div>;

  return (
    <div className="p-6" data-testid="admin-rewards">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy size={28} className="text-amber-500" weight="fill" />
          <h1 className="text-2xl font-bold text-gray-800">Manage Rewards</h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#3b82f6] text-white" data-testid="save-rewards">
          {saving ? 'Sauvegarde...' : (zone.country ? 'Sauvegarder cette zone' : 'Sauvegarder')}
        </Button>
      </div>

      {/* Zone selector — global config or per-zone override (V3Cube geo-scoping) */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6" data-testid="rewards-zone-bar">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={18} weight="duotone" className="text-emerald-600" />
          <span className="text-sm font-semibold text-slate-800">Configuration par zone</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600" data-testid="rewards-current-zone">{zoneLabel(zone)}</span>
          {hasOverride && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">BARÈME SPÉCIFIQUE</span>}
          {zone.country && !hasOverride && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">HÉRITE DU GLOBAL</span>}
        </div>
        <ZoneScopePicker value={zone} onChange={onZoneChange} />
        <p className="text-xs text-slate-400 mt-2">Vide = barème global (toutes zones). Choisissez une zone pour créer/éditer un barème spécifique (ex. garantie 80€ en Martinique). Un chauffeur reçoit automatiquement le barème de sa zone, sinon le global.</p>
        {zone.country && hasOverride && (
          <button onClick={deleteOverride} className="text-xs font-semibold text-red-600 mt-2 inline-flex items-center gap-1" data-testid="rewards-delete-override">
            <Trash size={13} /> Supprimer l&apos;override de cette zone
          </button>
        )}
        {zones.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">Zones personnalisées :</span>
            {zones.map((zz) => (
              <button key={zz.zone_key} onClick={() => onZoneChange(zz.scope)} data-testid={`rewards-zone-chip-${zz.zone_key}`}
                className={`text-[11px] font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1 ${currentZk === zz.zone_key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                <MapPin size={11} weight="fill" /> {zoneLabel(zz.scope)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'regard', label: 'Regard Vehicules', icon: Car, desc: 'Voiture / Moto / Velo' },
          { id: 'guarantee', label: 'Garantie CA', icon: CurrencyEur, desc: 'Chiffre minimum garanti' },
          { id: 'points', label: 'Points Chauffeurs', icon: Star, desc: 'Systeme de priorite' },
          { id: 'subcat', label: 'Bonus Sous-categories', icon: CurrencyEur, desc: 'Particulier / VTC / Taxi' },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                tab === t.id ? 'bg-[#3b82f6] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
              data-testid={`tab-${t.id}`}>
              <Icon size={18} weight={tab === t.id ? 'fill' : 'regular'} />
              <div className="text-left">
                <p>{t.label}</p>
                <p className={`text-[10px] ${tab === t.id ? 'text-blue-200' : 'text-gray-400'}`}>{t.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {tab === 'regard' && <RegardVehicles regards={regards} setRegards={setRegards} />}
      {tab === 'guarantee' && <GuaranteeCA guarantees={guarantees} setGuarantees={setGuarantees} />}
      {tab === 'points' && <DriverPoints points={points} setPoints={setPoints} />}
      {tab === 'subcat' && <SubCategoryBonus bonus={subCatBonus} setBonus={setSubCatBonus} />}
    </div>
  );
};

export default AdminRewards;
