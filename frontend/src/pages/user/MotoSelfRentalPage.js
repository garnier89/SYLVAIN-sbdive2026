import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Motorcycle, CaretRight, MapPin, IdentificationCard, Camera,
  CheckCircle, X, ShieldCheck, Clock,
} from '@phosphor-icons/react';
import { motoRentalAPI } from '../../services/api';

const NAVY = '#0A2540';
const ORANGE = '#FF5000';
const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const border = '1px solid #E5E7EB';

const STATUS_LABELS = {
  pending_license: { label: 'Permis en vérification', cls: 'bg-amber-100 text-amber-700' },
  awaiting_pickup: { label: 'Confirmée · retrait à venir', cls: 'bg-emerald-100 text-emerald-700' },
  active: { label: 'En cours', cls: 'bg-blue-100 text-blue-700' },
  returned: { label: 'Terminée', cls: 'bg-slate-100 text-slate-600' },
  rejected: { label: 'Refusée (remboursée)', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Annulée', cls: 'bg-slate-100 text-slate-500' },
};

const MotoSelfRentalPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('fleet'); // fleet | book | done | mine
  const [fleet, setFleet] = useState([]);
  const [moto, setMoto] = useState(null);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [quote, setQuote] = useState(null);
  const [licenseUrl, setLicenseUrl] = useState('');
  const [idUrl, setIdUrl] = useState('');
  const [uploading, setUploading] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);

  useEffect(() => { motoRentalAPI.fleet().then((r) => setFleet(r.data.motos || [])).catch(() => {}); }, []);
  const loadMine = () => motoRentalAPI.myRentals().then((r) => setMine(r.data.rentals || [])).catch(() => {});

  useEffect(() => {
    if (step === 'book' && moto && startAt && endAt) {
      motoRentalAPI.quote({ moto_id: moto.id, start_at: startAt, end_at: endAt })
        .then((r) => setQuote(r.data)).catch(() => setQuote(null));
    } else { setQuote(null); }
  }, [step, moto, startAt, endAt]);

  const upload = async (e, which) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(which);
    try {
      const r = await motoRentalAPI.uploadImage(file);
      if (which === 'license') setLicenseUrl(r.data.url); else setIdUrl(r.data.url);
      toast.success('Document ajouté');
    } catch { toast.error("Échec de l'upload"); }
    setUploading('');
  };

  const submit = async () => {
    if (!quote || quote.total_hours <= 0) { toast.error('Choisissez des dates valides'); return; }
    if (!licenseUrl || !idUrl) { toast.error('Permis et pièce d’identité requis'); return; }
    setBusy(true);
    try {
      await motoRentalAPI.book({ moto_id: moto.id, start_at: startAt, end_at: endAt, license_doc_url: licenseUrl, id_doc_url: idUrl });
      setStep('done'); loadMine();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec de la réservation'); }
    setBusy(false);
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette location ? Vous serez remboursé.')) return;
    try { await motoRentalAPI.cancel(id); toast.success('Annulée et remboursée'); loadMine(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-24" data-testid="moto-self-rental-page">
      <header className="sticky top-0 z-30 px-4 py-3.5 flex items-center gap-3 text-white" style={{ background: NAVY }}>
        <button onClick={() => (step === 'fleet' ? navigate(-1) : setStep('fleet'))} aria-label="Retour" data-testid="moto-back-btn" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Work Sans, sans-serif' }}><Motorcycle size={20} weight="fill" /> Location moto</h1>
          <p className="text-[11px] text-white/70 -mt-0.5">Sans chauffeur · vous conduisez</p>
        </div>
        <button onClick={() => { setStep('mine'); loadMine(); }} data-testid="moto-mine-btn" className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10">Mes locations</button>
      </header>

      {/* FLEET */}
      {step === 'fleet' && (
        <div className="p-4 space-y-3" data-testid="moto-fleet">
          <p className="text-sm text-gray-500">Choisissez votre moto. Permis A1/A2/B requis selon le modèle.</p>
          {fleet.length === 0 && <p className="text-sm text-gray-400">Aucune moto disponible pour le moment.</p>}
          {fleet.map((m) => (
            <button key={m.id} onClick={() => { setMoto(m); setStep('book'); }} data-testid={`moto-card-${m.id}`}
              className="w-full flex items-center gap-3 bg-white rounded-2xl p-3 text-left shadow-sm" style={{ border }}>
              <div className="w-20 h-16 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                {m.image_url ? <img src={m.image_url} alt="" className="w-full h-full object-cover" /> : <Motorcycle size={32} weight="duotone" className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{m.name}</p>
                <p className="text-xs text-gray-500">{m.model} · Permis {m.license_class}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {m.location_name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black" style={{ color: NAVY }}>{money(m.price_per_day)}<span className="text-[10px] font-normal text-gray-400">/jour</span></p>
                <p className="text-[10px] text-gray-400">{money(m.price_per_hour)}/h</p>
                <CaretRight size={16} className="ml-auto text-gray-300 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* BOOK */}
      {step === 'book' && moto && (
        <div className="p-4 space-y-4" data-testid="moto-book">
          <div className="bg-white rounded-2xl p-3 flex items-center gap-3" style={{ border }}>
            <div className="w-16 h-14 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
              {moto.image_url ? <img src={moto.image_url} alt="" className="w-full h-full object-cover" /> : <Motorcycle size={28} weight="duotone" className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0"><p className="font-bold text-gray-900">{moto.name}</p><p className="text-xs text-gray-500">{moto.model} · Permis {moto.license_class}</p></div>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border }}>
            <p className="font-bold text-gray-900 flex items-center gap-2"><Clock size={18} style={{ color: ORANGE }} /> Période</p>
            <label className="block text-xs font-semibold text-gray-600">Retrait
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} data-testid="moto-start" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
            <label className="block text-xs font-semibold text-gray-600">Retour
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} data-testid="moto-end" className="w-full min-h-[44px] px-3 rounded-lg text-gray-900 mt-1" style={{ border }} /></label>
            {quote && quote.total_hours > 0 && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm" data-testid="moto-quote">
                <div className="flex justify-between text-gray-600"><span>{quote.days} jour(s){quote.remaining_hours ? ` + ${quote.remaining_hours}h` : ''}</span><span className="font-bold text-gray-900">{money(quote.price)}</span></div>
                <div className="flex justify-between text-xs text-gray-400 mt-1"><span>Caution (indicative, non débitée)</span><span>{money(quote.deposit_amount)}</span></div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border }}>
            <p className="font-bold text-gray-900 flex items-center gap-2"><IdentificationCard size={18} style={{ color: ORANGE }} /> Documents (vérifiés par l'agence)</p>
            {[{ key: 'license', label: 'Permis de conduire', url: licenseUrl }, { key: 'id', label: "Pièce d'identité", url: idUrl }].map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                {d.url ? <img src={d.url} alt="" className="w-12 h-12 rounded-lg object-cover" data-testid={`moto-${d.key}-preview`} /> : <span className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><Camera size={18} className="text-gray-400" /></span>}
                <span className="flex-1 text-sm text-gray-700">{d.label}{d.url && <CheckCircle size={14} weight="fill" className="inline ml-1 text-emerald-500" />}</span>
                <label className="px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer" style={{ border, color: NAVY }}>
                  {uploading === d.key ? 'Envoi…' : (d.url ? 'Remplacer' : 'Ajouter')}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, d.key)} data-testid={`moto-${d.key}-input`} />
                </label>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 text-[11px] text-gray-500 px-1"><ShieldCheck size={16} className="text-emerald-500 shrink-0" /> Paiement via SB Pay. La caution est indicative et n'est pas débitée au MVP.</div>
        </div>
      )}

      {/* DONE */}
      {step === 'done' && (
        <div className="p-6 text-center" data-testid="moto-done">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><CheckCircle size={36} weight="fill" className="text-emerald-500" /></div>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Demande enregistrée</h2>
          <p className="text-sm text-gray-500 mt-2">Votre permis est en cours de vérification par l'agence. Vous serez notifié(e) dès validation.</p>
          <button onClick={() => { setStep('mine'); loadMine(); }} className="mt-6 w-full min-h-[48px] rounded-xl font-bold text-white" style={{ background: NAVY }} data-testid="moto-see-mine">Voir mes locations</button>
        </div>
      )}

      {/* MINE */}
      {step === 'mine' && (
        <div className="p-4 space-y-3" data-testid="moto-mine-list">
          {mine.length === 0 && <p className="text-sm text-gray-400">Aucune location pour le moment.</p>}
          {mine.map((r) => {
            const st = STATUS_LABELS[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={r.id} className="bg-white rounded-2xl p-4" style={{ border }} data-testid={`moto-rental-${r.id}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900">{r.moto_name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{r.days} jour(s) · {money(r.base_price)} · caution {money(r.deposit_amount)}</p>
                {(r.status === 'pending_license' || r.status === 'awaiting_pickup') && (
                  <button onClick={() => cancel(r.id)} data-testid={`moto-cancel-${r.id}`} className="mt-2 text-xs font-semibold text-rose-600">Annuler & être remboursé</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* sticky CTA for book step */}
      {step === 'book' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40">
          <button onClick={submit} disabled={busy || !quote || quote.total_hours <= 0 || !licenseUrl || !idUrl}
            data-testid="moto-confirm-btn" className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg disabled:opacity-50" style={{ background: ORANGE }}>
            {busy ? 'Traitement…' : `Réserver${quote ? ` · ${money(quote.price)}` : ''}`}
          </button>
        </div>
      )}
    </div>
  );
};

export default MotoSelfRentalPage;
