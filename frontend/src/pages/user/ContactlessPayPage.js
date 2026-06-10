import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, Wallet, CreditCard, QrCode, Keyboard, CheckCircle, X } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

// ───────── Camera QR scanner (html5-qrcode) ─────────
const Scanner = ({ onResult, onClose }) => {
  const ref = useRef(null);
  const idRef = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let html5;
    let stopped = false;
    (async () => {
      try {
        html5 = new Html5Qrcode(idRef.current, { verbose: false });
        ref.current = html5;
        await html5.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 230, height: 230 } },
          (text) => { if (!stopped) { stopped = true; onResult(text); } },
          () => {},
        );
      } catch (e) {
        toast.error("Caméra indisponible — saisissez le code manuellement");
        onClose();
      }
    })();
    return () => {
      stopped = true;
      if (ref.current) {
        ref.current.stop().then(() => ref.current.clear()).catch(() => {});
      }
    };
  }, [onResult, onClose]);

  return (
    <div className="fixed inset-0 z-[3000] bg-black flex flex-col" data-testid="qr-scanner">
      <div className="p-4 flex items-center justify-between text-white">
        <span className="font-semibold">Scannez le QR du commerçant</span>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="scanner-close-btn"><X size={18} /></button>
      </div>
      <div id={idRef.current} className="flex-1 [&_video]:object-cover" />
    </div>
  );
};

// Phase D — Payer (client) pays a contactless request via SB Pay or card.
const ContactlessPayPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  // Entry mode (no id): scan / manual code
  const [code, setCode] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Payment mode (id present)
  const [req, setReq] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [method, setMethod] = useState('wallet');
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(null);
  const confirmRef = useRef(false);

  // ----- Resolve a scanned QR / manual code into a request id -----
  const resolveCode = useCallback(async (raw) => {
    const text = (raw || '').trim();
    setResolving(true);
    try {
      // QR encodes a deep link ".../pay/<id>"
      const m = text.match(/\/pay\/([A-Za-z0-9_]+)/);
      if (m) { navigate(`/pay/${m[1]}`); return; }
      // Otherwise treat as a 6-digit code → lookup
      const digits = text.replace(/\D/g, '').slice(0, 6);
      if (digits.length !== 6) { toast.error('Code invalide'); return; }
      const r = await fetch(`${API}/api/contactless/lookup?code=${digits}`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Code invalide ou expiré');
      navigate(`/pay/${d.id}`);
    } catch (e) {
      toast.error(e.message || 'Code introuvable');
    } finally { setResolving(false); }
  }, [navigate]);

  // ----- Load the request when an id is present -----
  const loadReq = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/contactless/requests/${id}`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Demande introuvable');
      setReq(d);
      if (d.status === 'paid') setDone({ amount: d.amount });
    } catch (e) { setLoadErr(e.message || 'Erreur'); }
  }, [id]);

  useEffect(() => { if (id) loadReq(); }, [id, loadReq]);

  // ----- Stripe card return (?cl_session=...) → confirm + credit payee -----
  useEffect(() => {
    if (!id || confirmRef.current) return;
    const sid = new URLSearchParams(window.location.search).get('cl_session');
    if (!sid) return;
    confirmRef.current = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/contactless/requests/${id}/status?session_id=${encodeURIComponent(sid)}`, { credentials: 'include' });
        const d = await r.json();
        if (r.ok && d.payment_status === 'paid') {
          setDone({ amount: d.amount });
          toast.success('Paiement effectué !');
        } else if (d.payment_status === 'expired') {
          toast.error('Paiement expiré');
        } else {
          toast('Paiement en cours de confirmation…');
        }
      } catch { toast.error('Impossible de confirmer le paiement'); }
      finally { navigate(`/pay/${id}`, { replace: true }); }
    })();
  }, [id, navigate]);

  const pay = async () => {
    setPaying(true);
    try {
      const r = await fetch(`${API}/api/contactless/requests/${id}/pay`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, origin_url: window.location.origin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Paiement refusé');
      if (method === 'card' && d.url) { window.location.href = d.url; return; }
      setDone({ amount: d.amount, net: d.net, cashback: d.cashback });
      toast.success(`Payé ${Number(d.amount).toFixed(2)} €`);
    } catch (e) {
      toast.error(e.message || 'Paiement refusé');
    } finally { setPaying(false); }
  };

  // ═══════════ ENTRY MODE (no id): scan / enter code ═══════════
  if (!id) {
    return (
      <div className="mobile-container bg-gray-50 min-h-screen pb-20" data-testid="contactless-pay-entry">
        <div className="sticky top-0 z-50 bg-white border-b">
          <div className="p-4 flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1" data-testid="pay-back-btn"><ArrowLeft size={22} className="text-gray-700" /></button>
            <h1 className="text-lg font-bold text-gray-900">Payer un commerçant</h1>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <button onClick={() => setShowScanner(true)} className="w-full h-14 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2" data-testid="pay-scan-btn">
            <QrCode size={22} weight="duotone" /> Scanner le QR code
          </button>
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <label className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1"><Keyboard size={14} /> Saisir le code à 6 chiffres</label>
            <input
              type="text" inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full px-3 py-3 rounded-xl border border-gray-200 text-2xl font-mono tracking-[0.3em] text-center mb-3"
              data-testid="pay-code-input"
            />
            <button onClick={() => resolveCode(code)} disabled={resolving || code.length !== 6} className="w-full h-12 rounded-xl bg-gray-900 text-white font-bold disabled:opacity-60" data-testid="pay-code-submit">
              {resolving ? 'Recherche…' : 'Continuer'}
            </button>
          </div>
        </div>
        {showScanner && <Scanner onResult={(t) => { setShowScanner(false); resolveCode(t); }} onClose={() => setShowScanner(false)} />}
      </div>
    );
  }

  // ═══════════ PAYMENT MODE (id present) ═══════════
  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-20" data-testid="contactless-pay-page">
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-4">
          <button onClick={() => navigate('/pay')} className="p-1" data-testid="pay-back-btn"><ArrowLeft size={22} className="text-gray-700" /></button>
          <h1 className="text-lg font-bold text-gray-900">Paiement</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loadErr ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-red-100" data-testid="pay-error">
            <p className="text-sm text-red-600 mb-4">{loadErr}</p>
            <button onClick={() => navigate('/pay')} className="px-5 h-11 rounded-xl bg-gray-900 text-white font-bold">Réessayer</button>
          </div>
        ) : done ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-emerald-100" data-testid="pay-success">
            <CheckCircle size={64} weight="fill" className="text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900">Paiement effectué</h2>
            <p className="text-3xl font-extrabold text-emerald-600 my-2">{Number(done.amount).toFixed(2)} €</p>
            {done.cashback > 0 && <p className="text-sm text-emerald-600 mb-2">+{Number(done.cashback).toFixed(2)} € de cashback 🎁</p>}
            <button onClick={() => navigate('/wallet')} className="w-full h-12 rounded-xl bg-gray-900 text-white font-bold mt-3" data-testid="pay-done-wallet">Voir mon SB Pay</button>
          </div>
        ) : !req ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400">Chargement…</div>
        ) : req.status !== 'pending' || req.expired ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-200" data-testid="pay-unavailable">
            <p className="text-sm text-gray-600 mb-4">Cette demande n'est plus disponible (payée, annulée ou expirée).</p>
            <button onClick={() => navigate('/pay')} className="px-5 h-11 rounded-xl bg-gray-900 text-white font-bold">Nouveau paiement</button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center" data-testid="pay-summary">
              <p className="text-sm text-gray-500">Vous payez</p>
              <p className="text-4xl font-extrabold text-gray-900 my-1" data-testid="pay-amount">{Number(req.amount).toFixed(2)} €</p>
              <p className="text-sm text-gray-500">à <b className="text-gray-800">{req.payee_name}</b></p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Payer avec</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMethod('wallet')} data-testid="pay-method-wallet"
                  className={`py-4 rounded-xl border-2 font-semibold text-sm flex items-center justify-center gap-2 ${method === 'wallet' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-700'}`}>
                  <Wallet size={18} weight="duotone" /> SB Pay
                </button>
                <button onClick={() => setMethod('card')} data-testid="pay-method-card"
                  className={`py-4 rounded-xl border-2 font-semibold text-sm flex items-center justify-center gap-2 ${method === 'card' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-700'}`}>
                  <CreditCard size={18} weight="duotone" /> Carte
                </button>
              </div>
            </div>

            <button onClick={pay} disabled={paying} className="w-full h-13 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold disabled:opacity-60" data-testid="pay-confirm-btn">
              {paying ? 'Traitement…' : method === 'card' ? `Payer ${Number(req.amount).toFixed(2)} € par carte` : `Payer ${Number(req.amount).toFixed(2)} € avec SB Pay`}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ContactlessPayPage;
