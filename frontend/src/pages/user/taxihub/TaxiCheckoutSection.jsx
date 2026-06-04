/**
 * TaxiCheckoutSection — profil de course (Business/Personnel) + motif pro,
 * sélecteur de paiement et code promo. Extrait de TaxiHubPage.js.
 */
import React from 'react';
import { User, Tag, CheckCircle } from '@phosphor-icons/react';
import { PAYMENT_METHODS } from './taxiHubConstants';

export const TaxiCheckoutSection = ({
  rideProfiles, rideProfileId, setRideProfileId,
  businessReasons, businessReasonId, setBusinessReasonId,
  paymentMethod, setPaymentMethod,
  promoCode, setPromoCode, promoApplied, promoDiscount, applyPromo, clearPromo,
}) => {
  const selectedProfile = rideProfiles.find((p) => p.id === rideProfileId);
  return (
    <>
      {/* Ride profile (Business / Personnel) + business trip reason — V3Cube */}
      {rideProfiles.length > 0 && (
        <div className="mt-1 mb-3" data-testid="ride-profile-selector">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><User size={11} /> Profil de course</label>
          <div className="flex gap-2 mt-1.5 overflow-x-auto hide-scrollbar">
            {rideProfiles.map((p) => {
              const active = rideProfileId === p.id;
              return (
                <button key={p.id} onClick={() => { setRideProfileId(active ? '' : p.id); setBusinessReasonId(''); }}
                  data-testid={`ride-profile-${p.org_type.toLowerCase()}`}
                  className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl border text-left transition-colors ${active ? 'bg-[#0B1426] text-white border-transparent' : 'bg-white text-[#0B1426] border-[#E2E8F0]'}`}>
                  <span className="text-sm font-semibold block">{p.short_name}</span>
                  <span className={`text-[10px] block truncate ${active ? 'text-white/70' : 'text-slate-400'}`}>{p.title_description}</span>
                </button>
              );
            })}
          </div>
          {selectedProfile?.org_type === 'Business' && businessReasons.length > 0 && (
            <select value={businessReasonId} onChange={(e) => setBusinessReasonId(e.target.value)}
              data-testid="business-trip-reason-select"
              className="w-full mt-2 border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-white">
              <option value="">Motif du trajet professionnel…</option>
              {businessReasons.map((b) => <option key={b.id} value={b.id}>{b.trip_reason}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Payment method — horizontal selector */}
      <div className="mt-1 mb-3" data-testid="payment-selector">
        <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Moyen de paiement</label>
        <div className="flex gap-2 mt-1.5 overflow-x-auto hide-scrollbar">
          {PAYMENT_METHODS.map((pm) => {
            const PmIcon = pm.icon;
            const active = paymentMethod === pm.k;
            return (
              <button key={pm.k} onClick={() => setPaymentMethod(pm.k)} data-testid={`payment-${pm.k}`}
                className={`flex-1 min-w-[96px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${active ? 'bg-[#0B1426] text-white border-transparent' : 'bg-white text-[#0B1426] border-[#E2E8F0]'}`}>
                <PmIcon size={18} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : ''} /> {pm.l}
              </button>
            );
          })}
        </div>
      </div>

      {/* Promo code */}
      <div data-testid="promo-block">
        <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><Tag size={11} /> Code promo</label>
        {promoApplied ? (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mt-1.5">
            <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5" data-testid="promo-applied-label">
              <CheckCircle size={16} weight="fill" /> {promoCode.toUpperCase()} · -{promoDiscount.toFixed(2)} €
            </span>
            <button onClick={clearPromo} className="text-xs text-emerald-700 underline" data-testid="promo-clear-btn">Retirer</button>
          </div>
        ) : (
          <div className="flex gap-2 mt-1.5">
            <input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Ex: SB10" className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm" data-testid="promo-code-input" />
            <button onClick={applyPromo} className="px-4 rounded-xl bg-[#0B1426] text-white text-sm font-semibold" data-testid="promo-apply-btn">Appliquer</button>
          </div>
        )}
      </div>
    </>
  );
};
