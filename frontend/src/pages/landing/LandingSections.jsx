import React from 'react';
import {
  Car, MapPin, Phone, Globe, Lightning, Clock, Users, Taxi, CalendarCheck, Gavel,
  NavigationArrow, Receipt, Eye, LockKey, DeviceMobile, SteeringWheel, Buildings,
  Handshake, Briefcase, UserPlus,
} from '@phosphor-icons/react';

export const SB_LOGO = 'https://www.sbdrivevtc.com/assets/img/apptype/ProPTX/logo.png';
export const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.sbdrivervtc.client';
export const APP_STORE = 'https://apps.apple.com/fr/app/sb-drive-client/id1444980912';
export const PHONE = '+33759691797';
const PLAY_IMG = 'https://www.sbdrivevtc.com/webimages/upload/ckImages/images/play%20store%20300%20.png';
const APP_IMG = 'https://www.sbdrivevtc.com/webimages/upload/ckImages/images/apple%20store%20300%20.png';

const howItWorks = [
  { icon: DeviceMobile, title: 'Reservez en un clic !', desc: "Il vous suffit de prendre votre telephone, saisir votre destination, et l'application vous mettra en relation avec un chauffeur en quelques minutes." },
  { icon: Car, title: 'Infos chauffeur', desc: "Des que votre demande de trajet est acceptee, l'application vous transmet automatiquement toutes les informations du chauffeur, y compris la marque et le modele du vehicule." },
  { icon: NavigationArrow, title: 'Suivre et guider', desc: "Suivez en temps reel l'itineraire de votre chauffeur pour vous rejoindre. Visualisez sa position sur la carte et guidez-le si besoin." },
  { icon: Receipt, title: 'Facturation', desc: "Une fois que le chauffeur est arrive, montez a bord et profitez de votre trajet. L'application calculera automatiquement le tarif et vous enverra la facture a la fin du trajet." },
];

const services = [
  { icon: Taxi, name: 'VTC-Taxi', desc: "Reservez instantanement un chauffeur. Profitez de delais d'attente reduits, de trajets rapides et de tarifs avantageux." },
  { icon: Users, name: 'Pool-Partage', desc: "Reduisez vos couts en partageant le vehicule avec d'autres passagers se dirigeant vers la meme destination." },
  { icon: Gavel, name: 'Proposer votre tarif', desc: "Fixez vous-meme votre prix VTC. Proposez votre tarif aux chauffeurs disponibles et selectionnez l'offre la plus adaptee." },
  { icon: CalendarCheck, name: 'Reservez a l\'avance', desc: "Planifiez vos trajets a l'avance pour eviter les imprevus de derniere minute !" },
];

const registrationOptions = [
  { label: 'INSCRIPTION CLIENT', icon: UserPlus, path: '/login', color: '#FF5000' },
  { label: 'INSCRIPTION CHAUFFEUR', icon: SteeringWheel, path: '/chauffeur', color: '#1a1a2e' },
  { label: 'FLOTTE', icon: Car, path: '/login', color: '#16213e' },
  { label: 'ESPACE PRO', icon: Briefcase, path: '/login', color: '#0f3460' },
  { label: 'ESPACE PARTENAIRE', icon: Handshake, path: '/login', color: '#533483' },
];

const StoreLinks = ({ size = 'h-10' }) => (
  <>
    <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer"><img src={PLAY_IMG} alt="Google Play" className={`${size} hover:opacity-80 transition-opacity`} /></a>
    <a href={APP_STORE} target="_blank" rel="noopener noreferrer"><img src={APP_IMG} alt="App Store" className={`${size} hover:opacity-80 transition-opacity`} /></a>
  </>
);

export const HowItWorksSection = () => (
  <section id="how-it-works" className="py-16 sm:py-24 bg-gray-50" data-testid="how-section">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-14">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-wide">Comment ca fonctionne</h2>
        <p className="mt-3 text-gray-500 max-w-2xl mx-auto text-sm sm:text-base">Une plateforme simple et rapide pour reserver votre chauffeur en quelques minutes.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {howItWorks.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="bg-white rounded-2xl p-6 text-center border border-gray-100 hover:shadow-lg transition-shadow" data-testid={`how-step-${i}`}>
              <div className="w-16 h-16 rounded-2xl bg-[#FF5000]/10 flex items-center justify-center mx-auto mb-4">
                <Icon size={28} weight="duotone" className="text-[#FF5000]" />
              </div>
              <span className="text-xs font-bold text-[#FF5000] mb-2 block">0{i + 1}</span>
              <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

export const PoolBusinessSection = ({ navigate }) => (
  <section className="py-16 sm:py-24 bg-white" data-testid="pool-section">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-gray-950 rounded-2xl p-8 text-white">
          <h3 className="text-xl font-bold uppercase tracking-wide mb-4">Pool & Location</h3>
          <p className="text-gray-400 text-sm leading-relaxed">Louez un vehicule avec chauffeur en toute simplicite. Avec l'application SB Drive VTC, reservez un vehicule avec chauffeur pour quelques heures ou une journee entiere, selon vos besoins.</p>
          <p className="text-gray-400 text-sm leading-relaxed mt-3">Envie d'economiser ? Choisissez l'option "Pool" : partagez votre trajet avec d'autres passagers allant dans la meme direction, reduisez vos frais tout en voyageant confortablement.</p>
          <button onClick={() => navigate('/login')} className="mt-6 bg-[#FF5000] hover:bg-[#cc4000] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors">Reserver un Pool</button>
        </div>
        <div className="bg-gradient-to-br from-[#FF5000] to-[#cc4000] rounded-2xl p-8 text-white">
          <h3 className="text-xl font-bold uppercase tracking-wide mb-4">Des trajets destines aux entreprises</h3>
          <p className="text-white/80 text-sm leading-relaxed">Reservez facilement vos trajets professionnels ! Vos deplacements pro sont directement factures a votre entreprise, pour plus de simplicite.</p>
          <div className="mt-6 flex items-center gap-3">
            <Buildings size={24} className="text-white/60" />
            <span className="text-white/80 text-sm">Facturation entreprise directe</span>
          </div>
          <button onClick={() => navigate('/login')} className="mt-6 bg-white text-[#FF5000] font-bold px-6 py-3 rounded-xl text-sm hover:bg-gray-100 transition-colors">Espace Pro</button>
        </div>
      </div>
    </div>
  </section>
);

export const ServicesSection = () => (
  <section id="services" className="py-16 sm:py-24 bg-gray-50" data-testid="services-section">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-14">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-wide">Des trajets disponibles pour tous</h2>
        <p className="mt-3 text-gray-500 max-w-2xl mx-auto text-sm sm:text-base">Une appli concue pour tous vos deplacements ! Presse, planifiez a l'avance ou partagez votre course pour economiser, SB Drive VTC s'adapte a vous.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {services.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.name} className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:border-[#FF5000]/20 transition-all text-center group" data-testid={`service-${s.name}`}>
              <div className="w-20 h-20 rounded-2xl bg-[#FF5000]/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-[#FF5000]/20 transition-colors">
                <Icon size={36} weight="duotone" className="text-[#FF5000]" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{s.name}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

export const WhySection = () => (
  <section className="py-16 sm:py-24 bg-white" data-testid="why-section">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-wide text-center mb-14">Pourquoi utiliser nos services ?</h2>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="flex items-start gap-4 p-6 bg-gray-50 rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-[#FF5000]/10 flex items-center justify-center flex-shrink-0"><Lightning size={28} weight="duotone" className="text-[#FF5000]" /></div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Des trajets economiques</h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">Reservez un chauffeur selon votre budget, sans surprise ! Vous ne payez que le prix affiche.</p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-6 bg-gray-50 rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-[#FF5000]/10 flex items-center justify-center flex-shrink-0"><Clock size={28} weight="duotone" className="text-[#FF5000]" /></div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Trouver un chauffeur</h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">Plus besoin d'attendre ! Trouvez et reservez vite un chauffeur pour arriver a l'heure.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export const SecuritySection = () => (
  <section id="security" className="py-16 sm:py-24 bg-gray-950" data-testid="security-section">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-14">
        <h2 className="text-2xl sm:text-3xl font-bold text-white uppercase tracking-wide">Votre securite est notre priorite</h2>
        <p className="mt-3 text-gray-400 max-w-2xl mx-auto text-sm">Chauffeurs pro et formes, pour votre securite et serenite a chaque trajet.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <div className="w-12 h-12 rounded-xl bg-[#FF5000]/20 flex items-center justify-center mb-4"><Eye size={24} className="text-[#FF5000]" /></div>
          <h3 className="text-lg font-bold text-white">Suivre chaque etape</h3>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">Trajet securise avec suivi en temps reel. Voyagez en toute tranquillite ! Suivez votre trajet directement depuis l'application et, en cas de besoin, utilisez le bouton SOS pour une assistance immediate.</p>
        </div>
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <div className="w-12 h-12 rounded-xl bg-[#FF5000]/20 flex items-center justify-center mb-4"><LockKey size={24} className="text-[#FF5000]" /></div>
          <h3 className="text-lg font-bold text-white">Service securise</h3>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">Votre securite avant tout. Pour chaque trajet, un code OTP a 4 chiffres vous est envoye des confirmation. Partagez-le uniquement avec votre chauffeur pour garantir un depart securise.</p>
        </div>
      </div>
    </div>
  </section>
);

export const PhoneSection = () => (
  <section className="py-16 sm:py-24 bg-white" data-testid="phone-section">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-wide mb-4">Reserver par telephone</h2>
        <p className="text-gray-500 text-sm sm:text-base leading-relaxed">Pas d'internet ou vous n'etes pas familier avec l'application ? Pas de panique ! Il vous suffit de nous appeler, et nous nous chargerons d'organiser votre trajet.</p>
        <a href={`tel:${PHONE}`} className="mt-6 inline-flex items-center gap-3 bg-[#FF5000] hover:bg-[#cc4000] text-white font-bold px-8 py-4 rounded-full transition-colors text-lg" data-testid="phone-cta">
          <Phone size={24} weight="fill" /> {PHONE}
        </a>
        <div className="mt-8 flex justify-center items-center gap-4"><StoreLinks size="h-12" /></div>
      </div>
    </div>
  </section>
);

export const RegisterSection = ({ navigate }) => (
  <section id="register" className="py-16 sm:py-24 bg-gray-50" data-testid="register-section">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-14">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-wide">Inscription facile et simple</h2>
        <p className="mt-3 text-gray-500 max-w-3xl mx-auto text-sm sm:text-base leading-relaxed">Rejoignez des aujourd'hui la communaute SB Drive VTC ! Chauffeurs et clients, inscrivez-vous en quelques clics et beneficiez de tous les avantages de notre application. Les chauffeurs accedent a des courses regulieres avec des bonus a la cle. Les clients, quant a eux, peuvent reserver facilement et profiter d'un service rapide, fiable et securise.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {registrationOptions.map(opt => {
          const Icon = opt.icon;
          return (
            <button key={opt.label} onClick={() => navigate(opt.path)} className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-lg hover:border-[#FF5000]/30 transition-all text-center group" data-testid={`register-${opt.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform" style={{ backgroundColor: opt.color + '15' }}>
                <Icon size={28} weight="duotone" style={{ color: opt.color }} />
              </div>
              <p className="text-xs font-bold text-gray-800 uppercase tracking-wide leading-tight">{opt.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  </section>
);

export const LandingFooter = ({ navigate }) => (
  <footer className="bg-gray-950 py-12" data-testid="landing-footer">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <img src={SB_LOGO} alt="SB Drive VTC" className="h-12 w-auto mb-4" />
          <p className="text-sm text-gray-500 leading-relaxed">Reservez un taxi ou VTC en Martinique, Paris, Guadeloupe, Guyane et Reunion. Chauffeurs prives disponibles 24h/24.</p>
        </div>
        <div>
          <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Applications</h4>
          <div className="space-y-2">
            <button onClick={() => navigate('/login')} className="block text-sm text-gray-500 hover:text-white transition-colors">SB Drive Client</button>
            <button onClick={() => navigate('/chauffeur')} className="block text-sm text-gray-500 hover:text-white transition-colors">SB Drive Chauffeur</button>
            <button onClick={() => navigate('/login/email')} className="block text-sm text-gray-500 hover:text-white transition-colors" data-testid="footer-sb-store-link">SB Store (Commerçant)</button>
            <button onClick={() => navigate('/admin-login')} className="block text-sm text-gray-500 hover:text-white transition-colors">Administration</button>
            <button onClick={() => navigate('/dispatcher')} className="block text-sm text-gray-500 hover:text-white transition-colors">Dispatcher</button>
            <button onClick={() => navigate('/tab')} className="block text-sm text-gray-500 hover:text-white transition-colors" data-testid="footer-sb-tab-link">SB Tab (Kiosk)</button>
            <a href="https://www.sbdrivevtc.com" target="_blank" rel="noopener noreferrer" className="block text-sm text-gray-500 hover:text-white transition-colors" data-testid="footer-website-link">Site web · sbdrivevtc.com</a>
          </div>
        </div>
        <div>
          <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Services</h4>
          <div className="space-y-2">
            <span className="block text-sm text-gray-500">VTC-Taxi</span>
            <span className="block text-sm text-gray-500">Pool & Partage</span>
            <span className="block text-sm text-gray-500">Proposer votre tarif</span>
            <span className="block text-sm text-gray-500">Reservation a l'avance</span>
            <span className="block text-sm text-gray-500">Trajets entreprise</span>
          </div>
        </div>
        <div>
          <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Contact</h4>
          <div className="space-y-3">
            <a href={`tel:${PHONE}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"><Phone size={14} /> {PHONE}</a>
            <div className="flex items-center gap-2 text-sm text-gray-500"><Globe size={14} /> sbdrivevtc.com</div>
          </div>
          <div className="mt-4 flex gap-3"><StoreLinks size="h-8" /></div>
        </div>
      </div>
      <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} SB Drive VTC. Tous droits reserves.</p>
        <div className="flex gap-6">
          <span className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">Mentions legales</span>
          <span className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">CGU</span>
          <span className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer">Confidentialite</span>
        </div>
      </div>
    </div>
  </footer>
);

export { StoreLinks, MapPin };
