import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ShareNetwork, CurrencyEur, Users, Gift, Clock, Star } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const DEFAULTS = {
  enabled: true, currency: 'EUR',
  reward_client_client: 5.0, reward_driver_client: 5.0,
  reward_client_driver: 5.0, reward_driver_driver: 50.0,
  client_rides_required: 1, driver_driver_rides_required: 20, driver_driver_window_days: 30,
};

const REVIEW_DEFAULTS = {
  enabled: true, min_rides: 2,
  android_url: '', ios_url: '',
};

const AdminReferral = () => {
  const [config, setConfig] = useState(DEFAULTS);
  const [stats, setStats] = useState({ total_referrals: 0, total_earned: 0 });
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(REVIEW_DEFAULTS);
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    loadConfig();
    loadStats();
    loadReview();
  }, []);

  const loadReview = async () => {
    try {
      const res = await fetch(`${API}/api/config/store-review`, { credentials: 'include' });
      if (res.ok) setReview({ ...REVIEW_DEFAULTS, ...(await res.json()) });
    } catch (err) { console.error('Failed to load review config:', err); }
  };

  const saveReview = async () => {
    setSavingReview(true);
    try {
      const res = await fetch(`${API}/api/config/admin/store-review`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review),
      });
      if (res.ok) { setReview({ ...REVIEW_DEFAULTS, ...(await res.json()) }); toast.success('Rappel d\'évaluation enregistré !'); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSavingReview(false); }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API}/api/referral/config`, { credentials: 'include' });
      if (res.ok) setConfig({ ...DEFAULTS, ...(await res.json()) });
    } catch (err) { console.error('Failed to load config:', err); }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`${API}/api/referral/stats`, { credentials: 'include' });
      if (res.ok) setStats(await res.json());
    } catch (err) { console.error('Failed:', err); }
  };

  const num = (k) => (e) => setConfig({ ...config, [k]: parseFloat(e.target.value) || 0 });
  const int = (k) => (e) => setConfig({ ...config, [k]: parseInt(e.target.value, 10) || 0 });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/referral/config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) { setConfig({ ...DEFAULTS, ...(await res.json()) }); toast.success('Paramètres de parrainage enregistrés !'); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-6" data-testid="admin-referral">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Parrainage</h1>
      <p className="text-sm text-gray-500 mb-6">Codes basés sur le nom · récompenses conditionnelles configurables</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users size={16} /> Total parrainages</div>
          <p className="text-2xl font-bold text-gray-900" data-testid="stat-total-referrals">{stats.total_referrals || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><CurrencyEur size={16} /> Montant distribué</div>
          <p className="text-2xl font-bold text-green-600">{(stats.total_earned || 0).toFixed(2)} {config.currency}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Gift size={16} /> Bonus chauffeur→chauffeur</div>
          <p className="text-2xl font-bold text-blue-600">{config.reward_driver_driver} {config.currency}</p>
        </CardContent></Card>
      </div>

      <Card className="max-w-3xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShareNetwork size={18} /> Configuration du parrainage</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} className="w-4 h-4 rounded" data-testid="referral-enabled-toggle" />
            <span className="text-sm font-medium text-gray-700">Activer le système de parrainage</span>
          </label>

          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">Montants des récompenses (par personne, {config.currency})</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Client → Client</label>
                <Input type="number" value={config.reward_client_client} onChange={num('reward_client_client')} data-testid="reward-client-client" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Chauffeur → Client</label>
                <Input type="number" value={config.reward_driver_client} onChange={num('reward_driver_client')} data-testid="reward-driver-client" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Client → Chauffeur</label>
                <Input type="number" value={config.reward_client_driver} onChange={num('reward_client_driver')} data-testid="reward-client-driver" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Chauffeur → Chauffeur</label>
                <Input type="number" value={config.reward_driver_driver} onChange={num('reward_driver_driver')} data-testid="reward-driver-driver" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2"><Clock size={15} /> Conditions de validation</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Courses client (filleul)</label>
                <Input type="number" value={config.client_rides_required} onChange={int('client_rides_required')} data-testid="client-rides-required" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Courses chauffeur→chauffeur</label>
                <Input type="number" value={config.driver_driver_rides_required} onChange={int('driver_driver_rides_required')} data-testid="dd-rides-required" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Fenêtre (jours)</label>
                <Input type="number" value={config.driver_driver_window_days} onChange={int('driver_driver_window_days')} data-testid="dd-window-days" />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="bg-[#3b82f6] text-white" data-testid="save-referral-btn">
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-3xl mt-6">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star size={18} weight="fill" className="text-amber-400" /> Rappel d'évaluation (Play Store / App Store)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">Une invitation discrète à noter l'app s'affiche sur le reçu après N courses (4-5★ → store, 1-3★ → retour interne).</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={review.enabled} onChange={e => setReview({ ...review, enabled: e.target.checked })} className="w-4 h-4 rounded" data-testid="review-enabled-toggle" />
            <span className="text-sm font-medium text-gray-700">Activer le rappel d'évaluation</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Afficher après (courses)</label>
              <Input type="number" value={review.min_rides} onChange={e => setReview({ ...review, min_rides: parseInt(e.target.value, 10) || 1 })} data-testid="review-min-rides" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">URL Google Play</label>
              <Input value={review.android_url} onChange={e => setReview({ ...review, android_url: e.target.value })} placeholder="https://play.google.com/store/apps/details?id=…" data-testid="review-android-url" />
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs font-medium text-gray-600 block mb-1">URL App Store</label>
              <Input value={review.ios_url} onChange={e => setReview({ ...review, ios_url: e.target.value })} placeholder="https://apps.apple.com/…" data-testid="review-ios-url" />
            </div>
          </div>
          <Button onClick={saveReview} disabled={savingReview} className="bg-[#3b82f6] text-white" data-testid="save-review-btn">
            {savingReview ? 'Enregistrement…' : 'Sauvegarder'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReferral;
