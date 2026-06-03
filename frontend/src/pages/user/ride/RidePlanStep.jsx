import React from 'react';
import {
  MapPin, CaretDown, X, Plus, House, Briefcase,
  NavigationArrow, MapTrifold, Clock, User,
  PencilSimple, CaretRight, Percent,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../../components/GooglePlacesInput';

/**
 * Step 1 of the ride booking flow.
 * Shows pickup/dropoff inputs, favorites, recent locations, and a "Book for someone else" modal.
 */
export const RidePlanStep = ({
  navigate,
  bookFor, setBookFor,
  showBookForModal, setShowBookForModal,
  pickup, setPickup,
  dropoff, setDropoff,
  setMapCenter,
  stopovers, setStopovers,
  recentLocations,
  handleSetOnMap,
  handleDestinationFromRecent,
}) => {
  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-4 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg">Planifier votre course</h1>
        <button onClick={() => navigate(-1)} className="text-white text-sm font-medium" data-testid="ride-cancel-btn">
          Annuler
        </button>
      </div>

      {/* Pickup Now + For Me */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex gap-4">
        <button className="flex items-center gap-2 text-sm text-gray-700" data-testid="pickup-now-dropdown">
          <Clock size={16} className="text-gray-500" />
          <span className="font-medium">Maintenant</span>
          <CaretDown size={12} className="text-gray-400" />
        </button>
        <button onClick={() => setShowBookForModal(true)} className="flex items-center gap-2 text-sm text-gray-700" data-testid="for-me-dropdown">
          <User size={16} className="text-gray-500" />
          <span className="font-medium">{bookFor.name ? `Pour ${bookFor.name.split(' ')[0]}` : 'Pour moi'}</span>
          <CaretDown size={12} className="text-gray-400" />
        </button>
      </div>

      {/* Pickup / Destination Card */}
      <div className="px-4 py-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-3 gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div className="w-0.5 flex-1 bg-gray-300" />
            <div className="w-3 h-3 rounded-sm bg-slate-800" />
          </div>
          <div className="flex-1 space-y-2">
            <GooglePlacesInput
              placeholder="Adresse de depart"
              value={pickup.address}
              iconColor="#22C55E"
              onSelect={(result) => {
                setPickup({ lat: result.lat, lng: result.lng, address: result.address });
                setMapCenter({ lat: result.lat, lng: result.lng });
              }}
              testId="ride-pickup-input"
              inputClassName="h-11 !rounded-lg !border-gray-200 !py-2"
            />
            <GooglePlacesInput
              placeholder="Ou allez-vous ?"
              value={dropoff.address}
              iconColor="#EF4444"
              onSelect={(result) => {
                setDropoff({ lat: result.lat, lng: result.lng, address: result.address });
              }}
              testId="ride-dropoff-input"
              inputClassName="h-11 !rounded-lg !border-gray-200 !py-2"
            />
          </div>
          <div className="flex items-center pt-3">
            <button
              onClick={() => {
                if (stopovers.length >= 5) return;
                setStopovers((s) => [...s, { address: '', lat: null, lng: null }]);
              }}
              className="w-9 h-9 rounded-full bg-[#FF4500] flex items-center justify-center disabled:opacity-50"
              data-testid="add-stopover-btn"
              disabled={stopovers.length >= 5}
            >
              <Plus size={18} className="text-white" weight="bold" />
            </button>
          </div>
        </div>

        {/* Stopovers list */}
        {stopovers.length > 0 && (
          <div className="mt-3 space-y-2" data-testid="stopovers-list">
            {stopovers.map((s, i) => (
              <div key={s.id || `${s.lat || ''}-${s.lng || ''}-${i}`} className="flex items-center gap-2" data-testid={`stopover-${i}`}>
                <div className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />
                <GooglePlacesInput
                  placeholder={`Arret ${i + 1}`}
                  value={s.address}
                  iconColor="#F97316"
                  onSelect={(r) => setStopovers((arr) => arr.map((x, idx) => idx === i ? { address: r.address, lat: r.lat, lng: r.lng } : x))}
                  testId={`stopover-input-${i}`}
                  inputClassName="h-10 !rounded-lg !border-gray-200"
                />
                <button onClick={() => setStopovers((arr) => arr.filter((_, idx) => idx !== i))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid={`remove-stopover-${i}`}>
                  <X size={14} className="text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-gray-100 mx-4" />

      {/* Favourite Locations */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Lieux Favoris</h3>

        <button className="w-full flex items-center gap-3 py-3 border-b border-gray-50" data-testid="fav-home-btn">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <House size={20} className="text-gray-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-gray-900">Domicile</p>
            <p className="text-xs text-gray-500 truncate">5 Rue de Rivoli, 75004 Paris, France</p>
          </div>
          <PencilSimple size={18} className="text-gray-400" />
        </button>

        <button className="w-full flex items-center gap-3 py-3" data-testid="fav-work-btn">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Briefcase size={20} className="text-gray-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-gray-900">Travail</p>
            <p className="text-xs text-gray-500 truncate">La Défense, 92060 Puteaux, France</p>
          </div>
          <PencilSimple size={18} className="text-gray-400" />
        </button>
      </div>

      <div className="h-px bg-gray-100 mx-4" />

      {/* Promo Banner */}
      <div className="px-4 py-3">
        <div className="bg-gradient-to-r from-[#FF4500] to-orange-400 rounded-2xl p-4 flex items-center gap-3" data-testid="promo-banner">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Percent size={24} className="text-white" weight="bold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">-20% sur votre premiere course</p>
            <p className="text-xs text-white/80 mt-0.5">Code: SB20 - Valable 7 jours</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-2">
        <button className="w-full flex items-center gap-3 py-3 border-b border-gray-50" data-testid="set-current-location-btn">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <NavigationArrow size={20} className="text-gray-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">Localisation actuelle</span>
        </button>

        <button
          className="w-full flex items-center gap-3 py-3 border-b border-gray-50"
          onClick={handleSetOnMap}
          data-testid="set-on-map-btn"
        >
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <MapTrifold size={20} className="text-gray-600" />
          </div>
          <span className="flex-1 text-sm font-medium text-gray-900 text-left">Choisir sur la carte</span>
          <CaretRight size={16} className="text-gray-400" />
        </button>

        <button className="w-full flex items-center gap-3 py-3" data-testid="destination-later-btn">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Clock size={20} className="text-gray-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">Entrer la destination plus tard</span>
        </button>
      </div>

      <div className="h-px bg-gray-100 mx-4" />

      {/* Recent Locations */}
      <div className="px-4 pt-4 pb-6">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Lieux Récents</h3>
        {recentLocations.map((loc) => (
          <button
            key={loc.address}
            className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0"
            onClick={() => handleDestinationFromRecent(loc)}
            data-testid={`recent-location-${loc.address.slice(0, 15).replace(/\s/g, '-')}`}
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <MapPin size={20} className="text-gray-500" />
            </div>
            <p className="text-xs text-gray-600 text-left leading-relaxed">{loc.address}</p>
          </button>
        ))}
      </div>

      {/* Book For Someone Else Modal */}
      {showBookForModal && (
        <div className="fixed inset-0 z-[3000] flex items-end" data-testid="book-for-modal">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowBookForModal(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl pb-6 mx-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold text-gray-900">Pour qui est cette course ?</h3>
              <button onClick={() => setShowBookForModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="close-book-for-btn">
                <X size={16} className="text-gray-600" />
              </button>
            </div>
            <div className="px-5 space-y-3">
              <button onClick={() => { setBookFor({ name: '', phone: '' }); setShowBookForModal(false); }}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 ${!bookFor.name ? 'border-[#FF4500] bg-orange-50' : 'border-gray-200'}`}
                data-testid="book-for-me-btn">
                <User size={22} className="text-[#FF4500]" weight="fill" />
                <span className="flex-1 text-left font-bold text-gray-800">Pour moi</span>
              </button>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-bold text-gray-700 mb-2">Reserver pour quelqu'un d'autre</p>
                <input value={bookFor.name} onChange={(e) => setBookFor({ ...bookFor, name: e.target.value })}
                  placeholder="Nom du passager" className="w-full mb-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm" data-testid="book-for-name" />
                <input value={bookFor.phone} onChange={(e) => setBookFor({ ...bookFor, phone: e.target.value })}
                  placeholder="Telephone (+33...)" className="w-full mb-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm" data-testid="book-for-phone" />
                <button onClick={() => {
                  if (!bookFor.name.trim() || !bookFor.phone.trim()) return;
                  setShowBookForModal(false);
                }} className="w-full py-2.5 rounded-lg bg-[#FF4500] text-white font-bold text-sm disabled:opacity-50"
                  disabled={!bookFor.name.trim() || !bookFor.phone.trim()}
                  data-testid="book-for-confirm-btn">
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RidePlanStep;
