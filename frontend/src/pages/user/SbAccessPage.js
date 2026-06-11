import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Wheelchair, Eye, EarSlash, Brain, PawPrint,
  UsersThree, Clock, Car, Van, CheckCircle, TextAa, ShieldCheck, FirstAid,
  Plus, Minus, ArrowClockwise, CaretRight,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import { accessAPI } from '../../services/api';

const NAVY = '#0A2540';
const ORANGE = '#FF5000';

const NEED_GROUP_ICON = { mobility: Wheelchair, visual: Eye, auditory: EarSlash, cognitive: Brain };
const CAT_ICON = { Car, Van, Wheelchair };

const haversineKm = (a, b) => {
  if (!a?.lat || !b?.lat) return 0;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const STEPS = ['Besoins', 'Assistance', 'Trajet', 'Véhicule', 'Confirmation'];

export default function SbAccessPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState({});
  const [config, setConfig] = useState(null);
  const [step, setStep] = useState(-1); // -1 = landing
  const [needs, setNeeds] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [animal, setAnimal] = useState(false);
  const [companions, setCompanions] = useState(0);
  const [extraTime, setExtraTime] = useState(false);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [tripType, setTripType] = useState('standard');
  const [recurrence, setRecurrence] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [booking, setBooking] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pastBookings, setPastBookings] = useState([]);
  const [rebookingId, setRebookingId] = useState(null);

  // Réglages d'accessibilité (persistés)
  const [largeText, setLargeText] = useState(() => localStorage.getItem('a11y_large_text') === '1');
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('a11y_high_contrast') === '1');
  useEffect(() => { localStorage.setItem('a11y_large_text', largeText ? '1' : '0'); }, [largeText]);
  useEffect(() => { localStorage.setItem('a11y_high_contrast', highContrast ? '1' : '0'); }, [highContrast]);

  useEffect(() => {
    accessAPI.needsCatalog().then((r) => setCatalog(r.data.catalog || {})).catch(() => {});
    accessAPI.getConfig().then((r) => setConfig(r.data)).catch(() => {});
    accessAPI.getProfile().then((r) => {
      const p = r.data || {};
      setNeeds([...(p.mobility || []), ...(p.visual || []), ...(p.auditory || []), ...(p.cognitive || [])]);
      setEquipment(p.equipment || []);
      setAnimal(!!p.assistance_animal);
      setCompanions(p.default_companion_count || 0);
      setExtraTime(!!p.extra_assistance_time);
    }).catch(() => {});
    accessAPI.myBookings().then((r) => setPastBookings(r.data.items || [])).catch(() => {});
  }, []);

  const allNeedOptions = useMemo(() => {
    const map = {};
    Object.values(catalog).forEach((g) => (g.options || []).forEach((o) => { map[o.key] = o.label; }));
    return map;
  }, [catalog]);

  const toggle = (arr, set, key) => set(arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]);

  const loadVehicles = async () => {
    try {
      const r = await accessAPI.match({ needs });
      setVehicles(r.data.categories || []);
      if (r.data.categories?.length) setSelectedCat(r.data.categories[0].key);
    } catch { toast.error('Impossible de charger les véhicules'); }
  };

  const next = async () => {
    if (step === 2) {
      if (!pickup || !dropoff) { toast.error('Indiquez le départ et la destination'); return; }
      await loadVehicles();
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    if (!selectedCat) { toast.error('Choisissez un véhicule'); return; }
    setSubmitting(true);
    try {
      const distance_km = Number(haversineKm(pickup, dropoff).toFixed(1));
      const duration_min = Math.round(distance_km * 2.2);
      const r = await accessAPI.createBooking({
        category_key: selectedCat, needs, equipment, assistance_animal: animal,
        companion_count: companions, extra_assistance_time: extraTime,
        pickup, dropoff, trip_type: tripType, recurrence: recurrence || null,
        distance_km, duration_min,
      });
      // Sauvegarde silencieuse du profil pour les prochaines fois
      accessAPI.updateProfile({
        mobility: needs.filter((n) => (catalog.mobility?.options || []).some((o) => o.key === n)),
        visual: needs.filter((n) => (catalog.visual?.options || []).some((o) => o.key === n)),
        auditory: needs.filter((n) => (catalog.auditory?.options || []).some((o) => o.key === n)),
        cognitive: needs.filter((n) => (catalog.cognitive?.options || []).some((o) => o.key === n)),
        equipment, assistance_animal: animal, default_companion_count: companions, extra_assistance_time: extraTime,
      }).catch(() => {});
      setBooking(r.data);
      setStep(4);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de la réservation');
    }
    setSubmitting(false);
  };

  const rebook = async (b) => {
    if (rebookingId) return;
    setRebookingId(b.id);
    try {
      const distance_km = Number(haversineKm(b.pickup, b.dropoff).toFixed(1));
      const duration_min = Math.round(distance_km * 2.2);
      const r = await accessAPI.createBooking({
        category_key: b.category_key, needs: b.needs || [], equipment: b.equipment || [],
        assistance_animal: !!b.assistance_animal, companion_count: b.companion_count || 0,
        extra_assistance_time: !!b.extra_assistance_time,
        pickup: b.pickup, dropoff: b.dropoff, trip_type: b.trip_type || 'standard',
        recurrence: b.recurrence || null, distance_km, duration_min,
      });
      setBooking(r.data);
      setPastBookings((prev) => [r.data, ...prev]);
      setStep(4);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de la réservation');
    }
    setRebookingId(null);
  };

  const fontScale = largeText ? '1.15rem' : '1rem';
  const cardBorder = highContrast ? '2px solid #111827' : '1px solid #D1D5DB';

  return (
    <div
      className="max-w-[430px] mx-auto min-h-screen bg-white relative pb-28"
      style={{ fontSize: fontScale, fontFamily: 'IBM Plex Sans, system-ui, sans-serif' }}
      data-testid="sb-access-page"
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3" data-testid="access-nav-header">
        <button onClick={() => (step <= 0 ? navigate(-1) : back())} aria-label="Retour"
          className="w-11 h-11 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-100 focus:ring-2 focus:ring-offset-2"
          style={{ outlineColor: NAVY }} data-testid="access-back-btn">
          <ArrowLeft size={22} weight="bold" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold tracking-tight text-gray-900 leading-tight" style={{ fontFamily: 'Work Sans, sans-serif' }}>SB Drive Access</p>
          <p className="text-xs text-gray-600">Transport adapté & inclusif</p>
        </div>
        <button onClick={() => setLargeText((v) => !v)} aria-label="Agrandir le texte" title="Agrandir le texte"
          className={`w-11 h-11 rounded-full flex items-center justify-center focus:ring-2 ${largeText ? 'text-white' : 'text-gray-900 hover:bg-gray-100'}`}
          style={largeText ? { background: NAVY } : {}} data-testid="a11y-large-text-toggle">
          <TextAa size={22} weight="bold" />
        </button>
        <button onClick={() => setHighContrast((v) => !v)} aria-label="Contraste élevé" title="Contraste élevé"
          className={`w-11 h-11 rounded-full flex items-center justify-center focus:ring-2 ${highContrast ? 'text-white' : 'text-gray-900 hover:bg-gray-100'}`}
          style={highContrast ? { background: NAVY } : {}} data-testid="a11y-contrast-toggle">
          <CheckCircle size={22} weight={highContrast ? 'fill' : 'regular'} />
        </button>
      </header>

      {/* Landing */}
      {step === -1 && (
        <div data-testid="access-landing">
          <div className="relative">
            <img src="https://images.unsplash.com/photo-1611239677551-a13ef92c4ed4?crop=entropy&cs=srgb&fm=jpg&q=85&w=860" alt="" aria-hidden="true" className="w-full h-52 object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,37,64,0.1), rgba(10,37,64,0.85))' }} />
            <div className="absolute bottom-0 p-5 text-white">
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Work Sans, sans-serif' }}>Voyagez en toute autonomie</h1>
              <p className="text-base text-white/90 mt-1">Véhicules adaptés, chauffeurs certifiés, assistance personnalisée.</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {[
              { icon: Wheelchair, t: 'Véhicules adaptés PMR', d: 'Rampe, plateforme élévatrice, ancrage fauteuil.' },
              { icon: ShieldCheck, t: 'Chauffeurs Access certifiés', d: 'Formés à l\'assistance et au transport adapté.' },
              { icon: Clock, t: 'Temps d\'assistance offert', d: 'Embarquement sans stress, sans pénalité de retard.' },
              { icon: FirstAid, t: 'Trajets médicaux', d: 'Hôpitaux, dialyse, rééducation — réservation rapide.' },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ border: cardBorder, background: '#F3F4F6' }}>
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: NAVY }} aria-hidden="true"><f.icon size={22} weight="duotone" /></span>
                <div><p className="font-semibold text-gray-900">{f.t}</p><p className="text-sm text-gray-700">{f.d}</p></div>
              </div>
            ))}
          </div>
          {pastBookings.length > 0 && (
            <div className="px-5 pb-4" data-testid="access-recent-trips">
              <p className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                <ArrowClockwise size={18} weight="bold" style={{ color: NAVY }} /> Refaire un trajet
              </p>
              <p className="text-xs text-gray-600 mb-3">Vos trajets récents — reréservez en un seul tap.</p>
              <div className="space-y-2">
                {pastBookings.slice(0, 3).map((b) => (
                  <div key={b.id} className="p-3 rounded-xl flex items-center gap-3" style={{ border: cardBorder, background: '#fff' }} data-testid={`recent-trip-${b.id}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{b.pickup?.address || 'Départ'} → {b.dropoff?.address || 'Destination'}</span>
                      <span className="block text-xs text-gray-600 mt-0.5">{b.category_name}{b.fare_estimate != null ? ` · ${Number(b.fare_estimate).toFixed(2)} €` : ''}</span>
                    </span>
                    <button onClick={() => rebook(b)} disabled={!!rebookingId} data-testid={`rebook-btn-${b.id}`}
                      className="shrink-0 min-h-[40px] px-3 rounded-lg font-semibold text-white text-sm flex items-center gap-1.5 disabled:opacity-50 focus:ring-2 focus:ring-offset-1"
                      style={{ background: NAVY }}>
                      <ArrowClockwise size={16} weight="bold" /> {rebookingId === b.id ? 'Réservation…' : 'Refaire'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40">
            <button onClick={() => setStep(0)} className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg flex items-center justify-center gap-2 focus:ring-2 focus:ring-offset-2"
              style={{ background: ORANGE }} data-testid="access-start-btn">
              Réserver un transport adapté <ArrowRight size={20} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Stepper */}
      {step >= 0 && (
        <div data-testid="booking-stepper-container">
          <div className="px-5 pt-4">
            <p className="text-sm font-semibold" style={{ color: NAVY }}>Étape {step + 1} sur {STEPS.length} : {STEPS[step]}</p>
            <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: ORANGE }} />
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Step 0: Needs */}
            {step === 0 && (
              <div className="space-y-5">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900" style={{ fontFamily: 'Work Sans, sans-serif' }}>Quels sont vos besoins ?</h2>
                {Object.entries(catalog).map(([gKey, group]) => {
                  const GIcon = NEED_GROUP_ICON[gKey] || Wheelchair;
                  return (
                    <div key={gKey}>
                      <p className="flex items-center gap-2 font-semibold text-gray-900 mb-2"><GIcon size={20} weight="duotone" style={{ color: NAVY }} aria-hidden="true" /> {group.label}</p>
                      <div className="grid grid-cols-1 gap-2">
                        {(group.options || []).map((o) => {
                          const sel = needs.includes(o.key);
                          return (
                            <button key={o.key} onClick={() => toggle(needs, setNeeds, o.key)} data-testid={`need-card-${o.key}`}
                              aria-pressed={sel}
                              className="w-full min-h-[48px] px-4 py-3 rounded-xl flex items-center justify-between text-left transition-colors focus:ring-2 focus:ring-offset-1"
                              style={{ border: sel ? `2px solid ${ORANGE}` : cardBorder, background: sel ? '#FFF3ED' : '#fff' }}>
                              <span className="font-medium text-gray-900">{o.label}</span>
                              {sel && <CheckCircle size={22} weight="fill" style={{ color: ORANGE }} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 1: Assistance */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900" style={{ fontFamily: 'Work Sans, sans-serif' }}>Assistance & accompagnement</h2>
                <button onClick={() => setAnimal((v) => !v)} aria-pressed={animal} data-testid="access-animal-toggle"
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl flex items-center justify-between transition-colors"
                  style={{ border: animal ? `2px solid ${ORANGE}` : cardBorder, background: animal ? '#FFF3ED' : '#fff' }}>
                  <span className="flex items-center gap-2 font-medium text-gray-900"><PawPrint size={22} weight="duotone" style={{ color: NAVY }} /> Chien guide / animal d'assistance</span>
                  {animal && <CheckCircle size={22} weight="fill" style={{ color: ORANGE }} />}
                </button>

                <div className="p-4 rounded-xl" style={{ border: cardBorder }}>
                  <p className="flex items-center gap-2 font-medium text-gray-900 mb-3"><UsersThree size={22} weight="duotone" style={{ color: NAVY }} /> Accompagnateurs</p>
                  <div className="flex items-center justify-between">
                    <button onClick={() => setCompanions((c) => Math.max(0, c - 1))} aria-label="Moins d'accompagnateurs" data-testid="companions-minus"
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: NAVY }}><Minus size={20} weight="bold" /></button>
                    <span className="text-3xl font-bold text-gray-900" data-testid="companions-count">{companions}</span>
                    <button onClick={() => setCompanions((c) => Math.min(5, c + 1))} aria-label="Plus d'accompagnateurs" data-testid="companions-plus"
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: NAVY }}><Plus size={20} weight="bold" /></button>
                  </div>
                </div>

                <button onClick={() => setExtraTime((v) => !v)} aria-pressed={extraTime} data-testid="access-extra-time-toggle"
                  className="w-full px-4 py-3 rounded-xl flex items-center justify-between transition-colors"
                  style={{ border: extraTime ? `2px solid ${ORANGE}` : cardBorder, background: extraTime ? '#FFF3ED' : '#fff' }}>
                  <span className="flex items-start gap-2 text-left">
                    <Clock size={22} weight="duotone" style={{ color: NAVY }} className="mt-0.5" />
                    <span>
                      <span className="block font-medium text-gray-900">Temps d'assistance supplémentaire</span>
                      <span className="block text-sm text-gray-700">{config?.extra_assistance_minutes || 10} min offertes — aucune pénalité de retard.</span>
                    </span>
                  </span>
                  {extraTime && <CheckCircle size={22} weight="fill" style={{ color: ORANGE }} className="shrink-0" />}
                </button>
              </div>
            )}

            {/* Step 2: Trip */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900" style={{ fontFamily: 'Work Sans, sans-serif' }}>Votre trajet</h2>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Adresse de départ</label>
                  <GooglePlacesInput placeholder="Lieu de prise en charge" value={pickup?.address || ''} testId="access-pickup"
                    onChange={(a) => setPickup((p) => ({ ...(p || {}), address: a }))}
                    onSelect={(loc) => setPickup({ address: loc.address, lat: loc.lat, lng: loc.lng })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Destination</label>
                  <GooglePlacesInput placeholder="Où allez-vous ?" value={dropoff?.address || ''} testId="access-dropoff"
                    onChange={(a) => setDropoff((p) => ({ ...(p || {}), address: a }))}
                    onSelect={(loc) => setDropoff({ address: loc.address, lat: loc.lat, lng: loc.lng })} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-2">Type de trajet</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ k: 'standard', l: 'Standard', Icon: Car }, { k: 'medical', l: 'Médical', Icon: FirstAid }].map(({ k, l, Icon }) => (
                      <button key={k} onClick={() => setTripType(k)} data-testid={`trip-type-${k}`} aria-pressed={tripType === k}
                        className="min-h-[48px] rounded-xl flex items-center justify-center gap-2 font-medium transition-colors"
                        style={{ border: tripType === k ? `2px solid ${ORANGE}` : cardBorder, background: tripType === k ? '#FFF3ED' : '#fff', color: '#111827' }}>
                        <Icon size={20} weight="duotone" style={{ color: NAVY }} /> {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2"><ArrowClockwise size={18} weight="bold" style={{ color: NAVY }} /> Trajet récurrent (optionnel)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ k: '', l: 'Aucun' }, { k: 'daily', l: 'Quotidien' }, { k: 'weekly', l: 'Hebdo' }, { k: 'monthly', l: 'Mensuel' }].map(({ k, l }) => (
                      <button key={k || 'none'} onClick={() => setRecurrence(k)} data-testid={`recurrence-${k || 'none'}`} aria-pressed={recurrence === k}
                        className="min-h-[44px] rounded-lg text-sm font-medium transition-colors"
                        style={{ border: recurrence === k ? `2px solid ${ORANGE}` : cardBorder, background: recurrence === k ? '#FFF3ED' : '#fff', color: '#111827' }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Vehicle */}
            {step === 3 && (
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900" style={{ fontFamily: 'Work Sans, sans-serif' }}>Véhicule compatible</h2>
                {vehicles.length === 0 && <p className="text-gray-700">Aucun véhicule compatible trouvé pour ces besoins.</p>}
                {vehicles.map((v) => {
                  const Icon = CAT_ICON[v.icon] || Wheelchair;
                  const sel = selectedCat === v.key;
                  const dist = haversineKm(pickup, dropoff);
                  const fare = Math.max(v.min_fare, v.base_fare + v.price_per_km * dist + v.price_per_min * dist * 2.2);
                  return (
                    <button key={v.key} onClick={() => setSelectedCat(v.key)} data-testid={`vehicle-choice-${v.key}`} aria-pressed={sel}
                      className="w-full p-4 rounded-xl flex items-center gap-3 text-left transition-colors"
                      style={{ border: sel ? `2px solid ${ORANGE}` : cardBorder, background: sel ? '#FFF3ED' : '#fff' }}>
                      <span className="w-14 h-14 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: NAVY }} aria-hidden="true"><Icon size={28} weight="duotone" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{v.name}</span>
                          {sel && <CheckCircle size={20} weight="fill" style={{ color: ORANGE }} />}
                        </span>
                        <span className="block text-sm text-gray-700 leading-snug">{v.description}</span>
                        <span className="block text-xs text-gray-600 mt-1">
                          {v.capacity_wheelchairs > 0 ? `${v.capacity_wheelchairs} fauteuil${v.capacity_wheelchairs > 1 ? 's' : ''} · ` : ''}{v.capacity_passengers} passagers
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-lg font-bold" style={{ color: NAVY }}>{fare.toFixed(2)} €</span>
                        <span className="block text-[11px] text-gray-500">estimé</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 4: Confirmation */}
            {step === 4 && booking && (
              <div className="space-y-4 text-center pt-4" data-testid="access-confirmation">
                <span className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-white" style={{ background: '#059669' }}><CheckCircle size={36} weight="fill" /></span>
                <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Work Sans, sans-serif' }}>Réservation confirmée</h2>
                <div className="p-4 rounded-xl text-left space-y-2" style={{ border: cardBorder, background: '#F3F4F6' }}>
                  <Row k="Véhicule" v={booking.category_name} />
                  <Row k="Prix estimé" v={`${Number(booking.fare_estimate).toFixed(2)} €`} />
                  <Row k="Départ" v={booking.pickup?.address || '—'} />
                  <Row k="Destination" v={booking.dropoff?.address || '—'} />
                  {booking.extra_assistance_minutes > 0 && <Row k="Assistance" v={`+${booking.extra_assistance_minutes} min offertes`} />}
                  <div className="pt-2">
                    {booking.certified_driver ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-sm font-semibold" style={{ background: NAVY }} data-testid="certified-badge">
                        <ShieldCheck size={16} weight="fill" /> Chauffeur Access certifié{booking.matched_driver_name ? ` · ${booking.matched_driver_name}` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold" style={{ background: '#FFF3ED', color: NAVY }}>
                        <Clock size={16} weight="bold" /> Recherche d'un chauffeur certifié…
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => navigate('/home')} className="w-full min-h-[52px] rounded-xl font-bold text-white text-lg" style={{ background: ORANGE }} data-testid="access-done-btn">Terminé</button>
              </div>
            )}
          </div>

          {/* Sticky footer nav */}
          {step < 4 && (
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 p-4 z-40 flex gap-3">
              <button onClick={back} className="min-h-[52px] px-5 rounded-xl font-semibold text-gray-900 flex items-center gap-1" style={{ border: cardBorder }} data-testid="stepper-back-btn">
                <ArrowLeft size={18} weight="bold" /> Précédent
              </button>
              {step < 3 ? (
                <button onClick={next} className="flex-1 min-h-[52px] rounded-xl font-bold text-white text-lg flex items-center justify-center gap-2" style={{ background: NAVY }} data-testid="stepper-next-btn">
                  Suivant <ArrowRight size={20} weight="bold" />
                </button>
              ) : (
                <button onClick={submit} disabled={submitting || !selectedCat} className="flex-1 min-h-[52px] rounded-xl font-bold text-white text-lg flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: ORANGE }} data-testid="access-confirm-btn">
                  {submitting ? 'Réservation…' : 'Confirmer la réservation'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-gray-600">{k}</span>
    <span className="font-semibold text-gray-900 text-right">{v}</span>
  </div>
);
