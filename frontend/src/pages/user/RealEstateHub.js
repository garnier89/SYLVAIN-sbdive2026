import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Buildings, Key, Tag, ListBullets, CaretRight, Heart } from '@phosphor-icons/react';

const SERVICES = [
  { key: 'buy', label: 'Acheter un bien', desc: 'Maisons, appartements, terrains, locaux', icon: Buildings, path: '/real-estate?type=sale', grad: 'linear-gradient(135deg, #2563EB, #3B82F6)' },
  { key: 'rent', label: 'Louer un logement', desc: 'Locations résidentielles & commerciales', icon: Key, path: '/real-estate?type=rent', grad: 'linear-gradient(135deg, #059669, #10B981)' },
  { key: 'sell', label: 'Vendre / Mettre en location', desc: 'Publiez votre bien gratuitement', icon: Tag, path: '/real-estate/post', grad: 'linear-gradient(135deg, #EA580C, #F97316)' },
  { key: 'mine', label: 'Mes annonces', desc: 'Gérez & boostez vos biens', icon: ListBullets, path: '/real-estate/my', grad: 'linear-gradient(135deg, #6D28D9, #8B5CF6)' },
];

export const RealEstateHub = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-24" data-testid="realestate-hub">
      <header className="px-4 pt-3.5 pb-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0A2540, #6D28D9)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} aria-label="Retour" data-testid="realestate-hub-back" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
          <div className="flex-1">
            <h1 className="text-xl font-black" style={{ fontFamily: 'Work Sans, sans-serif' }}>Immobilier 🏠</h1>
            <p className="text-[12px] text-white/75 -mt-0.5">Acheter, louer & vendre</p>
          </div>
          <button onClick={() => navigate('/favoris')} aria-label="Favoris" data-testid="realestate-hub-fav" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><Heart size={20} weight="fill" /></button>
        </div>
      </header>
      <div className="p-4 space-y-3 -mt-2">
        <h2 className="text-sm font-bold text-gray-500 px-1">Nos services</h2>
        {SERVICES.map((s) => (
          <button key={s.key} onClick={() => navigate(s.path)} data-testid={`hub-re-${s.key}`}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left shadow-sm active:scale-[0.99] transition-transform" style={{ background: s.grad }}>
            <span className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0"><s.icon size={24} weight="fill" className="text-white" /></span>
            <span className="min-w-0 flex-1">
              <span className="text-white font-black text-sm block leading-tight">{s.label}</span>
              <span className="text-white/85 text-xs block leading-tight">{s.desc}</span>
            </span>
            <CaretRight size={18} className="text-white shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default RealEstateHub;
