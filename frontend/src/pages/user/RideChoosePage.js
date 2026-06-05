/**
 * RideChoosePage — Parcours « taxi standard » V3Cube.
 * Flux : saisie départ + destination → écran « Choisissez un voyage »
 * (tous les véhicules « ride » actifs avec prix + ETA calculés en direct)
 * → « Demander » → animation « Recherche d'un chauffeur » → suivi (/ride/:id).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, NavigationArrow, UsersThree, Car, Motorcycle, Van,
  Money, CreditCard, Wallet, CheckCircle, Lightning,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import SearchingRadar from '../../components/SearchingRadar';
import { configAPI, rideAPI } from '../../services/api';

const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

// Specialised service modes that require extra inputs → handled by their own
// dedicated flows (TaxiHubPage). The standard "choose a ride" comparison only
// lists plain point-to-point ride vehicles.
const EXCLUDED_SLUGS = ['pool', 'airport', 'pets', 'assist', 'accessible'];

const PAYMENTS = [
  { id: 'cash', label: 'Espèces', icon: Money },
  { id: 'card', label: 'Carte', icon: CreditCard },
  { id: 'sbpaygo', label: 'SB PayGo', icon: Wallet },
];

const vehicleIcon = (vt) => {
  const slug = (vt.slug || '').toLowerCase();
  const t = (vt.icon_type || '').toLowerCase();
  if (slug === 'moto' || t.includes('moto')) return Motorcycle;
  if (slug === 'van' || slug === 'suv' || t.includes('van') || (vt.person_capacity || 0) >= 6) return Van;
  return Car;
};

const RideChoosePage = () => {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [vtypes, setVtypes] = useState([]);
  const [estimates, setEstimates] = useState({}); // slug -> { fare, duration, distance, loading, error }
  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState('cash');
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);

  // Load active ride vehicle types once
  useEffect(() => {
    configAPI.getVehicleTypes()
      .then((res) => {
        const list = (res.data || [])
          .filter((v) => !EXCLUDED_SLUGS.includes(v.slug))
          .sort((a, b) => (a.display_order || 99) - (b.display_order || 99));
        setVtypes(list);
      })
      .catch(() => toast.error('Impossible de charger les véhicules'));
  }, []);

  const bothSet = !!(pickup?.lat && dropoff?.lat);

  // Fetch a live estimate for every vehicle type in parallel once both points set
  const fetchEstimates = useCallback(async () => {
    if (!bothSet || vtypes.length === 0) return;
    setEstimates(Object.fromEntries(vtypes.map((v) => [v.slug, { loading: true }])));
    const base = {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
      dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
      payment_method: 'cash', ride_type: 'instant',
    };
    await Promise.all(vtypes.map(async (v) => {
      try {
        const res = await rideAPI.estimate({ ...base, vehicle_type: v.slug });
        setEstimates((p) => ({ ...p, [v.slug]: {
          fare: res.data.estimated_fare,
          duration: res.data.duration_mins,
          distance: res.data.distance_km,
          loading: false,
        } }));
      } catch {
        setEstimates((p) => ({ ...p, [v.slug]: { loading: false, error: true } }));
      }
    }));
    // Auto-select the first (cheapest by display order) once available
    setSelected((cur) => cur || vtypes[0]?.slug || null);
  }, [bothSet, vtypes, pickup, dropoff]);

  useEffect(() => { fetchEstimates(); }, [fetchEstimates]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Géolocalisation indisponible');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          if (GMAP_KEY) {
            const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GMAP_KEY}&language=fr`);
            const d = await r.json();
            if (d.results?.[0]) address = d.results[0].formatted_address;
          }
        } catch { /* keep coords */ }
        setPickup({ lat, lng, address });
        setLocating(false);
      },
      () => { setLocating(false); toast.error('Position introuvable'); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const staticMapUrl = useMemo(() => {
    if (!GMAP_KEY || !pickup?.lat) return null;
    const params = [
      'size=640x320', 'scale=2', 'language=fr',
      `markers=color:0x22C55E%7C${pickup.lat},${pickup.lng}`,
    ];
    if (dropoff?.lat) {
      params.push(`markers=color:0xEF4444%7C${dropoff.lat},${dropoff.lng}`);
      params.push(`path=color:0x2563EBcc%7Cweight:4%7C${pickup.lat},${pickup.lng}%7C${dropoff.lat},${dropoff.lng}`);
    }
    return `https://maps.googleapis.com/maps/api/staticmap?${params.join('&')}&key=${GMAP_KEY}`;
  }, [pickup, dropoff]);

  const onRequest = async () => {
    if (!bothSet) return toast.error('Renseignez le départ et la destination');
    if (!selected) return toast.error('Choisissez un véhicule');
    const est = estimates[selected];
    if (!est || est.error) return toast.error('Tarif indisponible pour ce véhicule');
    setSearching(true);
    try {
      const res = await rideAPI.create({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
        vehicle_type: selected, payment_method: payment, ride_type: 'instant', mode_id: 'standard',
      });
      // Brief V3Cube "Recherche de pilotes" beat before handing off to live tracking
      setTimeout(() => navigate(`/ride/${res.data.id}`), 1600);
    } catch (e) {
      setSearching(false);
      toast.error(e?.response?.data?.detail || 'Échec de la demande');
    }
  };

  const selPrice = selected && estimates[selected]?.fare;

  return (
    <div className="mobile-container min-h-screen bg-gray-50 flex flex-col" data-testid="ride-choose-page">
      {/* Map preview */}
      <div className="relative h-52 bg-gradient-to-br from-[#0B1426] to-[#1b2b4d] overflow-hidden shrink-0">
        {staticMapUrl
          ? <img src={staticMapUrl} alt="Itinéraire" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">Carte de l'itinéraire</div>}
        <button
          onClick={() => navigate('/home')}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center"
          data-testid="ride-choose-back"
        >
          <ArrowLeft size={20} className="text-[#0B1426]" />
        </button>
        <div className="absolute bottom-3 left-4 right-4">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/80">SB Drive · Se déplacer</span>
          <h1 className="text-xl font-black text-white leading-tight">Planifiez votre trajet</h1>
        </div>
      </div>

      <div className="flex-1 -mt-4 bg-gray-50 rounded-t-3xl relative z-10 px-4 pt-5 pb-32 overflow-y-auto">
        {/* Address card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
          <div>
            <p className="text-[10px] font-bold uppercase text-gray-400 mb-1 ml-1">Départ</p>
            <GooglePlacesInput
              placeholder="Lieu de départ"
              value={pickup?.address || ''}
              iconColor="#22C55E"
              testId="ride-choose-pickup"
              onSelect={(p) => setPickup(p)}
            />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-gray-400 mb-1 ml-1">Destination</p>
            <GooglePlacesInput
              placeholder="Où allez-vous ?"
              value={dropoff?.address || ''}
              iconColor="#EF4444"
              testId="ride-choose-dropoff"
              onSelect={(p) => setDropoff(p)}
            />
          </div>
          <button
            onClick={useMyLocation}
            disabled={locating}
            className="flex items-center gap-2 text-sm font-semibold text-[#2563EB] pl-1 pt-1"
            data-testid="ride-choose-locate"
          >
            <NavigationArrow size={16} weight="fill" />
            {locating ? 'Localisation…' : 'Utiliser ma position actuelle'}
          </button>
        </div>

        {/* Choose a ride */}
        {bothSet && (
          <div className="mt-5" data-testid="choose-ride-section">
            <h2 className="text-base font-black text-[#0B1426] mb-1">Choisissez un voyage</h2>
            <p className="text-xs text-gray-500 mb-3">Tarif estimé en direct pour chaque véhicule.</p>
            <div className="space-y-2.5">
              {vtypes.map((v) => {
                const Icon = vehicleIcon(v);
                const est = estimates[v.slug] || {};
                const active = selected === v.slug;
                return (
                  <button
                    key={v.slug}
                    onClick={() => setSelected(v.slug)}
                    data-testid={`choose-vehicle-${v.slug}`}
                    className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                      active ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-transparent bg-white shadow-sm'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-[#FF5000]/15' : 'bg-gray-100'}`}>
                      <Icon size={26} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : 'text-gray-600'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-[#0B1426] truncate">{v.name_fr || v.name || v.slug}</p>
                        <span className="flex items-center gap-0.5 text-[11px] text-gray-400 shrink-0">
                          <UsersThree size={13} weight="fill" /> {v.person_capacity || 4}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {est.loading ? 'Calcul du tarif…'
                          : est.error ? 'Tarif indisponible'
                          : `${est.duration ?? '–'} min · ${est.distance ?? '–'} km`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {est.loading ? (
                        <div className="h-5 w-14 bg-gray-100 rounded animate-pulse" />
                      ) : est.error ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        <p className="text-base font-black text-[#0B1426]" data-testid={`price-${v.slug}`}>{est.fare?.toFixed(2)} €</p>
                      )}
                      {active && <CheckCircle size={16} weight="fill" className="text-[#FF5000] inline-block mt-0.5" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Payment */}
            <h3 className="text-xs font-bold uppercase text-gray-400 mt-5 mb-2">Moyen de paiement</h3>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map((p) => {
                const Icon = p.icon;
                const active = payment === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPayment(p.id)}
                    data-testid={`ride-choose-pay-${p.id}`}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-bold transition-colors ${
                      active ? 'border-[#0B1426] bg-[#0B1426] text-white' : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    <Icon size={16} weight={active ? 'fill' : 'regular'} /> {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      {bothSet && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4 z-20">
          <button
            onClick={onRequest}
            disabled={!selected || estimates[selected]?.loading || estimates[selected]?.error}
            className="w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{ backgroundColor: '#FF5000', color: '#0B1426' }}
            data-testid="ride-choose-request-btn"
          >
            <Lightning size={20} weight="fill" />
            Demander{selPrice ? ` · ${selPrice.toFixed(2)} €` : ''}
          </button>
        </div>
      )}

      {/* Searching overlay (V3Cube "Recherche de pilotes") */}
      <AnimatePresence>
        {searching && (
          <motion.div
            className="fixed inset-0 z-[80] bg-[#0B1426] flex flex-col items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            data-testid="ride-choose-searching"
          >
            <SearchingRadar size={220} />
            <p className="text-white font-black text-lg mt-8">Recherche d'un chauffeur…</p>
            <p className="text-white/60 text-sm mt-1">Nous contactons les chauffeurs proches</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RideChoosePage;
