import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Car, Motorcycle, SteeringWheel, Tag, Storefront, CaretRight, Heart,
} from '@phosphor-icons/react';

const NAVY = '#0A2540';

const Hub = ({ title, subtitle, grad, services, navigate, testid }) => (
  <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-24" data-testid={testid}>
    <header className="px-4 pt-3.5 pb-6 text-white relative overflow-hidden" style={{ background: grad }}>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} aria-label="Retour" data-testid={`${testid}-back`} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-black" style={{ fontFamily: 'Work Sans, sans-serif' }}>{title}</h1>
          <p className="text-[12px] text-white/75 -mt-0.5">{subtitle}</p>
        </div>
        <button onClick={() => navigate('/favoris')} aria-label="Favoris" data-testid={`${testid}-fav`} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><Heart size={20} weight="fill" /></button>
      </div>
    </header>
    <div className="p-4 space-y-3 -mt-2">
      <h2 className="text-sm font-bold text-gray-500 px-1">Nos services</h2>
      {services.map((s) => (
        <button key={s.key} onClick={() => navigate(s.path)} data-testid={`hub-${s.key}`}
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

export const VehiclesHub = () => {
  const navigate = useNavigate();
  return <Hub testid="vehicles-hub" title="Véhicules 🚗" subtitle="Achat, vente & location de véhicules"
    grad="linear-gradient(135deg, #0A2540, #2563EB)" navigate={navigate}
    services={[
      { key: 'buy-sell', label: 'Acheter / Vendre', desc: 'Voitures, motos & plus (occasion & neuf)', icon: Tag, path: '/marketplace/cars', grad: 'linear-gradient(135deg, #2563EB, #3B82F6)' },
      { key: 'rent-p2p', label: 'Louer entre particuliers', desc: 'Véhicules à louer près de chez vous', icon: Car, path: '/marketplace/cars?type=rent', grad: 'linear-gradient(135deg, #059669, #10B981)' },
      { key: 'car-selfdrive', label: 'Location voiture (self-drive)', desc: 'Notre flotte · vous conduisez · caution', icon: SteeringWheel, path: '/location-voiture', grad: 'linear-gradient(135deg, #EA580C, #F97316)' },
      { key: 'moto-selfdrive', label: 'Location moto (self-drive)', desc: 'Scooters & motos en libre-service', icon: Motorcycle, path: '/moto-location', grad: 'linear-gradient(135deg, #7C3AED, #9333EA)' },
    ]} />;
};

export const ShoppingHub = () => {
  const navigate = useNavigate();
  return <Hub testid="shopping-hub" title="Shopping 🛍️" subtitle="Acheter & vendre des produits"
    grad="linear-gradient(135deg, #BE185D, #DB2777)" navigate={navigate}
    services={[
      { key: 'buy-items', label: 'Acheter des produits', desc: 'Électronique, mode, maison & plus', icon: Storefront, path: '/marketplace/items', grad: 'linear-gradient(135deg, #DB2777, #EC4899)' },
      { key: 'rent-items', label: 'Louer des articles', desc: 'Matériel & équipements à louer', icon: Tag, path: '/marketplace/items?type=rent', grad: 'linear-gradient(135deg, #059669, #10B981)' },
      { key: 'sell-items', label: 'Vendre un article', desc: 'Publiez votre annonce en 2 minutes', icon: Tag, path: '/ma-galerie', grad: 'linear-gradient(135deg, #0891B2, #06B6D4)' },
    ]} />;
};

export default VehiclesHub;
