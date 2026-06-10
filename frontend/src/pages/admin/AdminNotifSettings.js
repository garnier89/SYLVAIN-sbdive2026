import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { FloppyDisk, BellRinging } from '@phosphor-icons/react';

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
    </div>
  );
};

export default AdminNotifSettings;
