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

const EMPTY_FORM = { id: null, title: '', body: '', audience: 'client', url: '', active: true };

const BroadcastManager = () => {
  const [items, setItems] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/notifications/broadcasts`, { withCredentials: true });
      setItems(data.items || []);
      setAudiences(data.audiences || []);
    } catch {
      toast.error('Échec du chargement des annonces');
    }
  };
  useEffect(() => { load(); }, []);

  const reset = () => setForm(EMPTY_FORM);

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast.error('Titre et message requis'); return; }
    setBusy(true);
    try {
      if (form.id) {
        await axios.put(`${API}/api/admin/notifications/broadcasts/${form.id}`, form, { withCredentials: true });
        toast.success('Notification mise à jour');
      } else {
        await axios.post(`${API}/api/admin/notifications/broadcasts`, form, { withCredentials: true });
        toast.success('Notification créée');
      }
      reset();
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Échec de l'enregistrement");
    } finally { setBusy(false); }
  };

  const send = async (b) => {
    if (!window.confirm(`Envoyer « ${b.title} » à : ${b.audience_label} ?`)) return;
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

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 mt-8" data-testid="broadcast-manager">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={22} className="text-[#FF4500]" weight="duotone" />
        <h2 className="text-xl font-bold text-gray-900">Notifications personnalisées</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">Créez et envoyez des notifications ciblées aux applications client, chauffeur ou marchand.</p>

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
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="broadcast-audience-select">
              {audiences.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Message</label>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="broadcast-body-input" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Lien (optionnel, ex: /promos)</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="broadcast-url-input" />
        </div>
        <div className="flex gap-2">
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-2 bg-[#FF4500] text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
            data-testid="broadcast-submit-btn">
            <Plus size={16} /> {form.id ? 'Mettre à jour' : 'Créer la notification'}
          </button>
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
        {items.map((b) => (
          <div key={b.id} className="border border-gray-200 rounded-xl p-3 flex items-start gap-3" data-testid={`broadcast-row-${b.id}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900">{b.title}</span>
                <span className="text-[10px] bg-orange-50 text-[#FF4500] px-2 py-0.5 rounded-full font-medium">{b.audience_label}</span>
                {b.sent_count > 0 && <span className="text-[10px] text-gray-400">· envoyée à {b.sent_count}</span>}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{b.body}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => send(b)} disabled={busy} title="Envoyer"
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100"
                data-testid={`broadcast-send-${b.id}`}><PaperPlaneTilt size={15} /></button>
              <button onClick={() => setForm({ id: b.id, title: b.title, body: b.body, audience: b.audience, url: b.url || '', active: b.active })}
                title="Modifier" className="h-8 w-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100"
                data-testid={`broadcast-edit-${b.id}`}><PencilSimple size={15} /></button>
              <button onClick={() => remove(b)} title="Supprimer"
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                data-testid={`broadcast-delete-${b.id}`}><Trash size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AdminNotifSettings;
