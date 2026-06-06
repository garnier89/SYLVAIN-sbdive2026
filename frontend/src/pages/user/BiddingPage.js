import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lightning, Drop, Hammer, PaintBrush, Wrench, Broom, Truck, Plant, Plus, MapPin, Calendar, CurrencyEur, ChatCircle, Clock, CaretRight } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORY_ICONS = {
  bcat_electric: Lightning, bcat_plumber: Drop, bcat_carpenter: Hammer,
  bcat_painter: PaintBrush, bcat_handyman: Wrench, bcat_cleaning: Broom,
  bcat_moving: Truck, bcat_gardening: Plant,
};

const CATEGORY_COLORS = {
  bcat_electric: 'bg-yellow-50 text-yellow-600', bcat_plumber: 'bg-blue-50 text-blue-500',
  bcat_carpenter: 'bg-orange-50 text-orange-600', bcat_painter: 'bg-indigo-50 text-indigo-500',
  bcat_handyman: 'bg-red-50 text-red-500', bcat_cleaning: 'bg-teal-50 text-teal-600',
  bcat_moving: 'bg-purple-50 text-purple-500', bcat_gardening: 'bg-green-50 text-green-600',
};

const BiddingPage = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('create');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', address: '', budget_min: '', budget_max: '', scheduled_date: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/bidding/categories`, { credentials: 'include' })
      .then(r => r.json()).then(d => setCategories(d.categories || [])).catch(() => {});
    fetch(`${API}/api/bidding/posts`, { credentials: 'include' })
      .then(r => r.json()).then(d => setMyPosts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!selectedCategory || !form.title || !form.description) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/bidding/posts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, category_id: selectedCategory, budget_min: parseFloat(form.budget_min) || 0, budget_max: parseFloat(form.budget_max) || 0 })
      });
      if (res.ok) {
        const post = await res.json();
        setMyPosts(prev => [post, ...prev]);
        setForm({ title: '', description: '', address: '', budget_min: '', budget_max: '', scheduled_date: '' });
        setSelectedCategory(null);
        setActiveTab('posts');
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const statusColors = { open: 'bg-green-50 text-green-600', in_progress: 'bg-blue-50 text-blue-600', completed: 'bg-gray-100 text-gray-500', cancelled: 'bg-red-50 text-red-500' };
  const statusLabels = { open: 'Ouvert', in_progress: 'En cours', completed: 'Terminé', cancelled: 'Annulé' };

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="bidding-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white">Enchères Services</h1>
        </div>
        <p className="text-sm text-white/80">Publiez votre besoin, recevez des offres de pros</p>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 flex gap-2">
        <button onClick={() => setActiveTab('create')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'create' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
          data-testid="tab-create">Nouvelle demande</button>
        <button onClick={() => setActiveTab('posts')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'posts' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
          data-testid="tab-posts">Mes demandes ({myPosts.length})</button>
      </div>

      {activeTab === 'create' ? (
        <div className="px-4 pb-6 space-y-4">
          {/* Category Selection */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Catégorie de service</label>
            <div className="grid grid-cols-4 gap-2">
              {categories.map(cat => {
                const Icon = CATEGORY_ICONS[cat.id] || Wrench;
                const colors = CATEGORY_COLORS[cat.id] || 'bg-gray-50 text-gray-500';
                return (
                  <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${selectedCategory === cat.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                    data-testid={`cat-${cat.id}`}>
                    <div className={`w-10 h-10 rounded-xl ${colors.split(' ')[0]} flex items-center justify-center`}>
                      <Icon size={20} weight="duotone" className={colors.split(' ')[1]} />
                    </div>
                    <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">{cat.name_fr}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Titre</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="Ex: Réparation fuite d'eau"
              data-testid="bid-title" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-24"
              placeholder="Décrivez votre besoin en détail..." data-testid="bid-description" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Adresse</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 pl-9 text-sm" placeholder="Adresse du lieu"
                data-testid="bid-address" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Budget min (€)</label>
              <input type="number" value={form.budget_min} onChange={e => setForm({ ...form, budget_min: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="0" data-testid="bid-budget-min" />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Budget max (€)</label>
              <input type="number" value={form.budget_max} onChange={e => setForm({ ...form, budget_max: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="100" data-testid="bid-budget-max" />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Date souhaitée</label>
            <input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm" data-testid="bid-date" />
          </div>
          <button onClick={handleSubmit} disabled={loading || !selectedCategory || !form.title}
            className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
            data-testid="submit-bid">
            {loading ? 'Publication...' : 'Publier ma demande'}
          </button>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-3">
          {myPosts.length === 0 ? (
            <div className="text-center py-12">
              <ChatCircle size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Aucune demande pour le moment</p>
              <button onClick={() => setActiveTab('create')} className="mt-3 text-indigo-500 text-sm font-medium">Créer une demande</button>
            </div>
          ) : myPosts.map(post => (
            <div key={post.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`post-${post.id}`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-gray-900 text-sm">{post.title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[post.status] || 'bg-gray-100 text-gray-500'}`}>
                  {statusLabels[post.status] || post.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{post.description}</p>
              <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
                {post.budget_max > 0 && (
                  <span className="flex items-center gap-1"><CurrencyEur size={12} />{post.budget_min}-{post.budget_max}€</span>
                )}
                {post.scheduled_date && <span className="flex items-center gap-1"><Calendar size={12} />{post.scheduled_date}</span>}
                <span className="flex items-center gap-1"><ChatCircle size={12} />{post.offers_count || 0} offres</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BiddingPage;
