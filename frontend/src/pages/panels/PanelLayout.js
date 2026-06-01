/**
 * PanelLayout — generic role-aware layout used by Dispatch, Billing, Server,
 * UsersAdmin, DriversAdmin, MerchantsAdmin panels.
 * Renders a colored sidebar based on PANEL_CONFIGS + Outlet for nested routes.
 */
import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MagnifyingGlass, CaretDown, CaretUp, List, Power, UserCircle } from '@phosphor-icons/react';
import { PANEL_CONFIGS, filterSidebar } from './panelConfigs';

export default function PanelLayout({ panelKey }) {
  const config = PANEL_CONFIGS[panelKey];
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openMenus, setOpenMenus] = useState({});
  const [search, setSearch] = useState('');

  if (!config) return <div className="p-8 text-red-600">Panel inconnu : {panelKey}</div>;

  const isActive = (path) => path === config.home_path
    ? location.pathname === path
    : location.pathname === path || location.pathname.startsWith(path + '/');

  const isParentActive = (item) => item.children
    ? item.children.some(c => isActive(c.path))
    : isActive(item.path);

  const handleLogout = async () => { await logout(); navigate('/login'); };
  const toggleMenu = (key) => setOpenMenus(p => ({ ...p, [key]: !p[key] }));
  const sections = filterSidebar(config.sidebar, search);

  return (
    <div className="min-h-screen bg-gray-50" data-testid={`panel-${panelKey}-layout`}>
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-[60px] bg-white border-b border-gray-200 flex items-center px-4 shadow-sm">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-700 mr-4" data-testid="toggle-sidebar">
          <List size={22} weight="bold" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-sm" style={{ background: config.brand_color }}>
            {config.label.charAt(0)}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-800 text-sm leading-tight" data-testid="panel-title">{config.title}</span>
            <span className="text-xs text-gray-500">{user?.name || 'Utilisateur'} · {config.role_label}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleLogout} className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-2" data-testid="logout-btn">
            <Power size={16} /> Déconnexion
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-[60px] left-0 bottom-0 z-40 bg-white border-r border-gray-200 overflow-y-auto transition-all duration-200 ${sidebarOpen ? 'w-[240px]' : 'w-0 overflow-hidden'}`}
        data-testid={`panel-${panelKey}-sidebar`}
      >
        <div className="px-4 py-3 border-b" style={{ background: `linear-gradient(135deg, ${config.brand_color}, ${config.brand_color}DD)` }}>
          <h1 className="text-white font-black text-lg tracking-tight">
            SB Drive <span className="opacity-80">/ {config.label}</span>
          </h1>
          <p className="text-white/80 text-xs">{config.role_label}</p>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded text-gray-700 outline-none focus:border-gray-400" data-testid="sidebar-search" />
          </div>
        </div>

        <nav className="px-2 pb-6">
          {sections.map(section => (
            <div key={section.title} className="mt-3">
              <p className="px-3 text-[10px] font-bold text-gray-400 tracking-wider mb-1 uppercase">{section.title}</p>
              {section.items.map(item => (
                <div key={item.key || item.path}>
                  {item.children ? (
                    <>
                      <button
                        onClick={() => toggleMenu(item.key)}
                        className={`w-full flex items-center gap-2 px-3 py-[7px] rounded-md text-[13px] transition ${isParentActive(item) && !openMenus[item.key] ? 'text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                        style={isParentActive(item) && !openMenus[item.key] ? { background: config.brand_color } : {}}
                      >
                        <item.icon size={16} weight={isParentActive(item) ? 'fill' : 'regular'} />
                        <span className="flex-1 text-left truncate leading-tight">{item.label}</span>
                        {openMenus[item.key] ? <CaretUp size={12} /> : <CaretDown size={12} />}
                      </button>
                      {openMenus[item.key] && (
                        <div className="ml-4 mt-0.5 space-y-0.5 pl-3">
                          {item.children.map(child => (
                            <Link
                              key={child.path}
                              to={child.path}
                              className={`flex items-center gap-2 py-1.5 px-2 rounded text-[12px] transition ${isActive(child.path) ? 'font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
                              style={isActive(child.path) ? { color: config.brand_color, background: `${config.brand_color}15` } : {}}
                            >
                              <span className="w-1.5 h-1.5 rounded-full border border-current flex-shrink-0" />
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={item.path}
                      className={`flex items-center gap-2 px-3 py-[7px] rounded-md text-[13px] transition ${isActive(item.path) ? 'text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                      style={isActive(item.path) ? { background: config.brand_color } : {}}
                      data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    >
                      <item.icon size={16} weight={isActive(item.path) ? 'fill' : 'regular'} />
                      <span className="truncate leading-tight">{item.label}</span>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400">SB Drive VTC · {config.label}</p>
        </div>
      </aside>

      {/* Main content */}
      <main className={`pt-[60px] min-h-screen transition-all duration-200 ${sidebarOpen ? 'ml-[240px]' : 'ml-0'}`}>
        <div className="bg-white min-h-[calc(100vh-60px)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
