import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Trophy, Crown, Star, Medal, Gear } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminTopDriversSettings = () => {
  const [settings, setSettings] = useState({ mode: 'composite', max_shown: 10, manual_driver_ids: [] });
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, dRes, pRes] = await Promise.all([
        fetch(`${API}/api/admin/top-drivers-config`, { credentials: 'include' }),
        fetch(`${API}/api/admin/priority-drivers`, { credentials: 'include' }),
        fetch(`${API}/api/drivers/top`),
      ]);
      const c = await cRes.json();
      const d = await dRes.json();
      const p = await pRes.json();
      setSettings(c.settings || { mode: 'composite', max_shown: 10, manual_driver_ids: [] });
      setDrivers(d || []);
      setPreview(p.drivers || []);
    } catch (err) { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleManual = (driver_id) => {
    setSettings(s => {
      const ids = s.manual_driver_ids || [];
      return { ...s, manual_driver_ids: ids.includes(driver_id) ? ids.filter(x => x !== driver_id) : [...ids, driver_id] };
    });
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    const ids = [...settings.manual_driver_ids];
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    setSettings(s => ({ ...s, manual_driver_ids: ids }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/admin/top-drivers-config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(settings),
      });
      toast.success('Configuration enregistree');
      const pRes = await fetch(`${API}/api/drivers/top`);
      const p = await pRes.json();
      setPreview(p.drivers || []);
    } catch (err) { toast.error('Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Chargement...</div>;

  return (
    <div className="p-6" data-testid="admin-top-drivers">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy size={28} className="text-amber-500" weight="fill" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Top Chauffeurs — Classement public</h1>
            <p className="text-xs text-gray-500">Configurez le classement affiche publiquement sur /top-chauffeurs et dans l'app passager</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-top-drivers">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Gear size={16} />Reglages</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">Mode de classement</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'composite', label: 'Score composite', desc: 'Points + courses + note' },
                  { id: 'points', label: 'Points uniquement', desc: 'Palette Expert en haut' },
                  { id: 'manual', label: 'Choix admin', desc: 'Selection manuelle' },
                ].map(m => (
                  <button key={m.id} onClick={() => setSettings(s => ({ ...s, mode: m.id }))}
                    className={`p-3 rounded-xl border-2 text-left transition-colors ${settings.mode === m.id ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    data-testid={`mode-${m.id}`}>
                    <p className="font-bold text-sm">{m.label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Nombre de chauffeurs a afficher</label>
              <Input type="number" min="3" max="50" value={settings.max_shown}
                onChange={e => setSettings(s => ({ ...s, max_shown: parseInt(e.target.value) || 10 }))}
                className="max-w-[120px]" data-testid="max-shown-input" />
            </div>

            {settings.mode === 'manual' && (
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-2">Selectionnez et ordonnez les chauffeurs ({(settings.manual_driver_ids || []).length} choisis)</label>

                {/* Selected with reorder */}
                {(settings.manual_driver_ids || []).length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                    <p className="text-xs font-bold text-amber-800 mb-2">Ordre d'affichage (#1 en haut)</p>
                    {(settings.manual_driver_ids || []).map((id, idx) => {
                      const d = drivers.find(x => x.driver_id === id);
                      if (!d) return null;
                      return (
                        <div key={id} className="flex items-center gap-2 bg-white rounded-lg p-2 mb-1.5" data-testid={`manual-selected-${id}`}>
                          <span className="font-bold text-amber-600 text-sm w-6">#{idx + 1}</span>
                          <span className="flex-1 text-sm">{d.name}</span>
                          <Button size="sm" variant="ghost" onClick={() => moveUp(idx)} disabled={idx === 0}>↑</Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => toggleManual(id)}>x</Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* All drivers list */}
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto border border-gray-200 rounded-xl p-2">
                  {drivers.map(d => {
                    const selected = (settings.manual_driver_ids || []).includes(d.driver_id);
                    return (
                      <button key={d.driver_id} onClick={() => toggleManual(d.driver_id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${selected ? 'bg-amber-100 border border-amber-300' : 'hover:bg-gray-50 border border-transparent'}`}
                        data-testid={`toggle-manual-${d.driver_id}`}>
                        <input type="checkbox" checked={selected} readOnly />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-gray-500">{d.vehicle_type} · {d.points} pts · {d.total_trips} courses · {d.rating}★</p>
                        </div>
                        {d.manual_priority && <Badge className="bg-amber-200 text-amber-900 text-[10px]">VIP</Badge>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Crown size={16} className="text-amber-500" />Apercu public</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {preview.length === 0 && <p className="text-xs text-gray-400">Aucun chauffeur a afficher</p>}
              {preview.slice(0, 10).map((d, idx) => {
                const color = ['#FFD700', '#C0C0C0', '#CD7F32'][idx] || '#94A3B8';
                return (
                  <div key={d.driver_id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg" data-testid={`preview-${idx}`}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: color }}>#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{d.name}</p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Star size={9} weight="fill" className="text-amber-400" />{d.rating} · {d.total_trips} courses · {Math.round(d.composite_score)} pts
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <a href="/top-chauffeurs" target="_blank" rel="noopener noreferrer" className="block mt-4 text-center py-2 bg-slate-800 text-white rounded-lg text-xs font-bold" data-testid="view-public-page">
              Voir la page publique →
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminTopDriversSettings;
