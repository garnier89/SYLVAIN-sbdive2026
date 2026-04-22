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
    ]
  },
  {
    title: 'MEMBRES',
    items: [
      { icon: UserCircle, label: 'Admin', key: 'admin', children: [
        { label: 'Administrator', path: '/admin/admins' },
        { label: 'Admin Groups', path: '/admin/groups' },
      ]},
      { icon: UsersThree, label: 'User', path: '/admin/users' },
      { icon: Car, label: 'Drivers / Service Providers', key: 'drivers', children: [
        { label: 'Manage Drivers', path: '/admin/drivers' },
        { label: 'Manage Vehicles', path: '/admin/vehicles' },
        { label: 'Service Requests', path: '/admin/requests' },
        { label: 'Document Verification', path: '/admin/documents' },
      ]},
      { icon: Trophy, label: 'Manage Rewards', key: 'rewards', children: [
        { label: 'Reports', path: '/admin/rewards-reports' },
        { label: 'Settings', path: '/admin/rewards' },
      ]},
      { icon: Buildings, label: 'Company / Fleet Owner', path: '/admin/company' },
      { icon: Storefront, label: 'Store', path: '/admin/stores' },
      { icon: Bed, label: 'Hotels', key: 'hotels', children: [
        { label: 'All Hotels', path: '/admin/hotels' },
      ]},
      { icon: TreeStructure, label: 'Organization', path: '/admin/organization' },
    ]
  },
  {
    title: 'SERVICES',
    items: [
      { icon: Taxi, label: 'Taxi / Transport', key: 'taxi', children: [
        { label: 'Toutes les courses', path: '/admin/rides' },
        { label: 'Types de véhicules', path: '/admin/vehicle-types' },
      ]},
      { icon: Package, label: 'Parcel Delivery', key: 'parcel', children: [
        { label: 'All Parcels', path: '/admin/parcels' },
      ]},
      { icon: ShoppingCart, label: 'Store Delivery Services', key: 'store-delivery', children: [
        { label: 'All Deliveries', path: '/admin/store-delivery' },
        { label: 'Store Delivery Orders', path: '/admin/store-orders' },
      ]},
      { icon: Lightning, label: 'Delivery Genie', key: 'genie', children: [
        { label: 'Settings', path: '/admin/genie' },
      ]},
      { icon: PersonSimpleRun, label: 'Delivery Runner', key: 'runner', children: [
        { label: 'Settings', path: '/admin/runner' },
      ]},
      { icon: Wrench, label: 'On-Demand Services', key: 'ondemand', children: [
        { label: 'Settings', path: '/admin/ondemand' },
      ]},
      { icon: VideoCamera, label: 'Video Consultation', key: 'video', children: [
        { label: 'Settings', path: '/admin/video' },
      ]},
      { icon: Gavel, label: 'Manage Bid Services', key: 'bid', children: [
        { label: 'Settings', path: '/admin/bids' },
      ]},
      { icon: Tag, label: 'Buy, Sell & Rent', key: 'marketplace', children: [
        { label: 'Settings', path: '/admin/marketplace' },
      ]},
      { icon: FirstAid, label: 'Medical Services', key: 'medical', children: [
        { label: 'Settings', path: '/admin/medical' },
      ]},
      { icon: UsersThree, label: 'Ride Share', key: 'rideshare', children: [
        { label: 'Settings', path: '/admin/rideshare' },
      ]},
      { icon: MapPinArea, label: 'Nearby Management', key: 'nearby', children: [
        { label: 'Settings', path: '/admin/nearby' },
      ]},
      { icon: Path, label: 'FET Tracking Service', key: 'tracking', children: [
        { label: 'Settings', path: '/admin/tracking' },
      ]},
    ]
  },
  {
    title: 'RÉSERVATIONS & RAPPORTS',
    items: [
      { icon: CalendarCheck, label: 'Bookings / Orders', key: 'bookings', children: [
        { label: 'Manual Booking', path: '/admin/manual-booking' },
        { label: 'Ride/Job Later Bookings', path: '/admin/later-bookings' },
        { label: 'Trips/Jobs', path: '/admin/trips' },
        { label: 'Create order', path: '/admin/create-order' },
      ]},
      { icon: Star, label: 'Reviews', key: 'reviews', children: [
        { label: 'Trips/Jobs Reviews', path: '/admin/reviews' },
      ]},
      { icon: ChartBar, label: 'Reports', key: 'reports', children: [
        { label: 'Earning Report', path: '/admin/revenue' },
        { label: 'Payout Report', path: '/admin/payout' },
        { label: 'Settlements', path: '/admin/settlements' },
      ]},
      { icon: Shield, label: 'Disputes', path: '/admin/disputes' },
    ]
  },
  {
    title: 'PORTEFEUILLE & PAIEMENTS',
    items: [
      { icon: Wallet, label: 'Wallet Requests', path: '/admin/wallet-requests' },
      { icon: HandCoins, label: 'Settlements', path: '/admin/settlements' },
    ]
  },
  {
    title: 'RÉCOMPENSES & FIDÉLITÉ',
    items: [
      { icon: Trophy, label: 'Reward Program', path: '/admin/rewards' },
      { icon: Trophy, label: 'Chauffeurs Prioritaires', path: '/admin/priority-drivers' },
      { icon: Trophy, label: 'Top Chauffeurs (Public)', path: '/admin/top-drivers' },
      { icon: Trophy, label: 'Rapport Ecart Negociation', path: '/admin/reports/negotiation-gap' },
    ]
  },
  {
    title: 'LOCALISATION',
    items: [
      { icon: MapPin, label: 'Manage Locations', key: 'locations', children: [
        { label: 'Geo Fence Location', path: '/admin/geo-fence' },
        { label: 'Restricted Area', path: '/admin/restricted' },
        { label: 'Locationwise Fare', path: '/admin/location-fare' },
        { label: 'Airport Surcharge', path: '/admin/airport' },
        { label: 'Country', path: '/admin/country' },
        { label: 'State', path: '/admin/state' },
      ]},
      { icon: Binoculars, label: "God's View", path: '/admin/gods-view' },
      { icon: Fire, label: 'Heat View', path: '/admin/heat-view' },
    ]
  },
  {
    title: 'PROMOTIONS & MARKETING',
    items: [
      { icon: Ticket, label: 'Promocode', path: '/admin/promocodes' },
      { icon: Gift, label: 'Manage Gift Cards', key: 'giftcards', children: [
        { label: 'All Gift Cards', path: '/admin/giftcards' },
      ]},
      { icon: ShareNetwork, label: 'MLM Referral Settings', path: '/admin/referral' },
      { icon: Image, label: 'Advertisement Banners', path: '/admin/banners' },
      { icon: Newspaper, label: 'News', path: '/admin/news' },
      { icon: EnvelopeSimple, label: 'Newsletter Subscribers', path: '/admin/newsletter' },
    ]
  },
  {
    title: 'CMS',
    items: [
      { icon: Globe, label: 'Website All Pages', key: 'pages', children: [
        { label: 'All Pages', path: '/admin/pages' },
      ]},
      { icon: DeviceMobile, label: 'User App Home Screen', key: 'app-home', children: [
        { label: 'Home Config', path: '/admin/app-home' },
      ]},
      { icon: Slideshow, label: 'Manage App Intro Screen', key: 'intro', children: [
        { label: 'Intro Screens', path: '/admin/intro' },
      ]},
      { icon: Translate, label: 'Manage Language Labels', key: 'lang', children: [
        { label: 'Labels', path: '/admin/labels' },
      ]},
      { icon: EnvelopeOpen, label: 'Email Templates', path: '/admin/email-templates' },
      { icon: ChatCircleText, label: 'SMS Templates', path: '/admin/sms-templates' },
      { icon: XCircle, label: 'Cancel Reason', path: '/admin/cancel-reasons' },
    ]
  },
  {
    title: 'SUPPORT',
    items: [
      { icon: EnvelopeSimple, label: 'Contact Us Requests', path: '/admin/contact-requests' },
      { icon: Warning, label: 'SOS Requests', path: '/admin/sos-requests' },
      { icon: FileText, label: 'Order Help Requests', path: '/admin/order-help-requests' },
      { icon: HandCoins, label: 'Payment Requests', path: '/admin/wallet-requests' },
      { icon: HandCoins, label: 'Withdraw Requests', path: '/admin/withdraw-requests' },
      { icon: FileText, label: 'Trip Help Requests', path: '/admin/trip-help-requests' },
    ]
  },
  {
    title: 'PARAMÈTRES & UTILITAIRES',
    items: [
      { icon: Gear, label: 'General', path: '/admin/settings' },
      { icon: HandCoins, label: 'Payment Options', path: '/admin/payment-options' },
      { icon: Wrench, label: 'Master Services', path: '/admin/master-services' },
      { icon: SealCheck, label: 'Currency', path: '/admin/currency' },
      { icon: Translate, label: 'Language', path: '/admin/language' },
      { icon: MagnifyingGlass, label: 'SEO Settings', path: '/admin/seo' },
      { icon: MapPin, label: 'Maps/Geo API Settings', path: '/admin/maps-api' },
      { icon: EnvelopeOpen, label: 'Send Push-Notification', path: '/admin/push-notifications' },
      { icon: FileText, label: 'Documents', path: '/admin/documents' },
      { icon: Car, label: 'Vehicle Make', path: '/admin/vehicle-makes' },
      { icon: Car, label: 'Vehicle Model', path: '/admin/vehicle-models' },
      { icon: FileText, label: 'DB Backup', path: '/admin/db-backup' },
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
