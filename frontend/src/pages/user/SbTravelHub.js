import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AirplaneTilt, Bed, Suitcase, CaretRight, GlobeHemisphereWest } from '@phosphor-icons/react';
import { OffresDuMoment } from '../../components/OffresDuMoment';

const NAVY = '#0A2540';

const SERVICES = [
  { key: 'flights', label: 'Billets d\'avion', desc: 'Recherchez et réservez vos vols', icon: AirplaneTilt, path: '/vols', grad: 'linear-gradient(135deg, #1D4ED8, #2563EB)' },
  { key: 'hotels', label: 'Hôtels', desc: 'Réservez votre séjour · meilleurs tarifs', icon: Bed, path: '/hotels', grad: 'linear-gradient(135deg, #0E7490, #0891B2)' },
  { key: 'packages', label: 'Forfaits Vol + Hôtel', desc: 'Packages tout compris · prix réduit', icon: Suitcase, path: '/forfaits', grad: 'linear-gradient(135deg, #7C3AED, #9333EA)', badge: 'PROMO' },
];

const SbTravelHub = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-24" data-testid="sb-travel-hub">
      <header className="px-4 pt-3.5 pb-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0A2540, #1D4ED8)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} aria-label="Retour" data-testid="sbtravel-back-btn" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
          <div className="flex-1">
            <h1 className="text-xl font-black flex items-center gap-2" style={{ fontFamily: 'Work Sans, sans-serif' }}><GlobeHemisphereWest size={22} weight="fill" /> SB Travel</h1>
            <p className="text-[12px] text-white/75 -mt-0.5">Vols, hôtels & forfaits voyage</p>
          </div>
        </div>
      </header>

      <div className="-mt-4">
        <OffresDuMoment className="bg-gray-50 pt-4" />
      </div>

      <div className="p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-500 px-1">Nos services</h2>
        {SERVICES.map((s) => (
          <button key={s.key} onClick={() => navigate(s.path)} data-testid={`sbtravel-${s.key}`}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left shadow-sm active:scale-[0.99] transition-transform" style={{ background: s.grad }}>
            <span className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0"><s.icon size={24} weight="fill" className="text-white" /></span>
            <span className="min-w-0 flex-1">
              <span className="text-white font-black text-sm block leading-tight">{s.label}</span>
              <span className="text-white/85 text-xs block leading-tight">{s.desc}</span>
            </span>
            {s.badge
              ? <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#FF5000] text-white shrink-0">{s.badge}</span>
              : <CaretRight size={18} className="text-white shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SbTravelHub;
