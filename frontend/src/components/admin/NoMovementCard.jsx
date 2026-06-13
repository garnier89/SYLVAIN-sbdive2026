import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { MapPinLine, ArrowsClockwise, CircleNotch } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dispatchAdminAPI } from '../../services/api';

/**
 * Réglage admin « immobilité » (anti-fraude Lot 2) :
 * activer/désactiver, délai (min) et seuil GPS (m), + réassignations auto du jour en direct.
 */
const NoMovementCard = () => {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reassigns, setReassigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReassigns = useCallback(() => {
    dispatchAdminAPI.noMovementReassignments(24)
      .then((r) => setReassigns(r.data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    dispatchAdminAPI.noMovementConfig().then((r) => setCfg(r.data)).catch(() => {});
    loadReassigns();
    const t = setInterval(loadReassigns, 20000);
    return () => clearInterval(t);
  }, [loadReassigns]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await dispatchAdminAPI.saveNoMovementConfig({
        enabled: cfg.enabled,
        minutes: Number(cfg.minutes),
        threshold_m: Number(cfg.threshold_m),
      });
      setCfg(data);
      toast.success('Réglage « immobilité » enregistré');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return null;

  return (
    <Card className="mb-6 border-orange-200" data-testid="no-movement-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2"><MapPinLine size={18} className="text-orange-500" weight="fill" /> Auto-réassignation « chauffeur immobile »</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{cfg.enabled ? 'Activé' : 'Désactivé'}</span>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} data-testid="no-movement-toggle" />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-4">
          Libère et réattribue automatiquement une course instantanée si le chauffeur ne s’est pas déplacé après acceptation (vérification GPS), avec pénalité et alerte.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Délai sans bouger (min)</label>
            <Input type="number" min="1" max="60" value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: e.target.value })} data-testid="no-movement-minutes" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Seuil GPS (m)</label>
            <Input type="number" min="30" max="2000" step="10" value={cfg.threshold_m} onChange={(e) => setCfg({ ...cfg, threshold_m: e.target.value })} data-testid="no-movement-threshold" />
          </div>
          <Button onClick={save} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="no-movement-save">
            {saving ? <CircleNotch size={16} className="animate-spin" /> : 'Enregistrer'}
          </Button>
        </div>

        <div className="mt-5 border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <ArrowsClockwise size={15} className="text-orange-500" /> Réassignations (24 h)
              <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold" data-testid="no-movement-count">{reassigns.length}</span>
            </p>
            <button onClick={loadReassigns} className="text-xs text-gray-400 hover:text-gray-600" data-testid="no-movement-refresh">Rafraîchir</button>
          </div>
          {loading ? (
            <p className="text-xs text-gray-400">Chargement…</p>
          ) : reassigns.length === 0 ? (
            <p className="text-xs text-gray-400" data-testid="no-movement-empty">Aucune réassignation pour immobilité aujourd’hui ✅</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto" data-testid="no-movement-list">
              {reassigns.map((r, i) => (
                <div key={`${r.ride_id}-${i}`} className="flex items-center justify-between text-xs bg-orange-50 rounded-lg px-3 py-2" data-testid={`no-movement-item-${r.ride_id}`}>
                  <span className="font-semibold text-gray-700 truncate">{r.driver_name}</span>
                  <span className="text-gray-400 font-mono truncate mx-2">#{(r.ride_id || '').slice(-8)}</span>
                  <span className="text-gray-500 shrink-0">{r.created_at ? new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default NoMovementCard;
