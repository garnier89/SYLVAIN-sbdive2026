/**
 * SbRewardsPage — student loyalty: points balance, catalog redemption, history.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CaretLeft, Trophy, Gift, Ticket, Confetti } from '@phosphor-icons/react';
import { studentAPI } from '../../services/api';

const BRAND = '#5B21B6';
const ICONS = { free_ride: Confetti, voucher: Ticket, partner_discount: Gift };

const SbRewardsPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [busy, setBusy] = useState('');

  const load = () => {
    studentAPI.rewardsMe().then((r) => setData(r.data)).catch(() => {});
    studentAPI.rewardsCatalog().then((r) => setCatalog(r.data.rewards || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const redeem = async (rw) => {
    if ((data?.balance || 0) < rw.cost_points) return toast.error('Points insuffisants');
    if (!window.confirm(`Échanger ${rw.cost_points} points contre « ${rw.title} » ?`)) return;
    setBusy(rw.id);
    try {
      const r = await studentAPI.rewardsRedeem(rw.id);
      toast.success(`Récompense obtenue ! Code : ${r.data.redemption.code}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy(''); }
  };

  const balance = data?.balance || 0;

  return (
    <div className="mobile-container min-h-screen bg-[#F5F3FF] pb-16" data-testid="sb-rewards-page">
      <div className="text-white px-4 pt-6 pb-8 rounded-b-3xl" style={{ background: `linear-gradient(135deg, ${BRAND}, #7C3AED)` }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-3" data-testid="rewards-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2"><Trophy size={24} weight="fill" /><h1 className="text-xl font-black">Récompenses</h1></div>
        <p className="text-white/80 text-sm mt-1">Gagnez des points à chaque course et échangez-les.</p>
        <div className="mt-3 bg-white/15 rounded-2xl px-4 py-3 inline-flex items-center gap-2" data-testid="rewards-balance">
          <Trophy size={20} weight="fill" className="text-amber-300" />
          <span className="text-2xl font-black">{balance}</span><span className="text-sm text-white/80">points</span>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        <p className="font-bold text-gray-900">Catalogue</p>
        {catalog.map((rw) => {
          const Icon = ICONS[rw.type] || Gift;
          const can = balance >= rw.cost_points;
          return (
            <div key={rw.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid={`reward-${rw.id}`}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: BRAND + '15' }}><Icon size={22} weight="duotone" style={{ color: BRAND }} /></div>
              <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 text-sm">{rw.title}</p><p className="text-xs text-gray-500">{rw.cost_points} points</p></div>
              <button onClick={() => redeem(rw)} disabled={!can || busy === rw.id} className={`px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40`} style={{ background: BRAND }} data-testid={`reward-redeem-${rw.id}`}>
                {busy === rw.id ? '…' : 'Échanger'}
              </button>
            </div>
          );
        })}
        {catalog.length === 0 && <p className="text-gray-400 text-sm">Aucune récompense disponible.</p>}

        {/* History */}
        {(data?.ledger || []).length > 0 && (
          <>
            <p className="font-bold text-gray-900 mt-4">Historique</p>
            <div className="bg-white rounded-2xl p-3 shadow-sm" data-testid="rewards-history">
              {data.ledger.slice(0, 15).map((l) => (
                <div key={l.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-600">{l.reason === 'ride' ? 'Course' : l.reason?.startsWith('redeem') ? 'Échange' : l.reason}</span>
                  <span className={`font-bold ${l.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{l.delta >= 0 ? '+' : ''}{l.delta}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SbRewardsPage;
