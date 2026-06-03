/**
 * CorporateAccountPage (Pack C — B2B, côté client).
 * L'employé rejoint son entreprise via un code et voit ses comptes actifs.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Buildings, SignOut, Briefcase } from '@phosphor-icons/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { corporateAPI } from '../../services/api';

const CorporateAccountPage = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try { const r = await corporateAPI.my(); setAccounts(r.data.items || []); }
    catch (e) { console.warn('corporate load failed:', e?.message || e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const join = async () => {
    if (!code.trim()) return toast.error('Entrez un code entreprise');
    setJoining(true);
    try {
      const r = await corporateAPI.join(code.trim());
      toast.success(r.data.message || `Rejoint ${r.data.corporate_name}`);
      setCode(''); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Code invalide');
    } finally { setJoining(false); }
  };

  const leave = async (id) => {
    if (!window.confirm('Quitter cette entreprise ?')) return;
    try { await corporateAPI.leave(id); toast.success('Vous avez quitté l\'entreprise'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="corporate-account-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E293B] text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="corporate-back"><ArrowLeft size={24} /></button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-indigo-500/30">
            <Briefcase size={26} className="text-indigo-300" weight="duotone" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Mes entreprises</h1>
            <p className="text-xs text-gray-400">Facturez vos courses à votre société</p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Join form */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="text-[11px] text-gray-500 font-semibold uppercase mb-1 block">Rejoindre avec un code</label>
          <div className="flex gap-2">
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex: ACME-2026" data-testid="join-code-input" />
            <Button onClick={join} disabled={joining} data-testid="join-corporate-btn" className="bg-indigo-600 hover:bg-indigo-700">
              {joining ? '...' : 'Rejoindre'}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Demandez le code à votre administrateur d'entreprise.</p>
        </div>

        {/* Accounts list */}
        <div className="space-y-3" data-testid="corporate-list">
          {accounts.length === 0 && (
            <div className="bg-white rounded-2xl p-6 text-center text-gray-400 shadow-sm">
              <Buildings size={40} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Vous n'êtes membre d'aucune entreprise.</p>
            </div>
          )}
          {accounts.map(a => (
            <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between" data-testid={`corporate-card-${a.id}`}>
              <div>
                <p className="font-bold text-gray-900">{a.name}</p>
                <p className="text-xs text-gray-500 font-mono">{a.join_code}</p>
                <p className="text-xs text-emerald-600 font-semibold mt-1">Remise {a.discount_pct}% · {a.member_role}</p>
              </div>
              <button onClick={() => leave(a.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg" title="Quitter" data-testid={`leave-corporate-${a.id}`}>
                <SignOut size={18} />
              </button>
            </div>
          ))}
        </div>

        {accounts.length > 0 && (
          <Button onClick={() => navigate('/taxi-advanced?mode=corporate')} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="book-corporate-ride-btn">
            Réserver une course entreprise
          </Button>
        )}
      </div>
    </div>
  );
};

export default CorporateAccountPage;
