import React, { useState, useEffect } from 'react';
import { useNavigate, Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  House, Users, Car, Storefront, Package, CurrencyEur,
  Headset, Gear, SignOut, List, X, ChartLine, MapPin
} from '@phosphor-icons/react';

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const navItems = [
    { icon: House, label: 'Dashboard', path: '/admin' },
    { icon: Users, label: 'Utilisateurs', path: '/admin/users' },
    { icon: Car, label: 'Chauffeurs', path: '/admin/drivers' },
    { icon: MapPin, label: 'Courses', path: '/admin/rides' },
    { icon: CurrencyEur, label: 'Revenus', path: '/admin/revenue' },
    { icon: Headset, label: 'Support', path: '/admin/support' },
    { icon: Gear, label: 'Configuration', path: '/admin/settings' },
  ];

  const isActive = (path) => path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-[#0f1117]" data-testid="admin-layout">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-[#161923] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(true)} className="text-gray-400" data-testid="mobile-menu-btn">
          <List size={24} />
        </button>
        <h1 className="font-bold text-base text-white">SB Drive Admin</h1>
        <div className="w-8 h-8 rounded-full bg-[#FF4500] flex items-center justify-center text-white text-xs font-bold">
          {user?.name?.charAt(0)}
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#161923] border-r border-gray-800 transform transition-transform duration-200
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#FF4500] flex items-center justify-center">
                <ChartLine size={20} weight="bold" className="text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">SB DRIVE</p>
                <p className="text-[10px] text-gray-500 font-medium tracking-wider">ADMIN PANEL</p>
              </div>
            </div>
            <button className="lg:hidden text-gray-500" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all ${
                  isActive(item.path) ? 'bg-[#FF4500] text-white font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                onClick={() => setSidebarOpen(false)} data-testid={`nav-${item.label.toLowerCase()}`}>
                <item.icon size={18} weight={isActive(item.path) ? 'fill' : 'regular'} />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* User */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#FF4500]/20 flex items-center justify-center text-[#FF4500] text-sm font-bold">
                {user?.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{user?.name}</p>
                <p className="text-gray-500 text-xs truncate">{user?.email}</p>
              </div>
            </div>
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3.5 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-sm transition-colors"
              data-testid="logout-btn">
              <SignOut size={16} /> Deconnexion
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <main className="lg:ml-64 min-h-screen"><Outlet /></main>
    </div>
  );
};

export default AdminLayout;
