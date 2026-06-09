import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Warning, FloppyDisk, Phone, ChatCircleText, ShieldWarning } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const EVENT_LABELS = {
  client_warning: { label: 'Avertissement client', color: 'text-amber-600 bg-amber-50' },
  client_ban: { label: 'Bannissement client', color: 'text-red-600 bg-red-50' },
  driver_penalty: { label: 'Pénalité chauffeur', color: 'text-orange-600 bg-orange-50' },
};

const AdminModeration = () => {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('config');
  const [events, setEvents] = useState([]);
  const [calls, setCalls] = useState([]);
  const [conversations, setConversations] = useState([]);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === 'events') fetchJson('/api/moderation/admin/events?limit=100', setEvents);
    if (tab === 'calls') fetchJson('/api/moderation/admin/call-logs?limit=100', setCalls);
    if (tab === 'conversations') fetchJson('/api/moderation/admin/conversations?limit=50', setConversations);
  }, [tab]);

  const fetchJson = async (path, setter) => {
    try {
      const res = await fetch(`${API}${path}`, { credentials: 'include' });
      if (res.ok) setter(await res.json());
    } catch { /* noop */ }
  };

  const load = async () => {
    try {
      const res = await fetch(`${API}/api/moderation/admin/config`, { credentials: 'include' });
      if (res.ok) setCfg(await res.json());
      else toast.error('Accès refusé');
    } catch { toast.error('Erreur réseau'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/moderation/admin/config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (res.ok) { setCfg(await res.json()); toast.success('Règles de modération enregistrées !'); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const fmt = (s) => s ? new Date(s).toLocaleString('fr-FR') : '—';

  if (!cfg) return <div className="p-6 text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="p-6 space-y-5" data-testid="admin-moderation">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ShieldWarning size={26} weight="fill" className="text-red-500" /> Modération & Annulations
          </h1>
          <p className="text-sm text-gray-500 mt-1">Règles d'annulation (clients & chauffeurs), journal d'appels et conversations archivées.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Activé</span>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} className="data-[state=checked]:bg-red-500" data-testid="moderation-enabled-toggle" />
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {[
          { k: 'config', label: 'Règles' },
          { k: 'events', label: 'Avertissements & pénalités' },
          { k: 'calls', label: 'Journal d\'appels' },
          { k: 'conversations', label: 'Conversations' },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`moderation-tab-${t.k}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Warning size={18} weight="fill" className="text-amber-500" /> Règles client (annulations)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Seuil d'avertissement" value={cfg.client_warn_threshold} onChange={(v) => setCfg({ ...cfg, client_warn_threshold: v })} testId="warn-threshold" />
              <Field label="Seuil de bannissement" value={cfg.client_ban_threshold} onChange={(v) => setCfg({ ...cfg, client_ban_threshold: v })} testId="ban-threshold" />
              <Field label="Durée du bannissement (h)" value={cfg.client_ban_hours} onChange={(v) => setCfg({ ...cfg, client_ban_hours: v })} testId="ban-hours" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Warning size={18} weight="fill" className="text-orange-500" /> Pénalités chauffeur (€)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Annulation abusive (€)" value={cfg.driver_abusive_penalty_eur} onChange={(v) => setCfg({ ...cfg, driver_abusive_penalty_eur: v })} testId="abusive-penalty" step="0.5" />
              <Field label="Accepter puis relâcher (€)" value={cfg.driver_release_penalty_eur} onChange={(v) => setCfg({ ...cfg, driver_release_penalty_eur: v })} testId="release-penalty" step="0.5" />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="bg-red-500 hover:bg-red-600 text-white" data-testid="save-moderation-btn">
              <FloppyDisk size={16} weight="fill" className="mr-2" />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}

      {tab === 'events' && (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {events.length === 0 && <div className="p-6 text-sm text-gray-400">Aucun événement.</div>}
            {events.map((ev) => {
              const meta = EVENT_LABELS[ev.type] || { label: ev.type, color: 'text-gray-600 bg-gray-50' };
              return (
                <div key={ev.id} className="p-4 flex items-center justify-between" data-testid={`event-row-${ev.id}`}>
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${meta.color}`}>{meta.label}</span>
                    <p className="text-sm text-gray-700 mt-1">
                      {ev.user_name || ev.user_id || '—'}
                      {ev.kind ? ` · ${ev.kind}` : ''}
                      {ev.amount ? ` · -${ev.amount.toFixed(2)} €` : ''}
                      {ev.count ? ` · ${ev.count} annulations` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{fmt(ev.created_at)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {tab === 'calls' && (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {calls.length === 0 && <div className="p-6 text-sm text-gray-400">Aucun appel enregistré.</div>}
            {calls.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between" data-testid={`call-row-${c.id}`}>
                <div className="flex items-center gap-3">
                  <Phone size={18} className="text-emerald-500" />
                  <div>
                    <p className="text-sm text-gray-700">{c.from_name || c.from_role} → {c.to_name || c.to_role}</p>
                    <p className="text-xs text-gray-400">Course {c.ride_id}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{fmt(c.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'conversations' && (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {conversations.length === 0 && <div className="p-6 text-sm text-gray-400">Aucune conversation.</div>}
            {conversations.map((cv) => (
              <div key={`${cv.ref_type}-${cv.ref_id}`} className="p-4 flex items-center justify-between" data-testid={`conv-row-${cv.ref_id}`}>
                <div className="flex items-center gap-3">
                  <ChatCircleText size={18} className="text-blue-500" />
                  <div>
                    <p className="text-sm text-gray-700 truncate max-w-md">{cv.last_text || '—'}</p>
                    <p className="text-xs text-gray-400">{cv.ref_type} · {cv.message_count} messages</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{fmt(cv.last_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Field = ({ label, value, onChange, testId, step }) => (
  <div>
    <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
    <Input type="number" step={step || '1'} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} data-testid={testId} />
  </div>
);

export default AdminModeration;
