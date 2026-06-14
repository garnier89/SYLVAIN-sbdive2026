/**
 * AdminScheduling — Configuration de la planification des courses (Programmer plus tard).
 * Pilote : activation globale, délai minimum d'avance, horizon max, et les modes
 * où la planification est interdite (Pool & Enchères par défaut, conformément à V3Cube).
 * Persisté côté backend via service_configs (service_key="scheduling").
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck, Clock, FloppyDisk, Prohibit, Timer, ChatCircleText } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

// Modes pouvant être interdits de planification (libellés FR pour l'admin)
const TOGGLEABLE_MODES = [
  { key: 'pool', label: 'Pool (course partagée)' },
  { key: 'bidding', label: 'Enchères (proposez votre prix)' },
  { key: 'moto', label: 'Moto' },
  { key: 'pets', label: 'Animaux' },
  { key: 'assist', label: 'Assistance' },
  { key: 'tuktuk', label: 'TukTuk' },
];

const DEFAULTS = {
  enabled: true,
  min_advance_minutes: 60,
  max_advance_days: 30,
  disabled_modes: ['pool', 'bidding'],
  driver_start_window_min: 40,
  anti_double_booking_min: 30,
  driver_conflict_min: 45,
  sms_reminder_enabled: true,
  sms_reminder_min: 30,
};

const AdminScheduling = () => {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminAPI.getServiceConfig('scheduling')
      .then((r) => {
        const s = r.data?.settings || {};
        setCfg({ ...DEFAULTS, ...s, disabled_modes: Array.isArray(s.disabled_modes) ? s.disabled_modes : DEFAULTS.disabled_modes });
      })
      .catch(() => toast.error('Erreur de chargement de la configuration'))
      .finally(() => setLoading(false));
  }, []);

  const toggleMode = (key) => {
    setCfg((c) => {
      const has = c.disabled_modes.includes(key);
      return { ...c, disabled_modes: has ? c.disabled_modes.filter((m) => m !== key) : [...c.disabled_modes, key] };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminAPI.saveServiceConfig('scheduling', {
        enabled: !!cfg.enabled,
        min_advance_minutes: Math.max(0, parseInt(cfg.min_advance_minutes, 10) || 0),
        max_advance_days: Math.max(1, parseInt(cfg.max_advance_days, 10) || 1),
        disabled_modes: cfg.disabled_modes,
        driver_start_window_min: Math.max(5, parseInt(cfg.driver_start_window_min, 10) || 40),
        anti_double_booking_min: Math.max(0, parseInt(cfg.anti_double_booking_min, 10) || 30),
        driver_conflict_min: Math.max(0, parseInt(cfg.driver_conflict_min, 10) || 45),
        sms_reminder_enabled: !!cfg.sms_reminder_enabled,
        sms_reminder_min: Math.max(5, parseInt(cfg.sms_reminder_min, 10) || 30),
      });
      toast.success('Configuration de planification enregistrée');
    } catch (e) {
      toast.error('Échec de l\'enregistrement');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-slate-500" data-testid="scheduling-loading">Chargement…</div>;

  return (
    <div className="p-6 max-w-3xl" data-testid="admin-scheduling-page">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center">
          <CalendarCheck size={24} className="text-sky-600" weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planification des courses</h1>
          <p className="text-sm text-slate-500">Contrôlez l'option « Programmer plus tard » de l'application client.</p>
        </div>
      </div>

      {/* Global toggle */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-900">Activer la planification</p>
          <p className="text-sm text-slate-500">Si désactivé, aucune course ne peut être programmée à l'avance.</p>
        </div>
        <button
          onClick={() => setCfg((c) => ({ ...c, enabled: !c.enabled }))}
          data-testid="scheduling-enabled-toggle"
          className={`relative w-14 h-8 rounded-full transition-colors ${cfg.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
          <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${cfg.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Timing rules */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <p className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Clock size={18} className="text-slate-500" /> Règles de délai</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Délai minimum d'avance (minutes)</label>
            <input type="number" min="0" value={cfg.min_advance_minutes}
              onChange={(e) => setCfg((c) => ({ ...c, min_advance_minutes: e.target.value }))}
              data-testid="scheduling-min-advance-input"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Par défaut : 60 minutes (1h).</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Horizon maximum (jours)</label>
            <input type="number" min="1" value={cfg.max_advance_days}
              onChange={(e) => setCfg((c) => ({ ...c, max_advance_days: e.target.value }))}
              data-testid="scheduling-max-days-input"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Au-delà, la planification est refusée.</p>
          </div>
        </div>
      </div>

      {/* Booking windows (based on appointment time) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <p className="font-semibold text-slate-900 flex items-center gap-2 mb-1"><Timer size={18} className="text-indigo-500" /> Fenêtres de réservation</p>
        <p className="text-sm text-slate-500 mb-4">Calculées par rapport à <strong>l'heure du rendez-vous</strong> (et non l'heure de commande).</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Fenêtre de démarrage chauffeur (min)</label>
            <input type="number" min="5" value={cfg.driver_start_window_min}
              onChange={(e) => setCfg((c) => ({ ...c, driver_start_window_min: e.target.value }))}
              data-testid="scheduling-driver-start-window-input"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Le chauffeur peut démarrer X min avant le RDV (défaut 40).</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Anti-double réservation client (min)</label>
            <input type="number" min="0" value={cfg.anti_double_booking_min}
              onChange={(e) => setCfg((c) => ({ ...c, anti_double_booking_min: e.target.value }))}
              data-testid="scheduling-anti-double-input"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Écart minimum entre 2 réservations (défaut 30).</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Anti-conflit agenda chauffeur (min)</label>
            <input type="number" min="0" value={cfg.driver_conflict_min}
              onChange={(e) => setCfg((c) => ({ ...c, driver_conflict_min: e.target.value }))}
              data-testid="scheduling-driver-conflict-input"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Chevauchement interdit pour un chauffeur (défaut 45).</p>
          </div>
        </div>
      </div>

      {/* SMS reminder */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-slate-900 flex items-center gap-2"><ChatCircleText size={18} className="text-emerald-500" /> Rappel SMS automatique</p>
            <p className="text-sm text-slate-500">Envoie un SMS au client et au chauffeur avant l'heure du rendez-vous.</p>
          </div>
          <button
            onClick={() => setCfg((c) => ({ ...c, sms_reminder_enabled: !c.sms_reminder_enabled }))}
            data-testid="scheduling-sms-toggle"
            className={`relative w-14 h-8 rounded-full transition-colors ${cfg.sms_reminder_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${cfg.sms_reminder_enabled ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="max-w-xs">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Délai du rappel avant le RDV (min)</label>
          <input type="number" min="5" disabled={!cfg.sms_reminder_enabled} value={cfg.sms_reminder_min}
            onChange={(e) => setCfg((c) => ({ ...c, sms_reminder_min: e.target.value }))}
            data-testid="scheduling-sms-reminder-min-input"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm disabled:bg-slate-100 disabled:text-slate-400" />
          <p className="text-[11px] text-slate-400 mt-1">Défaut : 30 minutes avant le rendez-vous.</p>
        </div>
      </div>

      {/* Disabled modes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <p className="font-semibold text-slate-900 flex items-center gap-2 mb-1"><Prohibit size={18} className="text-rose-500" /> Modes sans planification</p>
        <p className="text-sm text-slate-500 mb-4">Cochez les modes où l'option « Programmer plus tard » doit être masquée.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TOGGLEABLE_MODES.map((m) => {
            const disabled = cfg.disabled_modes.includes(m.key);
            return (
              <label key={m.key} data-testid={`scheduling-mode-${m.key}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${disabled ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                <input type="checkbox" checked={disabled} onChange={() => toggleMode(m.key)}
                  data-testid={`scheduling-mode-checkbox-${m.key}`} className="w-4 h-4 accent-rose-500" />
                <span className="text-sm font-medium text-slate-800">{m.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <button onClick={save} disabled={saving} data-testid="scheduling-save-btn"
        className="px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold flex items-center gap-2 disabled:opacity-60">
        <FloppyDisk size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer la configuration'}
      </button>
    </div>
  );
};

export default AdminScheduling;
