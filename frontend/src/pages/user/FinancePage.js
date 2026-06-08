import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Bank, ArrowUp, ArrowDown,
  Wallet as WalletIcon, ShieldCheck, Lightning,
  X, CreditCard, DeviceMobile, Buildings, Globe
} from '@phosphor-icons/react';
import { useSbPayGoAvailability } from '../../hooks/useSbPayGoAvailability';
import { useAuth } from '../../contexts/AuthContext';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * FinancePage — SB PayGo dashboard, 100% in-app.
 * No external redirect — TopUp and Send Money are handled via modals.
 */
const FinancePage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { available: zoneAvailable, zone, loading: zoneLoading } = useSbPayGoAvailability(user?.country);
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showSend, setShowSend] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/finance/balance`, { credentials: 'include' });
      if (!res.ok) throw new Error('balance fetch failed');
      const data = await res.json();
      setBalance(data.balance);
      setCurrency(data.currency || 'EUR');
      setTransactions((data.transactions || []).slice().reverse());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const statusRes = await fetch(`${API}/api/finance/status`, { credentials: 'include' });
        const statusData = await statusRes.json();
        setModuleEnabled(statusData.enabled);
        if (!statusData.enabled) { setLoading(false); return; }
        await reload();
      } catch (e) {
        toast.error('Erreur lors du chargement du solde');
      } finally { setLoading(false); }
    };
    load();
  }, [reload]);

  if (!moduleEnabled || (!zoneLoading && !zoneAvailable)) {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="px-4 py-4 flex items-center gap-3 border-b">
          <button onClick={() => navigate(-1)} data-testid="finance-back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold">SB PayGo</h1>
        </div>
        <div className="p-8 text-center text-gray-500" data-testid="sbpaygo-unavailable">
          {!moduleEnabled ? (
            <>
              <ShieldCheck size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm">SB PayGo est actuellement désactivé par l'administrateur.</p>
            </>
          ) : (
            <>
              <Globe size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm">SB PayGo n'est pas encore disponible dans votre région.</p>
              <p className="text-xs text-gray-400 mt-2">Notre équipe travaille à l'extension du service. Revenez bientôt !</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-12" data-testid="finance-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-600 to-purple-600 px-5 pt-5 pb-10 text-white">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="finance-back-btn">
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">SB PayGo</h1>
            <p className="text-xs text-white/70">
              {zone ? `${zone.country_label}${zone.city ? ` · ${zone.city}` : ''}` : 'Connecté à sbdrivevtc.com'}
            </p>
          </div>
          <Bank size={26} weight="duotone" className="text-white/80" />
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5">
          <p className="text-xs text-white/70 mb-1">Solde SB PayGo</p>
          {loading ? (
            <div className="h-9 w-32 bg-white/20 animate-pulse rounded mt-1" />
          ) : (
            <p className="text-3xl font-black" data-testid="finance-balance">
              {money(balance || 0)}
            </p>
          )}
        </div>
      </div>

      {/* Quick actions (in-app, no redirect) */}
      <div className="px-4 -mt-6 grid grid-cols-3 gap-3" data-testid="finance-actions">
        <button onClick={() => setShowTopUp(true)} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center text-center" data-testid="finance-topup-btn">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-1">
            <ArrowDown size={20} weight="bold" className="text-emerald-600" />
          </div>
          <span className="text-[11px] font-semibold text-gray-700">Recharger</span>
        </button>
        <button onClick={() => setShowSend(true)} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center text-center" data-testid="finance-send-btn">
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
                <p className="text-[11px] text-gray-500">{new Date(t.created_at).toLocaleString('fr-FR')}</p>
              </div>
              <p className={`text-sm font-bold ${t.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {t.type === 'credit' ? '+' : '-'}{money(Number(t.amount))}
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
            <b>SB PayGo intégré.</b> Rechargez votre solde et envoyez de l'argent à un autre utilisateur sans jamais quitter l'application. Toutes vos opérations sont sécurisées par votre compte SB Drive.
          </div>
        </div>
      </div>

      {/* Top-up modal */}
      {showTopUp && (
        <TopUpModal
          onClose={() => setShowTopUp(false)}
          onDone={() => { setShowTopUp(false); reload(); }}
        />
      )}
      {/* Send modal */}
      {showSend && (
        <SendModal
          balance={balance || 0}
          onClose={() => setShowSend(false)}
          onDone={() => { setShowSend(false); reload(); }}
        />
      )}
    </div>
  );
};

// ============ TopUpModal ============
const TOPUP_PRESETS = [10, 25, 50, 100];
const SOURCES = [
  { id: 'card', label: 'Carte bancaire', icon: CreditCard },
  { id: 'mobile_money', label: 'Mobile Money', icon: DeviceMobile },
  { id: 'bank', label: 'Virement bancaire', icon: Buildings },
];

const TopUpModal = ({ onClose, onDone }) => {
  const [amount, setAmount] = useState(25);
  const [custom, setCustom] = useState('');
  const [source, setSource] = useState('card');
  const [loading, setLoading] = useState(false);
  const finalAmount = custom ? parseFloat(custom) : amount;

  const submit = async () => {
    if (!finalAmount || finalAmount <= 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/finance/sbpaygo/topup`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalAmount, source }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'topup failed');
      }
      toast.success(`+${finalAmount.toFixed(2)} € rechargés`);
      onDone();
    } catch (e) {
      toast.error(e.message || 'Recharge échouée');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/50" data-testid="topup-modal">
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <ArrowDown size={20} weight="duotone" className="text-emerald-600" />
            Recharger SB PayGo
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="topup-close">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {TOPUP_PRESETS.map((v) => (
            <button
              key={v}
              onClick={() => { setAmount(v); setCustom(''); }}
              className={`py-3 rounded-xl border-2 font-bold text-sm ${!custom && amount === v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-700'}`}
              data-testid={`topup-preset-${v}`}
            >
              {v} €
            </button>
          ))}
        </div>
        <div className="mb-4">
          <input
            type="number" min="1" max="5000" step="1"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Montant personnalisé (€)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
            data-testid="topup-custom-input"
          />
        </div>

        <p className="text-xs font-bold text-gray-700 mb-2">Source de paiement</p>
        <div className="space-y-2 mb-5">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 ${source === s.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'}`}
              data-testid={`topup-source-${s.id}`}
            >
              <s.icon size={20} weight="duotone" className={source === s.id ? 'text-indigo-600' : 'text-gray-500'} />
              <span className="text-sm font-medium text-gray-800">{s.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={loading || !finalAmount}
          className="w-full h-12 rounded-xl bg-orange-600 text-white font-bold disabled:opacity-60"
          data-testid="topup-confirm-btn"
        >
          {loading ? 'Recharge…' : `Recharger ${finalAmount?.toFixed(2) || '0.00'} €`}
        </button>
      </div>
    </div>
  );
};

// ============ SendModal ============
const SendModal = ({ balance, onClose, onDone }) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const numAmount = parseFloat(amount) || 0;

  const submit = async () => {
    if (!recipient.trim() || numAmount <= 0) return;
    if (numAmount > balance) { toast.error('Solde insuffisant'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/finance/sbpaygo/send`, {
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
            <ArrowUp size={20} weight="duotone" className="text-orange-600" />
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

export default FinancePage;
