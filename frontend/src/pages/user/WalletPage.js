import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { walletAPI, couponAPI } from '../../services/api';
import {
  Wallet as WalletIcon, Plus, ArrowLeft,
  ArrowUp, ArrowDown, Gift, Tag, Coins, PaperPlaneTilt, X, ShieldCheck, Bank, QrCode
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TOPUP_PACKAGES = [
  { id: '10', amount: 10 },
  { id: '20', amount: 20 },
  { id: '50', amount: 50 },
  { id: '100', amount: 100 },
];

const WalletPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [wallet, setWallet] = useState({ balance: 0, currency: 'EUR', transactions: [] });
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [message, setMessage] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [showCoupons, setShowCoupons] = useState(false);
  const [paymentPolling, setPaymentPolling] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [cashbackCfg, setCashbackCfg] = useState(null);
  const [cashbackSummary, setCashbackSummary] = useState(null);

  const loadWallet = useCallback(async () => {
    try {
      const res = await walletAPI.get();
      setWallet(res.data);
    } catch (err) { console.error('Failed to load wallet:', err); } finally { setLoading(false); }
  }, []);

  const loadCoupons = useCallback(async () => {
    try {
      const res = await couponAPI.list();
      setCoupons(res.data);
    } catch (err) { console.error('Failed to load coupons:', err); }
  }, []);

  useEffect(() => { loadWallet(); loadCoupons(); }, [loadWallet, loadCoupons]);

  useEffect(() => {
    fetch(`${API_URL}/api/finance/cashback/config`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.enabled) setCashbackCfg(d); })
      .catch(() => {});
    fetch(`${API_URL}/api/finance/cashback/summary`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCashbackSummary(d); })
      .catch(() => {});
  }, []);

  // Deep-link actions from side menu (?action=topup|send)
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'topup') setShowTopup(true);
    if (action === 'send') setShowSend(true);
  }, [searchParams]);

  // Poll Stripe payment status when returning from checkout
  const pollPaymentStatus = useCallback(async (sessionId, attempts) => {
    if (attempts >= 8) {
      setPaymentPolling(false);
      setMessage('Vérification du paiement expirée. Vérifiez votre email.');
      setSearchParams({});
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/payments/status/${sessionId}`, { credentials: 'include' });
      const data = await res.json();

      if (data.payment_status === 'paid') {
        setPaymentPolling(false);
        setMessage(`+${data.amount} EUR ajouté à votre solde SB Pay !`);
        toast.success(`Paiement réussi ! +${data.amount} EUR`);
        setSearchParams({});
        loadWallet();
        return;
      } else if (data.status === 'expired') {
        setPaymentPolling(false);
        setMessage('Session de paiement expirée.');
        setSearchParams({});
        return;
      }
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (err) {
      console.error('Payment poll error:', err);
      setPaymentPolling(false);
      setMessage('Erreur lors de la vérification du paiement.');
      setSearchParams({});
    }
  }, [setSearchParams, loadWallet]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      setPaymentPolling(true);
      pollPaymentStatus(sessionId, 0);
    }
  }, [searchParams, pollPaymentStatus]);

  const handleStripeTopup = async (packageId, custom) => {
    setTopupLoading(true);
    setMessage('');
    try {
      const payload = { origin_url: window.location.origin };
      if (custom != null) payload.custom_amount = custom;
      else payload.package_id = packageId;
      const res = await fetch(`${API_URL}/api/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage(data.detail || 'Erreur de paiement');
      }
    } catch (err) {
      console.error('Stripe topup error:', err);
      setMessage('Erreur de connexion au service de paiement');
    } finally {
      setTopupLoading(false);
    }
  };

  const handleCustomTopup = () => {
    const val = parseFloat(customAmount);
    if (!val || val < 1 || val > 5000) {
      toast.error('Montant invalide (1 - 5000 €)');
      return;
    }
    handleStripeTopup(null, Math.round(val * 100) / 100);
  };

  const getTxColor = (amount) => amount >= 0 ? 'text-green-600' : 'text-red-600';
  const getTxBg = (amount) => amount >= 0 ? 'bg-green-50' : 'bg-red-50';
  const getTxIcon = (amount) => amount >= 0 ? ArrowDown : ArrowUp;

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-20" data-testid="wallet-page">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1" data-testid="wallet-back-btn">
            <ArrowLeft size={22} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">SB Pay</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Success message */}
        {message && (
          <div className={`p-3 rounded-xl text-sm font-medium ${message.includes('Erreur') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`} data-testid="wallet-message">
            {message}
          </div>
        )}

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-orange-500 rounded-2xl p-6 text-white" data-testid="wallet-balance-card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
              <WalletIcon size={24} weight="duotone" />
            </div>
            <div>
              <p className="text-xs text-white/70">Solde SB Pay disponible</p>
              <h2 className="text-3xl font-bold" data-testid="wallet-balance">
                {loading ? '...' : (wallet.balance || 0).toFixed(2)} <span className="text-lg font-normal">EUR</span>
              </h2>
              {wallet.can_withdraw && wallet.reserve > 0 && (
                <p className="text-[11px] text-white/75 mt-1" data-testid="wallet-reserve-info">
                  Réserve {Number(wallet.reserve).toFixed(0)} € non retirable · Retirable {Number(wallet.withdrawable || 0).toFixed(2)} €
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl h-10 text-sm"
              onClick={() => setShowTopup(true)}
              data-testid="topup-btn"
            >
              <Plus size={16} className="mr-1" /> Recharger
            </Button>
            <Button
              className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl h-10 text-sm"
              onClick={() => setShowSend(true)}
              data-testid="send-btn"
            >
              <PaperPlaneTilt size={16} className="mr-1" /> Envoyer
            </Button>
            <Button
              className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl h-10 text-sm"
              onClick={() => setShowCoupons(!showCoupons)}
              data-testid="coupons-btn"
            >
              <Tag size={16} className="mr-1" /> Coupons
            </Button>
          </div>
        </div>

        {/* Withdraw (drivers & merchants) */}
        {wallet.can_withdraw && (
          <button
            onClick={() => setShowWithdraw(true)}
            className="w-full h-12 rounded-2xl bg-gray-900 text-white font-bold flex items-center justify-center gap-2"
            data-testid="open-withdraw-btn"
          >
            <Bank size={18} weight="fill" /> Retirer vers mon compte
          </button>
        )}

        {/* Phase D — Contactless payments */}
        {wallet.can_withdraw && (
          <button
            onClick={() => navigate('/encaisser')}
            className="w-full h-12 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2"
            data-testid="receive-payment-btn"
          >
            <QrCode size={18} weight="fill" /> Encaisser un paiement (QR)
          </button>
        )}
        <button
          onClick={() => navigate('/pay')}
          className="w-full h-12 rounded-2xl bg-white border border-gray-200 text-gray-800 font-bold flex items-center justify-center gap-2"
          data-testid="scan-pay-btn"
        >
          <QrCode size={18} weight="duotone" className="text-indigo-600" /> Payer / Scanner un QR
        </button>

        {/* Linked accounts */}
        <button
          onClick={() => navigate('/wallet/linked-accounts')}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-700"
          data-testid="linked-accounts-link"
        >
          <span>🔗 Comptes liés</span>
          <span className="text-gray-300">›</span>
        </button>

        {/* Cashback advert + monthly counter */}
        {cashbackCfg && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5" data-testid="cashback-banner">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Gift size={20} weight="fill" className="text-emerald-600" />
              </div>
              <p className="text-[13px] text-emerald-800 leading-snug flex-1">
                Gagnez <b>{cashbackCfg.rate_pct}% de cashback SB Pay</b> sur chaque paiement par SB Pay ou carte
                {cashbackCfg.min_amount > 0 ? ` (dès ${cashbackCfg.min_amount} €)` : ''}.
              </p>
            </div>
            {cashbackSummary && (
              <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center justify-between" data-testid="cashback-monthly-counter">
                <div>
                  <p className="text-[11px] text-emerald-700/70 uppercase tracking-wide font-semibold">Cashback ce mois-ci</p>
                  <p className="text-xl font-extrabold text-emerald-700">{(cashbackSummary.this_month || 0).toFixed(2)} €</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-emerald-700/70 uppercase tracking-wide font-semibold">Total gagné</p>
                  <p className="text-base font-bold text-emerald-600">{(cashbackSummary.all_time || 0).toFixed(2)} €</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Topup Sheet */}
        {showTopup && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200" data-testid="topup-sheet">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-900">Recharger SB Pay</h3>
              <button onClick={() => setShowTopup(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center" data-testid="topup-close"><X size={14} /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
              <ShieldCheck size={14} className="text-emerald-600" /> Paiement sécurisé par Stripe
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TOPUP_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => handleStripeTopup(pkg.id)}
                  disabled={topupLoading}
                  className="h-16 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center disabled:opacity-50"
                  data-testid={`topup-${pkg.amount}`}
                >
                  <span className="text-xl font-bold">{pkg.amount}</span>
                  <span className="text-[10px] text-gray-400">EUR</span>
                </button>
              ))}
            </div>
            {/* Custom amount */}
            <div className="mt-3 flex gap-2">
              <input
                type="number" min="1" max="5000" step="1"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Montant libre (€)"
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                data-testid="topup-custom-input"
              />
              <button
                onClick={handleCustomTopup}
                disabled={topupLoading || !customAmount}
                className="px-4 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
                data-testid="topup-custom-btn"
              >
                Payer
              </button>
            </div>
            {topupLoading && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                Redirection vers Stripe...
              </div>
            )}
          </div>
        )}

        {/* Payment Processing Banner */}
        {paymentPolling && (
          <div className="bg-orange-50 border border-[#FF4500]/30 rounded-2xl p-4 flex items-center gap-3" data-testid="payment-polling">
            <div className="w-8 h-8 border-3 border-[#FF4500]/30 border-t-[#FF4500] rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Vérification du paiement...</p>
              <p className="text-xs text-gray-500">Veuillez patienter</p>
            </div>
          </div>
        )}

        {/* Coupons Section */}
        {showCoupons && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200" data-testid="coupons-section">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Gift size={18} className="text-[#FF4500]" /> Codes promo disponibles
            </h3>
            {coupons.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun coupon disponible</p>
            ) : (
              <div className="space-y-2">
                {coupons.map((c) => (
                  <div key={c.code || c.id} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100" data-testid={`coupon-${c.code}`}>
                    <Tag size={20} className="text-[#FF4500]" />
                    <div className="flex-1">
                      <p className="font-bold text-blue-800">{c.code}</p>
                      <p className="text-xs text-[#FF4500]">{c.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#E03D00]">
                        {c.discount_type === 'Percentage' ? `${c.discount_value}%` : `${c.discount_value} EUR`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Transactions */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Historique</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="flex gap-3"><div className="w-10 h-10 bg-gray-200 rounded-full" /><div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-2/3" /><div className="h-2 bg-gray-200 rounded w-1/3" /></div></div>
                </div>
              ))}
            </div>
          ) : wallet.transactions.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center" data-testid="no-transactions">
              <Coins size={40} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">Aucune transaction</p>
            </div>
          ) : (
            <div className="space-y-2">
              {wallet.transactions.map((tx, i) => {
                const TxIcon = getTxIcon(tx.amount);
                return (
                  <div key={tx.id || i} className="bg-white rounded-xl p-3 flex items-center gap-3" data-testid={`tx-${i}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getTxBg(tx.amount)}`}>
                      <TxIcon size={18} className={getTxColor(tx.amount)} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{tx.description || tx.type}</p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(tx.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className={`font-bold text-sm ${getTxColor(tx.amount)}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)} EUR
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Send modal (P2P) */}
      {showSend && (
        <SendModal
          balance={wallet.balance || 0}
          initialRecipient={searchParams.get('to') || ''}
          onClose={() => { setShowSend(false); if (searchParams.get('action')) setSearchParams({}); }}
          onDone={() => { setShowSend(false); if (searchParams.get('action')) setSearchParams({}); loadWallet(); }}
        />
      )}

      {/* Withdraw modal (drivers & merchants) */}
      {showWithdraw && (
        <WithdrawModal
          withdrawable={wallet.withdrawable || 0}
          reserve={wallet.reserve || 0}
          navigate={navigate}
          onClose={() => setShowWithdraw(false)}
          onDone={() => { setShowWithdraw(false); loadWallet(); }}
        />
      )}
    </div>
  );
};

// ============ WithdrawModal ============
const WithdrawModal = ({ withdrawable, reserve, navigate, onClose, onDone }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [sla, setSla] = useState(null);
  const [express, setExpress] = useState(false);
  const num = parseFloat(amount) || 0;

  useEffect(() => {
    fetch(`${API_URL}/api/payouts/sla`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then(setSla).catch(() => {});
  }, []);

  const fee = express && sla?.express_available ? (sla.express_fee || 0) : 0;
  const net = Math.max(0, num - fee);
  const etaHours = express && sla?.express_available ? sla?.express_hours : sla?.standard_hours;

  const submit = async () => {
    if (num <= 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/wallet/withdraw-request`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, express }),
      });
      if (!res.ok) {
        const err = await res.json();
        const msg = err.detail || 'Échec';
        if (msg.includes('moyen de retrait')) {
          toast.error(msg);
          onClose();
          navigate('/wallet/payout-method');
          return;
        }
        throw new Error(msg);
      }
      toast.success(`Demande de retrait de ${net.toFixed(2)} € envoyée (en attente de validation)`);
      onDone();
    } catch (e) {
      toast.error(e.message || 'Échec du retrait');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/50" data-testid="withdraw-modal">
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2"><Bank size={20} weight="duotone" className="text-gray-800" /> Retirer mes gains</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="withdraw-close"><X size={14} /></button>
        </div>
        <div className="mb-4 text-xs text-gray-500">
          Retirable : <b className="text-gray-900">{withdrawable.toFixed(2)} €</b>
          {reserve > 0 && <span> · réserve {reserve.toFixed(0)} € conservée</span>}
        </div>
        <label className="text-xs font-semibold text-gray-700 mb-1 block">Montant (€)</label>
        <input type="number" min="1" max={withdrawable} step="1" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-3" data-testid="withdraw-amount-input" />

        {/* Express option */}
        {sla?.express_available && (
          <button onClick={() => setExpress(!express)} data-testid="withdraw-express-toggle"
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border mb-3 transition-colors ${express ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
            <span className="text-sm font-semibold text-gray-800">⚡ Express (~{sla.express_hours}h)</span>
            <span className="text-xs text-gray-500">+{(sla.express_fee || 0).toFixed(2)} €</span>
          </button>
        )}

        {/* Estimated delay + net */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-600 space-y-1" data-testid="withdraw-eta">
          {etaHours != null && <div>🕒 Versement estimé sous <b className="text-gray-900">~{etaHours}h</b></div>}
          {fee > 0 && <div>Frais express : −{fee.toFixed(2)} € · vous recevrez <b className="text-gray-900">{net.toFixed(2)} €</b></div>}
        </div>

        <button onClick={() => navigate('/wallet/payout-method')} className="text-xs text-indigo-600 font-semibold mb-4 block" data-testid="manage-payout-method">
          Gérer mon moyen de retrait (RIB / Mobile Money) →
        </button>
        <button onClick={submit} disabled={loading || num <= 0 || num > withdrawable}
          className="w-full h-12 rounded-xl bg-gray-900 text-white font-bold disabled:opacity-60" data-testid="withdraw-confirm-btn">
          {loading ? 'Envoi…' : `Demander ${net.toFixed(2)} €`}
        </button>
        <p className="text-[11px] text-gray-400 text-center mt-2">Le montant est gelé jusqu'à validation par l'administrateur.</p>
      </div>
    </div>
  );
};

// ============ SendModal (P2P transfer by phone) ============
const SendModal = ({ balance, initialRecipient, onClose, onDone }) => {
  const [recipient, setRecipient] = useState(initialRecipient || '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const numAmount = parseFloat(amount) || 0;

  const submit = async () => {
    if (!recipient.trim() || numAmount <= 0) return;
    if (numAmount > balance) { toast.error('Solde insuffisant'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/finance/sbpaygo/send`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_phone: recipient, amount: numAmount, note: note || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'send failed');
      }
      const data = await res.json();
      toast.success(`${numAmount.toFixed(2)} € envoyés${data.recipient_found ? '' : ' (destinataire en attente)'}`);
      onDone();
    } catch (e) {
      toast.error(e.message || 'Envoi échoué');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/50" data-testid="send-modal">
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <PaperPlaneTilt size={20} weight="duotone" className="text-orange-600" />
            Envoyer de l'argent
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="send-close">
            <X size={14} />
          </button>
        </div>

        <div className="mb-4 text-xs text-gray-500">Solde disponible : <b className="text-gray-900">{balance.toFixed(2)} €</b></div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Téléphone du destinataire</label>
            <input
              type="tel" value={recipient} onChange={(e) => setRecipient(e.target.value)}
              placeholder="+33 6 12 34 56 78"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
              data-testid="send-recipient-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Montant (€)</label>
            <input
              type="number" min="0.5" step="0.5" max={balance}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
              data-testid="send-amount-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Note (optionnel)</label>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : Remboursement repas"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
              data-testid="send-note-input"
            />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={loading || !recipient.trim() || numAmount <= 0 || numAmount > balance}
          className="w-full h-12 rounded-xl bg-orange-600 text-white font-bold disabled:opacity-60"
          data-testid="send-confirm-btn"
        >
          {loading ? 'Envoi…' : `Envoyer ${numAmount.toFixed(2)} €`}
        </button>
      </div>
    </div>
  );
};

export default WalletPage;
