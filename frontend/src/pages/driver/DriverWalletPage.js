import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { driverAPI, walletAPI } from '../../services/api';
import { useAppSettings } from '../../hooks/useAppSettings';
import { DriverBottomNav } from './DriverProfilePage';
import { Button } from '../../components/ui/button';
import { Wallet, Plus, ArrowUp, ArrowDown, Clock, CheckCircle, CurrencyEur, X, Bank, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const TOPUP_PACKAGES = [10, 20, 50, 100];

const DriverWalletPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useAppSettings();
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentPolling, setPaymentPolling] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const res = await walletAPI.get();
      setWallet(res.data);
    } catch (err) { console.error('Failed to load wallet:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  // Open the top-up sheet when arriving via ?action=topup (e.g. the cash banner).
  useEffect(() => {
    if (searchParams.get('action') === 'topup') setShowTopup(true);
  }, [searchParams]);

  // Poll Stripe payment status when returning from checkout (stays on this page).
  const pollPaymentStatus = useCallback(async (sessionId, attempts) => {
    if (attempts >= 8) { setPaymentPolling(false); setSearchParams({}); return; }
    try {
      const res = await fetch(`${API}/api/payments/status/${sessionId}`, { credentials: 'include' });
      const data = await res.json();
      if (data.payment_status === 'paid') {
        setPaymentPolling(false);
        toast.success(`Paiement réussi ! +${data.amount} € sur votre portefeuille`);
        setSearchParams({});
        loadWallet();
        return;
      }
      if (data.status === 'expired') { setPaymentPolling(false); setSearchParams({}); return; }
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch { setPaymentPolling(false); setSearchParams({}); }
  }, [setSearchParams, loadWallet]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) { setPaymentPolling(true); pollPaymentStatus(sessionId, 0); }
  }, [searchParams, pollPaymentStatus]);

  const stripeTopup = async (packageIndex, custom) => {
    setTopupLoading(true);
    try {
      const payload = { origin_url: window.location.origin, return_path: '/chauffeur/wallet' };
      if (custom != null) payload.custom_amount = custom;
      else payload.package_id = String(packageIndex);
      const res = await fetch(`${API}/api/payments/checkout`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast.error(data.detail || 'Erreur de paiement');
    } catch { toast.error('Erreur de connexion au paiement'); }
    finally { setTopupLoading(false); }
  };

  const customTopup = () => {
    const val = parseFloat(customAmount);
    if (!val || val < 1 || val > 5000) return toast.error('Montant invalide (1 - 5000 €)');
    stripeTopup(null, Math.round(val * 100) / 100);
  };

  // The backend (/wallet) is the source of truth: drivers/merchants can withdraw.
  const canWithdraw = wallet.can_withdraw === true || settings.enable_driver_wallet_withdrawal === true;
  const withdrawable = Number(wallet.withdrawable || 0);
  const pending = Number(wallet.pending_withdraw || 0);

  const openWithdraw = () => {
    if (withdrawable <= 0) {
      toast.error('Aucun montant retirable pour le moment (réserve conservée).');
      return;
    }
    setShowWithdraw(true);
  };

  if (loading) return <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center"><div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /></div>;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-wallet">
      <div className="px-5 pt-6 pb-4"><h1 className="text-2xl font-bold text-white">Portefeuille</h1></div>

      <div className="mx-5 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-5 shadow-xl shadow-amber-500/20 mb-5">
        <p className="text-amber-100 text-sm font-medium">Solde disponible</p>
        <p className="text-4xl font-bold text-white mt-1" data-testid="wallet-balance">{(wallet.balance || 0).toFixed(2)} EUR</p>
        {wallet.reserve > 0 && (
          <p className="text-amber-100/90 text-xs mt-1" data-testid="driver-reserve-info">
            Réserve {Number(wallet.reserve).toFixed(0)} € (non retirable) · Retirable {withdrawable.toFixed(2)} €
          </p>
        )}
        {pending > 0 && (
          <p className="text-amber-100/90 text-xs mt-1" data-testid="driver-pending-withdraw">
            Retrait en attente de validation : {pending.toFixed(2)} €
          </p>
        )}
        <div className="flex gap-2 mt-4">
          {canWithdraw && (
            <Button onClick={openWithdraw} className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm h-10 rounded-xl" data-testid="payout-btn">
              <ArrowUp size={16} className="mr-1" /> Retrait
            </Button>
          )}
          <Button onClick={() => setShowTopup(true)} className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm h-10 rounded-xl" data-testid="topup-btn">
            <Plus size={16} className="mr-1" /> Recharger
          </Button>
        </div>
        {canWithdraw && (
          <button onClick={() => navigate('/wallet/payout-method')} className="text-amber-100/90 text-[11px] mt-2 underline" data-testid="driver-manage-payout-method">
            Gérer mon moyen de retrait (RIB / Mobile Money) →
          </button>
        )}
      </div>

      <div className="px-5">
        <h2 className="text-white font-bold mb-3">Historique</h2>
        <div className="space-y-2">
          {(wallet.transactions || []).length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <Clock size={28} className="text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Aucune transaction</p>
            </div>
          ) : (
            (wallet.transactions || []).slice(0, 15).map((tx, i) => (
              <div key={tx.id || i} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === 'topup' || tx.type === 'earning' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  {tx.type === 'topup' || tx.type === 'earning' ? <ArrowDown size={18} className="text-green-500" /> : <ArrowUp size={18} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{tx.description || tx.type}</p>
                  <p className="text-gray-500 text-xs">{tx.created_at ? new Date(tx.created_at).toLocaleDateString('fr-FR') : ''}</p>
                </div>
                <p className={`font-bold text-sm ${tx.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {tx.amount > 0 ? '+' : ''}{(tx.amount || 0).toFixed(2)} EUR
                </p>
              </div>
            ))
          )}
        </div>
      </div>
      <DriverBottomNav />
      {paymentPolling && (
        <div className="fixed inset-0 z-[3200] bg-black/70 flex items-center justify-center" data-testid="driver-payment-polling">
          <div className="bg-white rounded-2xl px-6 py-5 flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <span className="text-sm font-semibold text-gray-800">Vérification du paiement…</span>
          </div>
        </div>
      )}
      {showTopup && (
        <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/60" data-testid="driver-topup-sheet">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold flex items-center gap-2"><Plus size={20} weight="bold" className="text-amber-600" /> Recharger mon portefeuille</h3>
              <button onClick={() => setShowTopup(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="driver-topup-close"><X size={14} /></button>
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-1 mb-4"><ShieldCheck size={14} className="text-emerald-600" /> Paiement sécurisé par Stripe</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {TOPUP_PACKAGES.map((amt, idx) => (
                <button key={amt} onClick={() => stripeTopup(idx)} disabled={topupLoading}
                  className="py-3 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-700 font-bold disabled:opacity-60" data-testid={`driver-topup-${amt}`}>
                  {amt} €
                </button>
              ))}
            </div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Autre montant (€)</label>
            <div className="flex gap-2">
              <input type="number" min="1" max="5000" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="0.00" className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm" data-testid="driver-topup-custom-input" />
              <button onClick={customTopup} disabled={topupLoading || !customAmount}
                className="px-4 rounded-xl bg-gray-900 text-white font-bold text-sm disabled:opacity-60" data-testid="driver-topup-custom-btn">
                Payer
              </button>
            </div>
            {topupLoading && <p className="text-xs text-gray-500 text-center mt-3">Redirection vers Stripe…</p>}
          </div>
        </div>
      )}
      {showWithdraw && (
        <DriverWithdrawModal
          withdrawable={withdrawable}
          reserve={Number(wallet.reserve || 0)}
          navigate={navigate}
          onClose={() => setShowWithdraw(false)}
          onDone={() => { setShowWithdraw(false); loadWallet(); }}
        />
      )}
    </div>
  );
};

// Real withdrawal request — freezes the amount until admin validation.
const DriverWithdrawModal = ({ withdrawable, reserve, navigate, onClose, onDone }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [sla, setSla] = useState(null);
  const [express, setExpress] = useState(false);
  const num = parseFloat(amount) || 0;

  useEffect(() => {
    fetch(`${API}/api/payouts/sla`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then(setSla).catch(() => {});
  }, []);

  const fee = express && sla?.express_available ? (sla.express_fee || 0) : 0;
  const net = Math.max(0, num - fee);
  const etaHours = express && sla?.express_available ? sla?.express_hours : sla?.standard_hours;

  const submit = async () => {
    if (num <= 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/wallet/withdraw-request`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, express }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail || 'Échec du retrait';
        if (typeof msg === 'string' && msg.includes('moyen de retrait')) {
          toast.error(msg);
          onClose();
          navigate('/wallet/payout-method');
          return;
        }
        throw new Error(typeof msg === 'string' ? msg : 'Échec du retrait');
      }
      toast.success(`Demande de retrait de ${net.toFixed(2)} € envoyée (en attente de validation)`);
      onDone();
    } catch (e) {
      toast.error(e.message || 'Échec du retrait');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/60" data-testid="driver-withdraw-modal">
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2"><Bank size={20} weight="duotone" className="text-gray-800" /> Retirer mes gains</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="driver-withdraw-close"><X size={14} /></button>
        </div>
        <div className="mb-4 text-xs text-gray-500">
          Retirable : <b className="text-gray-900">{withdrawable.toFixed(2)} €</b>
          {reserve > 0 && <span> · réserve {reserve.toFixed(0)} € conservée</span>}
        </div>
        <label className="text-xs font-semibold text-gray-700 mb-1 block">Montant (€)</label>
        <input type="number" min="1" max={withdrawable} step="1" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-3" data-testid="driver-withdraw-amount-input" />

        {sla?.express_available && (
          <button onClick={() => setExpress(!express)} data-testid="driver-withdraw-express-toggle"
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border mb-3 transition-colors ${express ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
            <span className="text-sm font-semibold text-gray-800">⚡ Express (~{sla.express_hours}h)</span>
            <span className="text-xs text-gray-500">+{(sla.express_fee || 0).toFixed(2)} €</span>
          </button>
        )}

        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-600 space-y-1">
          {etaHours != null && <div>🕒 Versement estimé sous <b className="text-gray-900">~{etaHours}h</b></div>}
          {fee > 0 && <div>Frais express : −{fee.toFixed(2)} € · vous recevrez <b className="text-gray-900">{net.toFixed(2)} €</b></div>}
        </div>

        <button onClick={() => { onClose(); navigate('/wallet/payout-method'); }} className="text-xs text-indigo-600 font-semibold mb-4 block" data-testid="driver-manage-payout-method-modal">
          Gérer mon moyen de retrait (RIB / Mobile Money) →
        </button>
        <button onClick={submit} disabled={loading || num <= 0 || num > withdrawable}
          className="w-full h-12 rounded-xl bg-gray-900 text-white font-bold disabled:opacity-60" data-testid="driver-withdraw-confirm-btn">
          {loading ? 'Envoi…' : `Demander ${net.toFixed(2)} €`}
        </button>
        <p className="text-[11px] text-gray-400 text-center mt-2">Le montant est gelé jusqu'à validation par l'administrateur.</p>
      </div>
    </div>
  );
};

export default DriverWalletPage;
