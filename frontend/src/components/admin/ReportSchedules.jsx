import React, { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { toast } from 'sonner';
import { Plus, PaperPlaneTilt, Trash, PencilSimple, Clock, CheckCircle, XCircle } from '@phosphor-icons/react';

const REPORT_KINDS = [
  { key: 'results', label: 'Résultats' },
  { key: 'payments', label: 'Paiement' },
  { key: 'exceptional', label: 'Exceptionnel' },
  { key: 'refused-cancelled', label: 'Refusées / annulées' },
  { key: 'other', label: 'Autres' },
];
const FREQS = [
  { key: 'daily', label: 'Quotidien' },
  { key: 'weekly', label: 'Hebdomadaire' },
  { key: 'monthly', label: 'Mensuel' },
];
const WINDOWS = [
  { key: 'yesterday', label: 'Hier' },
  { key: 'last_7d', label: '7 derniers jours' },
  { key: 'last_30d', label: '30 derniers jours' },
  { key: 'last_month', label: 'Mois précédent' },
];
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const blank = () => ({
  name: 'Rapport automatique', kinds: ['results'], recipients: [], frequency: 'weekly',
  window: 'last_7d', send_hour: 8, send_day: 0, timezone: 'America/Martinique', enabled: true,
});

const ScheduleForm = ({ initial, onSave, onCancel }) => {
  const [f, setF] = useState(initial || blank());
  const [recipientsText, setRecipientsText] = useState((initial?.recipients || []).join(', '));
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleKind = (k) => set('kinds', f.kinds.includes(k) ? f.kinds.filter((x) => x !== k) : [...f.kinds, k]);

  const submit = () => {
    const recipients = recipientsText.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) { toast.error('Ajoutez au moins un destinataire'); return; }
    if (!f.kinds.length) { toast.error('Sélectionnez au moins un rapport'); return; }
    onSave({ ...f, recipients });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4" data-testid="schedule-form">
      <div>
        <label className="text-xs font-semibold text-gray-500">Nom</label>
        <input value={f.name} onChange={(e) => set('name', e.target.value)} data-testid="schedule-name-input"
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500">Rapports inclus</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {REPORT_KINDS.map((r) => (
            <button key={r.key} type="button" onClick={() => toggleKind(r.key)} data-testid={`schedule-kind-${r.key}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${f.kinds.includes(r.key) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">Fréquence</label>
          <select value={f.frequency} onChange={(e) => set('frequency', e.target.value)} data-testid="schedule-frequency"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {FREQS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Période couverte</label>
          <select value={f.window} onChange={(e) => set('window', e.target.value)} data-testid="schedule-window"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {WINDOWS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Heure d'envoi (h)</label>
          <input type="number" min="0" max="23" value={f.send_hour} onChange={(e) => set('send_hour', Number(e.target.value))} data-testid="schedule-hour"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        {f.frequency === 'weekly' && (
          <div>
            <label className="text-xs font-semibold text-gray-500">Jour de la semaine</label>
            <select value={f.send_day} onChange={(e) => set('send_day', Number(e.target.value))} data-testid="schedule-weekday"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        {f.frequency === 'monthly' && (
          <div>
            <label className="text-xs font-semibold text-gray-500">Jour du mois (1-28)</label>
            <input type="number" min="1" max="28" value={f.send_day || 1} onChange={(e) => set('send_day', Number(e.target.value))} data-testid="schedule-monthday"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500">Destinataires (séparés par virgule)</label>
        <textarea value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} rows={2} data-testid="schedule-recipients"
          placeholder="compta@exemple.com, direction@exemple.com"
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} data-testid="schedule-enabled" />
        Activée
      </label>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100" data-testid="schedule-cancel">Annuler</button>
        <button onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700" data-testid="schedule-save">Enregistrer</button>
      </div>
    </div>
  );
};

export const ReportSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [editing, setEditing] = useState(null); // schedule obj or 'new'
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([adminAPI.listReportSchedules(), adminAPI.reportScheduleRuns(20)]);
      setSchedules(s.data || []);
      setRuns(r.data || []);
    } catch (e) { toast.error('Échec du chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (body) => {
    try {
      if (editing && editing !== 'new' && editing.id) await adminAPI.updateReportSchedule(editing.id, body);
      else await adminAPI.createReportSchedule(body);
      toast.success('Planification enregistrée');
      setEditing(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette planification ?')) return;
    await adminAPI.deleteReportSchedule(id);
    toast.success('Supprimée');
    load();
  };

  const sendNow = async (id) => {
    const test_email = window.prompt('E-mail de test (laisser vide pour envoyer aux destinataires réels) :', '');
    try {
      const res = await adminAPI.sendReportScheduleNow(id, test_email || undefined);
      if (res.data?.status === 'sent') toast.success(`Envoyé (${res.data.range})`);
      else toast.error(res.data?.error || 'Échec de l\'envoi');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };

  if (editing) {
    return <ScheduleForm initial={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-4" data-testid="report-schedules">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Programmez l'envoi automatique des rapports par e-mail.</p>
        <button onClick={() => setEditing('new')} data-testid="add-schedule-btn"
          className="flex items-center gap-1.5 bg-gray-900 text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-800">
          <Plus size={16} /> Nouvelle planification
        </button>
      </div>

      {loading ? <p className="text-sm text-gray-400 py-8 text-center">Chargement…</p> : (
        <div className="space-y-2">
          {schedules.length === 0 && <p className="text-sm text-gray-400 py-8 text-center" data-testid="no-schedules">Aucune planification. Créez-en une pour automatiser l'envoi.</p>}
          {schedules.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-center gap-3" data-testid={`schedule-${s.id}`}>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{s.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.enabled ? 'Active' : 'Inactive'}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Clock size={13} /> {FREQS.find((x) => x.key === s.frequency)?.label} · {WINDOWS.find((x) => x.key === s.window)?.label} · {String(s.send_hour).padStart(2, '0')}h
                  {s.frequency === 'weekly' && ` · ${DAYS[s.send_day] || ''}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{(s.kinds || []).length} rapport(s) · {(s.recipients || []).length} destinataire(s)</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => sendNow(s.id)} title="Envoyer maintenant" data-testid={`send-now-${s.id}`}
                  className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"><PaperPlaneTilt size={17} /></button>
                <button onClick={() => setEditing(s)} title="Modifier" data-testid={`edit-schedule-${s.id}`}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"><PencilSimple size={17} /></button>
                <button onClick={() => remove(s.id)} title="Supprimer" data-testid={`delete-schedule-${s.id}`}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50"><Trash size={17} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {runs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Derniers envois</h3>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50" data-testid="schedule-runs">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {r.status === 'sent' ? <CheckCircle size={16} className="text-green-600" weight="fill" /> : <XCircle size={16} className="text-red-500" weight="fill" />}
                <span className="font-medium text-gray-700">{r.name}</span>
                <span className="text-xs text-gray-400">{r.range}</span>
                {r.is_test && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded">test</span>}
                <span className="ml-auto text-xs text-gray-400">{(r.recipients || []).join(', ')}</span>
                {r.error && <span className="text-xs text-red-500">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportSchedules;
