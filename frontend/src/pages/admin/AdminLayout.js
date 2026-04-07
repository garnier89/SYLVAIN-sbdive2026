import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  House, ChartLine, Users, Car, Buildings, Storefront,
  Taxi, Package, Truck, Wrench, MagnifyingGlass,
  CaretDown, CaretUp, SignOut, Gear, Bell, List, X,
  UserCircle, Warning, FileText, Power
} from '@phosphor-icons/react';

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openMenus, setOpenMenus] = useState({ admin: false, drivers: false, services: false });
  const [searchSidebar, setSearchSidebar] = useState('');

  const toggleMenu = (key) => setOpenMenus(prev => ({ ...prev, [key]: !prev[key] }));
  const isActive = (path) => path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const sections = [
    {
      title: 'HOME',
      items: [
        { icon: House, label: 'Dashboard', path: '/admin' },
        { icon: ChartLine, label: 'Server Monitoring', path: '/admin/monitoring' },
      ]
    },
    {
      title: 'MEMBERS',
      items: [
        { icon: UserCircle, label: 'Admin', path: '/admin/admins', submenu: 'admin',
          children: [
            { label: 'Administrator', path: '/admin/admins' },
            { label: 'Admin Groups', path: '/admin/groups' },
          ]
        },
        { icon: Users, label: 'Users', path: '/admin/users' },
        { icon: Car, label: 'Drivers / Service Providers', path: '/admin/drivers', submenu: 'drivers',
          children: [
            { label: 'Manage Drivers', path: '/admin/drivers' },
            { label: 'Manage Vehicles', path: '/admin/vehicles' },
            { label: 'Service Requests', path: '/admin/requests' },
            { label: 'Manage Rewards', path: '/admin/rewards' },
          ]
        },
        { icon: Buildings, label: 'Company', path: '/admin/company' },
        { icon: Storefront, label: 'Stores', path: '/admin/stores' },
      ]
    },
    {
      title: 'SERVICES',
      items: [
        { icon: Taxi, label: 'Taxi Service', path: '/admin/rides', submenu: 'services',
          children: [
            { label: 'All Rides', path: '/admin/rides' },
            { label: 'Ride Settings', path: '/admin/rides/settings' },
          ]
        },
        { icon: Package, label: 'Parcel Delivery', path: '/admin/parcels' },
        { icon: Truck, label: 'Delivery Services', path: '/admin/delivery' },
        { icon: Wrench, label: 'On-Demand Services', path: '/admin/ondemand' },
      ]
    },
    {
      title: 'SYSTEM',
      items: [
        { icon: Gear, label: 'Configuration', path: '/admin/settings' },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#f0f2f5]" data-testid="admin-layout">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-gray-200 flex items-center px-4 shadow-sm">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-700 mr-4" data-testid="toggle-sidebar">
          <List size={22} />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-800">{user?.name || 'Admin'}</span>
          <span className="text-xs text-gray-400">Super Administrator</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><UserCircle size={20} /></button>
          <button className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><Warning size={20} /></button>
          <button className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><FileText size={20} /></button>
          <button className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><Gear size={20} /></button>
          <button onClick={handleLogout} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500" data-testid="logout-btn"><Power size={20} /></button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`fixed top-14 left-0 bottom-0 z-40 bg-white border-r border-gray-200 overflow-y-auto transition-all duration-200
        ${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'}`} data-testid="admin-sidebar">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="font-black text-lg">
            <span className="text-gray-800">SB</span>
            <span className="text-[#3b82f6] font-black">DRIVE</span>
            <span className="text-[#FF4500] text-xs ml-1 font-bold">PLUS</span>
          </h1>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={searchSidebar} onChange={(e) => setSearchSidebar(e.target.value)}
              placeholder="Search" className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded text-gray-700 outline-none focus:border-blue-400 placeholder:text-gray-400" />
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="px-2 pb-6">
          {sections.map((section) => (
            <div key={section.title} className="mt-3">
              <p className="px-3 text-[10px] font-bold text-gray-400 tracking-wider mb-1">{section.title}</p>
              {section.items.filter(item =>
                !searchSidebar || item.label.toLowerCase().includes(searchSidebar.toLowerCase())
              ).map((item) => (
                <div key={item.path}>
                  {item.children ? (
                    <>
                      <button onClick={() => toggleMenu(item.submenu)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-all ${
                          isActive(item.path) && !openMenus[item.submenu] ? 'bg-[#3b82f6] text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon size={16} weight={isActive(item.path) ? 'fill' : 'regular'} />
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {openMenus[item.submenu] ? <CaretUp size={12} /> : <CaretDown size={12} />}
                      </button>
                      {openMenus[item.submenu] && (
                        <div className="ml-6 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-2">
                          {item.children.map((child) => (
                            <Link key={child.path} to={child.path}
                              className={`block py-1.5 px-2 rounded text-[12px] transition-all ${
                                location.pathname === child.path ? 'text-[#3b82f6] font-semibold bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
                              onClick={() => setSidebarOpen(window.innerWidth >= 1024)}>
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link to={item.path}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-all ${
                        isActive(item.path) ? 'bg-[#3b82f6] text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                      onClick={() => setSidebarOpen(window.innerWidth >= 1024)}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon size={16} weight={isActive(item.path) ? 'fill' : 'regular'} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className={`pt-14 min-h-screen transition-all duration-200 ${sidebarOpen ? 'ml-56' : 'ml-0'}`}>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
