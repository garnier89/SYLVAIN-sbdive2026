import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, House, ShoppingBag } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { favoritesAPI } from '../../services/api';

const NAVY = '#0A2540';
const money = (n, c = 'EUR') => `${Number(n || 0).toLocaleString('fr-FR')} ${c}`;

const TABS = [
  { key: 'property', label: 'Immobilier', icon: House },
  { key: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
];

const MyFavoritesPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('property');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = (t) => {
    setLoading(true);
    favoritesAPI.list(t)
      .then((r) => setItems(r.data.favorites || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(tab); }, [tab]);

  const open = (f) => {
    if (f.item_type === 'property') navigate(`/real-estate/${f.item_id}`);
    else navigate(`/marketplace?focus=${f.item_id}`);
  };

  const remove = async (f, e) => {
    e.stopPropagation();
    try { await favoritesAPI.toggle(f.item_type, f.item_id); setItems((arr) => arr.filter((x) => x.item_id !== f.item_id)); toast.success('Retiré des favoris'); }
    catch { toast.error('Action impossible'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto pb-24" data-testid="favorites-page">
      <header className="sticky top-0 z-30 px-4 py-3.5 flex items-center gap-3 text-white" style={{ background: NAVY }}>
        <button onClick={() => navigate(-1)} aria-label="Retour" data-testid="fav-back-btn" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft size={20} weight="bold" /></button>
        <h1 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Work Sans, sans-serif' }}><Heart size={20} weight="fill" /> Mes favoris</h1>
      </header>

      <div className="flex gap-2 p-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`fav-tab-${t.key}`}
            className={`flex-1 px-3 py-2 text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 ${tab === t.key ? 'text-white' : 'text-gray-600 bg-white border border-gray-200'}`}
            style={tab === t.key ? { background: NAVY } : {}}><t.icon size={16} /> {t.label}</button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {loading ? (
          <div className="py-16 flex justify-center"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400" data-testid="fav-empty">
            <Heart size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucun favori pour le moment.</p>
            <p className="text-xs mt-1">Touchez le ❤️ sur une annonce pour la sauvegarder ici.</p>
          </div>
        ) : (
          items.map((f) => {
            const l = f.listing || {};
            const img = l.thumbnail || l.image || (l.images && l.images[0]);
            return (
              <button key={f.item_id} onClick={() => open(f)} data-testid={`fav-item-${f.item_id}`}
                className="w-full flex items-center gap-3 bg-white rounded-2xl p-3 text-left shadow-sm border border-gray-100">
                <div className="w-20 h-16 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : (f.item_type === 'property' ? <House size={24} className="text-gray-300" /> : <ShoppingBag size={24} className="text-gray-300" />)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 truncate">{l.title || 'Annonce'}</p>
                  <p className="text-xs text-gray-400 truncate">{l.city || l.location || ''}</p>
                  <p className="text-sm font-black mt-0.5" style={{ color: NAVY }}>{money(l.price, l.currency)}{l.listing_type === 'rent' || l.transaction_type === 'rent' ? ' /mois' : ''}</p>
                </div>
                <button onClick={(e) => remove(f, e)} data-testid={`fav-remove-${f.item_id}`} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"><Heart size={20} weight="fill" className="text-rose-500" /></button>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MyFavoritesPage;
