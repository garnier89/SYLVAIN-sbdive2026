import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  EnvelopeSimple, FloppyDisk, PaperPlaneTilt, Eye, Clock, Gear, Spinner,
  ArrowClockwise, ClockCounterClockwise, CheckCircle, XCircle,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const TIMEZONES = [
  'America/Martinique', 'America/Guadeloupe', 'America/Cayenne', 'Europe/Paris', 'UTC',
];
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const money = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const Field = ({ label, children, hint }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-gray-700">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-400">{hint}</p>}
  </div>
);

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

const AdminWeeklyReports = () => {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [history, setHistory] = useState([]);
  const [resendingId, setResendingId] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/weekly-reports/history?limit=50`, { credentials: 'include' });
      if (res.ok) setHistory(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/weekly-reports/config`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setCfg({
          ...d,
          admin_emails: (d.admin_emails || []).join(', '),
          accountant_emails: (d.accountant_emails || []).join(', '),
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); loadHistory(); }, [load, loadHistory]);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...cfg,
        admin_emails: cfg.admin_emails.split(',').map((s) => s.trim()).filter(Boolean),
        accountant_emails: cfg.accountant_emails.split(',').map((s) => s.trim()).filter(Boolean),
        commission_rate: Number(cfg.commission_rate),
        non_withdrawable_amount: Number(cfg.non_withdrawable_amount),
        send_day: Number(cfg.send_day),
        send_hour: Number(cfg.send_hour),
      };
      // don't send masked key
      if (cfg.resend_api_key && cfg.resend_api_key.includes('•')) delete payload.resend_api_key;
      const res = await fetch(`${API}/api/admin/weekly-reports/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success('Configuration sauvegardée');
      load();
    } catch (e) { toast.error('Erreur lors de la sauvegarde'); }
    finally { setSaving(false); }
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch(`${API}/api/admin/weekly-reports/preview`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setPreview(await res.json());
    } catch (e) { toast.error('Erreur lors de l\'aperçu'); }
    finally { setPreviewing(false); }
  };

  const sendNow = async () => {
    if (!window.confirm(testEmail ? `Envoyer un email de test à ${testEmail} ?` : 'Envoyer les rapports à TOUS les destinataires maintenant ?')) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/admin/weekly-reports/send-now`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ test_email: testEmail || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'send failed');
      toast.success(`Envoyé: ${d.sent} · Échecs: ${d.failed} (semaine ${d.week})`);
      if (d.errors?.length) console.warn('Erreurs envoi:', d.errors);
      loadHistory();
    } catch (e) { toast.error(`Échec: ${e.message}`); }
    finally { setSending(false); }
  };

  const resendOne = async (id) => {
    setResendingId(id);
    try {
      const res = await fetch(`${API}/api/admin/weekly-reports/resend/${id}`, { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'resend failed');
      toast.success('Rapport renvoyé');
      loadHistory();
    } catch (e) { toast.error(`Échec du renvoi: ${e.message}`); }
    finally { setResendingId(null); }
  };

  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('fr-FR'); } catch { return iso; } };

  if (loading || !cfg) {
    return <div className="p-8 flex justify-center"><Spinner size={28} className="animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl" data-testid="weekly-reports-page">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <EnvelopeSimple size={26} weight="duotone" className="text-blue-500" /> Rapports hebdomadaires
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Envoi automatique chaque semaine du bilan détaillé (chauffeurs, prestataires, livreurs) + rapport global (admin & comptable).
          Semaine = lundi 00:00 → dimanche 23:59 en heure locale.
        </p>
      </div>

      {/* Activation + planning */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Clock size={18} /> Planification automatique</h3>
            <p className="text-xs text-gray-500">Active l'envoi automatique programmé.</p>
          </div>
          <label className="inline-flex items-center cursor-pointer" data-testid="toggle-enabled">
            <input type="checkbox" className="sr-only peer" checked={!!cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            <div className="relative w-11 h-6 bg-gray-200 peer-checked:bg-green-500 rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
          </label>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Jour d'envoi">
            <select className={inputCls} value={cfg.send_day} onChange={(e) => set('send_day', e.target.value)} data-testid="field-send_day">
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
          <Field label="Heure locale" hint="0–23">
            <input type="number" min="0" max="23" className={inputCls} value={cfg.send_hour} onChange={(e) => set('send_hour', e.target.value)} data-testid="field-send_hour" />
          </Field>
          <Field label="Fuseau horaire">
            <select className={inputCls} value={cfg.timezone} onChange={(e) => set('timezone', e.target.value)} data-testid="field-timezone">
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Email provider */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Gear size={18} /> Service d'email (Resend)</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Clé API Resend" hint={cfg.resend_api_key_set ? 'Une clé est déjà enregistrée — laissez tel quel pour la conserver.' : 'Obtenez-la sur resend.com → API Keys (re_...)'}>
            <input type="text" className={inputCls} value={cfg.resend_api_key} placeholder="re_..." onChange={(e) => set('resend_api_key', e.target.value)} data-testid="field-resend_api_key" />
          </Field>
          <Field label="Email expéditeur (vérifié)" hint="Doit être un domaine vérifié sur Resend">
            <input type="text" className={inputCls} value={cfg.sender_email} onChange={(e) => set('sender_email', e.target.value)} data-testid="field-sender_email" />
          </Field>
          <Field label="Nom expéditeur">
            <input type="text" className={inputCls} value={cfg.sender_name} onChange={(e) => set('sender_name', e.target.value)} data-testid="field-sender_name" />
          </Field>
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Destinataires & règles métier</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Emails admin (rapport global)" hint="Séparés par des virgules">
            <input type="text" className={inputCls} value={cfg.admin_emails} onChange={(e) => set('admin_emails', e.target.value)} data-testid="field-admin_emails" />
          </Field>
          <Field label="Emails comptable" hint="Séparés par des virgules">
            <input type="text" className={inputCls} value={cfg.accountant_emails} onChange={(e) => set('accountant_emails', e.target.value)} data-testid="field-accountant_emails" />
          </Field>
          <Field label="Commission plateforme (%)">
            <input type="number" step="0.5" className={inputCls} value={cfg.commission_rate} onChange={(e) => set('commission_rate', e.target.value)} data-testid="field-commission_rate" />
          </Field>
          <Field label="Montant non retirable (€)" hint="Conservé sur l'app, déduit du virement">
            <input type="number" step="1" className={inputCls} value={cfg.non_withdrawable_amount} onChange={(e) => set('non_withdrawable_amount', e.target.value)} data-testid="field-non_withdrawable_amount" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 pt-2">
          {[['send_to_drivers', 'Chauffeurs'], ['send_to_providers', 'Prestataires'], ['send_to_couriers', 'Livreurs']].map(([k, lbl]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!cfg[k]} onChange={(e) => set(k, e.target.checked)} data-testid={`toggle-${k}`} /> {lbl}
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700 pt-2" data-testid="toggle-restrict_driver_email">
          <input type="checkbox" className="mt-0.5" checked={!!cfg.restrict_driver_email_to_authorized}
            onChange={(e) => set('restrict_driver_email_to_authorized', e.target.checked)} />
          <span>Limiter le relevé individuel aux chauffeurs <b>Taxi/VTC</b> (et Particulier/Livreur autorisés par l'admin). Le rapport global couvre tout le monde.</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60" data-testid="save-config-btn">
          {saving ? <Spinner size={16} className="animate-spin" /> : <FloppyDisk size={16} />} Sauvegarder
        </button>
        <button onClick={runPreview} disabled={previewing} className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-60" data-testid="preview-btn">
          {previewing ? <Spinner size={16} className="animate-spin" /> : <Eye size={16} />} Aperçu (semaine précédente)
        </button>
      </div>

      {/* Send now */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-amber-900 flex items-center gap-2"><PaperPlaneTilt size={18} /> Envoi manuel</h3>
        <p className="text-xs text-amber-800">Envoie immédiatement les rapports de la semaine précédente. Renseignez un email de test pour n'envoyer qu'un échantillon (rapport global + 1 chauffeur) à cette adresse.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <Field label="Email de test (optionnel)">
              <input type="email" className={inputCls} value={testEmail} placeholder="test@exemple.com" onChange={(e) => setTestEmail(e.target.value)} data-testid="test-email-input" />
            </Field>
          </div>
          <button onClick={sendNow} disabled={sending} className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60" data-testid="send-now-btn">
            {sending ? <Spinner size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} />} Envoyer maintenant
          </button>
        </div>
      </div>

      {/* Preview result */}
      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4" data-testid="preview-result">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Aperçu — semaine du {preview.week}</h3>
            <span className="text-xs text-gray-500">{preview.active_drivers} chauffeurs actifs</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs text-gray-500">Revenu total</p><p className="text-lg font-bold text-gray-900">{money(preview.total_revenue)}</p></div>
            <div className="bg-green-50 rounded-lg p-3"><p className="text-xs text-gray-500">Commissions</p><p className="text-lg font-bold text-green-700">{money(preview.total_commission)}</p></div>
            <div className="bg-amber-50 rounded-lg p-3"><p className="text-xs text-gray-500">Virements à effectuer</p><p className="text-lg font-bold text-amber-700">{money(preview.total_transfers)}</p></div>
          </div>
          {preview.drivers?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">Chauffeur</th><th className="py-2 px-2 text-right">Term.</th><th className="py-2 px-2 text-right">Ann.</th>
                    <th className="py-2 px-2 text-right">Brut</th><th className="py-2 px-2 text-right">Espèces</th><th className="py-2 px-2 text-right">CB</th>
                    <th className="py-2 px-2 text-right">Portef.</th><th className="py-2 px-2 text-right">Comm.</th><th className="py-2 px-2 text-right">Net</th><th className="py-2 pl-2 text-right">Virement</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.drivers.map((d) => (
                    <tr key={d.driver_id} className="border-b last:border-0" data-testid={`preview-driver-${d.driver_id}`}>
                      <td className="py-2 pr-3 font-medium text-gray-800">{d.name}</td>
                      <td className="py-2 px-2 text-right">{d.completed}</td>
                      <td className="py-2 px-2 text-right">{d.cancelled}</td>
                      <td className="py-2 px-2 text-right">{money(d.gross)}</td>
                      <td className="py-2 px-2 text-right">{money(d.cash)}</td>
                      <td className="py-2 px-2 text-right">{money(d.card)}</td>
                      <td className="py-2 px-2 text-right">{money(d.wallet)}</td>
                      <td className="py-2 px-2 text-right text-red-600">-{money(d.commission)}</td>
                      <td className="py-2 px-2 text-right font-semibold">{money(d.net)}</td>
                      <td className="py-2 pl-2 text-right font-bold text-green-700">{money(d.transfer)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">Aucune activité sur la semaine précédente.</p>
          )}
        </div>
      )}

      {/* History / Archive */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4" data-testid="history-section">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><ClockCounterClockwise size={18} /> Historique des envois</h3>
          <button onClick={loadHistory} className="text-xs text-blue-600 hover:underline flex items-center gap-1" data-testid="refresh-history-btn">
            <ArrowClockwise size={14} /> Rafraîchir
          </button>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun envoi enregistré pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">Date</th><th className="py-2 px-2">Semaine</th><th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2">Destinataire</th><th className="py-2 px-2">Statut</th><th className="py-2 pl-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b last:border-0" data-testid={`history-row-${h.id}`}>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{fmtDate(h.created_at)}</td>
                    <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{h.week}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${h.type === 'global' ? 'bg-gray-800 text-white' : 'bg-blue-100 text-blue-700'}`}>
                        {h.type === 'global' ? 'Global' : h.name}
                      </span>
                      {h.is_test && <span className="ml-1 text-[10px] text-amber-600">(test)</span>}
                    </td>
                    <td className="py-2 px-2 text-gray-600 max-w-[200px] truncate">{h.recipient}</td>
                    <td className="py-2 px-2">
                      {h.status === 'sent'
                        ? <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={14} weight="fill" /> Envoyé</span>
                        : <span className="inline-flex items-center gap-1 text-red-600 text-xs" title={h.error}><XCircle size={14} weight="fill" /> Échec</span>}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button onClick={() => resendOne(h.id)} disabled={resendingId === h.id}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
                        data-testid={`resend-btn-${h.id}`}>
                        {resendingId === h.id ? <Spinner size={12} className="animate-spin" /> : <PaperPlaneTilt size={12} />} Renvoyer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminWeeklyReports;
