import { useLocale } from '../../contexts/LocaleContext';
/**
 * AdvancedTaxiBookingPage — V3Cube Pack A
 * Single unified page with mode tabs: Ride Later, Intercity, Airport, Rental,
 * Hire A Driver (Buddy), Corporate, Moto.
 * Reuses the same backend POST /api/rides with `ride_type` discriminator.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Calendar, MapPin, Airplane, Clock, Briefcase,
  UserCheck, Motorcycle, RoadHorizon, Trophy,
} from '@phosphor-icons/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import { corporateAPI, configAPI } from '../../services/api';

const API = process.env.REACT_APP_BACKEND_URL;

const MODES = [
  { key: 'scheduled', label: 'Plus tard', icon: Calendar, color: '#3B82F6' },
  { key: 'intercity', label: 'Intercité', icon: RoadHorizon, color: '#8B5CF6' },
  { key: 'airport', label: 'Aéroport', icon: Airplane, color: '#0EA5E9' },
  { key: 'rental', label: 'Location', icon: Clock, color: '#F59E0B' },
  { key: 'buddy_driver', label: 'Chauffeur perso', icon: UserCheck, color: '#10B981' },
  { key: 'corporate', label: 'Pro / Entreprise', icon: Briefcase, color: '#6366F1' },
  { key: 'moto', label: 'Moto', icon: Motorcycle, color: '#EF4444' },
];

// Default mapping mode → REAL vehicle_type slug (validated against the admin's
// /api/config/vehicle-types). Used as a fallback when the slug isn't loaded yet.
const VEHICLE_BY_MODE = {
  scheduled: 'sb', intercity: 'luxe', airport: 'airport',
  rental: 'confort', buddy_driver: 'confort', corporate: 'luxe', moto: 'moto',
};

const AdvancedTaxiBookingPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') || 'scheduled');

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [rentalPackages, setRentalPackages] = useState([]);
  const [rentalPkg, setRentalPkg] = useState(null);
  const [buddyHours, setBuddyHours] = useState(4);
  const [corporateAccountId, setCorporateAccountId] = useState('');
  const [corporateAccounts, setCorporateAccounts] = useState([]);
  const [motoSubType, setMotoSubType] = useState('bike'); // bike | scooter | sport
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loyaltyDisc, setLoyaltyDisc] = useState(null);
  const [vtypes, setVtypes] = useState([]); // admin-configured vehicle types (images + pricing)

  // Resolve the active mode → an actual vehicle_type from the admin config so the
  // estimate uses the admin's pricing and the card shows the admin-uploaded image.
  const currentVehicle = useMemo(() => {
    const want = mode === 'moto' ? 'moto' : (VEHICLE_BY_MODE[mode] || 'sb');
    return vtypes.find((v) => v.slug === want) || vtypes.find((v) => v.slug === 'sb') || vtypes[0] || null;
  }, [vtypes, mode]);
  const currentSlug = currentVehicle?.slug || (mode === 'moto' ? 'moto' : VEHICLE_BY_MODE[mode] || 'sb');

  // Loyalty booking discount (shown at checkout to drive retention)
  useEffect(() => {
    fetch(`${API}/api/loyalty/my-discount`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.discount_pct > 0) setLoyaltyDisc(d); })
      .catch(() => {});
  }, []);

  // Load admin vehicle types once (single source of truth for pricing + images).
  useEffect(() => {
    configAPI.getVehicleTypes().then((r) => setVtypes(r.data || [])).catch(() => {});
  }, []);

  // Load rental packages once
  useEffect(() => {
    fetch(`${API}/api/rides/rental-packages`, { method: 'POST', credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.packages) {
          setRentalPackages(d.packages);
          if (!rentalPkg) setRentalPkg(d.packages[0]?.slug);
        }
      })
      .catch(e => console.warn('rental packages load failed:', e?.message || e));
  }, [rentalPkg]);

  // Default scheduled_at = next hour (for any mode that uses scheduling)
  useEffect(() => {
    const needsSchedule = ['scheduled', 'intercity', 'airport'].includes(mode);
    if (needsSchedule && !scheduledAt) {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      setScheduledAt(d.toISOString().slice(0, 16));
    }
  }, [mode, scheduledAt]);

  // Load corporate accounts when corporate mode is active
  useEffect(() => {
    if (mode !== 'corporate') return;
    corporateAPI.my()
      .then(r => {
        const items = r.data.items || [];
        setCorporateAccounts(items);
        if (items.length && !corporateAccountId) setCorporateAccountId(items[0].join_code);
      })
      .catch(e => console.warn('corporate accounts load failed:', e?.message || e));
  }, [mode, corporateAccountId]);

  const fetchEstimate = useCallback(async () => {
    if (!pickup?.lat) return;
    if (mode !== 'rental' && mode !== 'buddy_driver' && !dropoff?.lat) return;
    try {
      const vehicleType = currentSlug;
      const dest = dropoff || pickup; // rental/buddy don't require dropoff
      const r = await fetch(`${API}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          dropoff_lat: dest.lat, dropoff_lng: dest.lng, dropoff_address: dest.address,
          vehicle_type: vehicleType, payment_method: 'cash',
        }),
      });
      if (r.ok) setEstimate(await r.json());
    } catch (e) { console.warn('estimate failed:', e?.message || e); }
  }, [pickup, dropoff, mode, currentSlug]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 400);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  const buildPayload = () => {
    const vehicleType = currentSlug;
    const base = {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
      dropoff_lat: (dropoff || pickup).lat, dropoff_lng: (dropoff || pickup).lng,
      dropoff_address: (dropoff || pickup).address,
      vehicle_type: vehicleType, payment_method: 'cash', ride_type: mode,
    };
    if (mode === 'scheduled' || mode === 'intercity' || mode === 'airport') {
      base.scheduled_at = scheduledAt || null;
    }
    if (mode === 'airport') base.flight_number = flightNumber || null;
    if (mode === 'rental') {
      const p = rentalPackages.find(p => p.slug === rentalPkg);
      base.rental_package = rentalPkg;
      base.rental_hours = p?.hours || 2;
    }
    if (mode === 'buddy_driver') base.buddy_hours = buddyHours;
    if (mode === 'corporate') base.corporate_account_id = corporateAccountId || null;
    return base;
  };

  const onSubmit = async () => {
    if (!pickup?.lat) return toast.error('Choisissez un lieu de départ');
    if (mode !== 'rental' && mode !== 'buddy_driver' && !dropoff?.lat) {
      return toast.error('Choisissez une destination');
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/rides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPayload()),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      toast.success('Réservation enregistrée !');
      if (mode === 'scheduled' || mode === 'intercity' || mode === 'airport') {
        navigate('/scheduled-rides');
      } else {
        navigate(`/ride/${data.id}`);
      }
    } catch (e) {
      toast.error('Échec : ' + (e.message || 'erreur inconnue'));
    } finally {
      setSubmitting(false);
    }
  };

  const current = MODES.find((m) => m.key === mode);
  const Icon = current?.icon || Calendar;

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="advanced-taxi-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E293B] text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="adv-back">
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: current?.color + '33' }}>
            <Icon size={26} style={{ color: current?.color }} weight="duotone" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Taxi Avancé</h1>
            <p className="text-xs text-gray-400">{current?.label}</p>
          </div>
        </div>
      </div>

      {/* Mode pills */}
      <div className="px-4 -mt-3 mb-4">
        <div className="bg-white rounded-2xl p-2 shadow-md overflow-x-auto flex gap-1" data-testid="mode-tabs">
          {MODES.map((m) => {
            const Ic = m.icon;
            const active = m.key === mode;
            return (
              <button
                key={m.key}
                data-testid={`mode-${m.key}`}
                onClick={() => setMode(m.key)}
                className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-colors ${
                  active ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={active ? { backgroundColor: m.color } : {}}
              >
                <Ic size={18} weight={active ? 'fill' : 'regular'} />
                <span className="mt-1 font-medium">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 space-y-3">
        {/* Pickup / Dropoff */}
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <label className="text-[11px] text-gray-500 font-semibold uppercase mb-1 block flex items-center gap-1">
            <MapPin size={12} className="text-emerald-600" /> Départ
          </label>
          <GooglePlacesInput value={pickup?.address || ''} onSelect={setPickup} placeholder="Lieu de prise en charge" testId="pickup-input" />
          {mode !== 'rental' && mode !== 'buddy_driver' && (
            <>
              <label className="text-[11px] text-gray-500 font-semibold uppercase mt-3 mb-1 block flex items-center gap-1">
                <MapPin size={12} className="text-red-600" /> Destination
              </label>
              <GooglePlacesInput value={dropoff?.address || ''} onSelect={setDropoff} placeholder="Destination" testId="dropoff-input" />
            </>
          )}
        </div>

        {/* Mode-specific fields */}
        {(mode === 'scheduled' || mode === 'intercity' || mode === 'airport') && (
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <label className="text-[11px] text-gray-500 font-semibold uppercase mb-1 block">
              Date et heure
            </label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              data-testid="scheduled-at-input"
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>
        )}

        {mode === 'airport' && (
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <label className="text-[11px] text-gray-500 font-semibold uppercase mb-1 block">
              Numéro de vol (optionnel)
            </label>
            <Input
              placeholder="Ex: AF1234"
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
              data-testid="flight-number-input"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Nous suivons votre vol pour ajuster automatiquement l&apos;heure de prise en charge.
            </p>
          </div>
        )}

        {mode === 'rental' && (
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <label className="text-[11px] text-gray-500 font-semibold uppercase mb-2 block">
              Forfait
            </label>
            <div className="grid grid-cols-3 gap-2" data-testid="rental-packages">
              {rentalPackages.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => setRentalPkg(p.slug)}
                  data-testid={`rental-pkg-${p.slug}`}
                  className={`p-3 rounded-xl border text-center transition-colors ${
                    rentalPkg === p.slug ? 'border-amber-500 bg-amber-50' : 'border-gray-200'
                  }`}
                >
                  <p className="font-bold text-sm">{p.label}</p>
                  <p className="text-xs text-gray-500">{money(p.price)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'buddy_driver' && (
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <label className="text-[11px] text-gray-500 font-semibold uppercase mb-2 block">
              Durée du chauffeur personnel
            </label>
            <div className="grid grid-cols-4 gap-2" data-testid="buddy-hours">
              {[2, 4, 6, 8].map((h) => (
                <button
                  key={h}
                  onClick={() => setBuddyHours(h)}
                  data-testid={`buddy-${h}h`}
                  className={`p-3 rounded-xl border text-center transition-colors ${
                    buddyHours === h ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'
                  }`}
                >
                  <p className="font-bold">{h}h</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Votre chauffeur conduira votre voiture pour la durée choisie.
            </p>
          </div>
        )}

        {mode === 'corporate' && (
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <label className="text-[11px] text-gray-500 font-semibold uppercase mb-1 block">
              Compte entreprise
            </label>
            {corporateAccounts.length > 0 ? (
              <select
                value={corporateAccountId}
                onChange={(e) => setCorporateAccountId(e.target.value)}
                data-testid="corporate-account-select"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {corporateAccounts.map((a) => (
                  <option key={a.id} value={a.join_code}>
                    {a.name} (-{a.discount_pct}%)
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input
                  placeholder="Ex: ACME-2026"
                  value={corporateAccountId}
                  onChange={(e) => setCorporateAccountId(e.target.value.toUpperCase())}
                  data-testid="corporate-account-input"
                />
                <button
                  onClick={() => navigate('/corporate')}
                  className="text-[11px] text-indigo-600 font-semibold mt-2"
                  data-testid="manage-corporate-link"
                >
                  Rejoindre une entreprise →
                </button>
              </>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              La course sera facturée directement à votre entreprise.
            </p>
          </div>
        )}

        {mode === 'moto' && (
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <label className="text-[11px] text-gray-500 font-semibold uppercase mb-2 block">
              Type de moto
            </label>
            <div className="grid grid-cols-3 gap-2" data-testid="moto-types">
              {[
                { k: 'bike', l: 'Moto' },
                { k: 'scooter', l: 'Scooter' },
                { k: 'sport', l: 'Sport' },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMotoSubType(t.k)}
                  data-testid={`moto-${t.k}`}
                  className={`p-3 rounded-xl border text-center transition-colors ${
                    motoSubType === t.k ? 'border-red-500 bg-red-50' : 'border-gray-200'
                  }`}
                >
                  <Motorcycle size={20} className="mx-auto" />
                  <p className="text-xs mt-1 font-medium">{t.l}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Estimate preview */}
        {estimate?.estimated_fare && (
          <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="estimate-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Tarif estimé</p>
                {loyaltyDisc ? (
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-gray-900">
                      {money(estimate.estimated_fare * (1 - loyaltyDisc.discount_pct / 100))}
                    </p>
                    <p className="text-sm text-gray-400 line-through">{money(estimate.estimated_fare)}</p>
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">{money(estimate.estimated_fare || 0)}</p>
                )}
                <p className="text-[10px] text-gray-400">
                  {estimate.distance_km?.toFixed(1)} km • {estimate.duration_mins} min
                </p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: current?.color + '22' }} data-testid="estimate-vehicle-icon">
                {currentVehicle?.image_unselected || currentVehicle?.image_selected ? (
                  <img src={currentVehicle.image_unselected || currentVehicle.image_selected} alt={currentVehicle.name_fr || currentVehicle.slug} className="w-full h-full object-cover" />
                ) : (
                  <Icon size={24} style={{ color: current?.color }} weight="duotone" />
                )}
              </div>
            </div>
            {loyaltyDisc && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2" data-testid="loyalty-discount-banner">
                <Trophy size={16} weight="fill" className="text-amber-500 shrink-0" />
                <p className="text-[12px] font-semibold text-amber-700">
                  En tant que membre {loyaltyDisc.tier_name}, -{loyaltyDisc.discount_pct}% appliqués 🎉
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 max-w-[430px] mx-auto">
        <Button
          className="w-full"
          onClick={onSubmit}
          disabled={submitting}
          data-testid="adv-submit"
          style={{ backgroundColor: current?.color }}
        >
          {submitting ? 'Envoi...' : (mode === 'scheduled' || mode === 'intercity' || mode === 'airport') ? 'Planifier la course' : 'Réserver'}
        </Button>
      </div>
    </div>
  );
};

export default AdvancedTaxiBookingPage;
