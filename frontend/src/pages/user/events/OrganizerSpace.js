import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Megaphone, Sparkle, Storefront } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { organizerAPI } from '../../../services/api';

/** Onboarding / entry point for SB Événement Pro (organizer space). */
const OrganizerSpace = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    organizerAPI.me()
      .then((r) => { if (r.data.profile) navigate('/organizer/dashboard', { replace: true }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const register = async () => {
    if (!name.trim()) { toast.error("Entrez le nom de l'organisateur"); return; }
    setSubmitting(true);
    try {
      await organizerAPI.register({ name: name.trim() });
      toast.success('Espace organisateur créé 🎉');
      navigate('/organizer/dashboard', { replace: true });
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-50"><div className="w-8 h-8 border-2 border-red-200 border-t-[#B91C1C] rounded-full animate-spin" /></div>;

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="organizer-space-page">
      <div className="bg-gradient-to-br from-[#7C2D12] via-[#B91C1C] to-[#FF4500] px-4 pt-5 pb-8 rounded-b-3xl">
        <button onClick={() => navigate('/events')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center mb-4" data-testid="back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-2xl font-extrabold text-white">Devenez organisateur</h1>
        <p className="text-white/80 text-sm mt-1">Créez vos événements, vendez vos billets et boostez votre visibilité sur SB Drive.</p>
      </div>

      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {[
            { Icon: Storefront, t: 'Créez & publiez', d: 'Événements + billets en quelques minutes' },
            { Icon: Sparkle, t: 'Suivez vos ventes', d: 'Tableau de bord, participants, recette nette' },
            { Icon: Megaphone, t: 'Boostez (sponsoring)', d: "Mettez votre événement À la une via SB Pay" },
          ].map((b) => (
            <div key={b.t} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0"><b.Icon size={20} weight="fill" className="text-[#B91C1C]" /></div>
              <div><p className="font-bold text-sm text-gray-900">{b.t}</p><p className="text-xs text-gray-500">{b.d}</p></div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Nom de l'organisateur / structure</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. SB Live Productions"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#B91C1C]" data-testid="org-name-input" />
          <button onClick={register} disabled={submitting} className="w-full mt-3 bg-[#B91C1C] text-white font-extrabold py-3 rounded-xl disabled:opacity-60" data-testid="org-register-btn">
            {submitting ? 'Création...' : "Ouvrir mon espace Pro"}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-2">Activation immédiate • Aucun frais d'ouverture</p>
        </div>
      </div>
    </div>
  );
};

export default OrganizerSpace;
