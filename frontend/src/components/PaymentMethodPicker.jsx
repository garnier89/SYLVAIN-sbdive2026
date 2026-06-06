import React, { useEffect, useState } from 'react';
import { Money, CreditCard, Wallet, Lightning } from '@phosphor-icons/react';
import usePaymentMethods from '../hooks/usePaymentMethods';
import { walletAPI, financeAPI } from '../services/api';

const ICONS = { cash: Money, card: CreditCard, wallet: Wallet, sbpaygo: Lightning };

/**
 * Reusable 4-method payment picker (Espèces · CB · Portefeuille · SB PayGo).
 * Methods come from the admin-controlled central config (usePaymentMethods).
 * Wallet / SB PayGo show the live balance ; if the balance is below `total`,
 * a hint warns the user that the course will be paid in cash (the backend
 * applies the same cash-fallback when debiting before the driver search).
 */
export const PaymentMethodPicker = ({ value, onChange, total = 0, testidPrefix = 'pay' }) => {
  const { methods } = usePaymentMethods();
  const [balances, setBalances] = useState({});

  useEffect(() => {
    let active = true;
    walletAPI.get().then((r) => active && setBalances((b) => ({ ...b, wallet: r.data?.balance ?? 0 }))).catch(() => {});
    financeAPI.balance().then((r) => active && setBalances((b) => ({ ...b, sbpaygo: r.data?.balance ?? 0 }))).catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-2" data-testid={`${testidPrefix}-methods`}>
      {methods.map((m) => {
        const Icon = ICONS[m.id] || Money;
        const isWallet = ['wallet', 'sbpaygo'].includes(m.id);
        const bal = balances[m.id];
        const insufficient = isWallet && total > 0 && (bal ?? 0) < total;
        const selected = value === m.id;
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => onChange(m.id)}
            aria-pressed={selected}
            data-testid={`${testidPrefix}-${m.id}`}
            className={`w-full flex items-center justify-between border rounded-2xl px-4 py-3 text-left transition-colors ${selected ? 'border-[#FF4500] bg-orange-50' : 'border-gray-200 bg-white'}`}
          >
            <div className="flex items-center gap-3">
              <Icon size={22} weight="fill" className={selected ? 'text-[#FF4500]' : 'text-gray-500'} />
              <div>
                <div className="text-sm font-semibold text-gray-900">{m.label}</div>
                {isWallet ? (
                  <div className={`text-[11px] ${insufficient ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                    Solde&nbsp;: {bal == null ? '—' : `${Number(bal).toFixed(2)} €`}
                    {insufficient ? ' · solde insuffisant → payé en espèces' : ''}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400">À régler à la livraison</div>
                )}
              </div>
            </div>
            <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${selected ? 'border-[#FF4500] bg-[#FF4500]' : 'border-gray-300'}`} />
          </button>
        );
      })}
    </div>
  );
};

export default PaymentMethodPicker;
