/**
 * ServicesHubPage — modern bento-grid entry point to every service, mirroring
 * the TaxiHub "Swiss & High-Contrast" aesthetic. Bookable services open the
 * unified ServiceBookingFlow; mobility shortcuts link to existing pages.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ClipboardText, Lightning } from '@phosphor-icons/react';
import { SERVICE_CATALOG, HUB_LINKS, SERVICE_GROUPS } from '../../data/serviceCatalog';

const Tile = ({ item, onClick, index }) => {
  const Icon = item.icon;
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
      onClick={onClick} data-testid={`hub-tile-${item.key}`}
      className="relative bg-white rounded-2xl p-4 text-left border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: `${item.color}1A` }}>
        <Icon size={26} weight="duotone" style={{ color: item.color }} />
      </div>
      <p className="font-bold text-sm text-[#0B1426] leading-tight">{item.title}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.subtitle}</p>
      {item.instant && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
          <Lightning size={9} weight="fill" /> 24/7
        </span>
      )}
    </motion.button>
  );
};

const ServicesHubPage = () => {
  const navigate = useNavigate();

  const itemsForGroup = (groupKey) => {
    if (groupKey === 'mobilite') return HUB_LINKS;
    return SERVICE_CATALOG.filter((s) => s.group === groupKey);
  };

  const go = (item) => navigate(item.to || `/service/${item.key}`);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="services-hub-page">
      {/* Header */}
      <div className="px-4 pt-10 pb-6 bg-[#0B1426] text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFC107] to-transparent opacity-60" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Tous les services</h1>
              <p className="text-xs text-white/60">Réservez en quelques secondes</p>
            </div>
          </div>
          <button onClick={() => navigate('/my-bookings')} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" data-testid="my-bookings-btn" title="Mes réservations">
            <ClipboardText size={20} />
          </button>
        </div>
      </div>

      {/* Groups */}
      <div className="px-4 -mt-3 space-y-6">
        {SERVICE_GROUPS.map((g) => {
          const items = itemsForGroup(g.key);
          if (!items.length) return null;
          return (
            <section key={g.key} data-testid={`hub-group-${g.key}`}>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 mt-1">{g.title}</h2>
              <div className="grid grid-cols-2 gap-3">
                {items.map((it, i) => <Tile key={it.key} item={it} index={i} onClick={() => go(it)} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ServicesHubPage;
