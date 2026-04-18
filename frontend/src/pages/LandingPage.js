import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Car, Package, ForkKnife, Wrench, ShieldCheck, MapPin,
  ArrowRight, Star, Users, Phone, Envelope, Globe,
  Lightning, CaretDown, Play, CheckCircle,
  Storefront, Taxi, Wallet, Heart,
  SteeringWheel, DeviceMobile
} from '@phosphor-icons/react';

const stats = [
  { value: '50K+', label: 'Utilisateurs actifs' },
  { value: '10K+', label: 'Chauffeurs partenaires' },
  { value: '500+', label: 'Marchands' },
  { value: '22+', label: 'Services disponibles' },
];

const services = [
  { icon: Car, name: 'VTC & Taxi', desc: '10 types de véhicules, réservation instantanée ou programmée', color: '#FF4500' },
  { icon: ForkKnife, name: 'Livraison Repas', desc: 'Restaurants, fast-food, traiteurs livrés chez vous', color: '#e11d48' },
  { icon: Package, name: 'Colis & Coursier', desc: 'Envoi express de colis et documents en ville', color: '#7c3aed' },
  { icon: Wrench, name: 'Services à domicile', desc: 'Plomberie, électricité, ménage, réparations', color: '#059669' },
  { icon: Storefront, name: 'Commerces Proches', desc: 'Pharmacie, supermarché, pressing à proximité', color: '#0891b2' },
  { icon: Heart, name: 'Beauté & Bien-être', desc: 'Coiffure, massage, manucure à domicile', color: '#ec4899' },
];

const steps = [
  { num: '01', title: 'Téléchargez l\'app', desc: 'Disponible sur iOS et Android, inscription en 30 secondes' },
  { num: '02', title: 'Choisissez un service', desc: '22+ services : VTC, livraison, ménage, beauté et plus' },
  { num: '03', title: 'Réservez en un clic', desc: 'Suivi en temps réel, paiement sécurisé, service garanti' },
];

const testimonials = [
  { name: 'Marie L.', role: 'Utilisatrice', text: 'SB Drive a changé mon quotidien. Je commande mon VTC et mes courses en un clic !', rating: 5 },
  { name: 'Amadou D.', role: 'Chauffeur VTC', text: 'Grâce à SB Drive, je gère mes courses et mes revenus facilement. Excellent outil.', rating: 5 },
  { name: 'Sophie M.', role: 'Restauratrice', text: 'Mes commandes en ligne ont triplé depuis que je suis sur SB Drive Kiosk.', rating: 5 },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      {/* ===== NAVBAR ===== */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100" data-testid="landing-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#FF4500] flex items-center justify-center">
                <Car size={20} weight="bold" className="text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900 tracking-tight">SB Drive <span className="text-[#FF4500]">VTC</span></span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#services" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Services</a>
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Comment ça marche</a>
              <a href="#driver" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Devenir chauffeur</a>
              <a href="#merchant" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Marchand</a>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => navigate('/login')} className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2" data-testid="nav-login">Connexion</button>
              <button onClick={() => navigate('/login')} className="text-sm font-bold text-white bg-[#FF4500] hover:bg-[#e03e00] px-5 py-2.5 rounded-full transition-colors" data-testid="nav-signup">S'inscrire</button>
            </div>
            <button className="md:hidden p-2" onClick={() => setMobileMenu(!mobileMenu)}>
              <CaretDown size={20} className={`text-gray-600 transition-transform ${mobileMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {mobileMenu && (
            <div className="md:hidden pb-4 space-y-2 border-t border-gray-100 pt-3">
              <a href="#services" className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Services</a>
              <a href="#how-it-works" className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Comment ça marche</a>
              <a href="#driver" className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Devenir chauffeur</a>
              <button onClick={() => navigate('/login')} className="w-full text-sm font-bold text-white bg-[#FF4500] px-5 py-2.5 rounded-full mt-2">S'inscrire</button>
            </div>
          )}
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="pt-24 pb-16 sm:pt-32 sm:pb-24 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 relative overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#FF4500] rounded-full blur-[120px]" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-500 rounded-full blur-[150px]" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-medium px-4 py-2 rounded-full mb-6 backdrop-blur-sm border border-white/10">
                <Lightning size={14} weight="fill" className="text-amber-400" />
                Plateforme #1 de Super App en France
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
                Tout ce dont vous avez besoin.
                <span className="text-[#FF4500]"> Une seule app.</span>
              </h1>
              <p className="mt-6 text-lg text-gray-400 leading-relaxed max-w-lg">
                VTC, livraison, services à domicile, beauté, courses — 22+ services réunis dans une super app intuitive et sécurisée.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={() => navigate('/login')}
                  className="inline-flex items-center gap-2 bg-[#FF4500] hover:bg-[#e03e00] text-white font-bold px-8 py-4 rounded-full text-base transition-all hover:shadow-lg hover:shadow-[#FF4500]/25"
                  data-testid="hero-cta"
                >
                  Commencer gratuitement
                  <ArrowRight size={20} weight="bold" />
                </button>
                <button
                  onClick={() => navigate('/chauffeur')}
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium px-8 py-4 rounded-full text-base transition-all border border-white/20"
                  data-testid="hero-driver-cta"
                >
                  <SteeringWheel size={20} />
                  Devenir chauffeur
                </button>
              </div>
              {/* Stats */}
              <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6">
                {stats.map(s => (
                  <div key={s.label}>
                    <p className="text-2xl sm:text-3xl font-bold text-white">{s.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden lg:flex justify-center">
              <div className="relative w-[300px] h-[600px] bg-gray-800 rounded-[3rem] border-4 border-gray-700 shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-2xl z-10" />
                <div className="w-full h-full bg-gradient-to-b from-gray-900 to-gray-950 p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-[#FF4500] flex items-center justify-center mb-4">
                    <Car size={40} weight="duotone" className="text-white" />
                  </div>
                  <p className="text-white text-xl font-bold">SB Drive</p>
                  <p className="text-gray-400 text-sm mt-1">VTC & Services</p>
                  <div className="mt-8 grid grid-cols-3 gap-3 w-full">
                    {[Car, ForkKnife, Package, Wrench, Heart, Storefront].map((Icon, i) => (
                      <div key={i} className="w-full aspect-square rounded-xl bg-white/5 flex items-center justify-center">
                        <Icon size={24} className="text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <section id="services" className="py-20 sm:py-28 bg-gray-50" data-testid="services-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-bold text-[#FF4500] uppercase tracking-wider mb-3">Nos Services</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">22+ services à portée de main</h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto">De la réservation VTC à la livraison de repas, en passant par les services à domicile et la beauté.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="group bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300" data-testid={`service-card-${s.name}`}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: s.color + '15' }}>
                    <Icon size={24} weight="duotone" style={{ color: s.color }} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{s.name}</h3>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-white" data-testid="how-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-bold text-[#FF4500] uppercase tracking-wider mb-3">Comment ça marche</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Simple comme 1, 2, 3</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map(s => (
              <div key={s.num} className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#FF4500]/10 flex items-center justify-center mx-auto mb-5">
                  <span className="text-2xl font-bold text-[#FF4500]">{s.num}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">{s.title}</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== DRIVER SECTION ===== */}
      <section id="driver" className="py-20 sm:py-28 bg-gray-950" data-testid="driver-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">Devenez chauffeur</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">Gagnez de l'argent avec SB Drive</h2>
              <p className="mt-4 text-gray-400 leading-relaxed">Rejoignez notre réseau de chauffeurs partenaires. Conduisez, livrez, et choisissez vos horaires librement.</p>
              <div className="mt-8 space-y-4">
                {['Commissions compétitives', 'Paiement hebdomadaire garanti', 'Application chauffeur dédiée', 'Support 24h/24 7j/7'].map(item => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle size={22} weight="fill" className="text-amber-400 flex-shrink-0" />
                    <span className="text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/chauffeur')}
                className="mt-8 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-8 py-4 rounded-full transition-all"
                data-testid="driver-cta"
              >
                <SteeringWheel size={20} weight="bold" />
                S'inscrire comme chauffeur
              </button>
            </div>
            <div className="hidden lg:flex justify-center">
              <div className="w-[280px] h-[560px] bg-gray-800 rounded-[3rem] border-4 border-gray-700 shadow-2xl overflow-hidden p-6 flex flex-col items-center justify-center text-center">
                <SteeringWheel size={48} weight="duotone" className="text-amber-500 mb-4" />
                <p className="text-white text-xl font-bold">SB Drive</p>
                <p className="text-amber-400 text-sm mt-1">Chauffeur</p>
                <div className="mt-6 w-full space-y-3">
                  <div className="bg-white/5 rounded-xl p-3 text-left">
                    <p className="text-xs text-gray-500">Gains du jour</p>
                    <p className="text-lg font-bold text-white">127,50 EUR</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-left">
                    <p className="text-xs text-gray-500">Courses effectuées</p>
                    <p className="text-lg font-bold text-white">8 courses</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MERCHANT SECTION ===== */}
      <section id="merchant" className="py-20 sm:py-28 bg-white" data-testid="merchant-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-bold text-[#FF4500] uppercase tracking-wider mb-3">Espace Marchand</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Développez votre activité avec SB Kiosk</h2>
          <p className="mt-4 text-gray-500 max-w-2xl mx-auto">Gérez vos commandes, vos produits et vos promotions depuis un tableau de bord intuitif.</p>
          <div className="mt-12 grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { icon: Storefront, title: 'Votre vitrine en ligne', desc: 'Publiez vos produits et services' },
              { icon: Package, title: 'Gestion des commandes', desc: 'Suivi en temps réel de chaque commande' },
              { icon: Wallet, title: 'Revenus & Analytics', desc: 'Tableau de bord de vos performances' },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="p-6 rounded-2xl bg-gray-50 border border-gray-100">
                  <Icon size={32} weight="duotone" className="text-[#FF4500] mx-auto mb-3" />
                  <h3 className="font-bold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-20 sm:py-28 bg-gray-50" data-testid="testimonials-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-bold text-[#FF4500] uppercase tracking-wider mb-3">Témoignages</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Ce que disent nos utilisateurs</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div key={t.name} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={`star-${t.name}-${i}`} size={16} weight="fill" className="text-amber-400" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed italic">"{t.text}"</p>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-20 sm:py-28 bg-[#FF4500]" data-testid="cta-section">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Prêt à commencer ?</h2>
          <p className="mt-4 text-white/80 text-lg max-w-xl mx-auto">Rejoignez des milliers d'utilisateurs qui font confiance à SB Drive pour leur quotidien.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="inline-flex items-center gap-2 bg-white text-[#FF4500] font-bold px-8 py-4 rounded-full hover:bg-gray-100 transition-colors"
              data-testid="cta-signup"
            >
              <DeviceMobile size={20} />
              Créer un compte
            </button>
            <button
              onClick={() => navigate('/chauffeur')}
              className="inline-flex items-center gap-2 bg-white/20 text-white font-bold px-8 py-4 rounded-full hover:bg-white/30 transition-colors border border-white/30"
              data-testid="cta-driver"
            >
              Devenir chauffeur
            </button>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-gray-950 py-16" data-testid="landing-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#FF4500] flex items-center justify-center">
                  <Car size={18} weight="bold" className="text-white" />
                </div>
                <span className="text-white font-bold">SB Drive VTC</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">La super app de mobilité et de services à la demande en France.</p>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-4">Applications</h4>
              <div className="space-y-2">
                <button onClick={() => navigate('/login')} className="block text-sm text-gray-500 hover:text-white transition-colors">SB Drive Client</button>
                <button onClick={() => navigate('/chauffeur')} className="block text-sm text-gray-500 hover:text-white transition-colors">SB Drive Chauffeur</button>
                <button onClick={() => navigate('/login?app=merchant')} className="block text-sm text-gray-500 hover:text-white transition-colors">SB Kiosk (Marchand)</button>
                <button onClick={() => navigate('/admin-login')} className="block text-sm text-gray-500 hover:text-white transition-colors">Administration</button>
              </div>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-4">Services</h4>
              <div className="space-y-2">
                <span className="block text-sm text-gray-500">VTC & Taxi</span>
                <span className="block text-sm text-gray-500">Livraison de repas</span>
                <span className="block text-sm text-gray-500">Colis & Coursier</span>
                <span className="block text-sm text-gray-500">Services à domicile</span>
                <span className="block text-sm text-gray-500">Beauté & Bien-être</span>
              </div>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-4">Contact</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Envelope size={14} /> contact@sbdrivevtc.com
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone size={14} /> +33 1 00 00 00 00
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Globe size={14} /> sbdrivevtc.com
                </div>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-600">© {new Date().getFullYear()} SB Drive VTC. Tous droits réservés.</p>
            <div className="flex gap-6">
              <span className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">Mentions légales</span>
              <span className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">CGU</span>
              <span className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">Confidentialité</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
