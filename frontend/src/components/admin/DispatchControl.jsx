import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Broadcast, X } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';
import { toast } from 'sonner';

/**
 * Sequential dispatch control for an unassigned ride: launches an offer chain
 * (closest drivers, 15s each, auto-escalation) and shows the live offer + countdown.
 */
export const DispatchControl = ({ ride, onChange }) => {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const prevStatus = useRef(null);

  const refetch = useCallback(async () => {
    try {
      const s = (await adminAPI.dispatchStatus(ride.id)).data.session;
      setSession(s);
      if (s && prevStatus.current === 'offering' && s.status !== 'offering') {
        if (s.status === 'accepted') { toast.success('Offre acceptée — chauffeur assigné ✅'); onChange?.(); }
        else if (s.status === 'exhausted') toast.warning('Aucun chauffeur n\'a accepté — course laissée en attente.');
      }
      prevStatus.current = s?.status || null;
    } catch (e) { /* ignore */ }
  }, [ride.id, onChange]);

  useEffect(() => { refetch(); }, [refetch]);

  // Poll status every 2s while offering.
  useEffect(() => {
    if (session?.status !== 'offering') return undefined;
    const t = setInterval(refetch, 2000);
    return () => clearInterval(t);
  }, [session?.status, refetch]);

  // Countdown ticker.
  useEffect(() => {
    if (session?.status !== 'offering' || !session?.expires_at) { setRemaining(0); return undefined; }
    const tick = () => setRemaining(Math.max(0, Math.round((new Date(session.expires_at) - new Date()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session?.expires_at, session?.status]);

  const start = async () => {
    setBusy(true);
    try { setSession((await adminAPI.autoDispatch(ride.id)).data.session); prevStatus.current = 'offering'; toast.success('Dispatch auto lancé'); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    try { await adminAPI.dispatchCancel(ride.id); setSession(null); prevStatus.current = null; toast('Dispatch annulé'); }
    catch (e) { toast.error('Échec'); }
  };

  if (session?.status === 'offering') {
    const cur = (session.chain || [])[session.index] || {};
    return (
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5" data-testid="dispatch-offering">
        <Broadcast size={15} className="text-blue-600 animate-pulse" />
        <span className="text-xs text-blue-800 font-semibold">Offre → {cur.name || '…'}</span>
        <span className="text-xs font-mono font-bold text-blue-600" data-testid="dispatch-countdown">{remaining}s</span>
        <span className="text-[10px] text-blue-400">tour {session.round}/3</span>
        <button onClick={cancel} className="text-blue-400 hover:text-blue-700" data-testid="dispatch-cancel-btn"><X size={14} /></button>
      </div>
    );
  }
  return (
    <button onClick={start} disabled={busy} className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-2.5 py-1.5 disabled:opacity-50" data-testid="dispatch-auto-btn">
      <Broadcast size={14} /> {busy ? '…' : 'Dispatch auto'}
    </button>
  );
};

export default DispatchControl;
