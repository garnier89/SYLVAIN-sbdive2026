import React from 'react';
import { ArrowLeft, Car, Info } from '@phosphor-icons/react';
import { useLocale } from '../../../contexts/LocaleContext';

/**
 * Step 2.5 — Negotiation: shows pending counter-offers from drivers.
 */
export const RideNegotiationStep = ({
  proposedFare, estimate,
  counterOffers, loading,
  acceptOffer, cancelNegotiation,
}) => {
  const { t } = useLocale();
  const mine = parseFloat(proposedFare) || (estimate?.estimated_fare || 0);
  const pending = counterOffers.filter(o => o.status === 'pending');

  return (
    <div className="mobile-container min-h-screen bg-gray-50 flex flex-col" data-testid="negotiation-step">
      <div className="bg-gradient-to-r from-[#FF4500] to-[#FF6B35] px-5 pt-6 pb-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={cancelNegotiation} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="cancel-negotiation-btn">
            <ArrowLeft size={18} className="text-white" weight="bold" />
          </button>
          <h1 className="text-lg font-bold">{t('ride.negotiation_title')}</h1>
        </div>
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4">
          <p className="text-xs text-white/80 mb-1">{t('ride.your_offer')}</p>
          <p className="text-4xl font-black">{mine.toFixed(2)} &euro;</p>
          <p className="text-xs text-white/80 mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
            {t('ride.sent_to_drivers')}
          </p>
        </div>
      </div>

      <div className="flex-1 px-5 py-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800">{t('ride.offers_received')}</h2>
          <span className="text-xs text-gray-500" data-testid="offers-count">{t('ride.proposals_count', { count: pending.length })}</span>
        </div>

        {pending.length === 0 && (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm" data-testid="waiting-state">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-orange-100 flex items-center justify-center animate-pulse">
              <Car size={28} className="text-[#FF4500]" weight="duotone" />
            </div>
            <p className="font-semibold text-slate-800 mb-1">{t('ride.waiting_drivers')}</p>
            <p className="text-xs text-gray-500">{t('ride.waiting_drivers_hint')}</p>
          </div>
        )}

        <div className="space-y-3">
          {pending.map(o => {
            const diff = o.amount - mine;
            const isHigher = diff > 0;
            return (
              <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`offer-${o.id}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-base">
                    {o.driver_name?.charAt(0).toUpperCase() || 'C'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{o.driver_name}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><Info size={10} weight="fill" className="text-amber-400" />{o.driver_rating?.toFixed(1) || '5.0'}</span>
                      {o.driver_vehicle_model && <span>&middot; {o.driver_vehicle_model}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-800">{o.amount.toFixed(2)} &euro;</p>
                    {diff !== 0 && (
                      <p className={`text-[10px] font-bold ${isHigher ? 'text-red-500' : 'text-green-600'}`}>
                        {isHigher ? '+' : ''}{diff.toFixed(2)} &euro; {t('ride.vs_your_offer')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => acceptOffer(o.id)}
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-[#FF4500] hover:bg-[#E53E00] text-white font-bold text-sm disabled:opacity-60"
                  data-testid={`accept-offer-${o.id}`}
                >
                  {t('ride.accept_offer')}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RideNegotiationStep;
