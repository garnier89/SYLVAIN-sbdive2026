import React, { useState, useEffect, useCallback } from 'react';
import { CircleNotch, Clock, Timer, TextT, FloppyDisk } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { reservationRulesAPI } from '../../services/api';

const FIELDS = [
  { key: 'scheduled_grace_minutes', label: 'Délai de grâce — réservations planifiées (min)',
    help: 'Une réservation programmée est effacée ce nombre de minutes APRÈS son heure de prise en charge (tolérance pour un chauffeur en retard).',
    icon: Clock, min: 0, max: 1440 },
  { key: 'immediate_expiry_minutes', label: 'Expiration — courses immédiates / enchères (min)',
    help: "Une demande immédiate (ou une enchère) non acceptée est effacée après ce nombre de minutes.",
    icon: Timer, min: 1, max: 240 },
  { key: 'start_delay_minutes', label: "Délai avant démarrage après acceptation (min)",
    help: "Après acceptation d'une réservation : pendant ce délai le bouton « Annuler » reste visible et « Démarrer » est verrouillé. Passé ce délai, « Annuler » disparaît et « Démarrer » devient actif.",
    icon: Timer, min: 0, max: 240 },
];

const AdminReservationRules = () => {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    reservationRulesAPI.get()
      .then((r) => setForm(r.data))
      .catch(() => toast.error('Échec du chargement'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await reservationRulesAPI.update({
        scheduled_grace_minutes: Number(form.scheduled_grace_minutes),
        immediate_expiry_minutes: Number(form.immediate_expiry_minutes),
        start_delay_minutes: Number(form.start_delay_minutes),
        start_button_label: form.start_button_label,
      });
      setForm(r.data);
      toast.success('Paramètres enregistrés');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l’enregistrement');
    } finally { setSaving(false); }
  };

  if (!form) {
    return <div className="flex justify-center py-20"><CircleNotch size={28} className="animate-spin text-sky-500" /></div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto" data-testid="admin-reservation-rules-page">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Réservations — délais & bouton</h1>
      <p className="text-sm text-gray-500 mb-6">Réglez les fenêtres d’expiration et le démarrage des réservations, sans redéploiement.</p>

      <div className="space-y-5">
        {FIELDS.map(({ key, label, help, icon: Icon, min, max }) => (
          <div key={key} className="bg-white rounded-xl border border-gray-100 p-4">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-1">
              <Icon size={16} className="text-sky-600" /> {label}
            </label>
            <p className="text-xs text-gray-500 mb-2 leading-relaxed">{help}</p>
            <input
              type="number" min={min} max={max}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              data-testid={`reservation-rule-${key}`}
            />
          </div>
        ))}

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-1">
            <TextT size={16} className="text-sky-600" /> Libellé du bouton « Démarrer »
          </label>
          <p className="text-xs text-gray-500 mb-2 leading-relaxed">Texte affiché au chauffeur pour démarrer le voyage (ex : « Démarrer la réservation », « Départ voyage »).</p>
          <input
            type="text" maxLength={40}
            value={form.start_button_label}
            onChange={(e) => setForm({ ...form, start_button_label: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            data-testid="reservation-rule-start_button_label"
          />
        </div>

        <button
          onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 bg-sky-600 text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-60"
          data-testid="reservation-rules-save"
        >
          {saving ? <CircleNotch size={16} className="animate-spin" /> : <FloppyDisk size={16} weight="fill" />} Enregistrer
        </button>
      </div>
    </div>
  );
};

export default AdminReservationRules;
