import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { walletAPI } from '../../services/api';
import { 
  Wallet as WalletIcon, Plus, ArrowLeft, 
  ArrowUp, ArrowDown, Clock, CheckCircle
} from '@phosphor-icons/react';

const WalletPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    loadWallet();
    
    // Check for payment success
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      pollPaymentStatus(sessionId);
    }
  }, [searchParams]);

  const loadWallet = async () => {
    try {
      const response = await walletAPI.get();
      setWallet(response.data);
    } catch (error) {
      console.error('Load wallet error:', error);
    } finally {
      setLoading(false);
    }
  };

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    
    if (attempts >= maxAttempts) {
      setStatusMessage('Payment status check timed out. Please check your email for confirmation.');
      return;
    }

    try {
      const response = await walletAPI.checkStatus(sessionId);
      
      if (response.data.status === 'completed' || response.data.status === 'paid') {
        setStatusMessage(`Successfully added $${response.data.amount} to your wallet!`);
        loadWallet();
        // Clear the session_id from URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      
      setStatusMessage('Payment is being processed...');
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error('Check status error:', error);
      setStatusMessage('Error checking payment status.');
    }
  };

  const handleTopup = async (amount) => {
    setTopupLoading(true);
    try {
      const originUrl = window.location.origin;
      const response = await walletAPI.topup(amount, originUrl);
      window.location.href = response.data.checkout_url;
    } catch (error) {
      console.error('Topup error:', error);
    } finally {
      setTopupLoading(false);
    }
  };

  const topupAmounts = [10, 25, 50, 100];

  return (
    <div className="mobile-container bg-background min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full"
            onClick={() => navigate(-1)}
            data-testid="back-btn"
          >
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-xl font-bold">Wallet</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Status Message */}
        {statusMessage && (
          <Card className={`${statusMessage.includes('Successfully') ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle size={24} className={statusMessage.includes('Successfully') ? 'text-green-600' : 'text-blue-600'} />
              <p className={statusMessage.includes('Successfully') ? 'text-green-800' : 'text-blue-800'}>{statusMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-primary to-emerald-400 text-white">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <WalletIcon size={28} weight="duotone" />
              </div>
              <div>
                <p className="text-sm opacity-90">Available Balance</p>
                <h2 className="text-3xl font-bold" data-testid="wallet-balance">
                  ${loading ? '...' : wallet.balance.toFixed(2)}
                </h2>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Top-up */}
        <div>
          <h3 className="font-semibold mb-3">Quick Top-up</h3>
          <div className="grid grid-cols-4 gap-2">
            {topupAmounts.map((amount) => (
              <Button
                key={amount}
                variant="outline"
                className="h-16 rounded-xl flex flex-col"
                onClick={() => handleTopup(amount)}
                disabled={topupLoading}
                data-testid={`topup-${amount}`}
              >
                <span className="font-bold text-lg">${amount}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Transaction History</h3>
          </div>
          
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/2" />
                        <div className="h-3 bg-muted rounded w-1/3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : wallet.transactions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <WalletIcon size={48} className="mx-auto mb-2 opacity-50" />
                <p>No transactions yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {wallet.transactions.map((txn, index) => (
                <Card key={txn.id || index} data-testid={`transaction-${index}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      txn.type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {txn.type === 'credit' ? (
                        <ArrowDown size={20} className="text-green-600" />
                      ) : (
                        <ArrowUp size={20} className="text-red-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{txn.description || (txn.type === 'credit' ? 'Top-up' : 'Payment')}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(txn.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`font-bold ${txn.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                      {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletPage;
