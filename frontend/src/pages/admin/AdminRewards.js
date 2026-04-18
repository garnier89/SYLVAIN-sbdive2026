import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Trophy, Star, Gift, Plus, Trash, PencilSimple, CaretDown, CaretUp, Download } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const TIER_COLORS = {
  Silver: { bg: 'bg-gradient-to-r from-gray-300 to-gray-400', text: 'text-white', badge: '#C0C0C0' },
  Gold: { bg: 'bg-gradient-to-r from-amber-400 to-amber-500', text: 'text-white', badge: '#FFD700' },
  Platinum: { bg: 'bg-gradient-to-r from-gray-500 to-gray-600', text: 'text-white', badge: '#E5E4E2' },
  Diamond: { bg: 'bg-gradient-to-r from-blue-400 to-blue-500', text: 'text-white', badge: '#B9F2FF' },
};

const defaultTiers = [
  { id: 't1', level: 'Silver', status: 'Active', min_trips: 10, ratings: 4.0, cancellation_rate: 30, acceptance_rate: 70, reward_amount: 50, image: null },
  { id: 't2', level: 'Gold', status: 'Active', min_trips: 25, ratings: 4.5, cancellation_rate: 20, acceptance_rate: 80, reward_amount: 100, image: null },
  { id: 't3', level: 'Platinum', status: 'Active', min_trips: 50, ratings: 4.7, cancellation_rate: 10, acceptance_rate: 90, reward_amount: 200, image: null },
];

const AdminRewards = () => {
  const [tab, setTab] = useState('settings');
  const [tiers, setTiers] = useState(defaultTiers);
  const [expanded, setExpanded] = useState('t1');
  const [saving, setSaving] = useState(false);

  // Reports data
  const [reports, setReports] = useState([
    { id: 'r1', driver_name: 'Jean Dupont', level: 'Silver', trips: 10, acceptance_rate: 82, cancellation_rate: 0, ratings: 5.0, date: '08 Apr, 2026 (Wed)' },
    { id: 'r2', driver_name: 'Amadou Diallo', level: 'Platinum', trips: 16, acceptance_rate: 83, cancellation_rate: 0, ratings: 5.0, date: '17 Mar, 2026 (Tue)' },
    { id: 'r3', driver_name: 'Sophie Martin', level: 'Gold', trips: 15, acceptance_rate: 82, cancellation_rate: 0, ratings: 5.0, date: '17 Mar, 2026 (Tue)' },
    { id: 'r4', driver_name: 'Mohamed Ben Ali', level: 'Silver', trips: 13, acceptance_rate: 100, cancellation_rate: 0, ratings: 5.0, date: '09 Mar, 2026 (Mon)' },
  ]);
  const [reportFilter, setReportFilter] = useState('');

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API}/api/admin/service-config/rewards`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.settings?.tiers?.length > 0) setTiers(data.settings.tiers);
      }
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/admin/service-config/rewards`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ settings: { tiers, campaign: 'User rewards' } }),
      });
      toast.success('Reward Settings sauvegardees !');
    } catch (err) { toast.error('Erreur'); }
    finally { setSaving(false); }
  };

  const updateTier = (id, field, value) => {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const addTier = () => {
    const newTier = { id: `t_${Date.now()}`, level: 'Diamond', status: 'Active', min_trips: 100, ratings: 4.8, cancellation_rate: 5, acceptance_rate: 95, reward_amount: 500, image: null };
    setTiers(prev => [...prev, newTier]);
    setExpanded(newTier.id);
  };

  const removeTier = (id) => { if (window.confirm('Supprimer ce niveau ?')) setTiers(prev => prev.filter(t => t.id !== id)); };

  const filteredReports = reports.filter(r => !reportFilter || (r.driver_name || '').toLowerCase().includes(reportFilter.toLowerCase()) || (r.level || '').toLowerCase().includes(reportFilter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-rewards">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Rewards</h1>
        <div className="flex gap-2">
          <Button variant={tab === 'reports' ? 'default' : 'outline'} className={tab === 'reports' ? 'bg-[#3b82f6] text-white' : ''} onClick={() => setTab('reports')} data-testid="tab-reports">Reports</Button>
          <Button variant={tab === 'settings' ? 'default' : 'outline'} className={tab === 'settings' ? 'bg-[#3b82f6] text-white' : ''} onClick={() => setTab('settings')} data-testid="tab-settings">Settings</Button>
        </div>
      </div>

      {/* ===== REPORTS TAB ===== */}
      {tab === 'reports' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-5">
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All Levels</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
            </select>
            <Button variant="outline" onClick={() => {}}>SEARCH</Button>
            <Button variant="outline" onClick={() => setReportFilter('')}>RESET</Button>
            <Button variant="outline" className="ml-auto"><Download size={16} className="mr-1" /> EXPORT</Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 cursor-pointer">Level <span className="text-gray-300">&#x25B4;&#x25BE;</span></th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600">Trip</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600 cursor-pointer">Acceptance Rate <span className="text-gray-300">&#x25B4;&#x25BE;</span></th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600">Cancellation Rate</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600 cursor-pointer">Ratings <span className="text-gray-300">&#x25B4;&#x25BE;</span></th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600 cursor-pointer">Date <span className="text-gray-300">&#x25B4;&#x25BE;</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`report-${r.id}`}>
                    <td className="py-3 px-4"><Badge className="bg-gray-100 text-gray-700">{r.level}</Badge></td>
                    <td className="py-3 px-4 text-center">{r.trips}</td>
                    <td className="py-3 px-4 text-center">{r.acceptance_rate}</td>
                    <td className="py-3 px-4 text-center">{r.cancellation_rate}</td>
                    <td className="py-3 px-4 text-center">{r.ratings.toFixed(2)}</td>
                    <td className="py-3 px-4 text-center text-gray-500">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== SETTINGS TAB ===== */}
      {tab === 'settings' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Reward Settings</h2>
              <p className="text-sm text-gray-500">Active Campaign: <b>User rewards</b></p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={addTier}><Plus size={16} className="mr-1" /> Add Level</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[#3b82f6] text-white" data-testid="save-rewards">{saving ? 'Saving...' : 'Save All'}</Button>
            </div>
          </div>

          <div className="space-y-4">
            {tiers.map(tier => {
              const colors = TIER_COLORS[tier.level] || TIER_COLORS.Silver;
              const isExpanded = expanded === tier.id;
              return (
                <div key={tier.id} className="border border-gray-200 rounded-xl overflow-hidden" data-testid={`tier-${tier.id}`}>
                  {/* Tier Header */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : tier.id)}
                    className={`w-full flex items-center justify-between px-5 py-3 ${colors.bg} ${colors.text}`}
                  >
                    <div className="flex items-center gap-2">
                      <Trophy size={18} weight="fill" />
                      <span className="font-bold">{tier.level}</span>
                    </div>
                    {isExpanded ? <CaretUp size={18} /> : <CaretDown size={18} />}
                  </button>

                  {/* Tier Body */}
                  {isExpanded && (
                    <div className="bg-white p-5">
                      {/* Badge Image */}
                      <div className="flex justify-center mb-6">
                        <div className="w-36 h-36 rounded-full flex items-center justify-center" style={{ background: `radial-gradient(circle, ${colors.badge}40, ${colors.badge}15)` }}>
                          <div className="text-center">
                            <Trophy size={40} weight="fill" style={{ color: colors.badge }} className="mx-auto mb-1" />
                            <p className="font-bold text-gray-700 text-sm">{tier.level}</p>
                            <p className="text-[10px] text-gray-500">Level</p>
                          </div>
                        </div>
                      </div>

                      {/* Form Fields - V3Cube Layout */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Level <span className="text-red-500">*</span></label>
                          <Input value={tier.level} onChange={e => updateTier(tier.id, 'level', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Status</label>
                          <select value={tier.status} onChange={e => updateTier(tier.id, 'status', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Minimum Trips</label>
                          <Input type="number" value={tier.min_trips} onChange={e => updateTier(tier.id, 'min_trips', parseInt(e.target.value) || 0)} />
                        </div>
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Ratings</label>
                          <Input type="number" step="0.01" value={tier.ratings} onChange={e => updateTier(tier.id, 'ratings', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Cancellation Rate</label>
                          <div className="flex items-center gap-1">
                            <Input type="number" value={tier.cancellation_rate} onChange={e => updateTier(tier.id, 'cancellation_rate', parseInt(e.target.value) || 0)} />
                            <span className="text-gray-500 text-sm font-medium">%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Acceptance Rate</label>
                          <div className="flex items-center gap-1">
                            <Input type="number" value={tier.acceptance_rate} onChange={e => updateTier(tier.id, 'acceptance_rate', parseInt(e.target.value) || 0)} />
                            <span className="text-gray-500 text-sm font-medium">%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Image</label>
                          <input type="file" accept="image/*" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="text-sm font-bold text-gray-800 block mb-1">Reward Amount <span className="text-red-500">*</span></label>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500 text-sm font-bold px-2 py-2 bg-gray-100 rounded-l-lg border border-gray-300 border-r-0">EUR</span>
                            <Input type="number" step="0.01" value={tier.reward_amount} onChange={e => updateTier(tier.id, 'reward_amount', parseFloat(e.target.value) || 0)} className="rounded-l-none" />
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-red-500 mt-3 italic">* All values should be lower than the {tier.level === 'Silver' ? 'Gold' : tier.level === 'Gold' ? 'Platinum' : 'Diamond'} level.</p>

                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                        <Button onClick={handleSave} className="bg-[#3b82f6] text-white">Update</Button>
                        <Button variant="outline" className="text-red-500 border-red-200" onClick={() => removeTier(tier.id)}>
                          <Trash size={14} className="mr-1" /> Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRewards;
