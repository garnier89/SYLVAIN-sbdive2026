import React from 'react';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '../../../components/LeafletMap';
import {
  ArrowLeft, Car, CreditCard, CaretRight, Motorcycle,
  Jeep, Lightning, Van, Wheelchair, AirplaneTilt,
  Users, Info, Money, Gavel, User, Wallet, DeviceMobile, Waves, Bank,
} from '@phosphor-icons/react';

const PM_ICON_MAP = { Money, CreditCard, Wallet, DeviceMobile, Waves, Bank };

const VehicleIcon = ({ iconType, slug, selected }) => {
  const cls = selected ? 'text-[#FF4500]' : 'text-gray-600';
  const size = 32;
  if (iconType === 'Bike') return <Motorcycle size={size} weight="duotone" className={cls} />;
  if (slug === 'suv') return <Jeep size={size} weight="duotone" className={cls} />;
  if (slug === 'electric') return <Lightning size={size} weight="duotone" className={cls} />;
  if (slug === 'van') return <Van size={size} weight="duotone" className={cls} />;
  if (slug === 'accessible') return <Wheelchair size={size} weight="duotone" className={cls} />;
  if (slug === 'airport') return <AirplaneTilt size={size} weight="duotone" className={cls} />;
  if (slug === 'pool') return <Users size={size} weight="duotone" className={cls} />;
  return <Car size={size} weight="duotone" className={cls} />;
};

/**
 * Step 2 of the ride booking flow: map view with vehicle selection bottom sheet.
 */
export const RideMapStep = ({
  pickup, dropoff, mapCenter, routePath, estimate,
  vehicleTypes, selectedVehicle, setSelectedVehicle,
  paymentMethod, setPaymentMethod,
  paymentMethods = [],
  poolEnabled, setPoolEnabled,
  airportSurcharge,
  scheduleMode, scheduleDate, setScheduleDate, scheduleTime, setScheduleTime,
  selectingLocation, handleLocationSelect, getEstimate,
  gmapLoaded, confirmRide, loading,
  vehicleMeta,
  setStep,
}) => {
  const navigate = useNavigate();
  const gmapCenter = pickup.lat && dropoff.lat
    ? { lat: (pickup.lat + dropoff.lat) / 2, lng: (pickup.lng + dropoff.lng) / 2 }
    : pickup.lat ? { lat: pickup.lat, lng: pickup.lng } : mapCenter;

  // Compose dynamic payment methods (fallback to cash/card/wallet if API list empty)
  const pmList = paymentMethods.length > 0 ? paymentMethods : [
    { id: 'cash', label: 'Espèces', icon: 'Money' },
    { id: 'card', label: 'Carte bancaire', icon: 'CreditCard' },
    { id: 'wallet', label: 'Portefeuille SB', icon: 'Wallet' },
  ];
  const currentPm = pmList.find((m) => m.id === paymentMethod) || pmList[0];
  const CurrentPmIcon = PM_ICON_MAP[currentPm?.icon] || CreditCard;
  const cyclePayment = () => {
    const idx = pmList.findIndex((m) => m.id === paymentMethod);
    const next = pmList[(idx + 1) % pmList.length];
    setPaymentMethod(next.id);
  };

  return (
    <div className="mobile-container min-h-screen bg-white relative">
      {/* Map with Route (OpenStreetMap / Leaflet — free) */}
      <div className="h-[55vh] relative">
        <LeafletMap
          center={gmapCenter}
          zoom={pickup.lat && dropoff.lat ? 12 : 14}
          pickup={pickup.lat ? pickup : null}
          dropoff={dropoff.lat ? dropoff : null}
          routePath={routePath}
          onMapClick={(latLng) => {
            if (selectingLocation) {
              handleLocationSelect(latLng);
              if (selectingLocation === 'dropoff' && pickup.lat) getEstimate();
            }
          }}
        />

        {/* Floating back button */}
        <button
          className="absolute top-4 left-4 z-[1000] w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center"
          onClick={() => setStep('plan')}
          data-testid="map-back-btn"
        >
          <ArrowLeft size={20} className="text-gray-700" weight="bold" />
        </button>

        {/* Destination address label */}
        {dropoff.lat && dropoff.address && (
          <div className="absolute top-[35%] left-1/2 -translate-x-1/2 z-[500] bg-white px-3 py-2 rounded-lg shadow-lg max-w-[60%] pointer-events-none">
            <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{dropoff.address}</p>
          </div>
        )}

        {/* Floating "Location Taxi" shortcut */}
        <button
          onClick={() => navigate('/ride?type=rental')}
          className="absolute top-4 right-4 z-[1000] bg-white px-3.5 py-2 rounded-xl shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform"
          data-testid="rent-a-taxi-btn"
        >
          <Car size={18} className="text-blue-600" weight="duotone" />
          <span className="text-sm font-bold text-gray-800">Location Taxi</span>
        </button>

        {/* ETA bubble */}
        {estimate?.duration_mins && (
          <div className="absolute top-6 right-4 z-[500] flex items-stretch gap-0 rounded-lg shadow-lg overflow-hidden">
            <div className="bg-slate-800 text-white px-3 py-2 flex flex-col items-center justify-center">
              <span className="text-lg font-bold leading-none">{Math.round(estimate.duration_mins)}</span>
              <span className="text-[9px] font-semibold">min(s)</span>
            </div>
            <div className="bg-white px-3 py-2 max-w-[180px]">
              <p className="text-[11px] text-gray-500 leading-tight truncate">@Pour</p>
              <p className="text-[11px] font-semibold text-blue-600 leading-tight truncate">{dropoff.address}</p>
            </div>
          </div>
        )}

        {selectingLocation && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-md">
            <p className="text-xs font-medium text-gray-700">
              Touchez la carte pour {selectingLocation === 'pickup' ? 'le départ' : 'la destination'}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '65vh' }} data-testid="booking-bottom-sheet">
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mt-2.5 mb-1" />

        {!estimate && selectingLocation && (
          <div className="p-5 text-center">
            <p className="text-sm text-gray-500">Selectionnez un point sur la carte</p>
          </div>
        )}

        {estimate && (
          <>
            <div className="px-5 pt-3 pb-3">
              <p className="text-center text-base font-semibold text-slate-800">
                Choisir une gamme ou faites glisser vers le haut
              </p>
            </div>

            {/* Vehicle list */}
            <div className="flex-1 overflow-y-auto border-t border-gray-100">
              {vehicleTypes.map((v) => {
                const fare = selectedVehicle === v.slug && estimate
                  ? estimate.estimated_fare?.toFixed(2) || v.min_fare?.toFixed(2)
                  : v.min_fare?.toFixed(2) || '--';
                const isSelected = selectedVehicle === v.slug;
                const meta = vehicleMeta[v.slug] || { label: v.name_fr, desc: v.description || 'Véhicule pour vos trajets' };
                return (
                  <button
                    key={v.slug}
                    onClick={() => setSelectedVehicle(v.slug)}
                    className={`w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}
                    data-testid={`vehicle-${v.slug}`}
                  >
                    <div className="w-16 h-14 flex items-center justify-center flex-shrink-0">
                      <VehicleIcon iconType={v.icon_type} slug={v.slug} selected={isSelected} />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-slate-800 text-[15px]">{meta.label}</p>
                      <p className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
                        {meta.desc}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <User size={12} className="text-gray-500" weight="fill" />
                        <span className="text-xs text-gray-600">{v.person_capacity || 4}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="font-bold text-lg text-blue-600">{fare} &euro;</span>
                      <Info size={14} className="text-blue-600" />
                    </div>
                  </button>
                );
              })}
            </div>

            {scheduleMode && (
              <div className="flex gap-2 px-5 py-2 border-t border-gray-100" data-testid="schedule-inputs">
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl p-2.5 text-sm" data-testid="schedule-date" />
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                  className="w-28 border border-gray-200 rounded-xl p-2.5 text-sm" data-testid="schedule-time" />
              </div>
            )}

            {/* Payment + Offer + CTA */}
            <div className="border-t border-gray-100 px-5 py-3">
              {/* Airport surcharge banner */}
              {airportSurcharge?.surcharge > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2" data-testid="airport-surcharge-banner">
                  <span className="text-base">✈️</span>
                  <span><b>{airportSurcharge.zone}</b> · Supplément aéroport +{airportSurcharge.surcharge.toFixed(2)} €</span>
                </div>
              )}

              {/* Taxi Pool toggle */}
              <label className="flex items-center gap-3 py-2 mb-2 cursor-pointer" data-testid="pool-toggle-label">
                <input
                  type="checkbox"
                  checked={!!poolEnabled}
                  onChange={(e) => setPoolEnabled(e.target.checked)}
                  className="sr-only peer"
                  data-testid="pool-toggle-input"
                />
                <div className="relative w-10 h-5 bg-gray-300 peer-checked:bg-emerald-500 rounded-full transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">Partager la course (Taxi Pool)</p>
                  <p className="text-[11px] text-gray-500">Jusqu'à -30% si un autre passager part dans la même direction</p>
                </div>
                <Users size={20} className="text-emerald-600" weight="duotone" />
              </label>
              <button
                onClick={() => {
                  const q = new URLSearchParams();
                  if (pickup?.address) q.set('pickup', pickup.address);
                  if (pickup?.lat) q.set('plat', pickup.lat);
                  if (pickup?.lng) q.set('plng', pickup.lng);
                  if (dropoff?.address) q.set('dropoff', dropoff.address);
                  if (dropoff?.lat) q.set('dlat', dropoff.lat);
                  if (dropoff?.lng) q.set('dlng', dropoff.lng);
                  navigate(`/taxi-bidding?${q.toString()}`);
                }}
                className="w-full mb-3 py-2.5 rounded-xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                data-testid="open-taxi-bidding-btn"
              >
                <Gavel size={16} weight="duotone" />
                Proposer un prix différent
                <span className="text-[10px] text-pink-500 font-normal">(Enchères Taxi)</span>
              </button>

              <button
                className="w-full flex items-center gap-3 py-3 border-b border-gray-100"
                data-testid="payment-method-btn"
                onClick={() => {
                  const next = paymentMethod === 'cash' ? 'card' : paymentMethod === 'card' ? 'wallet' : 'cash';
                  setPaymentMethod(next);
                }}
              >
                {paymentMethod === 'cash' ? (
                  <Money size={32} className="text-green-500" weight="fill" />
                ) : paymentMethod === 'card' ? (
                  <CreditCard size={32} className="text-blue-500" weight="fill" />
                ) : (
                  <CreditCard size={32} className="text-purple-500" weight="fill" />
                )}
                <span className="flex-1 text-base font-medium text-slate-800 text-left">
                  {paymentMethod === 'cash' ? 'Paiement en especes' : paymentMethod === 'card' ? 'Carte bancaire' : 'Portefeuille SB'}
                </span>
                <CaretRight size={18} className="text-gray-400" />
              </button>

              <button
                className="w-full mt-3 h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base disabled:opacity-60"
                onClick={confirmRide}
                disabled={loading}
                data-testid="request-now-btn"
              >
                {loading ? 'Reservation en cours...' : scheduleMode ? 'Programmer la course' : 'Demander maintenant'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RideMapStep;
