import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  SquaresFour, ChartLine, UserCircle, UsersThree, Car, Buildings, Storefront,
  BuildingOffice, TreeStructure, Taxi, Package, ShoppingCart, Lightning,
  PersonSimpleRun, Wrench, VideoCamera, Gavel, Tag, FirstAid,
  MapPinArea, Path, CalendarCheck, Star, ChartBar, MapPin, Eye, Fire,
  Ticket, Gift, ShareNetwork, Image, Newspaper, EnvelopeSimple, Globe,
  DeviceMobile, Slideshow, Translate, EnvelopeOpen, ChatCircleText, XCircle,
  Gear, MagnifyingGlass, CaretDown, CaretUp, List, Warning, FileText, Power,
  Bed, SealCheck, Binoculars, Trophy, Wallet, HandCoins, Shield
} from '@phosphor-icons/react';

const sidebarConfig = [
  {
    title: 'ACCUEIL',
    items: [
      { icon: SquaresFour, label: 'Tableau de bord', path: '/admin' },
      { icon: ChartLine, label: 'Monitoring serveur', path: '/admin/monitoring' },
      { icon: Path, label: 'Courses en direct', path: '/admin/live-rides' },
      { icon: Lightning, label: 'Auto-dispatch', path: '/admin/auto-dispatch' },
    ]
  },
  {
    title: 'MEMBRES',
    items: [
      { icon: UserCircle, label: 'Admin', key: 'admin', children: [
        { label: 'Administrateurs', path: '/admin/admins' },
        { label: 'Groupes admin', path: '/admin/groups' },
      ]},
      { icon: UsersThree, label: 'Utilisateurs', path: '/admin/users' },
      { icon: Car, label: 'Chauffeurs / Prestataires', key: 'drivers', children: [
        { label: 'Gérer chauffeurs', path: '/admin/drivers' },
        { label: 'Gérer véhicules', path: '/admin/vehicles' },
        { label: 'Demandes de service', path: '/admin/requests' },
        { label: 'Vérification documents', path: '/admin/documents' },
      ]},
      { icon: Trophy, label: 'Gérer récompenses', key: 'rewards', children: [
        { label: 'Rapports', path: '/admin/rewards-reports' },
        { label: 'Paramètres', path: '/admin/rewards' },
      ]},
      { icon: Buildings, label: 'Entreprise / Flotte', path: '/admin/company' },
      { icon: Storefront, label: 'Boutiques', path: '/admin/stores' },
      { icon: Bed, label: 'Hôtels', key: 'hotels', children: [
        { label: 'Tous les hôtels', path: '/admin/hotels' },
        { label: 'Bornes SB Drive Tab', path: '/admin/kiosks' },
      ]},
      { icon: TreeStructure, label: 'Organisation', path: '/admin/organization' },
    ]
  },
  {
    title: 'SERVICES',
    items: [
      { icon: Taxi, label: 'Taxi / Transport', key: 'taxi', children: [
        { label: 'Toutes les courses', path: '/admin/rides' },
        { label: 'Types de véhicules', path: '/admin/vehicle-types' },
      ]},
      { icon: Package, label: 'Livraison colis', key: 'parcel', children: [
        { label: 'Tous les colis', path: '/admin/parcels' },
      ]},
      { icon: ShoppingCart, label: 'Livraisons boutiques', key: 'store-delivery', children: [
        { label: 'Toutes les livraisons', path: '/admin/store-delivery' },
        { label: 'Commandes boutiques', path: '/admin/store-orders' },
      ]},
      { icon: Lightning, label: 'Delivery Genie', key: 'genie', children: [
        { label: 'Paramètres', path: '/admin/genie' },
      ]},
      { icon: PersonSimpleRun, label: 'Coursier / Runner', key: 'runner', children: [
        { label: 'Paramètres', path: '/admin/runner' },
      ]},
      { icon: Wrench, label: 'Services à la demande', key: 'ondemand', children: [
        { label: 'Paramètres', path: '/admin/ondemand' },
      ]},
      { icon: VideoCamera, label: 'Consultation vidéo', key: 'video', children: [
        { label: 'Paramètres', path: '/admin/video' },
      ]},
      { icon: Gavel, label: 'Services aux enchères', key: 'bid', children: [
        { label: 'Paramètres', path: '/admin/bids' },
      ]},
      { icon: Tag, label: 'Acheter, Vendre & Louer', key: 'marketplace', children: [
        { label: 'Paramètres', path: '/admin/marketplace' },
      ]},
      { icon: FirstAid, label: 'Services médicaux', key: 'medical', children: [
        { label: 'Paramètres', path: '/admin/medical' },
      ]},
      { icon: UsersThree, label: 'Covoiturage', key: 'rideshare', children: [
        { label: 'Paramètres', path: '/admin/rideshare' },
      ]},
      { icon: MapPinArea, label: 'À proximité', key: 'nearby', children: [
        { label: 'Paramètres', path: '/admin/nearby' },
      ]},
      { icon: Path, label: 'Suivi FET', key: 'tracking', children: [
        { label: 'Paramètres', path: '/admin/tracking' },
      ]},
    ]
  },
  {
    title: 'RÉSERVATIONS & RAPPORTS',
    items: [
      { icon: CalendarCheck, label: 'Réservations / Commandes', key: 'bookings', children: [
        { label: 'Réservation manuelle', path: '/admin/manual-booking' },
        { label: 'Réservations différées', path: '/admin/later-bookings' },
        { label: 'Courses / Missions', path: '/admin/trips' },
        { label: 'Créer une commande', path: '/admin/create-order' },
      ]},
      { icon: Star, label: 'Avis', key: 'reviews', children: [
        { label: 'Avis courses/missions', path: '/admin/reviews' },
      ]},
      { icon: ChartBar, label: 'Rapports', key: 'reports', children: [
        { label: 'Rapport des revenus', path: '/admin/revenue' },
        { label: 'Rapport des versements', path: '/admin/payout' },
        { label: 'Versements', path: '/admin/settlements' },
      ]},
      { icon: Shield, label: 'Litiges', path: '/admin/disputes' },
    ]
  },
  {
    title: 'PORTEFEUILLE & PAIEMENTS',
    items: [
      { icon: Wallet, label: 'Demandes portefeuille', path: '/admin/wallet-requests' },
      { icon: HandCoins, label: 'Versements', path: '/admin/settlements' },
    ]
  },
  {
    title: 'RÉCOMPENSES & FIDÉLITÉ',
    items: [
      { icon: Trophy, label: 'Programme de récompenses', path: '/admin/rewards' },
      { icon: Trophy, label: 'Chauffeurs prioritaires', path: '/admin/priority-drivers' },
      { icon: Trophy, label: 'Top Chauffeurs (public)', path: '/admin/top-drivers' },
      { icon: Trophy, label: 'Rapport écart négociation', path: '/admin/reports/negotiation-gap' },
    ]
  },
  {
    title: 'LOCALISATION',
    items: [
      { icon: MapPin, label: 'Gérer les zones', key: 'locations', children: [
        { label: 'Geofencing', path: '/admin/geo-fence' },
        { label: 'Zones restreintes', path: '/admin/restricted' },
        { label: 'Tarification par zone', path: '/admin/location-fare' },
        { label: 'Surcharge aéroport', path: '/admin/airport' },
        { label: 'Pays', path: '/admin/country' },
        { label: 'Régions', path: '/admin/state' },
      ]},
      { icon: Binoculars, label: "Vue d'ensemble", path: '/admin/gods-view' },
      { icon: Fire, label: 'Vue thermique', path: '/admin/heat-view' },
    ]
  },
  {
    title: 'PROMOTIONS & MARKETING',
    items: [
      { icon: Ticket, label: 'Codes promo', path: '/admin/promocodes' },
      { icon: Star, label: 'Mise en avant sponsorisée', path: '/admin/featured-listings' },
      { icon: Gift, label: 'Cartes cadeaux', key: 'giftcards', children: [
        { label: 'Toutes les cartes', path: '/admin/giftcards' },
      ]},
      { icon: ShareNetwork, label: 'Paramètres parrainage MLM', path: '/admin/referral' },
      { icon: Image, label: 'Bannières publicitaires', path: '/admin/banners' },
      { icon: Newspaper, label: 'Actualités', path: '/admin/news' },
      { icon: EnvelopeSimple, label: 'Newsletter', path: '/admin/newsletter' },
    ]
  },
  {
    title: 'CMS',
    items: [
      { icon: Globe, label: 'Pages du site web', key: 'pages', children: [
        { label: 'Toutes les pages', path: '/admin/pages' },
      ]},
      { icon: DeviceMobile, label: 'Écran accueil app', key: 'app-home', children: [
        { label: 'Configuration', path: '/admin/app-home' },
      ]},
      { icon: Slideshow, label: 'Écrans d\'intro', key: 'intro', children: [
        { label: 'Slides', path: '/admin/intro' },
      ]},
      { icon: Translate, label: 'Traductions', key: 'lang', children: [
        { label: 'Labels', path: '/admin/labels' },
      ]},
      { icon: EnvelopeOpen, label: 'Modèles email', path: '/admin/email-templates' },
      { icon: ChatCircleText, label: 'Modèles SMS', path: '/admin/sms-templates' },
      { icon: XCircle, label: 'Motifs d\'annulation', path: '/admin/cancel-reasons' },
    ]
  },
  {
    title: 'SUPPORT',
    items: [
      { icon: EnvelopeSimple, label: 'Demandes de contact', path: '/admin/contact-requests' },
      { icon: Warning, label: 'Alertes SOS', path: '/admin/sos-requests' },
      { icon: FileText, label: 'Aide commandes', path: '/admin/order-help-requests' },
      { icon: HandCoins, label: 'Demandes de paiement', path: '/admin/wallet-requests' },
      { icon: HandCoins, label: 'Demandes de retrait', path: '/admin/withdraw-requests' },
      { icon: FileText, label: 'Aide courses', path: '/admin/trip-help-requests' },
    ]
  },
  {
    title: 'PARAMÈTRES & UTILITAIRES',
    items: [
      { icon: Gear, label: 'Paramètres généraux', path: '/admin/settings' },
      { icon: HandCoins, label: 'Options de paiement', path: '/admin/payment-methods' },
      { icon: HandCoins, label: 'Zones SB PayGo', path: '/admin/sbpaygo-zones' },
      { icon: Wrench, label: 'Services principaux', path: '/admin/master-services' },
      { icon: SealCheck, label: 'Devise', path: '/admin/currency' },
      { icon: Translate, label: 'Langue', path: '/admin/language' },
      { icon: MagnifyingGlass, label: 'Paramètres SEO', path: '/admin/seo' },
      { icon: MapPin, label: 'Paramètres Maps/Geo', path: '/admin/maps-api' },
      { icon: EnvelopeOpen, label: 'Notifications push', path: '/admin/push-notifications' },
      { icon: FileText, label: 'Documents', path: '/admin/documents' },
      { icon: Car, label: 'Marques véhicules', path: '/admin/vehicle-makes' },
      { icon: Car, label: 'Modèles véhicules', path: '/admin/vehicle-models' },
      { icon: FileText, label: 'Sauvegarde BDD', path: '/admin/db-backup' },
    ]
  },
  {
    title: 'SYSTÈME',
    items: [
      { icon: Gear, label: 'Paramètres généraux', path: '/admin/settings' },
    ]
  }
];

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openMenus, setOpenMenus] = useState({});
  const [searchSidebar, setSearchSidebar] = useState('');

  const toggleMenu = (key) => setOpenMenus(prev => ({ ...prev, [key]: !prev[key] }));

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isParentActive = (item) => {
    if (item.children) return item.children.some(c => isActive(c.path));
    return isActive(item.path);
  };

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const filteredSections = searchSidebar
    ? sidebarConfig.map(section => ({
        ...section,
        items: section.items.filter(item =>
          item.label.toLowerCase().includes(searchSidebar.toLowerCase()) ||
          (item.children && item.children.some(c => c.label.toLowerCase().includes(searchSidebar.toLowerCase())))
        )
      })).filter(s => s.items.length > 0)
    : sidebarConfig;

  return (
    <div className="min-h-screen bg-[#f0f2f5]" data-testid="admin-layout">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-[60px] bg-[#f5f5f5] border-b border-gray-200 flex items-center px-4" data-testid="admin-header">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-700 mr-4" data-testid="toggle-sidebar">
          <List size={22} weight="bold" />
        </button>
        <div className="flex flex-col">
          <span className="font-bold text-gray-800 text-sm leading-tight">{user?.name || 'Admin'}</span>
          <span className="text-xs text-gray-500">Super Administrator</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {[
            { Icon: UserCircle, id: 'profile' },
            { Icon: Warning, id: 'alerts' },
            { Icon: FileText, id: 'docs' },
            { Icon: Gear, id: 'settings' },
            { Icon: Power, id: 'logout' },
          ].map(({ Icon, id }) => (
            <button key={id}
              onClick={id === 'logout' ? handleLogout : undefined}
              className="w-8 h-8 rounded hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              data-testid={id === 'logout' ? 'logout-btn' : `admin-header-${id}`}>
              <Icon size={20} />
            </button>
          ))}
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`fixed top-[60px] left-0 bottom-0 z-40 bg-white border-r border-gray-200 overflow-y-auto transition-all duration-200 scrollbar-thin
        ${sidebarOpen ? 'w-[220px]' : 'w-0 overflow-hidden'}`} data-testid="admin-sidebar">
        {/* Logo */}
        <div className="px-4 py-3 border-b border-gray-100">
          <h1 className="text-xl tracking-tight" data-testid="admin-brand">
            <span className="font-black text-gray-800">SB</span>
            <span className="font-black text-[#3b82f6]">Drive</span>
            <span className="text-[10px] ml-1 text-gray-500 font-semibold uppercase tracking-wide">VTC</span>
          </h1>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={searchSidebar} onChange={(e) => setSearchSidebar(e.target.value)}
              placeholder="Search" className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded text-gray-700 outline-none focus:border-blue-400 placeholder:text-gray-400" data-testid="sidebar-search" />
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="px-2 pb-6">
          {filteredSections.map((section) => (
            <div key={section.title} className="mt-3">
              <p className="px-3 text-[10px] font-bold text-gray-400 tracking-wider mb-1 uppercase">{section.title}</p>
              {section.items.map((item) => (
                <div key={item.key || item.path}>
                  {item.children ? (
                    <>
                      <button onClick={() => toggleMenu(item.key)}
                        className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-md text-[13px] transition-all ${
                          isParentActive(item) && !openMenus[item.key]
                            ? 'bg-[#3b82f6] text-white font-medium'
                            : 'text-gray-600 hover:bg-gray-50'}`}
                        data-testid={`nav-${item.key}`}>
                        <item.icon size={16} weight={isParentActive(item) ? 'fill' : 'regular'} />
                        <span className="flex-1 text-left truncate leading-tight">{item.label}</span>
                        {openMenus[item.key] ? <CaretUp size={12} /> : <CaretDown size={12} />}
                      </button>
                      {openMenus[item.key] && (
                        <div className="ml-4 mt-0.5 space-y-0.5 pl-3">
                          {item.children.map((child) => (
                            <Link key={child.path} to={child.path}
                              className={`flex items-center gap-2 py-1.5 px-2 rounded text-[12px] transition-all ${
                                isActive(child.path) ? 'text-[#3b82f6] font-semibold bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}>
                              <span className="w-1.5 h-1.5 rounded-full border border-current flex-shrink-0" />
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link to={item.path}
                      className={`flex items-center gap-2 px-3 py-[7px] rounded-md text-[13px] transition-all ${
                        isActive(item.path) ? 'bg-[#3b82f6] text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                      data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      <item.icon size={16} weight={isActive(item.path) ? 'fill' : 'regular'} />
                      <span className="truncate leading-tight">{item.label}</span>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400">SB Drive VTC - 2026</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`pt-[60px] min-h-screen transition-all duration-200 ${sidebarOpen ? 'ml-[220px]' : 'ml-0'}`}>
        <div className="bg-white min-h-[calc(100vh-60px)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
