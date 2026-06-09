import React, { useState, useEffect } from 'react';
import { useNavigate, Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { 
  House, Package, Storefront, Tag, 
  ChartLine, Gear, SignOut, List, X, Clock, Robot
} from '@phosphor-icons/react';

const MerchantLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { icon: House, label: 'Dashboard', path: '/merchant' },
    { icon: Package, label: 'Orders', path: '/merchant/orders' },
    { icon: Storefront, label: 'Products', path: '/merchant/products' },
    { icon: Tag, label: 'Promotions', path: '/merchant/promotions' },
    { icon: ChartLine, label: 'Analytics', path: '/merchant/analytics' },
    { icon: Gear, label: 'Settings', path: '/merchant/settings' },
    { icon: Clock, label: 'Chat Support', path: '/merchant/chat' },
    { icon: Robot, label: 'Parler en direct', path: '/merchant/live-support' },
  ];

  const isActive = (path) => {
    if (path === '/merchant') return location.pathname === '/merchant';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-btn">
          <List size={24} />
        </Button>
        <h1 className="font-bold text-lg">SB Drive Marchand</h1>
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.avatar_url} />
          <AvatarFallback className="bg-orange-100 text-orange-600 text-sm">{user?.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-200
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                <Storefront size={24} weight="duotone" className="text-white" />
              </div>
              <span className="font-bold text-xl">Merchant</span>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X size={20} />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive(item.path)
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
                onClick={() => setSidebarOpen(false)}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon size={20} weight={isActive(item.path) ? 'duotone' : 'regular'} />
                <span className="font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* User */}
          <div className="p-4 border-t">
            <div className="flex items-center gap-3 px-4 py-2">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.avatar_url} />
                <AvatarFallback className="bg-orange-100 text-orange-600">{user?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user?.name}</p>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <SignOut size={20} className="mr-2" />
              Déconnexion
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
};

export default MerchantLayout;
