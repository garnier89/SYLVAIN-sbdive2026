/**
 * RideVehicleSection — liste de véhicules, moyen de paiement et fiche véhicule
 * pour RideChoosePage (étape 2 / carte). Extrait de RideChoosePage.js sans
 * changement de comportement. Composants pilotés par props (bundles spread dans
 * la page : vehicleListProps / paymentProps).
 */
import React from 'react';
import {
  Motorcycle, Van, Car, UsersThree, Info, Gavel, WhatsappLogo,
  Money, CreditCard, Wallet, Lightning, CaretDown, CheckCircle,
} from '@phosphor-icons/react';

const BADGE_COLOR_CLASSES = {
  Vert: 'bg-emerald-100 text-emerald-700',
  Orange: 'bg-orange-100 text-orange-700',
  Bleu: 'bg-blue-100 text-blue-700',
  Rouge: 'bg-red-100 text-red-700',
};

const PAYMENT_ICONS = { Money, CreditCard, Wallet, Lightning };

// Fallback descriptions when a vehicle has no admin-set `info`.
const DEFAULT_VEHICLE_INFO = {
  sb: 'Taxi de base et de routine pour les trajets quotidiens.',
  confort: 'Confort supérieur pour vos trajets quotidiens.',
  luxe: 'Berline haut de gamme, chauffeur en costume.',
  moto: 'Déplacements rapides en moto, idéal en ville.',
  pool: 'Trajet partagé à prix réduit avec d\'autres passagers.',
  suv: 'Véhicule spacieux pour les voyages en groupe.',
  electric: 'Véhicule électrique, trajet propre et silencieux.',
  van: 'Grand véhicule pour les groupes et les bagages.',
};

export const vehicleDesc = (v) => v.info || DEFAULT_VEHICLE_INFO[v.slug] || 'Trajet confortable jusqu\'à destination.';

const vehicleIcon = (vt) => {
  const slug = (vt.slug || '').toLowerCase();
  const t = (vt.icon_type || '').toLowerCase();
  if (slug === 'moto' || slug === 'tuktuk' || t.includes('moto')) return Motorcycle;
  if (slug === 'van' || slug === 'suv' || t.includes('van') || (vt.person_capacity || 0) >= 6) return Van;
  return Car;
};

export const RideVehicleList = (p) => {
  const { effectiveVtypes, estimates, selected, setSelected, nearby, badgeCfg,
    waActive, openWhatsApp, setInfoVehicle, money, isBidding, avgFares, isPool } = p;
  // "Meilleur choix" badge = best price-per-seat ratio among real cars
  // (capacity ≥ 4 — excludes Moto/TukTuk), e.g. SB at 10€/4. Shown when ≥2 eligible.
  let bestSlug = null; let _min = Infinity; let _pricedCount = 0;
  effectiveVtypes.forEach((v) => {
    const e = estimates[v.slug];
    const cap = v.person_capacity || 1;
    if (e && !e.loading && !e.error && e.fare != null && cap >= 4) {
      _pricedCount += 1;
      const ratio = e.fare / cap;
      if (ratio < _min) { _min = ratio; bestSlug = v.slug; }
    }
  });
  if (_pricedCount < 2) bestSlug = null;
  return (
    <div data-testid="choose-ride-section" className="space-y-2.5">
      {effectiveVtypes.map((v) => {
        const Icon = vehicleIcon(v);
        const est = estimates[v.slug] || {};
        const active = selected === v.slug;
        const img = active ? (v.image_selected || v.image_unselected) : (v.image_unselected || v.image_selected);
        const pickupEta = nearby.etaMins;
        const pickupTime = pickupEta != null
          ? new Date(Date.now() + pickupEta * 60000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : null;
        return (
          <div key={v.slug} onClick={() => setSelected(v.slug)} data-testid={`choose-vehicle-${v.slug}`}
            className={`flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer transition-colors ${active ? 'border-[#0B1426] bg-white' : 'border-transparent bg-gray-50'}`}>
            <div className="w-20 h-16 flex items-center justify-center shrink-0">
              {img ? <img src={img} alt={v.name_fr || v.slug} className="max-h-16 object-contain" /> : <Icon size={36} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : 'text-gray-500'} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <p className="font-black text-[#0B1426] text-base truncate">{v.name_fr || v.name || v.slug}</p>
                  <span className="flex items-center gap-0.5 text-xs text-gray-500 shrink-0"><UsersThree size={14} weight="fill" />{v.person_capacity || 4}</span>
                  {badgeCfg.enabled && v.slug === bestSlug && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide shrink-0 ${BADGE_COLOR_CLASSES[badgeCfg.color] || BADGE_COLOR_CLASSES.Vert}`} data-testid={`best-choice-${v.slug}`}>{badgeCfg.label}</span>
                  )}
                  {waActive && v.allow_whatsapp_booking && (
                    <button type="button" onClick={(e) => openWhatsApp(v.slug, e)}
                      data-testid={`vehicle-whatsapp-${v.slug}`}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-[#25D366] text-white shrink-0 active:scale-95 transition-transform">
                      <WhatsappLogo size={11} weight="fill" /> WhatsApp
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {est.loading ? <div className="h-5 w-14 bg-gray-100 rounded animate-pulse" />
                    : est.error ? <span className="text-xs text-gray-300">—</span>
                    : <p className="font-black text-[#0B1426] text-base" data-testid={`price-${v.slug}`}>{est.fare != null ? money(est.fare) : '—'}</p>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); setInfoVehicle(v); }} data-testid={`vehicle-info-${v.slug}`} className="text-gray-400 active:scale-90 transition-transform" aria-label="Détails du véhicule">
                    <Info size={17} weight="bold" />
                  </button>
                </div>
              </div>
              <p className="text-[12px] text-gray-500 mt-0.5">{pickupTime ? `${pickupTime} · ${pickupEta} min` : (est.duration != null ? `${est.duration} min` : '')}</p>
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{vehicleDesc(v)}</p>
              {isBidding && avgFares[v.slug] != null && (
                <p className="text-[11px] font-semibold text-emerald-600 mt-0.5 flex items-center gap-1" data-testid={`avg-fare-${v.slug}`}>
                  <Gavel size={12} weight="fill" /> Tarif moyen accepté : {money(avgFares[v.slug])}
                </p>
              )}
              {isPool && est.originalFare && est.originalFare > est.fare && (
                <p className="text-[11px] text-gray-400 line-through leading-none mt-0.5" data-testid={`orig-price-${v.slug}`}>{money(est.originalFare)}</p>
              )}
              {isPool && est.poolSavings > 0 && (
                <p className="text-[11px] font-bold text-emerald-600 leading-none mt-0.5" data-testid={`savings-${v.slug}`}>-{money(est.poolSavings)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const RidePaymentMethod = (p) => {
  const { payments, payment, setPayment, payOpen, setPayOpen, effectivePayments,
    walletBalance, displayPrice, carriedDebt, navigate, money } = p;
  const sel = payments.find((pm) => pm.id === payment) || payments[0];
  const SelIcon = PAYMENT_ICONS[sel?.icon] || Money;
  return (
    <>
      <h3 className="text-xs font-bold uppercase text-gray-400 mt-4 mb-2">Moyen de paiement</h3>
      <div className="relative" data-testid="payment-dropdown-wrap">
        <button type="button" onClick={() => setPayOpen((o) => !o)} data-testid="payment-dropdown"
          className="w-full flex items-center justify-between rounded-xl border-2 border-gray-200 bg-white py-3 px-3">
          <span className="flex items-center gap-2 text-sm font-bold text-[#0B1426]"><SelIcon size={18} weight="fill" /> {sel?.label}</span>
          <CaretDown size={16} weight="bold" className={`text-gray-400 transition-transform ${payOpen ? 'rotate-180' : ''}`} />
        </button>
        {payOpen && (
          <div className="absolute z-30 left-0 right-0 bottom-full mb-1.5 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden" data-testid="payment-dropdown-list">
            {effectivePayments.map((pm) => {
              const Icon = PAYMENT_ICONS[pm.icon] || Money; const active = payment === pm.id;
              return (
                <button key={pm.id} type="button" onClick={() => { setPayment(pm.id); setPayOpen(false); }} data-testid={`ride-choose-pay-${pm.id}`}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left ${active ? 'bg-[#FFF3EC] text-[#FF5000] font-bold' : 'text-[#0B1426]'}`}>
                  <Icon size={18} weight={active ? 'fill' : 'regular'} /> {pm.label}
                  {active && <CheckCircle size={15} weight="fill" className="ml-auto text-[#FF5000]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {payment === 'wallet' && walletBalance != null && displayPrice != null && walletBalance < displayPrice && (
        <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5" data-testid="wallet-shortfall-notice">
          <div className="flex items-start gap-2">
            <Wallet size={16} weight="duotone" className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-amber-800 leading-snug">
              Solde portefeuille : <b>{money(Number(walletBalance))}</b> — insuffisant. Ajoutez de l&apos;argent,
              ou continuez et payez la différence de <b>{money(displayPrice - walletBalance)}</b> en espèces au chauffeur.
            </p>
          </div>
          <button type="button" onClick={() => navigate('/wallet?action=topup')}
            className="mt-2 w-full py-2 rounded-xl bg-amber-600 text-white text-[13px] font-bold"
            data-testid="add-money-btn">Ajouter de l&apos;argent</button>
        </div>
      )}
      {payment === 'wallet' && walletBalance != null && displayPrice != null && walletBalance >= displayPrice && (
        <p className="mt-2 text-[12px] font-semibold text-emerald-700" data-testid="wallet-ok-notice">Solde portefeuille : {Number(walletBalance).toFixed(2)} € · suffisant ✓</p>
      )}
      {carriedDebt > 0 && (
        <div className="mt-2 rounded-xl bg-red-50 border border-red-200 p-2.5" data-testid="carried-debt-notice">
          <p className="text-[12px] text-red-800 leading-snug">
            Solde dû précédent : <b>{money(carriedDebt)}</b> sera ajouté à cette course.
            {displayPrice != null && <> Total à régler : <b>{money(Number(displayPrice) + carriedDebt)}</b>.</>}
          </p>
        </div>
      )}
    </>
  );
};

export const RideVehicleInfoModal = ({ vehicle, onClose, onSelect, money }) => {
  if (!vehicle) return null;
  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end" onClick={onClose} data-testid="vehicle-info-modal">
      <div className="w-full bg-white rounded-t-3xl p-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-4 mb-3">
          <div className="w-24 h-18 flex items-center justify-center shrink-0">
            {(vehicle.image_selected || vehicle.image_unselected)
              ? <img src={vehicle.image_selected || vehicle.image_unselected} alt={vehicle.name_fr || vehicle.slug} className="max-h-20 object-contain" />
              : <Car size={44} className="text-gray-400" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-black text-[#0B1426] truncate">{vehicle.name_fr || vehicle.name || vehicle.slug}</h3>
            <span className="flex items-center gap-1 text-sm text-gray-500 mt-0.5"><UsersThree size={16} weight="fill" /> {vehicle.person_capacity || 4} passagers</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4 leading-snug">{vehicleDesc(vehicle)}</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-gray-400">Prise en charge</p>
            <p className="font-black text-[#0B1426] text-sm mt-0.5">{money(Number(vehicle.base_fare || vehicle.pickup_price || 0))}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-gray-400">Par km</p>
            <p className="font-black text-[#0B1426] text-sm mt-0.5">{money(Number(vehicle.price_per_km || 0))}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-gray-400">Par min</p>
            <p className="font-black text-[#0B1426] text-sm mt-0.5">{money(Number(vehicle.price_per_min || 0))}</p>
          </div>
        </div>
        <button onClick={() => onSelect(vehicle.slug)} data-testid="vehicle-info-select-btn"
          className="w-full py-3.5 rounded-xl bg-[#FF5000] text-white font-black active:scale-[0.98] transition-transform">
          Choisir {vehicle.name_fr || vehicle.name || vehicle.slug}
        </button>
      </div>
    </div>
  );
};
