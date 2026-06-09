import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, ArrowRight, X, User, MapPin, CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { servicesAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';
import { useAuth } from '../../contexts/AuthContext';

const TABS = [
  { k: 'services', label: 'Prestations de service' },
  { k: 'gallery', label: 'Galerie' },
  { k: 'reviews', label: 'Avis' },
];

// « Détail du service » — provider profile + bookable services + booking modal.
const ServiceProviderDetailPage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const { user } = useAuth();
  const { id } = useParams();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('services');
  const [booking, setBooking] = useState(null); // selected service for booking
  const [address, setAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    servicesAPI.getProvider(id)
      .then((r) => { if (active) setProvider(r.data); })
      .catch(() => toast.error('Prestataire introuvable'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const confirmBooking = async () => {
    setSubmitting(true);
    try {
      const isInstant = !scheduledDate;
      await servicesAPI.createBooking({
        category: provider.category_slug,
        service_key: booking.id,
        service_name: booking.name,
        provider_id: provider.id,
        provider_name: provider.name,
        provider_phone: provider.phone,
        base_price: booking.price,
        quantity: 1,
        address: address || user?.address || '',
        is_instant: isInstant,
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        payment_method: 'cash',
      });
      toast.success('Réservation confirmée !');
      setBooking(null);
      navigate('/my-bookings');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de la réservation');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-400">Chargement…</div>;
  if (!provider) return null;

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="service-provider-detail">
      <div className="sticky top-0 z-40 bg-[#2F6BFF] px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white flex-1 text-center pr-9">Détail du service</h1>
      </div>

      {/* Profile card */}
      <div className="p-4">
        <div className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden flex-shrink-0">
            {provider.photo
              ? <img src={provider.photo} alt={provider.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><User size={28} className="text-gray-300" /></div>}
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">{provider.name}</h2>
            <span className="flex items-center gap-1 mt-1">
              <Star size={16} weight="fill" className="text-amber-500" />
              <span className="font-bold text-gray-800">{(provider.rating || 5).toFixed(1)}</span>
              <span className="text-xs text-gray-400">({provider.reviews_count || 0} avis)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === t.k ? 'border-[#2F6BFF] text-[#2F6BFF]' : 'border-transparent text-gray-500'}`}
            data-testid={`tab-${t.k}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'services' && (
          <div className="space-y-3" data-testid="services-list">
            {provider.services?.length ? provider.services.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`service-${s.id}`}>
                <h3 className="font-bold text-gray-900">{s.name}</h3>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-lg font-extrabold text-[#2F6BFF]">{money(s.price)}</span>
                  <button
                    onClick={() => { setBooking(s); setAddress(user?.address || ''); }}
                    className="flex items-center gap-2 bg-[#2F6BFF] text-white rounded-xl px-5 py-2.5 font-bold text-sm active:scale-95 transition-transform"
                    data-testid={`book-service-${s.id}`}
                  >
                    Réserver maintenant <ArrowRight size={16} weight="bold" />
                  </button>
                </div>
              </div>
            )) : <p className="text-sm text-gray-400 text-center py-8">Aucune prestation</p>}
          </div>
        )}

        {tab === 'gallery' && (
          <div className="grid grid-cols-2 gap-3" data-testid="gallery-grid">
            {provider.gallery?.length ? provider.gallery.map((g, i) => (
              <img key={i} src={g} alt={`gallery-${i}`} className="w-full h-32 object-cover rounded-xl" loading="lazy" />
            )) : <p className="col-span-2 text-sm text-gray-400 text-center py-8">Aucune photo</p>}
          </div>
        )}

        {tab === 'reviews' && (
          <div className="text-center py-8 text-sm text-gray-400" data-testid="reviews-empty">
            {provider.reviews_count || 0} avis · note moyenne {(provider.rating || 5).toFixed(1)} ★
          </div>
        )}
      </div>

      {/* Booking modal */}
      {booking && (
        <div className="fixed inset-0 z-[2800] bg-black/60 flex items-end" onClick={() => setBooking(null)} data-testid="booking-modal">
          <div className="w-full bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-gray-900">Confirmer la réservation</h3>
              <button onClick={() => setBooking(null)} className="text-gray-400" data-testid="booking-close"><X size={22} /></button>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-900">{booking.name}</p>
                <p className="text-xs text-gray-500">{provider.name}</p>
              </div>
              <span className="text-lg font-extrabold text-[#2F6BFF]">{money(booking.price)}</span>
            </div>

            <label className="text-xs font-medium text-gray-600 block mb-1">Adresse</label>
            <div className="relative mb-4">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Votre adresse"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" data-testid="booking-address" />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Date (optionnel)</label>
                <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" data-testid="booking-date" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Heure (optionnel)</label>
                <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" data-testid="booking-time" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-4">Sans date, l'intervention est demandée immédiatement. Paiement : espèces.</p>

            <button onClick={confirmBooking} disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-[#2F6BFF] text-white rounded-xl py-3.5 font-bold disabled:opacity-60"
              data-testid="booking-confirm">
              <CheckCircle size={18} weight="fill" />
              {submitting ? 'Réservation…' : `Confirmer · ${money(booking.price)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceProviderDetailPage;
