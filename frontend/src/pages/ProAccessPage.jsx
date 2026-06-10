import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Car, SteeringWheel, Storefront, DeviceTabletSpeaker, ShieldCheck, Headset,
  ArrowRight, ArrowLeft, Globe,
} from '@phosphor-icons/react';

const APPS = [
  {
    id: 'client', title: 'SB Drive Client', to: '/login', logo: '/sb-logo-driver.png',
    icon: Car, accent: '#FF4500',
    desc: 'Réservez un VTC, commandez des repas, envoyez des colis et gérez votre SB Pay.',
    tags: ['VTC', 'Repas', 'Colis', 'Services'],
  },
  {
    id: 'chauffeur', title: 'SB Drive Chauffeur', to: '/chauffeur', icon: SteeringWheel, accent: '#F59E0B',
    desc: 'Conduisez, livrez et suivez vos gains en temps réel.',
    tags: ['Courses', 'Livraisons', 'Gains'],
  },
  {
    id: 'store', title: 'SB Store', to: '/login/email', logo: '/sb-store-logo.jpg',
    icon: Storefront, accent: '#EF4444',
    desc: 'Espace commerçant : commandes en direct, catalogue, stock et analytics.',
    tags: ['Commandes', 'Stock', 'Analytics'],
  },
  {
    id: 'kiosk', title: 'SB Tab (Kiosk)', to: '/tab', icon: DeviceTabletSpeaker, accent: '#06B6D4',
    desc: 'Borne libre-service en point de vente pour commander sans application.',
    tags: ['Libre-service', 'Borne', 'Point de vente'],
  },
  {
    id: 'admin', title: 'Administration', to: '/admin-login', icon: ShieldCheck, accent: '#8B5CF6',
    desc: 'Pilotage et supervision complète de la plateforme.',
    tags: ['Supervision', 'Réglages', 'Finances'],
  },
  {
    id: 'dispatcher', title: 'Dispatcher', to: '/dispatcher', icon: Headset, accent: '#3B82F6',
    desc: 'Répartition et coordination des courses en temps réel.',
    tags: ['Répartition', 'Temps réel', 'Support'],
  },
];

const ProAccessPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const redirects = { user: '/home', driver: '/chauffeur/home', merchant: '/merchant', admin: '/admin', dispatcher: '/dispatch' };
      navigate(redirects[user.role] || '/home', { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white relative overflow-hidden" data-testid="pro-access-page">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#FF4500]/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl" />

      <div className="relative max-w-6xl mx-auto px-5 py-12 sm:py-16">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-10 text-sm" data-testid="pro-back-home">
          <ArrowLeft size={18} /> Retour à l'accueil
        </button>

        <header className="mb-12 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <img src="/sb-logo-driver.png" alt="SB" className="h-12 w-12 rounded-2xl object-contain drop-shadow-[0_0_20px_rgba(255,69,0,0.4)]" />
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#FF4500]">Espace Pro</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">
            Connectez-vous à votre<br /><span className="text-[#FF4500]">application SB Drive</span>
          </h1>
          <p className="text-gray-400 text-base mt-4">
            Toutes les interfaces de l'écosystème SB Drive, réunies au même endroit. Choisissez votre espace.
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {APPS.map((app, i) => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => navigate(app.to)}
                data-testid={`pro-app-${app.id}`}
                style={{ animationDelay: `${i * 70}ms` }}
                className="group relative text-left rounded-2xl bg-white/[0.04] border border-white/10 p-6 transition-all duration-200 hover:bg-white/[0.07] hover:-translate-y-1 animate-[fadeInUp_0.5s_ease_both]"
              >
                <div
                  className="absolute inset-x-0 top-0 h-1 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: app.accent }}
                />
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
                    style={{ backgroundColor: `${app.accent}1A` }}
                  >
                    {app.logo
                      ? <img src={app.logo} alt={app.title} className="w-9 h-9 object-contain" />
                      : <Icon size={30} weight="duotone" style={{ color: app.accent }} />}
                  </div>
                  <ArrowRight size={22} className="text-gray-600 group-hover:translate-x-1 transition-transform" style={{ color: app.accent }} />
                </div>
                <h2 className="text-lg font-bold text-white">{app.title}</h2>
                <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{app.desc}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {app.tags.map((t) => (
                    <span key={t} className="px-2.5 py-1 rounded-full bg-white/5 text-[11px] text-gray-400 border border-white/10">{t}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Website */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center"><Globe size={24} className="text-gray-300" /></div>
            <div>
              <p className="font-semibold text-white">Site web officiel</p>
              <p className="text-sm text-gray-400">Découvrez SB Drive sur sbdrivevtc.com</p>
            </div>
          </div>
          <a
            href="https://www.sbdrivevtc.com" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4500] text-white text-sm font-bold hover:bg-[#e63e00] transition-colors"
            data-testid="pro-website-link"
          >
            Visiter le site <ArrowRight size={16} />
          </a>
        </div>

        <p className="text-center text-gray-600 text-xs mt-10">SB Drive VTC &copy; {new Date().getFullYear()} — Tous droits réservés</p>
      </div>

      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
};

export default ProAccessPage;
