import { useLocale } from '../../contexts/LocaleContext';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, VideoCamera, Star, MagnifyingGlass, Clock, Globe, CheckCircle, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import VideoCall from '../../components/VideoCall';

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
  const { money } = useLocale();
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [booking, setBooking] = useState({ duration: 30, notes: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState(null);   // created session (lobby)
  const [joining, setJoining] = useState(false);
  const [call, setCall] = useState(null);          // { room_name, display_name, provider_name }
  const [booked, setBooked] = useState(null);      // completed summary

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
    setSubmitting(true);
    try {
      const totalPrice = (provider.price_per_min * booking.duration).toFixed(2);
      const res = await fetch(`${API}/api/video-consult/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider_id: provider.id,
          provider_name: provider.name,
          category: provider.category,
          duration_min: booking.duration,
          total_price: totalPrice,
          notes: booking.notes
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedProvider(null);
        setSession({ ...data, provider });
        toast.success('Consultation prête !');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Échec de la réservation. Réessayez.');
      }
    } catch (e) {
      toast.error('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!session) return;
    setJoining(true);
    try {
      const res = await fetch(`${API}/api/video-consult/sessions/${session.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCall({
          room_name: data.room_name,
          display_name: data.display_name,
          provider_name: data.provider_name || session.provider?.name,
        });
      } else {
        toast.error(data.detail || 'Impossible de rejoindre la consultation.');
      }
    } catch (e) {
      toast.error('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setJoining(false);
    }
  };

  const handleEndCall = async () => {
    const ended = session;
    try {
      if (ended) {
        await fetch(`${API}/api/video-consult/sessions/${ended.id}/end`, {
          method: 'POST', credentials: 'include',
        });
      }
    } catch (e) { /* non-blocking */ }
    setCall(null);
    setBooked({
      provider: ended?.provider,
      duration: ended?.duration_min,
      total: ended?.total_price,
    });
    setSession(null);
  };

  // ── In-call: embedded Jitsi room ──
  if (call) {
    return (
      <VideoCall
        roomName={call.room_name}
        displayName={call.display_name}
        providerName={call.provider_name}
        onClose={handleEndCall}
      />
    );
  }

  // ── Lobby: session created, ready to join (payment happens on join) ──
  if (session) {
    const p = session.provider;
    return (
      <div className="mobile-container min-h-screen bg-white" data-testid="video-consult-lobby">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={() => setSession(null)} data-testid="back-from-lobby"><ArrowLeft size={22} /></button>
          <h1 className="text-base font-bold">Rejoindre la consultation</h1>
        </div>
        <div className="p-4 flex flex-col items-center text-center">
          <div className="relative mt-4">
            <img src={p?.image_url} alt={p?.name} className="w-24 h-24 rounded-full object-cover" />
            <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white" />
          </div>
          <h2 className="font-bold text-gray-900 mt-4">{p?.name}</h2>
          <p className="text-sm text-gray-500">{p?.specialty}</p>

          <div className="w-full bg-gray-50 rounded-2xl p-4 mt-6 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Durée</span>
              <span className="font-semibold text-gray-900">{session.duration_min} min</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total (débité au démarrage)</span>
              <span className="font-bold text-gray-900">{money(Number(session.total_price))}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400 mt-4">
            <ShieldCheck size={16} className="text-teal-500" />
            <span>Appel chiffré et privé — salle dédiée</span>
          </div>

          <button onClick={handleJoin} disabled={joining}
            className="w-full mt-6 bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="join-video-call">
            <VideoCamera size={18} weight="fill" />
            {joining ? 'Connexion…' : `Démarrer l'appel · ${Number(session.total_price).toFixed(2)}€`}
          </button>
          <button onClick={() => setSession(null)} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="lobby-cancel">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  if (booked) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center" data-testid="video-consult-success">
        <div className="w-20 h-20 rounded-full bg-teal-50 flex items-center justify-center mb-5">
          <CheckCircle size={48} weight="fill" className="text-teal-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Consultation terminée !</h1>
        <p className="text-sm text-gray-500 mt-2">Votre consultation vidéo de {booked.duration} min avec <b>{booked.provider?.name}</b> est terminée. Merci d&apos;avoir utilisé SB Consultation.</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full mt-5 flex justify-between text-sm">
          <span className="text-gray-500">Total</span>
          <span className="font-bold text-gray-900">{money(Number(booked.total))}</span>
        </div>
        <button onClick={() => setBooked(null)} className="w-full mt-5 bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-sm" data-testid="video-success-back">
          Réserver une autre consultation
        </button>
        <button onClick={() => navigate('/home')} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="video-success-home">
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

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
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${booking.duration === d ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
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
                <span className="font-bold text-gray-900">{money(Number(totalPrice))}</span>
              </div>
            </div>

            <button onClick={() => handleBook(p)} disabled={submitting}
              className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-60"
              data-testid="confirm-video-booking">
              {submitting ? 'Préparation…' : `Continuer · ${totalPrice}€`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="video-consult-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 px-4 pt-4 pb-6">
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
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${activeCategory === cat.id ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
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
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${provider.available ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
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
