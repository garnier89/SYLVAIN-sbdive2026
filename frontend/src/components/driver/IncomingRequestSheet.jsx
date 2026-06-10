import React, { useEffect, useState, useRef } from 'react';
import { Star, MapPin, ArrowRight, X, Plus } from '@phosphor-icons/react';
import { CountdownRing } from '../CountdownRing';
import { useLocale } from '../../contexts/LocaleContext';

const RatingStars = ({ value = 5, size = 18 }) => {
  const full = Math.round(value);
  return (
    <div className="flex items-center gap-0.5" data-testid="request-passenger-stars">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} weight={i < full ? 'fill' : 'regular'} className={i < full ? 'text-amber-400' : 'text-gray-300'} />
      ))}
    </div>
  );
};

const haversineKm = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/**
 * IncomingRequestSheet — V3Cube "PARTNER APP" incoming ride request bottom sheet.
 * Green circular countdown, estimated price, pickup & trip estimations, passenger
 * rating, pickup/destination, Déclin / Acceptez. Keeps the existing counter-offer.
 */
const IncomingRequestSheet = ({
  request, driverPos, windowSeconds = 30,
  onAccept, onDecline,
  myOffer, nowTs, onSendCounterOffer, onRenewOffer, onCancelOffer,
}) => {
  const { t } = useLocale();
  const offerPending = myOffer && myOffer.rideId === request.id;
  const [remaining, setRemaining] = useState(windowSeconds);
  const [showCounter, setShowCounter] = useState(false);
  const [counterVal, setCounterVal] = useState('');

  // Keep the latest onDecline in a ref so the countdown effect does NOT depend on
  // its identity. Otherwise an inline onDecline (new ref each parent render) keeps
  // restarting the timer → it never reaches 0 → the request sheet + siren stay
  // stuck on screen even after the acceptance window elapses.
  const onDeclineRef = useRef(onDecline);
  useEffect(() => { onDeclineRef.current = onDecline; }, [onDecline]);

  useEffect(() => {
    if (offerPending) return undefined;
    const started = Date.now();
    setRemaining(windowSeconds);
    const id = setInterval(() => {
      const left = Math.max(0, windowSeconds - Math.floor((Date.now() - started) / 1000));
      setRemaining(left);
      if (left <= 0) { clearInterval(id); onDeclineRef.current?.(); }
    }, 500);
    return () => clearInterval(id);
  }, [offerPending, windowSeconds, request.id]);

  const price = (request.proposed_fare || request.estimated_fare || 0).toFixed(2);
  // Counter-offer stepper (driver at the wheel → no typing): pre-fill with the
  // passenger fare and adjust by ±1 € taps.
  const COUNTER_STEP = 1;
  const counterBase = () => parseFloat(counterVal || price) || parseFloat(price) || 1;
  const incCounter = () => setCounterVal(Math.max(1, counterBase() + COUNTER_STEP).toFixed(2));
  const decCounter = () => setCounterVal(Math.max(1, counterBase() - COUNTER_STEP).toFixed(2));
  const openCounter = () => { setCounterVal(price); setShowCounter(true); };
  const pickupDist = haversineKm(driverPos, { lat: request.pickup_lat, lng: request.pickup_lng });
  const pickupEta = pickupDist != null ? Math.max(1, Math.round((pickupDist / 22) * 60) + 1) : null;
  const seats = request.seats_required || 1;
  const isBidding = request.is_bidding === true || request.mode === 'bidding' || request.ride_type === 'bidding';
  const vehicleLabel = (request.vehicle_type || 'Basic').toString().replace(/^./, (c) => c.toUpperCase());
  const title = isBidding
    ? `${t('driver.bidding_request')} · ${vehicleLabel}`
    : request.pool_enabled
      ? t('driver.pool_request', { seats })
      : `${t('driver.demande')} · ${vehicleLabel}`;
  const priceLabel = isBidding ? t('driver.passenger_offer') : t('driver.est_price');

  return (
    <div className="fixed inset-0 z-[2000] bg-black/40 flex items-end" data-testid="incoming-request-modal">
      <div className="w-full bg-white rounded-t-3xl px-5 pt-3 pb-5 max-h-[92vh] overflow-y-auto">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3" />

        <div className="flex items-center justify-center gap-3 mb-3">
          <h3 className="text-xl font-extrabold text-gray-900 text-center truncate" data-testid="request-title">{title}</h3>
          {request.is_priority && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 animate-pulse" data-testid="priority-badge">
              ⚡ TIER {request.tier || 1}
            </span>
          )}
        </div>

        {/* Prix estimé (yellow) — "offre du passager" for bidding rides */}
        <div className={`rounded-2xl py-3 text-center mb-3 ${isBidding ? 'bg-pink-100' : 'bg-amber-100'}`} data-testid="request-price-box">
          <p className={`text-sm font-bold ${isBidding ? 'text-pink-900' : 'text-amber-900'}`}>{priceLabel}</p>
          <p className={`text-2xl font-extrabold ${isBidding ? 'text-pink-900' : 'text-amber-900'}`} data-testid="request-price">{price} €</p>
        </div>

        {/* Estimations: ramassage (pink) + voyage (cyan) */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-rose-100 p-3" data-testid="request-pickup-estimate">
            <p className="text-sm font-bold text-rose-900 leading-tight">{t('driver.pickup_estimate')}</p>
            <p className="text-sm text-rose-800 mt-1">
              {pickupDist != null ? `${pickupDist.toFixed(2)} km | ${pickupEta} ${t('driver.minutes')}` : t('driver.no_distance')}
            </p>
          </div>
          <div className="rounded-2xl bg-cyan-100 p-3" data-testid="request-trip-estimate">
            <p className="text-sm font-bold text-cyan-900 leading-tight">{t('driver.trip_estimate')}</p>
            <p className="text-sm text-cyan-800 mt-1">{(request.distance_km || 0).toFixed(2)} km | {request.duration_mins || 0} {t('driver.minutes')}</p>
          </div>
        </div>

        {/* Passenger */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-lg font-extrabold text-gray-900" data-testid="request-passenger-name">{request.passenger_name || t('driver.passenger')}</p>
          <RatingStars value={request.passenger_rating || 5} />
        </div>

        {/* Pickup / Destination */}
        <div className="space-y-3 mb-4">
          <div className="flex items-start gap-3">
            <MapPin size={22} weight="fill" className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">{t('driver.pickup_location')}</p>
              <p className="text-sm font-semibold text-gray-800" data-testid="request-pickup">{request.pickup_address}</p>
            </div>
          </div>
          {(request.stops || []).filter((s) => s?.address).map((s, i) => (
            <div key={`rq-stop-${i}`} className="flex items-start gap-3" data-testid={`request-stop-${i}`}>
              <span className="w-5 h-5 rounded-full bg-amber-400 text-[11px] font-bold text-gray-900 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <div><p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">{t('ride.stop', { n: i + 1 })}</p><p className="text-sm font-semibold text-gray-800">{s.address}</p></div>
            </div>
          ))}
          <div className="flex items-start gap-3">
            <span className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0 mt-1" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">{t('driver.destination_address')}</p>
              <p className="text-sm font-semibold text-gray-800" data-testid="request-dropoff">{request.dropoff_address}</p>
            </div>
          </div>
        </div>

        {/* Countdown timer — placed in the clear space just above the actions so it
            never covers the order info (price, estimations, pickup/destination). */}
        {!offerPending && (
          <div className="flex flex-col items-center mb-4" data-testid="accept-timer-big">
            <CountdownRing seconds={remaining} total={windowSeconds} size={120} />
            <span className="mt-1.5 text-sm font-bold text-gray-700">Temps pour accepter</span>
          </div>
        )}

        {offerPending ? (() => {
          const rem = myOffer.expires_at ? Math.max(0, Math.ceil((new Date(myOffer.expires_at).getTime() - nowTs) / 1000)) : null;
          const expired = rem === 0;
          return (
            <div className={`rounded-xl p-4 border ${expired ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`} data-testid="my-offer-panel">
              <div className="flex items-center gap-3">
                {rem !== null && !expired && <CountdownRing seconds={rem} total={myOffer.ttl_seconds || 30} size={44} />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-600 uppercase">{t('driver.your_offer_sent')}</p>
                  <p className="text-2xl font-extrabold text-slate-900" data-testid="my-offer-amount">{myOffer.amount.toFixed(2)} €</p>
                  <p className={`text-xs font-semibold ${expired ? 'text-red-600' : 'text-emerald-700'}`} data-testid="my-offer-status">
                    {expired ? t('driver.offer_expired') : t('driver.offer_expires_in', { s: rem })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={onCancelOffer} className="px-4 h-11 rounded-full border border-gray-300 text-gray-600 font-bold text-sm" data-testid="cancel-offer-btn">{t('ride.cancel')}</button>
                <button onClick={onRenewOffer} className={`flex-1 h-11 rounded-full text-white font-bold text-sm flex items-center justify-center gap-2 ${expired ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`} data-testid="renew-offer-btn">
                  <Plus size={18} /> {t('driver.renew_offer')}
                </button>
              </div>
            </div>
          );
        })() : (
          <>
            {showCounter && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                <p className="text-xs font-bold text-slate-700 mb-2 text-center">{t('driver.propose_other_price')}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={decCounter} aria-label="Diminuer"
                    className="w-14 h-14 rounded-2xl bg-white border-2 border-orange-300 text-orange-600 text-3xl font-extrabold flex items-center justify-center active:scale-95 transition-transform" data-testid="counter-minus-btn">−</button>
                  <div className="flex-1 flex items-center justify-center gap-1 bg-white border border-gray-200 rounded-2xl h-14">
                    <span className="text-xl font-bold text-slate-400">€</span>
                    <input type="number" inputMode="decimal" step="0.50" min="1" value={counterVal}
                      onChange={(e) => setCounterVal(e.target.value)} placeholder={price}
                      className="w-28 text-center outline-none text-2xl font-extrabold text-slate-800 bg-transparent" data-testid="counter-offer-input" />
                  </div>
                  <button type="button" onClick={incCounter} aria-label="Augmenter"
                    className="w-14 h-14 rounded-2xl bg-white border-2 border-orange-300 text-orange-600 text-3xl font-extrabold flex items-center justify-center active:scale-95 transition-transform" data-testid="counter-plus-btn">+</button>
                </div>
                <button onClick={() => { const amt = parseFloat(counterVal); if (amt > 0) onSendCounterOffer?.(request.id, counterVal); }}
                  className="w-full mt-3 h-12 rounded-2xl bg-orange-500 text-white font-extrabold text-base active:scale-[0.99] transition-transform" data-testid="send-counter-offer-btn">{t('driver.send')}</button>
              </div>
            )}
            {!showCounter && onSendCounterOffer && (
              <button onClick={openCounter} className="w-full mb-3 h-12 rounded-2xl border-2 border-orange-500 text-orange-600 font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition-transform" data-testid="toggle-counter-offer-btn">
                <Plus size={18} weight="bold" /> {t('driver.propose_other_price')}
              </button>
            )}
            <div className="flex items-center gap-4">
              <button onClick={onDecline} className="px-6 py-4 text-lg font-bold text-gray-500" data-testid="reject-ride-btn">{t('driver.decline')}</button>
              <button onClick={() => onAccept?.(request.id)} className="flex-1 h-14 rounded-2xl text-white text-lg font-extrabold flex items-center justify-center gap-2 shadow-lg" style={{ background: '#FF5000' }} data-testid="accept-ride-btn">
                {isBidding ? `${t('driver.accept')} · ${price} €` : t('driver.accept')} <ArrowRight size={22} weight="bold" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default IncomingRequestSheet;
