import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ShareNetwork, CurrencyEur, Users, Gift, CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminReferral = () => {
  const [config, setConfig] = useState({
    enabled: true, amount_per_referral: 5.0, currency: 'EUR',
    max_referrals: 100, min_rides_to_qualify: 1, bonus_driver: 3.0,
  });
  const [stats, setStats] = useState({ total_referrals: 0, total_earned: 0 });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API}/api/referral/stats`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setStats(data); }
    } catch (err) { console.error('Failed:', err); }
  };

  const handleSave = () => { toast.success('Parametres de parrainage sauvegardes !'); };

  return (
    <div className="p-6" data-testid="admin-referral">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">MLM Referral Settings</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users size={16} /> Total parrainages</div>
          <p className="text-2xl font-bold text-gray-900">{stats.total_referrals || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><CurrencyEur size={16} /> Montant distribue</div>
          <p className="text-2xl font-bold text-green-600">{(stats.total_earned || 0).toFixed(2)} EUR</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Gift size={16} /> Bonus par parrainage</div>
          <p className="text-2xl font-bold text-blue-600">{config.amount_per_referral} EUR</p>
        </CardContent></Card>
      </div>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShareNetwork size={18} /> Configuration du parrainage</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={config.enabled} onChange={e => setConfig({...config, enabled: e.target.checked})} className="w-4 h-4 rounded" />
            <span className="text-sm font-medium text-gray-700">Activer le systeme de parrainage</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Bonus parrain (EUR)</label>
              <Input type="number" value={config.amount_per_referral} onChange={e => setConfig({...config, amount_per_referral: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Bonus chauffeur (EUR)</label>
              <Input type="number" value={config.bonus_driver} onChange={e => setConfig({...config, bonus_driver: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Max parrainages</label>
              <Input type="number" value={config.max_referrals} onChange={e => setConfig({...config, max_referrals: parseInt(e.target.value) || 0})} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Courses min. pour eligibilite</label>
              <Input type="number" value={config.min_rides_to_qualify} onChange={e => setConfig({...config, min_rides_to_qualify: parseInt(e.target.value) || 0})} />
            </div>
          </div>
          <Button onClick={handleSave} className="bg-[#3b82f6] text-white" data-testid="save-referral-btn">Sauvegarder</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReferral;
