import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Camera, IdentificationCard, Bank, DeviceMobile, CheckCircle, Clock, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const PROVIDER_LABEL = { orange: 'Orange Money', mtn: 'MTN Mobile Money', wave: 'Wave', sbpaygo: 'SBPAYGO', moov: 'Moov Money' };

const fileToB64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const PayoutMethodPage = () => {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ holder_name: '', iban: '', bic: '', holder_type: 'person', company_name: '', provider: 'orange', mobile_number: '' });
  const [selfie, setSelfie] = useState(null);
  const [idDoc, setIdDoc] = useState(null);
  const selfieRef = useRef();
  const idRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/payouts/method`, { credentials: 'include' });
      const d = await r.json();
      setCfg(d);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const isRib = cfg?.allowed_types?.includes('rib');
  const method = cfg?.method;

  const pick = async (e, setter) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error('Fichier trop volumineux (max 8 Mo)'); return; }
    setter(await fileToB64(f));
  };

  const submit = async () => {
    if (!form.holder_name.trim()) { toast.error('Nom du titulaire requis'); return; }
    if (!selfie || !idDoc) { toast.error('Selfie et pièce d\'identité requis'); return; }
    if (isRib) {
      if (form.iban.replace(/\s/g, '').length < 15) { toast.error('IBAN invalide'); return; }
      if (!form.bic.trim()) { toast.error('BIC requis'); return; }
    } else if (!form.mobile_number.trim()) { toast.error('Numéro Mobile Money requis'); return; }

    setSubmitting(true);
    try {
      const payload = isRib
        ? { type: 'rib', iban: form.iban, bic: form.bic, holder_type: form.holder_type, company_name: form.company_name, holder_name: form.holder_name, selfie_url: selfie, id_doc_url: idDoc }
        : { type: 'mobile_money', provider: form.provider, mobile_number: form.mobile_number, holder_name: form.holder_name, selfie_url: selfie, id_doc_url: idDoc };
      const r = await fetch(`${API}/api/payouts/method`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Échec'); }
      toast.success('Moyen de retrait soumis — en attente de validation');
      setSelfie(null); setIdDoc(null);
      load();
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const StatusBadge = ({ status }) => {
    const map = {
      pending: { icon: Clock, c: 'bg-amber-100 text-amber-700', t: 'En attente de validation' },
      approved: { icon: CheckCircle, c: 'bg-emerald-100 text-emerald-700', t: 'Validé' },
      rejected: { icon: XCircle, c: 'bg-red-100 text-red-700', t: 'Refusé' },
    }[status] || { icon: Clock, c: 'bg-gray-100 text-gray-600', t: status };
    const I = map.icon;
    return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${map.c}`} data-testid="payout-status-badge"><I size={14} weight="fill" /> {map.t}</span>;
  };

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-24" data-testid="payout-method-page">
      <div className="sticky top-0 z-50 bg-white border-b p-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1" data-testid="payout-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-lg font-bold">Moyen de retrait</h1>
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-400">Chargement…</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
            <ShieldCheck size={22} className="text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-[13px] text-indigo-900 leading-snug">
              Zone : <b>{cfg.region === 'africa' ? 'Afrique' : 'Europe / DOM-TOM'}</b>. {isRib
                ? 'Enregistrez votre RIB (il doit vous appartenir ou appartenir à votre société).'
                : 'Enregistrez votre compte Mobile Money.'} Un selfie et une pièce d\'identité sont requis pour vérification.
            </p>
          </div>

          {method && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4" data-testid="current-method">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-900">Moyen enregistré</h3>
                <StatusBadge status={method.status} />
              </div>
              <p className="text-sm text-gray-600">
                {method.type === 'rib' ? `RIB ${method.iban_masked || ''} · ${method.bic || ''}` : `${PROVIDER_LABEL[method.provider] || method.provider} · ${method.mobile_number || ''}`}
              </p>
              <p className="text-xs text-gray-400 mt-1">Titulaire : {method.holder_name}</p>
              {method.status === 'rejected' && method.reject_reason && (
                <p className="text-xs text-red-600 mt-2" data-testid="reject-reason">Motif du refus : {method.reject_reason}</p>
              )}
              {method.status === 'pending' && (
                <p className="text-xs text-amber-600 mt-2">Votre dossier est en cours de vérification par notre équipe.</p>
              )}
            </div>
          )}

          {/* Form (submit / resubmit) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              {isRib ? <Bank size={18} className="text-indigo-600" /> : <DeviceMobile size={18} className="text-indigo-600" />}
              {method ? 'Mettre à jour mon moyen de retrait' : 'Enregistrer mon moyen de retrait'}
            </h3>

            <Field label="Nom du titulaire">
              <input className="inp" value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} placeholder="Nom complet" data-testid="payout-holder-input" />
            </Field>

            {isRib ? (
              <>
                <Field label="IBAN">
                  <input className="inp" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="FR76 ..." data-testid="payout-iban-input" />
                </Field>
                <Field label="BIC / SWIFT">
                  <input className="inp" value={form.bic} onChange={(e) => setForm({ ...form, bic: e.target.value })} placeholder="BNPAFRPP" data-testid="payout-bic-input" />
                </Field>
                <Field label="Titulaire">
                  <select className="inp" value={form.holder_type} onChange={(e) => setForm({ ...form, holder_type: e.target.value })} data-testid="payout-holder-type">
                    <option value="person">Particulier (moi-même)</option>
                    <option value="company">Société</option>
                  </select>
                </Field>
                {form.holder_type === 'company' && (
                  <Field label="Nom de la société">
                    <input className="inp" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} data-testid="payout-company-input" />
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label="Opérateur">
                  <select className="inp" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} data-testid="payout-provider-select">
                    {(cfg.providers || []).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p] || p}</option>)}
                  </select>
                </Field>
                <Field label="Numéro Mobile Money">
                  <input className="inp" value={form.mobile_number} onChange={(e) => setForm({ ...form, mobile_number: e.target.value })} placeholder="+225 ..." data-testid="payout-mobile-input" />
                </Field>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Uploader label="Selfie" icon={Camera} value={selfie} inputRef={selfieRef} onPick={(e) => pick(e, setSelfie)} capture="user" testid="payout-selfie" />
              <Uploader label="Pièce d'identité" icon={IdentificationCard} value={idDoc} inputRef={idRef} onPick={(e) => pick(e, setIdDoc)} testid="payout-iddoc" />
            </div>

            <button onClick={submit} disabled={submitting} className="w-full h-12 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60" data-testid="payout-submit-btn">
              {submitting ? 'Envoi…' : 'Soumettre pour vérification'}
            </button>
            <p className="text-[11px] text-gray-400 text-center">Vérification automatique par IA + validation par notre équipe avant tout retrait.</p>
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;font-size:14px}`}</style>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div><label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>{children}</div>
);

const Uploader = ({ label, icon: Icon, value, inputRef, onPick, capture, testid }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
    <button type="button" onClick={() => inputRef.current?.click()} className="w-full h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 overflow-hidden bg-gray-50" data-testid={`${testid}-btn`}>
      {value ? <img src={value} alt={label} className="h-full w-full object-cover" /> : <><Icon size={24} className="text-gray-400" /><span className="text-[11px] text-gray-400">Ajouter</span></>}
    </button>
    <input ref={inputRef} type="file" accept="image/*" capture={capture} onChange={onPick} className="hidden" data-testid={`${testid}-input`} />
  </div>
);

export default PayoutMethodPage;
