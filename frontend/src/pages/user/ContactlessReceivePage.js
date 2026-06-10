import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, QrCode, CheckCircle, ArrowsClockwise, X, HandHeart } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

// Phase D — Payee (driver/merchant) generates a contactless payment request.
const ContactlessReceivePage = () => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [req, setReq] = useState(null);          // active request
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(null);        // {net, amount} when paid
  const [secsLeft, setSecsLeft] = useState(0);
  const pollRef = useRef(null);

  const payUrl = req ? `${window.location.origin}/pay/${req.id}` : '';

  const generate = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error('Saisissez un montant'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/contactless/requests`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: val }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Erreur');
      setReq(d);
      setPaid(null);
    } catch (e) {
      toast.error(e.message || 'Impossible de générer la demande');
    } finally { setLoading(false); }
  };

  const cancel = useCallback(async () => {
    if (req) {
      try { await fetch(`${API}/api/contactless/requests/${req.id}/cancel`, { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    }
    setReq(null); setPaid(null); setAmount('');
  }, [req]);

  // Poll for payment + run the countdown.
  useEffect(() => {
    if (!req || paid) return undefined;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(req.expires_at) - new Date()) / 1000));
      setSecsLeft(left);
    };
    tick();
    pollRef.current = setInterval(async () => {
      tick();
      try {
        const r = await fetch(`${API}/api/contactless/requests/${req.id}`, { credentials: 'include' });
        const d = await r.json();
        if (r.ok && d.status === 'paid') {
          setPaid({ amount: d.amount });
          toast.success(`Paiement reçu : ${Number(d.amount).toFixed(2)} €`);
          clearInterval(pollRef.current);
        } else if (r.ok && (d.status === 'expired' || d.expired)) {
          toast('La demande a expiré');
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [req, paid]);

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-20" data-testid="contactless-receive-page">
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1" data-testid="receive-back-btn">
            <ArrowLeft size={22} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Encaisser un paiement</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {paid ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-emerald-100" data-testid="receive-success">
            <CheckCircle size={64} weight="fill" className="text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900">Paiement reçu !</h2>
            <p className="text-3xl font-extrabold text-emerald-600 my-2">{Number(paid.amount).toFixed(2)} €</p>
            <p className="text-sm text-gray-500 mb-5">Le montant net (après commission) a été crédité sur votre solde SB Pay retirable.</p>
            <button onClick={cancel} className="w-full h-12 rounded-xl bg-gray-900 text-white font-bold" data-testid="receive-new-btn">
              Nouvel encaissement
            </button>
          </div>
        ) : !req ? (
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-indigo-50 flex items-center justify-center">
                <QrCode size={24} weight="duotone" className="text-indigo-600" />
              </div>
              <p className="text-sm text-gray-600 flex-1">Saisissez un montant : le client scanne le QR ou tape le code à 6 chiffres pour payer.</p>
            </div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Montant à encaisser (€)</label>
            <input
              type="number" min="1" step="0.5" value={amount} inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex : 12.50"
              className="w-full px-3 py-3 rounded-xl border border-gray-200 text-lg font-bold mb-4"
              data-testid="receive-amount-input"
            />
            <button onClick={generate} disabled={loading} className="w-full h-12 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60" data-testid="receive-generate-btn">
              {loading ? 'Génération…' : 'Générer le QR + code'}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center" data-testid="receive-qr-card">
            <p className="text-sm text-gray-500">Montant à payer</p>
            <p className="text-3xl font-extrabold text-gray-900 mb-4" data-testid="receive-amount">{Number(req.amount).toFixed(2)} €</p>
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-white rounded-2xl border-2 border-gray-100">
                <QRCodeSVG value={payUrl} size={200} data-testid="receive-qr" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">ou saisir le code</p>
            <p className="text-4xl font-mono font-extrabold tracking-[0.3em] text-indigo-600 mb-4" data-testid="receive-code">{req.code}</p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-5" data-testid="receive-countdown">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              En attente du paiement · expire dans {mm}:{ss}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={generate} className="h-11 rounded-xl border border-gray-200 text-sm font-semibold flex items-center justify-center gap-1" data-testid="receive-regenerate-btn">
                <ArrowsClockwise size={16} /> Nouveau
              </button>
              <button onClick={cancel} className="h-11 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 flex items-center justify-center gap-1" data-testid="receive-cancel-btn">
                <X size={16} /> Annuler
              </button>
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
          <HandHeart size={14} /> Idéal quand le client n'a pas assez d'espèces, ou pour un pourboire.
        </p>
      </div>
    </div>
  );
};

export default ContactlessReceivePage;
