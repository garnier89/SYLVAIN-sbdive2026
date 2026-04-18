import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Trophy, Star, Gift, Users, CurrencyEur, TrendUp, Plus, Trash, PencilSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminRewards = () => {
  const [config, setConfig] = useState({
    enabled: true,
    points_per_ride: 10,
    points_per_euro: 1,
    points_per_referral: 50,
    points_per_review: 5,
    min_redeem: 100,
    point_value_eur: 0.01,
    driver_bonus_per_trip: 2,
    driver_weekly_target: 50,
    driver_weekly_bonus: 25,
  });
  const [tiers, setTiers] = useState([
    { id: 't1', name: 'Bronze', min_points: 0, discount_pct: 0, color: '#CD7F32', perks: 'Acces standard' },
    { id: 't2', name: 'Argent', min_points: 500, discount_pct: 5, color: '#C0C0C0', perks: '5% reduction, Support prioritaire' },
    { id: 't3', name: 'Or', min_points: 2000, discount_pct: 10, color: '#FFD700', perks: '10% reduction, Courses prioritaires, Annulations gratuites' },
    { id: 't4', name: 'Platine', min_points: 5000, discount_pct: 15, color: '#E5E4E2', perks: '15% reduction, Vehicule premium, Support VIP 24/7' },
  ]);
  const [stats, setStats] = useState({ total_points: 0, total_redeemed: 0, active_users: 0 });
  const [showTierForm, setShowTierForm] = useState(false);
  const [tierForm, setTierForm] = useState({ name: '', min_points: 0, discount_pct: 0, color: '#3B82F6', perks: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API}/api/admin/service-config/rewards`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          if (data.settings.config) setConfig(prev => ({ ...prev, ...data.settings.config }));
          if (data.settings.tiers) setTiers(data.settings.tiers);
        }
      }
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/admin/service-config/rewards`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ settings: { config, tiers } }),
      });
      toast.success('Configuration des recompenses sauvegardee !');
    } catch (err) { toast.error('Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };

  const addTier = () => {
    setTiers(prev => [...prev, { ...tierForm, id: `t_${Date.now()}` }]);
    setShowTierForm(false);
    setTierForm({ name: '', min_points: 0, discount_pct: 0, color: '#3B82F6', perks: '' });
  };

  const removeTier = (id) => setTiers(prev => prev.filter(t => t.id !== id));

  return (
    <div className="p-6" data-testid="admin-rewards">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
            <Trophy size={24} className="text-amber-500" weight="duotone" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Programme de Recompenses</h1>
            <p className="text-sm text-gray-500">Fidelite utilisateurs et bonus chauffeurs</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#3b82f6] text-white" data-testid="save-rewards-btn">
          {saving ? 'Sauvegarde...' : 'Sauvegarder tout'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Star size={16} /> Points distribues</div>
          <p className="text-2xl font-bold text-amber-600">{stats.total_points.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Gift size={16} /> Points utilises</div>
          <p className="text-2xl font-bold text-green-600">{stats.total_redeemed.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users size={16} /> Utilisateurs actifs</div>
          <p className="text-2xl font-bold text-blue-600">{stats.active_users}</p>
        </CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Points Configuration */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star size={18} className="text-amber-500" /> Regles de points (Utilisateurs)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={config.enabled} onChange={e => setConfig({...config, enabled: e.target.checked})} className="w-4 h-4 rounded" />
              <span className="text-sm font-medium text-gray-700">Programme actif</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-500 block mb-1">Points par course</label>
                <Input type="number" value={config.points_per_ride} onChange={e => setConfig({...config, points_per_ride: parseInt(e.target.value) || 0})} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Points par EUR depense</label>
                <Input type="number" value={config.points_per_euro} onChange={e => setConfig({...config, points_per_euro: parseInt(e.target.value) || 0})} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Points par parrainage</label>
                <Input type="number" value={config.points_per_referral} onChange={e => setConfig({...config, points_per_referral: parseInt(e.target.value) || 0})} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Points par avis</label>
                <Input type="number" value={config.points_per_review} onChange={e => setConfig({...config, points_per_review: parseInt(e.target.value) || 0})} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Min. pour echanger</label>
                <Input type="number" value={config.min_redeem} onChange={e => setConfig({...config, min_redeem: parseInt(e.target.value) || 0})} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Valeur 1 point (EUR)</label>
                <Input type="number" step="0.01" value={config.point_value_eur} onChange={e => setConfig({...config, point_value_eur: parseFloat(e.target.value) || 0})} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Driver Bonuses */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendUp size={18} className="text-green-500" /> Bonus Chauffeurs</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-500 block mb-1">Bonus par course (EUR)</label>
                <Input type="number" step="0.5" value={config.driver_bonus_per_trip} onChange={e => setConfig({...config, driver_bonus_per_trip: parseFloat(e.target.value) || 0})} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Objectif hebdo (courses)</label>
                <Input type="number" value={config.driver_weekly_target} onChange={e => setConfig({...config, driver_weekly_target: parseInt(e.target.value) || 0})} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Bonus objectif (EUR)</label>
                <Input type="number" step="0.5" value={config.driver_weekly_bonus} onChange={e => setConfig({...config, driver_weekly_bonus: parseFloat(e.target.value) || 0})} /></div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs text-green-800">Les chauffeurs gagnent <b>{config.driver_bonus_per_trip}EUR</b> par course + <b>{config.driver_weekly_bonus}EUR</b> bonus s'ils atteignent {config.driver_weekly_target} courses/semaine.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loyalty Tiers */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Trophy size={18} className="text-amber-500" /> Niveaux de fidelite</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowTierForm(!showTierForm)} data-testid="add-tier-btn"><Plus size={14} className="mr-1" /> Ajouter</Button>
          </div>
        </CardHeader>
        <CardContent>
          {showTierForm && (
            <div className="grid grid-cols-5 gap-2 mb-4 p-3 bg-gray-50 rounded-xl">
              <Input placeholder="Nom" value={tierForm.name} onChange={e => setTierForm({...tierForm, name: e.target.value})} />
              <Input type="number" placeholder="Points min" value={tierForm.min_points} onChange={e => setTierForm({...tierForm, min_points: parseInt(e.target.value) || 0})} />
              <Input type="number" placeholder="Reduction %" value={tierForm.discount_pct} onChange={e => setTierForm({...tierForm, discount_pct: parseInt(e.target.value) || 0})} />
              <Input placeholder="Avantages" value={tierForm.perks} onChange={e => setTierForm({...tierForm, perks: e.target.value})} />
              <Button onClick={addTier} className="bg-[#3b82f6] text-white">Ajouter</Button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map(tier => (
              <div key={tier.id} className="border border-gray-200 rounded-xl p-4 relative group" data-testid={`tier-${tier.id}`}>
                <button onClick={() => removeTier(tier.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"><Trash size={14} /></button>
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 mx-auto" style={{ backgroundColor: tier.color + '25' }}>
                  <Trophy size={24} style={{ color: tier.color }} weight="fill" />
                </div>
                <h3 className="text-center font-bold text-gray-900">{tier.name}</h3>
                <p className="text-center text-xs text-gray-500 mt-1">{tier.min_points}+ points</p>
                <div className="mt-3 text-center">
                  <Badge className="bg-blue-50 text-blue-700">{tier.discount_pct}% reduction</Badge>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 text-center leading-relaxed">{tier.perks}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminRewards;
