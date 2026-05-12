import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Bank, ArrowSquareOut, ArrowUp, ArrowDown,
  Wallet as WalletIcon, ShieldCheck, Lightning
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * FinancePage — SB PayGo dashboard for SB Drive users.
 * Shows balance + last transactions, and an SSO link to sbpaygo.com.
 */
const FinancePage = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const statusRes = await fetch(`${API}/api/finance/status`, { credentials: 'include' });
        const statusData = await statusRes.json();
        setModuleEnabled(statusData.enabled);
        if (!statusData.enabled) { setLoading(false); return; }

        const res = await fetch(`${API}/api/finance/balance`, { credentials: 'include' });
        if (!res.ok) throw new Error('balance fetch failed');
        const data = await res.json();
        setBalance(data.balance);
        setCurrency(data.currency || 'EUR');
        setTransactions(data.transactions || []);
      } catch (e) {
        console.error(e);
        toast.error('Erreur lors du chargement du solde');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openSbPaygo = async () => {
    setRedirecting(true);
    try {
      const res = await fetch(`${API}/api/finance/sbpaygo/sso-link`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('sso failed');
      const data = await res.json();
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error(e);
      toast.error('Impossible d\'ouvrir SB PayGo');
    } finally {
      setRedirecting(false);
    }
  };

  if (!moduleEnabled) {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="px-4 py-4 flex items-center gap-3 border-b">
          <button onClick={() => navigate(-1)} data-testid="finance-back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold">SB PayGo</h1>
        </div>
        <div className="p-8 text-center text-gray-500">
          <ShieldCheck size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">SB PayGo est actuellement désactivé par l'administrateur.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-12" data-testid="finance-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 px-5 pt-5 pb-10 text-white">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="finance-back-btn">
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">SB PayGo</h1>
            <p className="text-xs text-white/70">Connecté à sbdrivevtc.com</p>
          </div>
          <Bank size={26} weight="duotone" className="text-white/80" />
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5">
          <p className="text-xs text-white/70 mb-1">Solde SB PayGo</p>
          {loading ? (
            <div className="h-9 w-32 bg-white/20 animate-pulse rounded mt-1" />
          ) : (
            <p className="text-3xl font-black" data-testid="finance-balance">
              {balance?.toFixed(2)} <span className="text-base font-bold">{currency === 'EUR' ? '€' : currency}</span>
            </p>
          )}
          <button
            onClick={openSbPaygo}
            disabled={redirecting}
            className="mt-4 inline-flex items-center gap-2 bg-white text-indigo-700 px-4 py-2 rounded-full text-sm font-bold disabled:opacity-60"
            data-testid="open-sbpaygo-btn"
          >
            {redirecting ? 'Ouverture...' : 'Ouvrir SB PayGo'}
            <ArrowSquareOut size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-4 -mt-6 grid grid-cols-3 gap-3" data-testid="finance-actions">
        <button onClick={openSbPaygo} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center text-center" data-testid="finance-topup-btn">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-1">
            <ArrowDown size={20} weight="bold" className="text-emerald-600" />
          </div>
          <span className="text-[11px] font-semibold text-gray-700">Recharger</span>
        </button>
        <button onClick={openSbPaygo} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center text-center" data-testid="finance-send-btn">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center mb-1">
            <ArrowUp size={20} weight="bold" className="text-orange-600" />
          </div>
          <span className="text-[11px] font-semibold text-gray-700">Envoyer</span>
        </button>
        <button onClick={() => navigate('/wallet')} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center text-center" data-testid="finance-wallet-btn">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-1">
            <WalletIcon size={20} weight="bold" className="text-blue-600" />
          </div>
          <span className="text-[11px] font-semibold text-gray-700">Portefeuille</span>
        </button>
      </div>

      {/* Transactions */}
      <div className="px-4 mt-6">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Dernières transactions</h3>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y" data-testid="finance-tx-list">
          {transactions.length === 0 && !loading && (
            <div className="p-6 text-center text-xs text-gray-500">Aucune transaction pour le moment.</div>
          )}
          {transactions.map((t, i) => (
            <div key={t.id || i} className="flex items-center gap-3 p-3" data-testid={`finance-tx-${i}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${t.type === 'credit' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                {t.type === 'credit'
                  ? <ArrowDown size={16} weight="bold" className="text-emerald-600" />
                  : <ArrowUp size={16} weight="bold" className="text-rose-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{t.label || 'Transaction'}</p>
                <p className="text-[11px] text-gray-500">{t.created_at}</p>
              </div>
              <p className={`text-sm font-bold ${t.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {t.type === 'credit' ? '+' : '-'}{Number(t.amount).toFixed(2)} €
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Info card */}
      <div className="px-4 mt-6">
        <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 flex gap-3" data-testid="finance-info-card">
          <Lightning size={22} weight="duotone" className="text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-700 leading-relaxed">
            Votre compte SB Drive VTC est <b>connecté à SB PayGo</b>. Aucune nouvelle inscription n'est requise — utilisez directement votre identifiant SB Drive pour vous connecter sur sbpaygo.com.
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancePage;
