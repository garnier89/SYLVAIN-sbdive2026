import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, VideoCamera, Star, MagnifyingGlass, Phone, Clock, Globe, FunnelSimple } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = [
  { id: 'all', label: 'Tous' },
  { id: 'doctor', label: 'Médecin' },
  { id: 'lawyer', label: 'Avocat' },
  { id: 'tutor', label: 'Tuteur' },
  { id: 'astrologer', label: 'Astrologue' },
  { id: 'fitness', label: 'Fitness' },
];

const VideoConsultPage = () => {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [booking, setBooking] = useState({ duration: 30, notes: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const cat = activeCategory === 'all' ? '' : `?category=${activeCategory}`;
        const res = await fetch(`${API}/api/video-consult/providers${cat}`, { credentials: 'include' });
        const data = await res.json();
        setProviders(data.providers || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchProviders();
  }, [activeCategory]);

  const filteredProviders = providers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.specialty.toLowerCase().includes(search.toLowerCase())
  );

  const handleBook = async (provider) => {
    try {
      const res = await fetch(`${API}/api/video-consult/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider_id: provider.id,
          provider_name: provider.name,
          category: provider.category,
          duration_min: booking.duration,
          total_price: (provider.price_per_min * booking.duration).toFixed(2),
          notes: booking.notes
        })
      });
      if (res.ok) {
        setSelectedProvider(null);
        alert('Consultation réservée avec succès !');
      }
    } catch (e) { console.error(e); }
  };

  if (selectedProvider) {
    const p = selectedProvider;
    const totalPrice = (p.price_per_min * booking.duration).toFixed(2);
    return (
      <div className="mobile-container min-h-screen bg-white" data-testid="video-consult-booking">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={() => setSelectedProvider(null)} data-testid="back-from-booking"><ArrowLeft size={22} /></button>
          <h1 className="text-base font-bold">Réserver une consultation</h1>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-6">
            <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded-full object-cover" />
            <div>
              <h2 className="font-bold text-gray-900">{p.name}</h2>
              <p className="text-sm text-gray-500">{p.specialty}</p>
              <div className="flex items-center gap-1 mt-1">
                <Star size={14} weight="fill" className="text-amber-400" />
                <span className="text-xs font-medium">{p.rating}</span>
                <span className="text-xs text-gray-400">({p.reviews} avis)</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Durée de la consultation</label>
              <div className="flex gap-2">
                {[15, 30, 45, 60].map(d => (
                  <button key={d} onClick={() => setBooking({ ...booking, duration: d })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${booking.duration === d ? 'bg-teal-500 text-white border-teal-500' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                    data-testid={`duration-${d}`}>
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Notes (optionnel)</label>
              <textarea value={booking.notes} onChange={e => setBooking({ ...booking, notes: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-24"
                placeholder="Décrivez brièvement votre besoin..." data-testid="booking-notes" />
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{p.price_per_min}€/min x {booking.duration} min</span>
                <span className="font-bold text-gray-900">{totalPrice}€</span>
              </div>
            </div>

            <button onClick={() => handleBook(p)}
              className="w-full bg-teal-500 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-teal-600 transition-colors"
              data-testid="confirm-video-booking">
              Confirmer la réservation - {totalPrice}€
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="video-consult-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-500 to-teal-600 px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white">Consultation Vidéo</h1>
        </div>
        <p className="text-sm text-white/80 mb-4">Consultez des experts en vidéo depuis chez vous</p>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-11 rounded-xl bg-white pl-10 pr-4 text-sm"
            placeholder="Rechercher un expert..." data-testid="search-input" />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${activeCategory === cat.id ? 'bg-teal-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid={`cat-${cat.id}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Provider List */}
      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : filteredProviders.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Aucun expert trouvé</div>
        ) : filteredProviders.map(provider => (
          <div key={provider.id} className="bg-white rounded-2xl p-4 border border-gray-100"
            data-testid={`provider-${provider.id}`}>
            <div className="flex gap-3">
              <img src={provider.image_url} alt={provider.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{provider.name}</h3>
                    <p className="text-xs text-gray-500">{provider.specialty}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${provider.available ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {provider.available ? 'En ligne' : 'Hors ligne'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    <Star size={12} weight="fill" className="text-amber-400" />
                    <span className="text-xs font-medium">{provider.rating}</span>
                    <span className="text-[10px] text-gray-400">({provider.reviews})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-gray-400" />
                    <span className="text-[10px] text-gray-500">{provider.experience_years} ans</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Globe size={12} className="text-gray-400" />
                    <span className="text-[10px] text-gray-500">{provider.languages?.join(', ')}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm font-bold text-teal-600">{provider.price_per_min}€/min</span>
                  <button onClick={() => provider.available && setSelectedProvider(provider)}
                    disabled={!provider.available}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${provider.available ? 'bg-teal-500 text-white hover:bg-teal-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                    data-testid={`book-${provider.id}`}>
                    <VideoCamera size={14} />
                    Consulter
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoConsultPage;
