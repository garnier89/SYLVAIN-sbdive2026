import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { driverAPI, walletAPI } from '../../services/api';
import { useAppSettings } from '../../hooks/useAppSettings';
import { DriverBottomNav } from './DriverProfilePage';
import { Button } from '../../components/ui/button';
import { Wallet, Plus, ArrowUp, ArrowDown, Clock, CheckCircle, CurrencyEur } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const DriverWalletPage = () => {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [loading, setLoading] = useState(true);

  const loadWallet = useCallback(async () => {
    try {
      const res = await walletAPI.get();
      setWallet(res.data);
    } catch (err) { console.error('Failed to load wallet:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  const withdrawalEnabled = settings.enable_driver_wallet_withdrawal === true;
  const minWithdrawal = Number(settings.driver_wallet_withdrawal_restriction_min || 0);

  const requestPayout = async () => {
    if (wallet.balance < minWithdrawal) { toast.error(`Solde minimum ${minWithdrawal} EUR pour un retrait`); return; }
    toast.success('Demande de retrait envoyee !');
  };

  if (loading) return <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center"><div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /></div>;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-wallet">
      <div className="px-5 pt-6 pb-4"><h1 className="text-2xl font-bold text-white">Portefeuille</h1></div>

      <div className="mx-5 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-5 shadow-xl shadow-amber-500/20 mb-5">
        <p className="text-amber-100 text-sm font-medium">Solde disponible</p>
        <p className="text-4xl font-bold text-white mt-1" data-testid="wallet-balance">{(wallet.balance || 0).toFixed(2)} EUR</p>
        <div className="flex gap-2 mt-4">
          {withdrawalEnabled && (
            <Button onClick={requestPayout} className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm h-10 rounded-xl" data-testid="payout-btn">
              <ArrowUp size={16} className="mr-1" /> Retrait
            </Button>
          )}
          <Button onClick={() => navigate('/wallet')} className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm h-10 rounded-xl">
            <Plus size={16} className="mr-1" /> Recharger
          </Button>
        </div>
        {withdrawalEnabled && (
          <p className="text-amber-100/80 text-[11px] mt-2" data-testid="withdrawal-min-hint">Retrait à partir de {minWithdrawal} EUR.</p>
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
    </div>
  );
};

export default DriverWalletPage;
