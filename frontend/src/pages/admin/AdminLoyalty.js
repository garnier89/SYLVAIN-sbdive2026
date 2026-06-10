import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Trophy, Crown, FloppyDisk, Gift, Plus, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminLoyalty = () => {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const res = await fetch(`${API}/api/loyalty/admin/config`, { credentials: 'include' });
      if (res.ok) setCfg(await res.json());
      else toast.error('Accès refusé');
    } catch { toast.error('Erreur réseau'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/loyalty/admin/config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (res.ok) { setCfg(await res.json()); toast.success('Programme de fidélité enregistré !'); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const setTier = (i, k, v) => {
    const tiers = cfg.tiers.map((t, idx) => idx === i ? { ...t, [k]: v } : t);
    setCfg({ ...cfg, tiers });
  };

  const rewards = cfg.rewards || [];
  const setReward = (i, k, v) => {
    const next = rewards.map((r, idx) => idx === i ? { ...r, [k]: v } : r);
    setCfg({ ...cfg, rewards: next });
  };
  const addReward = () => setCfg({
    ...cfg,
    rewards: [...rewards, { id: `reward_${Date.now()}`, name: 'Nouvelle récompense', cost_points: 200,
                            type: 'wallet_credit', value: 2, min_tier: (cfg.tiers?.[0]?.key) || 'silver' }],
  });
  const removeReward = (i) => setCfg({ ...cfg, rewards: rewards.filter((_, idx) => idx !== i) });

  if (!cfg) return <div className="p-6 text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="p-6 space-y-5" data-testid="admin-loyalty">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Trophy size={26} weight="fill" className="text-amber-500" /> Statuts de fidélité
          </h1>
          <p className="text-sm text-gray-500 mt-1">Points & paliers Silver → Gold → Platinum → Diamond (clients & chauffeurs).</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Activé</span>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} className="data-[state=checked]:bg-amber-500" data-testid="loyalty-enabled-toggle" />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Attribution des points</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Points par course" value={cfg.points_per_ride} onChange={(v) => setCfg({ ...cfg, points_per_ride: v })} testId="points-per-ride" />
          <Field label="Points par commande" value={cfg.points_per_order} onChange={(v) => setCfg({ ...cfg, points_per_order: v })} testId="points-per-order" />
          <Field label="Points par livraison (colis)" value={cfg.points_per_delivery} onChange={(v) => setCfg({ ...cfg, points_per_delivery: v })} testId="points-per-delivery" />
          <Field label="Bonus 1ère course" value={cfg.bonus_first_ride} onChange={(v) => setCfg({ ...cfg, bonus_first_ride: v })} testId="bonus-first-ride" />
          <Field label="Bonus parrainage" value={cfg.bonus_referral} onChange={(v) => setCfg({ ...cfg, bonus_referral: v })} testId="bonus-referral" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Gift size={18} weight="fill" className="text-emerald-500" /> Catalogue de récompenses</CardTitle>
            <Button onClick={addReward} variant="outline" size="sm" data-testid="add-reward-btn"><Plus size={14} className="mr-1" /> Ajouter</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rewards.length === 0 && <p className="text-sm text-gray-400">Aucune récompense. Cliquez sur « Ajouter ».</p>}
          {rewards.map((r, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-4" data-testid={`reward-edit-${i}`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Nom</label>
                  <Input value={r.name} onChange={(e) => setReward(i, 'name', e.target.value)} data-testid={`reward-${i}-name`} />
                </div>
                <Field label="Coût (points)" value={r.cost_points} onChange={(v) => setReward(i, 'cost_points', v)} testId={`reward-${i}-cost`} />
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Palier min.</label>
                  <select value={r.min_tier} onChange={(e) => setReward(i, 'min_tier', e.target.value)} className="w-full h-9 rounded-md border border-gray-200 text-sm px-2" data-testid={`reward-${i}-tier`}>
                    {cfg.tiers.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mt-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
                  <select value={r.type} onChange={(e) => setReward(i, 'type', e.target.value)} className="w-full h-9 rounded-md border border-gray-200 text-sm px-2" data-testid={`reward-${i}-type`}>
                    <option value="wallet_credit">Crédit SB Pay (€)</option>
                    <option value="coupon">Coupon de réduction</option>
                  </select>
                </div>
                {r.type === 'wallet_credit' ? (
                  <Field label="Montant crédité (€)" value={r.value} onChange={(v) => setReward(i, 'value', v)} testId={`reward-${i}-value`} />
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Réduction</label>
                      <select value={r.discount_type || 'Flat'} onChange={(e) => setReward(i, 'discount_type', e.target.value)} className="w-full h-9 rounded-md border border-gray-200 text-sm px-2" data-testid={`reward-${i}-disctype`}>
                        <option value="Flat">Montant fixe (€)</option>
                        <option value="Percentage">Pourcentage (%)</option>
                      </select>
                    </div>
                    <Field label="Valeur" value={r.value} onChange={(v) => setReward(i, 'value', v)} testId={`reward-${i}-disc`} />
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Service</label>
                      <select value={r.service_type || 'All'} onChange={(e) => setReward(i, 'service_type', e.target.value)} className="w-full h-9 rounded-md border border-gray-200 text-sm px-2" data-testid={`reward-${i}-service`}>
                        <option value="All">Tous</option>
                        <option value="ride">Courses</option>
                        <option value="delivery">Livraison</option>
                      </select>
                    </div>
                  </>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => removeReward(i)} variant="ghost" size="sm" className="text-red-500" data-testid={`reward-${i}-remove`}><Trash size={16} /></Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Crown size={18} weight="fill" className="text-amber-500" /> Paliers & avantages</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {cfg.tiers.map((t, i) => (
            <div key={t.key} className="rounded-xl border border-gray-200 p-4" data-testid={`tier-row-${t.key}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-4 h-4 rounded-full" style={{ background: t.color }} />
                <span className="font-bold text-gray-800">{t.name}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Seuil (points)" value={t.min_points} onChange={(v) => setTier(i, 'min_points', v)} testId={`tier-${t.key}-min`} />
                <Field label="Commission -% (chauffeur)" value={t.driver_commission_discount_pct} onChange={(v) => setTier(i, 'driver_commission_discount_pct', v)} testId={`tier-${t.key}-comm`} />
                <Field label="Réduction -% (client)" value={t.client_discount_pct} onChange={(v) => setTier(i, 'client_discount_pct', v)} testId={`tier-${t.key}-disc`} />
                <Field label="Priorité dispatch" value={t.dispatch_priority} onChange={(v) => setTier(i, 'dispatch_priority', v)} testId={`tier-${t.key}-prio`} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-loyalty-btn">
          <FloppyDisk size={16} weight="fill" className="mr-2" />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, testId }) => (
  <div>
    <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
    <Input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} data-testid={testId} />
  </div>
);

export default AdminLoyalty;
