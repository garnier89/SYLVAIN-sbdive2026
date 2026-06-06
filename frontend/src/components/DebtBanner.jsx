import React, { useEffect, useState, useCallback } from 'react';
import { Warning, CircleNotch } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { debtsAPI } from '../services/api';

const REMINDER_MS = 2 * 60 * 60 * 1000; // remind every 2h while unpaid

/**
 * DebtBanner — persistent alert shown while the passenger has an unpaid
 * cancellation debt. Blocks nothing visually but reminds (and re-toasts every
 * 2h). Offers a one-tap "Régler" that settles from the wallet.
 */
export const DebtBanner = () => {
  const [debt, setDebt] = useState(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await debtsAPI.me();
      setDebt(data);
      if (data?.has_debt) {
        const last = Number(localStorage.getItem('debt_reminded_at') || 0);
        if (Date.now() - last > REMINDER_MS) {
          toast.warning(`Dette d'annulation : ${Number(data.total).toFixed(2)} € à régler.`);
          localStorage.setItem('debt_reminded_at', String(Date.now()));
        }
      } else {
        localStorage.removeItem('debt_reminded_at');
      }
    } catch (e) {
      console.warn('[DebtBanner] load failed:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REMINDER_MS);
    return () => clearInterval(t);
  }, [load]);

  const pay = async () => {
    if (paying) return;
    setPaying(true);
    try {
      await debtsAPI.pay();
      toast.success('Dette réglée — merci !');
      localStorage.removeItem('debt_reminded_at');
      setDebt({ has_debt: false, total: 0 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec du paiement. Rechargez votre portefeuille.');
    }
    setPaying(false);
  };

  if (!debt?.has_debt) return null;

  return (
    <div className="mx-4 mt-3 rounded-2xl bg-red-50 border border-red-200 p-3 flex items-center gap-3" data-testid="debt-banner">
      <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
        <Warning size={20} weight="fill" className="text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-red-700 leading-tight">Dette d'annulation : {Number(debt.total).toFixed(2)} €</p>
        <p className="text-[11px] text-red-600/80 leading-snug">Réglez-la (ou rechargez votre portefeuille) pour commander une nouvelle course.</p>
      </div>
      <button onClick={pay} disabled={paying} className="shrink-0 px-3 py-2 rounded-full bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60" data-testid="debt-pay-btn">
        {paying && <CircleNotch size={14} className="animate-spin" />} Régler
      </button>
    </div>
  );
};

export default DebtBanner;
