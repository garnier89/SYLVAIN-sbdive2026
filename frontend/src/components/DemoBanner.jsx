/**
 * DemoBanner — thin global banner shown when the Demo Mode is enabled.
 * Offers a non-charged "Crédit démo" wallet top-up. Hidden in production mode.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Flask, Plus } from '@phosphor-icons/react';
import { demoModeAPI } from '../services/api';

const DemoBanner = () => {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem('token');
    if (!token) return undefined;
    demoModeAPI.status().then((r) => { if (mounted) setCfg(r.data); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  if (!cfg?.enabled) return null;

  const credit = async () => {
    setBusy(true);
    try {
      const r = await demoModeAPI.walletCredit();
      toast.success(`+${Number(r.data.credited).toFixed(2)} € crédités (démo) · solde ${Number(r.data.balance).toFixed(2)} €`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy(false); }
  };

  return (
    <div className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] font-bold text-amber-950"
      style={{ background: 'repeating-linear-gradient(45deg,#FCD34D,#FCD34D 12px,#FbbF24 12px,#FbbF24 24px)' }}
      data-testid="demo-banner">
      <Flask size={15} weight="fill" /> MODE DÉMO
      <button onClick={credit} disabled={busy}
        className="ml-2 flex items-center gap-1 bg-amber-950 text-amber-50 px-2 py-0.5 rounded-full text-[11px] disabled:opacity-50"
        data-testid="demo-credit-btn">
        <Plus size={11} weight="bold" /> {busy ? '…' : `Crédit démo +${Number(cfg.wallet_credit || 100).toFixed(0)} €`}
      </button>
    </div>
  );
};

export default DemoBanner;
