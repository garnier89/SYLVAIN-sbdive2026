import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { FloppyDisk, BellRinging, Plus, PaperPlaneTilt, Trash, PencilSimple, Megaphone } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const MESSAGE_FIELDS = [
  ['new_ride', 'Nouvelle course (chauffeur)'],
  ['scheduled_reservation', 'Réservation planifiée (chauffeur)'],
  ['ride_accepted', 'Course acceptée (client)'],
  ['driver_nearby', 'Chauffeur à proximité (client) — {distance} = mètres'],
  ['driver_arrived', 'Chauffeur arrivé (client)'],
  ['ride_started', 'Course démarrée (client)'],
  ['ride_completed', 'Course terminée (client)'],
  ['driver_back_online', 'Chauffeur de retour en ligne'],
  ['new_message', 'Nouveau message'],
];

const AdminNotifSettings = () => {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/notifications/settings`, { withCredentials: true });
      setS(data);
    } catch {
      toast.error('Échec du chargement des réglages');
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await axios.put(`${API}/api/admin/notifications/settings`, s, { withCredentials: true });
      setS(data);
      toast.success('Réglages enregistrés');
    } catch {
      toast.error("Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (!s) {
    return <div className="p-8 text-gray-500" data-testid="notif-settings-loading">Chargement…</div>;
  }

  const num = (k, v) => setS({ ...s, [k]: v });
  const msg = (k, v) => setS({ ...s, messages: { ...s.messages, [k]: v } });

  return (
    <div className="p-6 max-w-3xl" data-testid="admin-notif-settings">
      <div className="flex items-center gap-3 mb-6">
        <BellRinging size={26} className="text-[#FF4500]" weight="duotone" />
        <h1 className="text-2xl font-bold text-gray-900">Notifications — Réglages</h1>
      </div>

      {/* Proximity */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <h2 className="font-bold text-gray-800 mb-3">Proximité « Chauffeur est là »</h2>
        <label className="block text-sm text-gray-600 mb-1">Distance d'alerte (mètres)</label>
        <input type="number" min="10" value={s.arrival_distance_m}
          onChange={(e) => num('arrival_distance_m', parseInt(e.target.value || '0', 10))}
          className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="arrival-distance-input" />
        <p className="text-xs text-gray-400 mt-1">Le client est notifié « votre chauffeur arrive » à cette distance.</p>
      </section>

      {/* Auto demand alerts (background agent) */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <h2 className="font-bold text-gray-800 mb-3">Relances automatiques (agent demande)</h2>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={!!s.auto_demand_alerts}
            onChange={(e) => num('auto_demand_alerts', e.target.checked)} data-testid="auto-demand-toggle" />
          Notifier automatiquement les chauffeurs hors-ligne là où des clients attendent
        </label>
        <div className="flex gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Anti-spam : délai min/zone (min)</label>
            <input type="number" min="1" value={s.demand_cooldown_min ?? 30}
              onChange={(e) => num('demand_cooldown_min', parseInt(e.target.value || '30', 10))}
              className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="demand-cooldown-input" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Seuil : clients en attente</label>
            <input type="number" min="1" value={s.demand_min_waiting ?? 1}
              onChange={(e) => num('demand_min_waiting', parseInt(e.target.value || '1', 10))}
              className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="demand-min-waiting-input" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">L'agent analyse la demande toutes les 5 min et relance les chauffeurs hors-ligne de la zone concernée.</p>
      </section>

      {/* Chaining is governed by the dedicated "Prochaine course" (next-job)
          admin config; not duplicated here to avoid conflicting settings. */}

      {/* Messages */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <h2 className="font-bold text-gray-800 mb-3">Textes des notifications</h2>
        <div className="space-y-3">
          {MESSAGE_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input value={s.messages?.[k] || ''} onChange={(e) => msg(k, e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid={`msg-${k}`} />
            </div>
          ))}
        </div>
      </section>

      <button onClick={save} disabled={saving}
        className="inline-flex items-center gap-2 bg-[#FF4500] text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60"
        data-testid="save-notif-settings-btn">
        <FloppyDisk size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>

      <BroadcastManager />
    </div>
  );
};

const EMPTY_FORM = { id: null, title: '', body: '', audience: 'client', url: '', zone_id: '', inactive_days: 30, schedule_at: '', active: true };

const STATUS_BADGE = {
  draft: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Planifiée', cls: 'bg-blue-100 text-blue-700' },
  sent: { label: 'Envoyée', cls: 'bg-green-100 text-green-700' },
};

// datetime-local <-> ISO helpers (the input has no timezone; treat as local).
const isoToLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
const localInputToIso = (v) => (v ? new Date(v).toISOString() : '');

const BroadcastManager = () => {
  const [items, setItems] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [zones, setZones] = useState([]);
  const [zoneAudiences, setZoneAudiences] = useState([]);
  const [inactivityAudiences, setInactivityAudiences] = useState([]);
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState(null);

  const needsZone = zoneAudiences.includes(form.audience);
  const needsInactivity = inactivityAudiences.includes(form.audience);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/notifications/broadcasts`, { withCredentials: true });
      setItems(data.items || []);
      setAudiences(data.audiences || []);
      setZones(data.zones || []);
      setZoneAudiences(data.zone_audiences || []);
      setInactivityAudiences(data.inactivity_audiences || []);
      setPresets(data.inactivity_presets || []);
    } catch {
      toast.error('Échec du chargement des annonces');
    }
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm(EMPTY_FORM); setEstimate(null); };

  const payload = () => ({
    title: form.title, body: form.body, audience: form.audience, url: form.url,
    active: form.active,
    zone_id: needsZone ? form.zone_id : undefined,
    inactive_days: needsInactivity ? form.inactive_days : undefined,
    schedule_at: localInputToIso(form.schedule_at) || null,
  });

  const preview = async () => {
    if (needsZone && !form.zone_id) { toast.error('Sélectionnez une zone'); return; }
    try {
      const { data } = await axios.post(`${API}/api/admin/notifications/broadcasts/preview`,
        { audience: form.audience, zone_id: form.zone_id, inactive_days: form.inactive_days },
        { withCredentials: true });
      setEstimate(data.count);
    } catch { toast.error("Échec de l'estimation"); }
  };

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast.error('Titre et message requis'); return; }
    if (needsZone && !form.zone_id) { toast.error('Sélectionnez une zone'); return; }
    setBusy(true);
    try {
      if (form.id) {
        await axios.put(`${API}/api/admin/notifications/broadcasts/${form.id}`, payload(), { withCredentials: true });
        toast.success('Notification mise à jour');
      } else {
        await axios.post(`${API}/api/admin/notifications/broadcasts`, payload(), { withCredentials: true });
        toast.success(form.schedule_at ? 'Notification planifiée' : 'Notification créée');
      }
      reset();
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Échec de l'enregistrement");
    } finally { setBusy(false); }
  };

  const send = async (b) => {
    if (!window.confirm(`Envoyer maintenant « ${b.title} » à : ${b.audience_label} ?`)) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/api/admin/notifications/broadcasts/${b.id}/send`, {}, { withCredentials: true });
      toast.success(`Envoyée à ${data.sent} utilisateur(s)`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Échec de l'envoi");
    } finally { setBusy(false); }
  };

  const remove = async (b) => {
    if (!window.confirm(`Supprimer « ${b.title} » ?`)) return;
    try {
      await axios.delete(`${API}/api/admin/notifications/broadcasts/${b.id}`, { withCredentials: true });
      if (form.id === b.id) reset();
      await load();
    } catch { toast.error('Échec de la suppression'); }
  };

  const edit = (b) => setForm({
    id: b.id, title: b.title, body: b.body, audience: b.audience, url: b.url || '',
    zone_id: b.zone_id || '', inactive_days: b.inactive_days || 30,
    schedule_at: isoToLocalInput(b.schedule_at), active: b.active,
  });

  const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 mt-8" data-testid="broadcast-manager">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={22} className="text-[#FF4500]" weight="duotone" />
        <h2 className="text-xl font-bold text-gray-900">Notifications personnalisées</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">Ciblez des segments (apps, chauffeurs hors-ligne, par zone, clients inactifs) et planifiez l'envoi.</p>

      {/* Form */}
      <div className="grid gap-3 mb-4 bg-gray-50 rounded-xl p-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Titre</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="broadcast-title-input" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Destinataires</label>
            <select value={form.audience} onChange={(e) => { setForm({ ...form, audience: e.target.value }); setEstimate(null); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="broadcast-audience-select">
              {audiences.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </div>

        {/* Conditional targeting controls */}
        {(needsZone || needsInactivity) && (
          <div className="grid sm:grid-cols-2 gap-3">
            {needsZone && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Zone</label>
                <select value={form.zone_id} onChange={(e) => { setForm({ ...form, zone_id: e.target.value }); setEstimate(null); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="broadcast-zone-select">
                  <option value="">— Choisir une zone —</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            )}
            {needsInactivity && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Inactivité depuis</label>
                <select value={form.inactive_days} onChange={(e) => { setForm({ ...form, inactive_days: parseInt(e.target.value, 10) }); setEstimate(null); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="broadcast-inactive-select">
                  {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Message</label>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="broadcast-body-input" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lien (optionnel, ex: /promos)</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="broadcast-url-input" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Planifier l'envoi (optionnel)</label>
            <input type="datetime-local" value={form.schedule_at} onChange={(e) => setForm({ ...form, schedule_at: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="broadcast-schedule-input" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-2 bg-[#FF4500] text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
            data-testid="broadcast-submit-btn">
            <Plus size={16} /> {form.id ? 'Mettre à jour' : (form.schedule_at ? 'Planifier' : 'Créer la notification')}
          </button>
          <button onClick={preview} type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-700"
            data-testid="broadcast-preview-btn">
            Estimer l'audience
          </button>
          {estimate != null && (
            <span className="text-sm font-medium text-gray-700" data-testid="broadcast-estimate">
              ≈ {estimate} destinataire(s)
            </span>
          )}
          {form.id && (
            <button onClick={reset} className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600" data-testid="broadcast-cancel-btn">
              Annuler
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2" data-testid="broadcast-list">
        {items.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Aucune notification personnalisée.</p>}
        {items.map((b) => {
          const sb = STATUS_BADGE[b.status] || STATUS_BADGE.draft;
          return (
            <div key={b.id} className="border border-gray-200 rounded-xl p-3 flex items-start gap-3" data-testid={`broadcast-row-${b.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900">{b.title}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sb.cls}`}>{sb.label}</span>
                  <span className="text-[10px] bg-orange-50 text-[#FF4500] px-2 py-0.5 rounded-full font-medium">{b.audience_label}</span>
                  {b.zone_name && <span className="text-[10px] text-gray-400">· {b.zone_name}</span>}
                  {b.inactive_days && <span className="text-[10px] text-gray-400">· &gt; {b.inactive_days}j</span>}
                  {b.sent_count > 0 && <span className="text-[10px] text-gray-400">· envoyée à {b.sent_count}</span>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{b.body}</p>
                {b.status === 'scheduled' && b.schedule_at && (
                  <p className="text-[11px] text-blue-600 mt-1">⏰ Programmée pour le {fmtWhen(b.schedule_at)}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => send(b)} disabled={busy} title="Envoyer maintenant"
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100"
                  data-testid={`broadcast-send-${b.id}`}><PaperPlaneTilt size={15} /></button>
                <button onClick={() => edit(b)}
                  title="Modifier" className="h-8 w-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100"
                  data-testid={`broadcast-edit-${b.id}`}><PencilSimple size={15} /></button>
                <button onClick={() => remove(b)} title="Supprimer"
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                  data-testid={`broadcast-delete-${b.id}`}><Trash size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AdminNotifSettings;
