/**
 * ServiceBookingFlow — unified, modern booking experience for every non-taxi
 * service. Mirrors the TaxiHub model: provider selection → service + address +
 * scheduling + payment + promo + live price → confirmation. Real backend
 * (/api/services/estimate + /bookings), no mocked toasts.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, MapPin, Star, CaretRight, Money, CreditCard, Wallet, Tag,
  CheckCircle, Lightning, Clock, CalendarPlus, Minus, Plus, Storefront, MapTrifold,
} from '@phosphor-icons/react';
import GooglePlacesInput from './GooglePlacesInput';
import MapLocationPicker from './MapLocationPicker';
import { servicesAPI } from '../services/api';
import { getServiceConfig } from '../data/serviceCatalog';

const API = process.env.REACT_APP_BACKEND_URL;
const PAYMENTS = [
  { k: 'cash', l: 'Espèces', icon: Money },
  { k: 'card', l: 'Carte', icon: CreditCard },
  { k: 'sbpaygo', l: 'SB PayGo', icon: Wallet },
];

const ServiceBookingFlow = () => {
  const { serviceKey } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cfg = useMemo(() => getServiceConfig(serviceKey), [serviceKey]);

  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(null);
  const [step, setStep] = useState('provider'); // provider | form
  const [subService, setSubService] = useState(cfg?.subServices?.[0] || null);
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState(null);
  const [when, setWhen] = useState(cfg?.instant ? 'now' : 'now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [payment, setPayment] = useState('cash');
  const [promoCode, setPromoCode] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const debounceRef = useRef(null);

  // Load providers for this service catalog
  useEffect(() => {
    if (!cfg) return;
    fetch(`${API}/api/phase2/catalogs/${cfg.collection}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setProviders(list);
        const pre = params.get('provider');
        if (pre) {
          const found = list.find((p) => p.id === pre);
          if (found) { setProvider(found); setStep('form'); }
        }
      })
      .catch(() => setProviders([]));
  }, [cfg, params]);

  // Live estimate (debounced)
  const fetchEstimate = useCallback(async () => {
    if (!subService) return null;
    try {
      const r = await fetch(`${API}/api/services/estimate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          base_price: subService.base_price, quantity,
          coupon_code: promoCode.trim().toUpperCase() || null,
        }),
      });
      if (r.ok) { const d = await r.json(); setEstimate(d); return d; }
    } catch { /* ignore */ }
    return null;
  }, [subService, quantity, promoCode]);

  useEffect(() => {
    if (step !== 'form') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchEstimate, 300);
  }, [step, fetchEstimate]);

  if (!cfg) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500" data-testid="service-not-found">
        Service introuvable
      </div>
    );
  }
  const Icon = cfg.icon;
  const promoOk = estimate?.promo_valid;

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    const d = await fetchEstimate();
    if (d?.promo_valid) toast.success(`Code promo appliqué : -${d.discount.toFixed(2)} €`);
    else toast.error('Code promo invalide');
  };

  const onSubmit = async () => {
    if (cfg.addressRequired && !address) { toast.error('Veuillez indiquer une adresse'); return; }
    if (when === 'later' && (!date || !time)) { toast.error('Choisissez une date et une heure'); return; }
    setSubmitting(true);
    try {
      const { data } = await servicesAPI.createBooking({
        category: cfg.category,
        service_key: cfg.key,
        service_name: subService?.name || cfg.title,
        provider_id: provider?.id || null,
        provider_name: provider?.name || null,
        provider_phone: provider?.phone || null,
        address: address?.address || 'À domicile',
        lat: address?.lat || null,
        lng: address?.lng || null,
        is_instant: when === 'now',
        scheduled_date: when === 'later' ? date : null,
        scheduled_time: when === 'later' ? time : null,
        quantity,
        base_price: subService?.base_price || 0,
        coupon_code: promoOk ? promoCode.trim().toUpperCase() : null,
        payment_method: payment,
        notes: '',
      });
      toast.success('Réservation confirmée !');
      navigate(`/my-bookings?focus=${data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Échec de la réservation");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="service-booking-flow">
      {/* Header */}
      <div className="px-4 pt-10 pb-5 text-white relative overflow-hidden" style={{ background: cfg.color }}>
        <div className="flex items-center gap-3 relative z-10">
          <button onClick={() => (step === 'form' && !params.get('provider') ? setStep('provider') : navigate(-1))}
            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Icon size={26} weight="duotone" />
            <div>
              <h1 className="text-lg font-black leading-tight">{cfg.title}</h1>
              <p className="text-[11px] text-white/70">{cfg.subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 1 — provider selection */}
      {step === 'provider' && (
        <div className="px-4 -mt-3" data-testid="provider-step">
          <div className="bg-white rounded-2xl shadow-sm p-3 mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Choisissez un prestataire</p>
          </div>
          {providers.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-sm text-gray-500" data-testid="no-providers">
              <Storefront size={32} className="mx-auto mb-2 text-gray-300" weight="duotone" />
              Aucun prestataire disponible pour le moment.
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((p) => (
                <button key={p.id} onClick={() => { setProvider(p); setStep('form'); }}
                  className="w-full bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 text-left hover:shadow-md transition-shadow"
                  data-testid={`provider-${p.id}`}>
                  {p.image && <img src={p.image} alt={p.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" loading="lazy" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{p.name}</p>
                    {(p.address || p.location) && <p className="text-[11px] text-gray-500 truncate"><MapPin size={10} className="inline mr-0.5" />{p.address || p.location}</p>}
                    {p.rating != null && <span className="inline-flex items-center gap-0.5 text-xs text-gray-700 mt-0.5"><Star size={12} weight="fill" className="text-amber-400" />{p.rating.toFixed(1)}</span>}
                  </div>
                  <CaretRight size={16} className="text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — booking form */}
      {step === 'form' && (
        <div className="px-4 -mt-3 space-y-4" data-testid="booking-form-step">
          {/* Selected provider */}
          {provider && (
            <div className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3" data-testid="selected-provider">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${cfg.color}1A` }}>
                <Icon size={20} style={{ color: cfg.color }} weight="fill" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">{provider.name}</p>
                <p className="text-[11px] text-gray-500">Prestataire sélectionné</p>
              </div>
              {!params.get('provider') && (
                <button onClick={() => setStep('provider')} className="text-xs font-semibold" style={{ color: cfg.color }} data-testid="change-provider-btn">Changer</button>
              )}
            </div>
          )}

          {/* Sub-service chips */}
          {cfg.subServices.length > 1 && (
            <div className="bg-white rounded-2xl shadow-sm p-3" data-testid="subservice-block">
              <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 mb-2">Prestation</p>
              <div className="flex flex-wrap gap-2">
                {cfg.subServices.map((s) => (
                  <button key={s.name} onClick={() => setSubService(s)} data-testid={`subservice-${s.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${subService?.name === s.name ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                    style={subService?.name === s.name ? { background: cfg.color } : undefined}>
                    {s.name}{s.base_price > 0 ? ` · ${s.base_price}€` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          {subService?.base_price > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-3 flex items-center justify-between" data-testid="quantity-block">
              <p className="text-sm font-semibold text-gray-700">Quantité</p>
              <div className="flex items-center gap-4">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center" data-testid="qty-minus"><Minus size={16} /></button>
                <span className="text-lg font-bold w-6 text-center" data-testid="qty-value">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center" data-testid="qty-plus"><Plus size={16} /></button>
              </div>
            </div>
          )}

          {/* Address */}
          {cfg.addressRequired && (
            <div className="bg-white rounded-2xl shadow-sm p-3 space-y-2" data-testid="address-block">
              <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Adresse d'intervention</p>
              <GooglePlacesInput
                placeholder="Saisissez votre adresse"
                value={address?.address || ''}
                testId="service-address-input"
                onSelect={(r) => setAddress({ address: r.address, lat: r.lat, lng: r.lng })}
              />
              <button onClick={() => setMapOpen(true)} className="flex items-center gap-2 text-xs font-semibold" style={{ color: cfg.color }} data-testid="map-pick-btn">
                <MapTrifold size={15} /> Définir l'emplacement sur la carte
              </button>
            </div>
          )}

          {/* Scheduling */}
          {!cfg.instant && (
            <div className="bg-white rounded-2xl shadow-sm p-3" data-testid="schedule-block">
              <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 mb-2">Quand ?</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setWhen('now')} data-testid="when-now"
                  className={`py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${when === 'now' ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                  style={when === 'now' ? { background: cfg.color } : undefined}><Clock size={16} /> Dès que possible</button>
                <button onClick={() => setWhen('later')} data-testid="when-later"
                  className={`py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${when === 'later' ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                  style={when === 'later' ? { background: cfg.color } : undefined}><CalendarPlus size={16} /> Programmer</button>
              </div>
              {when === 'later' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="schedule-date" />
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="schedule-time" />
                </div>
              )}
            </div>
          )}

          {/* Payment */}
          <div className="bg-white rounded-2xl shadow-sm p-3" data-testid="payment-selector">
            <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 mb-2">Moyen de paiement</p>
            <div className="flex gap-2">
              {PAYMENTS.map((pm) => {
                const PmIcon = pm.icon; const active = payment === pm.k;
                return (
                  <button key={pm.k} onClick={() => setPayment(pm.k)} data-testid={`payment-${pm.k}`}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-semibold ${active ? 'bg-[#0B1426] text-white border-transparent' : 'bg-white text-[#0B1426] border-gray-200'}`}>
                    <PmIcon size={18} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : ''} /> {pm.l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Promo */}
          <div className="bg-white rounded-2xl shadow-sm p-3" data-testid="promo-block">
            <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1"><Tag size={11} /> Code promo</p>
            {promoOk ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5" data-testid="promo-applied"><CheckCircle size={16} weight="fill" /> {promoCode.toUpperCase()} · -{estimate.discount.toFixed(2)} €</span>
                <button onClick={() => { setPromoCode(''); fetchEstimate(); }} className="text-xs text-emerald-700 underline" data-testid="promo-clear">Retirer</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Ex: SB10" className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="promo-input" />
                <button onClick={applyPromo} className="px-4 rounded-xl bg-[#0B1426] text-white text-sm font-semibold" data-testid="promo-apply">Appliquer</button>
              </div>
            )}
          </div>

          {/* Live price */}
          <AnimatePresence>
            {estimate && subService?.base_price > 0 && (
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-[#0B1426] text-white p-4 rounded-2xl flex items-center justify-between" data-testid="live-price-card">
                <div>
                  <p className="text-[10px] tracking-[0.1em] uppercase font-bold" style={{ color: cfg.color }}>{subService.name}</p>
                  <p className="text-xs text-white/60 mt-0.5">{quantity} × {subService.base_price}€{estimate.discount > 0 ? ` · promo -${estimate.discount.toFixed(2)}€` : ''}</p>
                </div>
                <p className="text-4xl font-black tracking-tighter" data-testid="live-price-value">{estimate.total.toFixed(2)}<span className="text-lg"> €</span></p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Sticky CTA */}
      {step === 'form' && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={onSubmit} disabled={submitting} data-testid="confirm-booking-btn"
            className="w-full py-4 font-black text-lg flex items-center justify-center gap-2 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60 text-white"
            style={{ background: cfg.color }}>
            <Lightning size={20} weight="fill" /> {submitting ? 'Envoi…' : 'Confirmer la réservation'}
          </button>
        </div>
      )}

      <MapLocationPicker
        open={mapOpen}
        target="dropoff"
        initial={address}
        onClose={() => setMapOpen(false)}
        onConfirm={(place) => { setAddress(place); setMapOpen(false); }}
      />
    </div>
  );
};

export default ServiceBookingFlow;
