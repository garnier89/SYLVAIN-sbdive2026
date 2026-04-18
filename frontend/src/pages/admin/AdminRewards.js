import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Trophy, Star, Gift, Plus, Trash, CaretDown, CaretUp, Download,
  Car, Motorcycle, Bicycle, CurrencyEur, Clock, MapPin, Power,
  TrendUp, Shield, Lightning, CalendarCheck, Timer, Eye
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

// ============= TAB 1: REGARD VEHICULES =============
const RegardVehicles = () => {
  const [regards, setRegards] = useState([
    { id: 'rv_1', type: 'Voiture', icon: 'Car', active: true, start_date: '2026-04-18', end_date: '2026-05-18', start_time: '06:00', end_time: '23:00', zone: 'Martinique', bonus_per_trip: 3, min_trips: 5, description: 'Bonus course voiture' },
    { id: 'rv_2', type: 'Moto', icon: 'Motorcycle', active: false, start_date: '', end_date: '', start_time: '08:00', end_time: '22:00', zone: 'Paris', bonus_per_trip: 2, min_trips: 8, description: 'Bonus course moto' },
    { id: 'rv_3', type: 'Velo', icon: 'Bicycle', active: false, start_date: '', end_date: '', start_time: '07:00', end_time: '21:00', zone: 'Fort-de-France', bonus_per_trip: 1.5, min_trips: 10, description: 'Bonus course velo' },
  ]);
  const [expanded, setExpanded] = useState('rv_1');

  const icons = { Car, Motorcycle, Bicycle };
  const colors = { Car: '#3B82F6', Motorcycle: '#F59E0B', Bicycle: '#10B981' };

  const updateRegard = (id, field, value) => setRegards(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const toggleActive = (id) => setRegards(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Regard Vehicules</h2>
          <p className="text-xs text-gray-500">Activez et configurez les bonus par type de vehicule</p>
        </div>
      </div>

      {regards.map(regard => {
        const Icon = icons[regard.icon] || Car;
        const color = colors[regard.icon] || '#3B82F6';
        const isExp = expanded === regard.id;
        return (
          <div key={regard.id} className="border border-gray-200 rounded-xl overflow-hidden" data-testid={`regard-${regard.id}`}>
            <button onClick={() => setExpanded(isExp ? null : regard.id)}
              className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
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
                {/* Activation Toggle */}
                <div className="flex items-center justify-between mb-5 p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Power size={18} className={regard.active ? 'text-green-500' : 'text-gray-400'} />
                    <span className="text-sm font-bold text-gray-800">Activation du Regard {regard.type}</span>
                  </div>
                  <button onClick={() => toggleActive(regard.id)}
                    className={`w-14 h-8 rounded-full relative transition-colors ${regard.active ? 'bg-green-500' : 'bg-gray-300'}`}
                    data-testid={`toggle-${regard.id}`}>
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${regard.active ? 'left-[26px]' : 'left-1'}`} />
                  </button>
                </div>

                {/* Date/Time/Zone */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1"><CalendarCheck size={12} className="inline mr-1" />Date de debut</label>
                    <Input type="date" value={regard.start_date} onChange={e => updateRegard(regard.id, 'start_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1"><CalendarCheck size={12} className="inline mr-1" />Date de fin</label>
                    <Input type="date" value={regard.end_date} onChange={e => updateRegard(regard.id, 'end_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1"><MapPin size={12} className="inline mr-1" />Zone d'activation</label>
                    <select value={regard.zone} onChange={e => updateRegard(regard.id, 'zone', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="Martinique">Martinique</option>
                      <option value="Guadeloupe">Guadeloupe</option>
                      <option value="Guyane">Guyane</option>
                      <option value="Reunion">Reunion</option>
                      <option value="Paris">Paris / Ile-de-France</option>
                      <option value="Fort-de-France">Fort-de-France</option>
                      <option value="Toutes">Toutes les zones</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1"><Clock size={12} className="inline mr-1" />Heure debut</label>
                    <Input type="time" value={regard.start_time} onChange={e => updateRegard(regard.id, 'start_time', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1"><Clock size={12} className="inline mr-1" />Heure fin</label>
                    <Input type="time" value={regard.end_time} onChange={e => updateRegard(regard.id, 'end_time', e.target.value)} />
                  </div>
                </div>

                {/* Bonus config */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Bonus par course (EUR)</label>
                    <Input type="number" step="0.5" value={regard.bonus_per_trip} onChange={e => updateRegard(regard.id, 'bonus_per_trip', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Courses minimum</label>
                    <Input type="number" value={regard.min_trips} onChange={e => updateRegard(regard.id, 'min_trips', parseInt(e.target.value) || 0)} />
                  </div>
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
const GuaranteeCA = () => {
  const [guarantees, setGuarantees] = useState([
    { id: 'g1', name: 'Garantie Journee Standard', active: true, start_hour: '12:00', end_hour: '20:00', min_revenue: 59, acceptance_rate: 80, max_cancellation: 10, zone: 'Martinique', start_date: '2026-04-18', end_date: '2026-05-31', description: 'Entre 12h et 20h, CA min 59EUR' },
    { id: 'g2', name: 'Garantie Soiree', active: false, start_hour: '18:00', end_hour: '02:00', min_revenue: 40, acceptance_rate: 75, max_cancellation: 15, zone: 'Paris', start_date: '', end_date: '', description: 'Soiree/nuit, CA min 40EUR' },
  ]);
  const [expanded, setExpanded] = useState('g1');

  const update = (id, field, value) => setGuarantees(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Garantie de Chiffre d'Affaires</h2>
          <p className="text-xs text-gray-500">L'application complete la difference si le chauffeur n'atteint pas le CA minimum</p>
        </div>
        <Button variant="outline" onClick={() => setGuarantees(prev => [...prev, { id: `g_${Date.now()}`, name: 'Nouvelle garantie', active: false, start_hour: '08:00', end_hour: '20:00', min_revenue: 50, acceptance_rate: 80, max_cancellation: 10, zone: 'Toutes', start_date: '', end_date: '', description: '' }])}>
          <Plus size={14} className="mr-1" /> Ajouter
        </Button>
      </div>

      {/* Example card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-2">
        <p className="text-sm text-amber-900 font-medium">Exemple : Garantie 59 EUR entre 12h-20h</p>
        <p className="text-xs text-amber-700 mt-1">Si un chauffeur fait 30 EUR entre 12h et 20h, l'application complete les <b>29 EUR</b> manquants. Le chauffeur doit maintenir un taux d'acceptation &ge;80% et un taux d'annulation &le;10%.</p>
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
                  <span className="text-sm font-bold text-gray-800">Activer la garantie</span>
                  <button onClick={() => update(g.id, 'active', !g.active)}
                    className={`w-14 h-8 rounded-full relative transition-colors ${g.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${g.active ? 'left-[26px]' : 'left-1'}`} />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">CA Minimum (EUR)</label>
                    <Input type="number" value={g.min_revenue} onChange={e => update(g.id, 'min_revenue', parseFloat(e.target.value) || 0)} /></div>
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">Heure debut</label>
                    <Input type="time" value={g.start_hour} onChange={e => update(g.id, 'start_hour', e.target.value)} /></div>
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">Heure fin</label>
                    <Input type="time" value={g.end_hour} onChange={e => update(g.id, 'end_hour', e.target.value)} /></div>
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">Taux d'acceptation min (%)</label>
                    <Input type="number" value={g.acceptance_rate} onChange={e => update(g.id, 'acceptance_rate', parseInt(e.target.value) || 0)} /></div>
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">Taux d'annulation max (%)</label>
                    <Input type="number" value={g.max_cancellation} onChange={e => update(g.id, 'max_cancellation', parseInt(e.target.value) || 0)} /></div>
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">Zone</label>
                    <select value={g.zone} onChange={e => update(g.id, 'zone', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="Martinique">Martinique</option><option value="Guadeloupe">Guadeloupe</option><option value="Paris">Paris</option><option value="Toutes">Toutes</option>
                    </select></div>
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">Date debut</label>
                    <Input type="date" value={g.start_date} onChange={e => update(g.id, 'start_date', e.target.value)} /></div>
                  <div><label className="text-xs font-bold text-gray-700 block mb-1">Date fin</label>
                    <Input type="date" value={g.end_date} onChange={e => update(g.id, 'end_date', e.target.value)} /></div>
                </div>
                <Button variant="outline" className="text-red-500 border-red-200 mt-4" onClick={() => setGuarantees(prev => prev.filter(x => x.id !== g.id))}><Trash size={14} className="mr-1" /> Supprimer</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============= TAB 3: POINTS CHAUFFEURS =============
const DriverPoints = () => {
  const [config, setConfig] = useState({
    initial_points: 100, points_per_ride_accepted: 2, points_lost_per_refuse: 5, points_lost_per_cancel: 10,
    palettes: [
      { id: 'p1', name: 'Debutant', min_points: 0, max_points: 30, priority_access: false, max_ride_amount: 20, color: '#EF4444' },
      { id: 'p2', name: 'Standard', min_points: 31, max_points: 60, priority_access: false, max_ride_amount: 50, color: '#F59E0B' },
      { id: 'p3', name: 'Confirme', min_points: 61, max_points: 80, priority_access: true, max_ride_amount: 100, color: '#3B82F6' },
      { id: 'p4', name: 'Expert', min_points: 81, max_points: 100, priority_access: true, max_ride_amount: 999, color: '#10B981' },
    ]
  });

  const updatePalette = (id, field, value) => {
    setConfig(prev => ({ ...prev, palettes: prev.palettes.map(p => p.id === id ? { ...p, [field]: value } : p) }));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Systeme de Points Chauffeurs</h2>
        <p className="text-xs text-gray-500">A l'inscription, chaque chauffeur recoit des points. Les refus et annulations font perdre des points et la priorite sur les courses.</p>
      </div>

      {/* Points Rules */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Regles de Points</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label className="text-xs font-bold text-gray-700 block mb-1">Points initiaux</label>
              <Input type="number" value={config.initial_points} onChange={e => setConfig(prev => ({...prev, initial_points: parseInt(e.target.value) || 0}))} /></div>
            <div><label className="text-xs font-bold text-gray-700 block mb-1">Points gagnes / course acceptee</label>
              <Input type="number" value={config.points_per_ride_accepted} onChange={e => setConfig(prev => ({...prev, points_per_ride_accepted: parseInt(e.target.value) || 0}))} /></div>
            <div><label className="text-xs font-bold text-gray-700 block mb-1">Points perdus / refus</label>
              <Input type="number" value={config.points_lost_per_refuse} onChange={e => setConfig(prev => ({...prev, points_lost_per_refuse: parseInt(e.target.value) || 0}))} /></div>
            <div><label className="text-xs font-bold text-gray-700 block mb-1">Points perdus / annulation</label>
              <Input type="number" value={config.points_lost_per_cancel} onChange={e => setConfig(prev => ({...prev, points_lost_per_cancel: parseInt(e.target.value) || 0}))} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Palettes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Palettes de Priorite</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setConfig(prev => ({...prev, palettes: [...prev.palettes, { id: `p_${Date.now()}`, name: 'Nouveau', min_points: 0, max_points: 50, priority_access: false, max_ride_amount: 30, color: '#8B5CF6' }]}))}>
              <Plus size={14} className="mr-1" /> Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {config.palettes.map(palette => (
              <div key={palette.id} className="border border-gray-200 rounded-xl p-4" data-testid={`palette-${palette.id}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: palette.color }} />
                  <span className="font-bold text-gray-800">{palette.name}</span>
                  <Badge className="text-[10px]">{palette.min_points}-{palette.max_points} pts</Badge>
                  {palette.priority_access && <Badge className="bg-green-100 text-green-700 text-[10px]">PRIORITE</Badge>}
                  {!palette.priority_access && <Badge className="bg-red-100 text-red-700 text-[10px]">PAS DE PRIORITE</Badge>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div><label className="text-[10px] text-gray-500 block mb-0.5">Nom</label>
                    <Input value={palette.name} onChange={e => updatePalette(palette.id, 'name', e.target.value)} className="h-8 text-xs" /></div>
                  <div><label className="text-[10px] text-gray-500 block mb-0.5">Points min</label>
                    <Input type="number" value={palette.min_points} onChange={e => updatePalette(palette.id, 'min_points', parseInt(e.target.value) || 0)} className="h-8 text-xs" /></div>
                  <div><label className="text-[10px] text-gray-500 block mb-0.5">Points max</label>
                    <Input type="number" value={palette.max_points} onChange={e => updatePalette(palette.id, 'max_points', parseInt(e.target.value) || 0)} className="h-8 text-xs" /></div>
                  <div><label className="text-[10px] text-gray-500 block mb-0.5">Montant max course (EUR)</label>
                    <Input type="number" value={palette.max_ride_amount} onChange={e => updatePalette(palette.id, 'max_ride_amount', parseInt(e.target.value) || 0)} className="h-8 text-xs" /></div>
                  <div><label className="text-[10px] text-gray-500 block mb-0.5">Priorite</label>
                    <button onClick={() => updatePalette(palette.id, 'priority_access', !palette.priority_access)}
                      className={`w-full h-8 rounded-lg text-xs font-bold ${palette.priority_access ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {palette.priority_access ? 'OUI' : 'NON'}
                    </button></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============= MAIN COMPONENT =============
const AdminRewards = () => {
  const [tab, setTab] = useState('regard');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/admin/service-config/rewards`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ settings: { type: tab, saved_at: new Date().toISOString() } }),
      });
      toast.success('Configuration sauvegardee !');
    } catch (err) { toast.error('Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-6" data-testid="admin-rewards">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy size={28} className="text-amber-500" weight="fill" />
          <h1 className="text-2xl font-bold text-gray-800">Manage Rewards</h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#3b82f6] text-white" data-testid="save-rewards">
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'regard', label: 'Regard Vehicules', icon: Car, desc: 'Voiture / Moto / Velo' },
          { id: 'guarantee', label: 'Garantie CA', icon: CurrencyEur, desc: 'Chiffre minimum garanti' },
          { id: 'points', label: 'Points Chauffeurs', icon: Star, desc: 'Systeme de priorite' },
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

      {tab === 'regard' && <RegardVehicles />}
      {tab === 'guarantee' && <GuaranteeCA />}
      {tab === 'points' && <DriverPoints />}
    </div>
  );
};

export default AdminRewards;
