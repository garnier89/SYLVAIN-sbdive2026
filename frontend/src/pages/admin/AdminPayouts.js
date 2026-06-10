import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { HandCoins, IdentificationCard, Star, CheckCircle, XCircle, Money, ShieldCheck, PaperPlaneTilt, ArrowsClockwise, Warning } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const AI_BADGE = {
  match: 'bg-emerald-100 text-emerald-700',
  no_match: 'bg-red-100 text-red-700',
  uncertain: 'bg-amber-100 text-amber-700',
};

const AdminPayouts = () => {
  const [tab, setTab] = useState('withdrawals');
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" data-testid="admin-payouts-page">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Retraits &amp; Moyens de paiement (KYC)</h1>
      <p className="text-sm text-gray-500 mb-5">Validez les demandes de retrait (avec score chauffeur) et les RIB / Mobile Money soumis.</p>
      <div className="flex gap-2 mb-5">
        <TabBtn active={tab === 'withdrawals'} onClick={() => setTab('withdrawals')} icon={HandCoins} label="Demandes de retrait" testid="tab-withdrawals" />
        <TabBtn active={tab === 'methods'} onClick={() => setTab('methods')} icon={IdentificationCard} label="Moyens de retrait (KYC)" testid="tab-methods" />
      </div>
      {tab === 'withdrawals' ? <WithdrawalsTab /> : <MethodsTab />}
    </div>
  );
};

const TabBtn = ({ active, onClick, icon: Icon, label, testid }) => (
  <button onClick={onClick} data-testid={testid}
    className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
    <Icon size={16} /> {label}
  </button>
);

// ───────────────────────── Withdrawals ─────────────────────────
const WithdrawalsTab = () => {
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [finals, setFinals] = useState({});
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [verify, setVerify] = useState({});

  const loadCfg = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/payouts/admin/payout-config`, { credentials: 'include' });
      if (r.ok) setCfg(await r.json());
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/payouts/admin/withdrawals?status=${status}`, { credentials: 'include' });
      const d = await r.json();
      setData(d);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCfg(); }, [loadCfg]);

  const saveCfg = async (patch) => {
    try {
      const r = await fetch(`${API}/api/payouts/admin/payout-config`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error('Échec');
      const resp = await r.json();
      setCfg((prev) => ({ ...prev, ...resp }));
      toast.success('Configuration des versements mise à jour');
    } catch (e) { toast.error(e.message); }
  };

  const act = async (id, action, body) => {
    try {
      const r = await fetch(`${API}/api/payouts/admin/withdrawals/${id}/${action}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Échec'); }
      toast.success('Action effectuée');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const sendPayout = async (id, force = false) => {
    setBusy(id);
    try {
      const r = await fetch(`${API}/api/payouts/admin/withdrawals/${id}/send`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Échec du versement');
      if (d.blocked) {
        // Active safety: verification failed (NO_MATCH / out-of-limits). Require explicit override.
        setVerify((v) => ({ ...v, [id]: d.verification }));
        const ok = window.confirm(`${d.message}\n\nVoulez-vous FORCER le versement malgré tout ?`);
        if (ok) { await sendPayout(id, true); }
        else { toast.error('Versement bloqué par la vérification du bénéficiaire'); }
        return;
      }
      const lbl = d.status === 'paid' ? 'Versé' : 'En cours';
      toast.success(`${lbl}${d.simulated ? ' (simulation sandbox)' : ''} · ${d.amount_xof?.toLocaleString()} XOF via ${d.provider?.toUpperCase()}`);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const verifyRecipient = async (id) => {
    setBusy(`v-${id}`);
    try {
      const r = await fetch(`${API}/api/payouts/admin/withdrawals/${id}/verify-recipient`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Échec de la vérification');
      setVerify((v) => ({ ...v, [id]: d }));
      (d.verdict === 'ok' ? toast.success : d.verdict === 'warning' ? toast.error : toast)(d.message);
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const refreshStatus = async (id) => {
    setBusy(id);
    try {
      const r = await fetch(`${API}/api/payouts/admin/withdrawals/${id}/refresh-status`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Échec');
      toast.success(`Statut : ${d.status}`);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const isMobileMoney = (w) => w.payout_method && w.payout_method.type === 'mobile_money';

  return (
    <div>
      {/* Payout provider mode banner */}
      {cfg && (
        <div className={`rounded-2xl p-4 mb-4 border ${cfg.mode === 'live' && cfg.live_enabled ? 'bg-red-50 border-red-200' : cfg.mode === 'live' ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'}`} data-testid="payout-config-banner">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Warning size={18} weight="fill" className={cfg.mode === 'live' && cfg.live_enabled ? 'text-red-500' : cfg.mode === 'live' ? 'text-orange-500' : 'text-amber-500'} />
              <span className="text-sm font-bold text-gray-800">
                Versements Mobile Money : {cfg.mode === 'live' && cfg.live_enabled ? 'MODE LIVE (argent réel) 🔴' : cfg.mode === 'live' ? "Mode Live — argent réel NON activé (cochez pour confirmer)" : 'Mode Sandbox (simulation, aucun argent réel)'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                Mode
                <select value={cfg.mode} onChange={(e) => saveCfg({ mode: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-gray-300 text-xs" data-testid="payout-mode-select">
                  <option value="sandbox">Sandbox</option>
                  <option value="live">Live</option>
                </select>
              </label>
              {cfg.mode === 'live' && (
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                  <input type="checkbox" checked={!!cfg.live_enabled} onChange={(e) => saveCfg({ live_enabled: e.target.checked })} data-testid="payout-live-enabled-toggle" />
                  Activer l'argent réel
                </label>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-500 flex-wrap">
            <span>Taux fixe : 1 € = {cfg.xof_per_eur} XOF</span>
            {cfg.providers_ready && (['wave', 'mtn', 'orange'].map((p) => (
              <span key={p} className={`px-2 py-0.5 rounded-full font-semibold ${cfg.providers_ready[p] ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.toUpperCase()} {cfg.providers_ready[p] ? 'prêt' : 'à configurer'}
              </span>
            )))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['pending', 'approved', 'processing', 'paid', 'rejected'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} data-testid={`wd-filter-${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {({ pending: 'En attente', approved: 'Approuvés', processing: 'En cours', paid: 'Versés', rejected: 'Refusés' })[s]} ({data.counts?.[s] ?? 0})
          </button>
        ))}
      </div>
      {loading ? <p className="text-gray-400">Chargement…</p> : data.items.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center" data-testid="wd-empty">Aucune demande.</p>
      ) : (
        <div className="space-y-3">
          {data.items.map((w) => {
            const sc = w.score || {};
            return (
              <div key={w.id} className="bg-white rounded-2xl border border-gray-200 p-4" data-testid={`wd-row-${w.id}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-bold text-gray-900">{w.name} <span className="text-xs font-normal text-gray-400">· {w.role} · {w.region === 'africa' ? 'Afrique' : 'EU/DOM-TOM'}</span></p>
                    <p className="text-2xl font-extrabold text-indigo-600 mt-1">{Number(w.amount).toFixed(2)} €</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Star size={13} weight="fill" className="text-amber-500" />{sc.rating ?? '—'}</span>
                      <span>Acceptation {sc.acceptance_rate ?? '—'}%</span>
                      <span>Annulation {sc.cancellation_rate ?? '—'}%</span>
                      <span>Courses {sc.total_trips ?? 0}</span>
                      <span className={sc.open_complaints ? 'text-red-600 font-bold' : ''}>Réclam. {sc.open_complaints ?? 0}</span>
                    </div>
                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      <ShieldCheck size={14} className="text-gray-400" />
                      {w.payout_method ? (w.payout_method.type === 'rib' ? `RIB ${w.payout_method.iban_masked || ''}` : `${w.payout_method.provider} ${w.payout_method.mobile_number || ''}`) : 'Aucun moyen'}
                      {w.ai_face_match && (
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${AI_BADGE[w.ai_face_match.verdict] || 'bg-gray-100'}`}>IA: {w.ai_face_match.verdict} {w.ai_face_match.confidence}%</span>
                      )}
                    </div>
                  </div>
                  {w.status === 'pending' && (
                    <div className="flex flex-col gap-2 w-44">
                      <input type="number" min="0" max={w.amount} step="1"
                        defaultValue={w.amount}
                        onChange={(e) => setFinals({ ...finals, [w.id]: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Montant validé (€)"
                        data-testid={`wd-final-${w.id}`} />
                      <button onClick={() => act(w.id, 'approve', { final_amount: Number(finals[w.id] ?? w.amount) })}
                        className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-1" data-testid={`wd-approve-${w.id}`}>
                        <CheckCircle size={15} /> Approuver
                      </button>
                      <button onClick={() => { const r = prompt('Motif du refus ?'); if (r) act(w.id, 'reject', { reason: r }); }}
                        className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-1" data-testid={`wd-reject-${w.id}`}>
                        <XCircle size={15} /> Refuser
                      </button>
                    </div>
                  )}
                  {w.status === 'approved' && (
                    <div className="flex flex-col gap-2 self-center w-48">
                      {isMobileMoney(w) && (
                        <>
                          <button onClick={() => verifyRecipient(w.id)} disabled={busy === `v-${w.id}`}
                            className="px-4 py-2 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-60" data-testid={`wd-verify-${w.id}`}>
                            <ShieldCheck size={15} /> {busy === `v-${w.id}` ? '…' : 'Vérifier le bénéficiaire'}
                          </button>
                          {verify[w.id] && (
                            <p className={`text-[11px] leading-tight ${verify[w.id].verdict === 'ok' ? 'text-emerald-600' : verify[w.id].verdict === 'warning' ? 'text-red-600' : 'text-gray-500'}`} data-testid={`wd-verify-result-${w.id}`}>
                              {verify[w.id].message}
                            </p>
                          )}
                          <button onClick={() => sendPayout(w.id)} disabled={busy === w.id}
                            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-60" data-testid={`wd-send-${w.id}`}>
                            <PaperPlaneTilt size={15} weight="fill" /> {busy === w.id ? '…' : 'Envoyer le versement'}
                          </button>
                        </>
                      )}
                      <button onClick={() => act(w.id, 'mark-paid')} className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-bold flex items-center justify-center gap-1" data-testid={`wd-markpaid-${w.id}`}>
                        <Money size={15} /> Marquer versé
                      </button>
                    </div>
                  )}
                  {w.status === 'processing' && (
                    <button onClick={() => refreshStatus(w.id)} disabled={busy === w.id}
                      className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold flex items-center gap-1 self-center disabled:opacity-60" data-testid={`wd-refresh-${w.id}`}>
                      <ArrowsClockwise size={15} /> {busy === w.id ? '…' : 'Rafraîchir le statut'}
                    </button>
                  )}
                </div>
                {w.adjusted && <p className="text-[11px] text-amber-600 mt-2">Montant ajusté à {Number(w.final_amount).toFixed(2)} €</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ───────────────────────── Methods (KYC) ─────────────────────────
const MethodsTab = () => {
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/payouts/admin/methods?status=${status}`, { credentials: 'include' });
      setData(await r.json());
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action, body) => {
    try {
      const r = await fetch(`${API}/api/payouts/admin/methods/${id}/${action}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Échec'); }
      toast.success('Action effectuée');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} data-testid={`pm-filter-${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {({ pending: 'En attente', approved: 'Validés', rejected: 'Refusés' })[s]} ({data.counts?.[s] ?? 0})
          </button>
        ))}
      </div>
      {loading ? <p className="text-gray-400">Chargement…</p> : data.items.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center" data-testid="pm-empty">Aucun dossier.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.items.map((m) => (
            <div key={m.id} className="bg-white rounded-2xl border border-gray-200 p-4" data-testid={`pm-row-${m.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900">{m.holder_name} <span className="text-xs font-normal text-gray-400">· {m.role} · {m.region === 'africa' ? 'Afrique' : 'EU/DOM-TOM'}</span></p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {m.type === 'rib' ? `RIB ${m.iban_masked || ''} · ${m.bic || ''} · ${m.holder_type === 'company' ? (m.company_name || 'Société') : 'Particulier'}` : `${m.provider} · ${m.mobile_number || ''}`}
                  </p>
                </div>
                {m.ai_face_match && (
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${AI_BADGE[m.ai_face_match.verdict] || 'bg-gray-100'}`} data-testid={`pm-ai-${m.id}`}>
                    IA: {m.ai_face_match.verdict} {m.ai_face_match.confidence}%
                  </span>
                )}
              </div>
              {m.ai_face_match?.reasoning && <p className="text-[11px] text-gray-400 mt-1 italic">{m.ai_face_match.reasoning}</p>}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div><p className="text-[10px] text-gray-400 mb-1">Selfie</p>{m.selfie_url ? <img src={m.selfie_url} alt="selfie" className="w-full h-28 object-cover rounded-lg border" /> : <div className="h-28 bg-gray-100 rounded-lg" />}</div>
                <div><p className="text-[10px] text-gray-400 mb-1">Pièce d'identité</p>{m.id_doc_url ? <img src={m.id_doc_url} alt="id" className="w-full h-28 object-cover rounded-lg border" /> : <div className="h-28 bg-gray-100 rounded-lg" />}</div>
              </div>
              {m.status === 'rejected' && m.reject_reason && <p className="text-xs text-red-600 mt-2">Motif : {m.reject_reason}</p>}
              {m.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => act(m.id, 'approve')} className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-1" data-testid={`pm-approve-${m.id}`}><CheckCircle size={15} /> Valider</button>
                  <button onClick={() => { const r = prompt('Motif du refus ?'); if (r) act(m.id, 'reject', { reason: r }); }} className="flex-1 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-1" data-testid={`pm-reject-${m.id}`}><XCircle size={15} /> Refuser</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPayouts;
