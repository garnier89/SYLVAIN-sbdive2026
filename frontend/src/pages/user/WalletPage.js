import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { walletAPI, couponAPI } from '../../services/api';
import {
  Wallet as WalletIcon, Plus, ArrowLeft,
  ArrowUp, ArrowDown, Clock, CheckCircle,
  Gift, Tag, CreditCard, Coins
} from '@phosphor-icons/react';

const WalletPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [wallet, setWallet] = useState({ balance: 0, currency: 'EUR', transactions: [] });
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [showCoupons, setShowCoupons] = useState(false);

  useEffect(() => { loadWallet(); loadCoupons(); }, []);

  const loadWallet = async () => {
    try {
      const res = await walletAPI.get();
      setWallet(res.data);
    } catch { /* empty */ } finally { setLoading(false); }
  };

  const loadCoupons = async () => {
    try {
      const res = await couponAPI.list();
      setCoupons(res.data);
    } catch { /* empty */ }
  };

  const handleTopup = async (amount) => {
    setTopupLoading(true);
    setMessage('');
    try {
      const res = await walletAPI.topup(amount, 'card');
      setWallet(prev => ({ ...prev, balance: res.data.balance, transactions: [res.data.transaction, ...prev.transactions] }));
      setMessage(`+${amount} EUR ajouté au wallet`);
      setShowTopup(false);
      setCustomAmount('');
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Erreur lors du rechargement');
    } finally { setTopupLoading(false); }
  };

  const topupAmounts = [10, 50, 100];

  const getTxIcon = (type) => {
    if (['Deposit', 'Refund', 'Transfer'].includes(type) ) return ArrowDown;
    return ArrowUp;
  };

  const getTxColor = (amount) => amount >= 0 ? 'text-green-600' : 'text-red-600';
  const getTxBg = (amount) => amount >= 0 ? 'bg-green-50' : 'bg-red-50';

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-20" data-testid="wallet-page">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1" data-testid="wallet-back-btn">
            <ArrowLeft size={22} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Portefeuille</h1>
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
        <div className="bg-gradient-to-br from-gray-900 to-gray-700 rounded-2xl p-6 text-white" data-testid="wallet-balance-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
              <WalletIcon size={24} weight="duotone" />
            </div>
            <div>
              <p className="text-xs text-gray-300">Solde disponible</p>
              <h2 className="text-3xl font-bold" data-testid="wallet-balance">
                {loading ? '...' : wallet.balance.toFixed(2)} <span className="text-lg font-normal">EUR</span>
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl h-10 text-sm"
              onClick={() => setShowTopup(true)}
              data-testid="topup-btn"
            >
              <Plus size={16} className="mr-1" /> Recharger
            </Button>
            <Button
              className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl h-10 text-sm"
              onClick={() => setShowCoupons(!showCoupons)}
              data-testid="coupons-btn"
            >
              <Tag size={16} className="mr-1" /> Coupons
            </Button>
          </div>
        </div>

        {/* Topup Sheet */}
        {showTopup && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200" data-testid="topup-sheet">
            <h3 className="font-semibold text-gray-900 mb-3">Recharger le portefeuille</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {topupAmounts.map(amount => (
                <button
                  key={amount}
                  onClick={() => handleTopup(amount)}
                  disabled={topupLoading}
                  className="h-14 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center justify-center"
                  data-testid={`topup-${amount}`}
                >
                  <span className="text-lg font-bold">{amount}</span>
                  <span className="text-[10px] text-gray-400">EUR</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Montant personnalise"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                data-testid="custom-amount-input"
              />
              <Button
                onClick={() => { if (customAmount > 0) handleTopup(parseFloat(customAmount)); }}
                disabled={topupLoading || !customAmount}
                className="rounded-xl"
                data-testid="custom-topup-btn"
              >
                OK
              </Button>
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
                {coupons.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100" data-testid={`coupon-${i}`}>
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
                const TxIcon = getTxIcon(tx.type);
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
    </div>
  );
};

export default WalletPage;
