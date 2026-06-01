/**
 * SB Drive Tab (Kiosk) - libre-service tablet app for hotels/restaurants.
 * V3Cube-style orange theme. Landscape tablet layout (1024x768+).
 * Flow: Splash -> Unlock PIN -> Home -> Customer Form -> Vehicle Select -> Destination + Fare -> Searching.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import kioskAPI from '../../api/kioskAPI';
import LeafletMap from '../../components/LeafletMap';
import { MagnifyingGlass, ArrowLeft, Info, Wallet, Clock, MapPin, SignOut, X } from '@phosphor-icons/react';

const ORANGE = '#FF6B1A';
const KIOSK_TOKEN_KEY = 'sb_kiosk_token';

// ===================== Sub-screens =====================

const KioskSplash = () => (
  <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
    <div className="w-48 h-48 rounded-full flex items-center justify-center mb-8" style={{ background: 'conic-gradient(from 0deg, #84CC16 0%, #FF6B1A 50%, #DC2626 100%)' }}>
      <div className="w-44 h-44 rounded-full bg-white flex items-center justify-center">
        <span className="text-6xl font-black tracking-tight" style={{ color: '#DC2626' }}>SB</span>
      </div>
    </div>
    <h1 className="text-4xl font-black tracking-wide">
      SB DRIVE <span style={{ color: ORANGE }}>TAB</span>
    </h1>
    <div className="mt-12 flex gap-2">
      <div className="w-3 h-3 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-3 h-3 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-3 h-3 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  </div>
);

const KioskUnlock = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length < 4) {
      toast.error('Code PIN trop court (4 chiffres min.)');
      return;
    }
    setLoading(true);
    try {
      const data = await kioskAPI.unlock(pin);
      localStorage.setItem(KIOSK_TOKEN_KEY, data.session_token);
      toast.success(`Borne ${data.hotel_name} déverrouillée`);
      onUnlock(data.session_token);
    } catch (err) {
      toast.error('Code PIN incorrect');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const KeyButton = ({ value }) => (
    <button
      data-testid={`pin-key-${value}`}
      type="button"
      onClick={() => setPin(p => (p.length < 8 ? p + value : p))}
      className="h-20 text-3xl font-bold bg-white border-2 border-orange-200 rounded-2xl hover:bg-orange-50 active:scale-95 transition"
    >
      {value}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #FF8A3D 100%)` }}>
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md" data-testid="kiosk-unlock-form">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-orange-100 flex items-center justify-center">
            <span className="text-3xl font-black text-red-600">SB</span>
          </div>
          <h2 className="text-2xl font-bold">SB Drive Tab</h2>
          <p className="text-sm text-gray-500 mt-2">Saisir le code PIN administrateur pour activer cette borne</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          className="w-full h-16 text-center text-3xl font-bold tracking-widest border-2 border-orange-300 rounded-xl mb-4 focus:border-orange-500 focus:outline-none"
          placeholder="• • • •"
          data-testid="pin-input"
          autoFocus
        />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {['1','2','3','4','5','6','7','8','9'].map(n => <KeyButton key={n} value={n} />)}
          <button type="button" onClick={() => setPin('')} className="h-20 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-2xl">Effacer</button>
          <KeyButton value="0" />
          <button type="button" onClick={() => setPin(p => p.slice(0, -1))} className="h-20 text-2xl text-gray-500 hover:bg-gray-100 rounded-2xl">⌫</button>
        </div>
        <button
          type="submit"
          disabled={loading}
          data-testid="pin-submit-btn"
          className="w-full h-14 text-white font-bold text-lg rounded-xl transition disabled:opacity-50"
          style={{ background: ORANGE }}
        >
          {loading ? 'Vérification…' : 'Activer la borne'}
        </button>
      </form>
    </div>
  );
};

const KioskHome = ({ info, nearestDriver, onStart, onLogout, onChangeLang, onChangeCurrency }) => (
  <div className="min-h-screen flex" data-testid="kiosk-home">
    {/* LEFT: hotel info + image + CTA */}
    <div className="flex-1 flex flex-col" style={{ background: ORANGE }}>
      <div className="flex items-center gap-4 p-6">
        <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center shadow-lg">
          <span className="text-4xl font-black text-red-600">SB</span>
        </div>
        <div className="text-white">
          <h1 className="text-3xl font-bold leading-tight" data-testid="hotel-name">{info.hotel_name}</h1>
          <p className="text-sm mt-1 flex items-center gap-1 opacity-90"><MapPin size={16} weight="fill" /> {info.address}</p>
        </div>
      </div>
      <div className="flex-1 px-6 pb-6 relative">
        <div className="w-full h-full rounded-3xl overflow-hidden bg-white/10 shadow-2xl">
          <img src={info.image_url} alt={info.hotel_name} className="w-full h-full object-cover" />
        </div>
        <button
          data-testid="start-booking-btn"
          onClick={onStart}
          className="absolute left-1/2 -translate-x-1/2 bottom-12 bg-white text-black font-bold text-xl px-10 py-5 rounded-xl shadow-2xl hover:scale-105 active:scale-95 transition"
        >
          RÉSERVER UN CHAUFFEUR
        </button>
      </div>
    </div>
    {/* RIGHT: language, currency, driver ETA, logout */}
    <div className="w-96 p-8 flex flex-col" style={{ background: '#FF8A3D' }}>
      <div className="space-y-6 text-white">
        <div>
          <label className="block text-sm mb-1 opacity-80">La langue</label>
          <select
            data-testid="lang-select"
            value={info.language}
            onChange={(e) => onChangeLang(e.target.value)}
            className="w-full bg-transparent border-b border-white py-2 text-lg font-semibold focus:outline-none"
          >
            <option className="text-black" value="fr">French (Français)</option>
            <option className="text-black" value="en">English</option>
            <option className="text-black" value="es">Español</option>
            <option className="text-black" value="pt">Português</option>
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1 opacity-80">Devise</label>
          <select
            data-testid="currency-select"
            value={info.currency}
            onChange={(e) => onChangeCurrency(e.target.value)}
            className="w-full bg-transparent border-b border-white py-2 text-lg font-semibold focus:outline-none"
          >
            <option className="text-black" value="EUR">EUR</option>
            <option className="text-black" value="USD">USD</option>
            <option className="text-black" value="XOF">XOF</option>
            <option className="text-black" value="XAF">XAF</option>
          </select>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-white" data-testid="nearest-driver-eta">
        <p className="text-lg font-semibold text-center mb-4">Le chauffeur plus proche est à</p>
        <div className="w-44 h-44 rounded-full bg-white flex flex-col items-center justify-center shadow-xl border-4 border-white">
          <Clock size={32} weight="duotone" className="text-orange-500 mb-1" />
          <span className="text-5xl font-black" style={{ color: ORANGE }}>{nearestDriver?.eta_minutes ?? '—'}</span>
          <span className="text-sm text-gray-500 -mt-1">min(s)</span>
        </div>
        {!nearestDriver?.available && <p className="text-xs mt-3 text-white/80">Aucun chauffeur disponible actuellement</p>}
      </div>
      <button data-testid="kiosk-logout-btn" onClick={onLogout} className="self-end p-3 hover:bg-white/10 rounded-full transition" title="Verrouiller la borne">
        <SignOut size={28} className="text-white" weight="bold" />
      </button>
    </div>
  </div>
);

const KioskCustomerForm = ({ onBack, onNext }) => {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.phone.trim()) {
      toast.error('Prénom, nom et téléphone obligatoires');
      return;
    }
    if (form.phone.length < 6) {
      toast.error('Numéro de téléphone invalide');
      return;
    }
    onNext({ ...form, phone: form.phone.startsWith('+') ? form.phone : `+33${form.phone.replace(/^0/, '')}` });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white" data-testid="customer-form-screen">
      <header className="h-20 flex items-center px-6 text-white text-2xl font-semibold" style={{ background: ORANGE }}>
        <button onClick={onBack} className="mr-4 hover:bg-white/20 p-2 rounded-full" data-testid="back-btn">
          <ArrowLeft size={28} weight="bold" />
        </button>
        Réserver un chauffeur maintenant
      </header>
      <form onSubmit={submit} className="flex-1 p-10 max-w-4xl">
        <h2 className="text-2xl font-semibold mb-8">Fournir ci-dessous des détails :</h2>
        <div className="grid grid-cols-2 gap-x-12 gap-y-8">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Prénom</label>
            <input data-testid="first-name-input" value={form.first_name} onChange={setF('first_name')} className="w-full border-b-2 border-gray-300 py-3 text-xl focus:border-orange-500 focus:outline-none" autoFocus />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Nom de famille</label>
            <input data-testid="last-name-input" value={form.last_name} onChange={setF('last_name')} className="w-full border-b-2 border-gray-300 py-3 text-xl focus:border-orange-500 focus:outline-none" />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-gray-500 mb-1 block">Adresse électronique</label>
            <input data-testid="email-input" type="email" value={form.email} onChange={setF('email')} className="w-full border-b-2 border-gray-300 py-3 text-xl focus:border-orange-500 focus:outline-none" />
            <p className="text-xs mt-1" style={{ color: ORANGE }}>*Optionnel</p>
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Pays</label>
            <input value="+33" readOnly className="w-full border-b-2 border-gray-300 py-3 text-xl bg-transparent" />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Mobile</label>
            <input data-testid="phone-input" type="tel" inputMode="numeric" value={form.phone} onChange={setF('phone')} className="w-full border-b-2 border-gray-300 py-3 text-xl focus:border-orange-500 focus:outline-none" />
          </div>
        </div>
        <div className="mt-16 flex gap-6 justify-center">
          <button type="button" onClick={() => setForm({ first_name: '', last_name: '', email: '', phone: '' })} className="px-10 py-4 text-white font-bold text-lg rounded-md" style={{ background: ORANGE }} data-testid="reset-btn">
            RÉINITIALISER
          </button>
          <button type="submit" className="px-10 py-4 text-white font-bold text-lg rounded-md" style={{ background: ORANGE }} data-testid="next-btn">
            SUIVANT
          </button>
        </div>
      </form>
    </div>
  );
};

const KioskVehicleSelect = ({ vehicles, currency, selected, onBack, onSelect, onNext }) => (
  <div className="min-h-screen flex flex-col bg-white" data-testid="vehicle-select-screen">
    <header className="h-20 flex items-center px-6 text-white text-2xl font-semibold" style={{ background: ORANGE }}>
      <button onClick={onBack} className="mr-4 hover:bg-white/20 p-2 rounded-full"><ArrowLeft size={28} weight="bold" /></button>
      Sélectionnez votre véhicule
    </header>
    <div className="flex-1 flex items-center px-8 py-8 overflow-x-auto gap-6" data-testid="vehicle-cards">
      {vehicles.map(v => (
        <button
          key={v.key}
          data-testid={`vehicle-card-${v.key}`}
          onClick={() => onSelect(v.key)}
          className={`flex-shrink-0 w-60 h-72 bg-white rounded-xl shadow-lg border-2 transition relative p-4 ${selected === v.key ? 'border-orange-500 ring-4 ring-orange-200' : 'border-gray-200 hover:border-orange-300'}`}
        >
          <div className="absolute top-3 right-3"><Info size={22} weight="bold" style={{ color: ORANGE }} /></div>
          <div className="flex items-center justify-center h-36 mt-6">
            <div className="text-7xl">🚗</div>
          </div>
          <p className="mt-4 text-xl font-bold text-center" style={{ color: ORANGE }}>{v.label}</p>
          <p className="text-center mt-2 text-lg" style={{ color: ORANGE }}>
            <span className="font-bold">{v.price_per_km.toFixed(2)} {currency === 'EUR' ? '€' : currency}</span>
            <span className="text-gray-500 text-sm"> /km</span>
          </p>
        </button>
      ))}
    </div>
    <div className="flex justify-center pb-10">
      <button
        onClick={onNext}
        disabled={!selected}
        data-testid="vehicle-next-btn"
        className="px-16 py-4 bg-white border-2 rounded-md text-lg font-bold transition disabled:opacity-40"
        style={{ borderColor: ORANGE, color: 'black' }}
      >
        SUIVANT
      </button>
    </div>
  </div>
);

const KioskDestination = ({ info, vehicle, onBack, onConfirm }) => {
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const [dest, setDest] = useState(null); // {lat, lng, address}
  const [estimate, setEstimate] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef(null);
  const token = localStorage.getItem(KIOSK_TOKEN_KEY);

  // Nominatim free geocoding (open street map)
  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 3) { setSuggestions([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`);
      const data = await res.json();
      setSuggestions(data || []);
    } catch (e) { setSuggestions([]); }
    finally { setSearchLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search, fetchSuggestions]);

  const pickSuggestion = async (s) => {
    const d = { lat: parseFloat(s.lat), lng: parseFloat(s.lon), address: s.display_name };
    setDest(d);
    setShowSearch(false);
    setSearch(d.address);
    try {
      const est = await kioskAPI.estimate(token, { dest_lat: d.lat, dest_lng: d.lng, vehicle_type: vehicle.key });
      setEstimate(est);
    } catch (e) { toast.error('Erreur calcul tarif'); }
  };

  if (showSearch) {
    return (
      <div className="min-h-screen flex flex-col bg-white" data-testid="search-destination-screen">
        <div className="h-20 flex items-center px-4 gap-3" style={{ background: ORANGE }}>
          <div className="flex-1 bg-white rounded-md px-4 flex items-center h-12">
            <MagnifyingGlass size={24} className="text-orange-500 mr-3" />
            <input
              data-testid="destination-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher"
              className="flex-1 outline-none text-lg"
              autoFocus
            />
            {search && <button onClick={() => setSearch('')}><X size={20} className="text-gray-400" /></button>}
          </div>
          <button onClick={onBack} className="text-white text-lg font-medium px-2">Annuler</button>
        </div>
        <h3 className="text-white text-lg font-semibold px-6 py-3" style={{ background: ORANGE }}>Lieux récents</h3>
        <div className="flex-1 overflow-y-auto bg-white">
          {searchLoading && <p className="p-6 text-gray-400">Recherche…</p>}
          {!searchLoading && suggestions.length === 0 && search.length >= 3 && <p className="p-6 text-gray-400">Aucun résultat</p>}
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => pickSuggestion(s)} data-testid={`suggestion-${i}`} className="w-full text-left px-6 py-4 border-b hover:bg-orange-50 flex items-start gap-3">
              <MapPin size={20} weight="fill" className="text-orange-500 mt-1 flex-shrink-0" />
              <span className="text-base">{s.display_name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-100" data-testid="destination-recap-screen">
      <header className="h-20 flex items-center px-6 text-white text-2xl font-semibold" style={{ background: ORANGE }}>
        <button onClick={onBack} className="mr-4 hover:bg-white/20 p-2 rounded-full"><ArrowLeft size={28} weight="bold" /></button>
        Réserver un chauffeur maintenant
      </header>
      <div className="flex-1 flex">
        {/* LEFT: search + map */}
        <div className="flex-1 flex flex-col p-4">
          <button onClick={() => setShowSearch(true)} className="bg-white rounded-md shadow px-4 h-14 flex items-center gap-3 w-full" data-testid="reopen-search-btn">
            <MagnifyingGlass size={24} className="text-orange-500" />
            <span className="flex-1 text-left text-lg truncate">{dest?.address || 'Sélectionner la destination'}</span>
          </button>
          <div className="flex-1 mt-3 rounded-lg overflow-hidden">
            <LeafletMap
              pickup={{ lat: info.lat, lng: info.lng }}
              dropoff={dest ? { lat: dest.lat, lng: dest.lng } : null}
              routePath={dest ? [[info.lat, info.lng], [dest.lat, dest.lng]] : null}
              height="100%"
              zoom={12}
            />
          </div>
        </div>
        {/* RIGHT: recap */}
        <div className="w-96 bg-white p-8 flex flex-col">
          <div className="flex items-start gap-3 mb-6">
            <span className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold flex-shrink-0" style={{ background: ORANGE }}>1</span>
            <div>
              <p className="text-xl font-bold">Type de cabine</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="text-5xl">🚗</div>
                <div>
                  <p className="font-semibold text-lg">{vehicle.label}</p>
                  <p className="text-sm text-gray-500">{vehicle.seats} Personnes</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 mb-6">
            <span className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold flex-shrink-0" style={{ background: ORANGE }}>2</span>
            <div className="flex-1">
              <p className="text-xl font-bold">Détails du tarif</p>
              <div className="mt-3 flex items-center gap-3">
                <Wallet size={56} weight="duotone" className="text-gray-400" />
                <div>
                  <p className="text-3xl font-bold flex items-center gap-2" style={{ color: ORANGE }} data-testid="estimated-fare">
                    {estimate ? `${estimate.estimated_fare.toFixed(2)} €` : '—'}
                    <Info size={20} style={{ color: ORANGE }} />
                  </p>
                  <p className="text-sm text-gray-500">Tarif</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center italic">(Le tarif réel peut varier par rapport au tarif estimé).</p>
            </div>
          </div>
          <div className="mt-auto space-y-3">
            <button
              onClick={() => dest && estimate && onConfirm(dest, estimate)}
              disabled={!dest || !estimate}
              data-testid="confirm-booking-btn"
              className="w-full py-4 text-white font-bold text-xl rounded-md disabled:opacity-40"
              style={{ background: ORANGE }}
            >
              RÉSERVER<br />MAINTENANT
            </button>
            <button onClick={onBack} className="w-full py-3 text-white font-bold text-lg rounded-md" style={{ background: ORANGE, opacity: 0.85 }} data-testid="cancel-booking-btn">
              ANNULER
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const KioskSearching = ({ info, dest, bookingNo, rideId, onDone }) => {
  const [rideStatus, setRideStatus] = useState('pending');
  const [driver, setDriver] = useState(null);
  const token = localStorage.getItem(KIOSK_TOKEN_KEY);

  useEffect(() => {
    if (!rideId) return;
    const tick = async () => {
      try {
        const r = await kioskAPI.rideStatus(token, rideId);
        setRideStatus(r.status);
        if (r.driver_info) setDriver(r.driver_info);
      } catch (e) { /* ignore */ }
    };
    tick();
    const i = setInterval(tick, 4000);
    return () => clearInterval(i);
  }, [rideId, token]);

  const accepted = ['accepted', 'arriving', 'in_progress'].includes(rideStatus);

  return (
    <div className="min-h-screen flex flex-col bg-gray-100" data-testid="searching-screen">
      <header className="h-20 flex items-center justify-center text-white text-2xl font-semibold" style={{ background: ORANGE }}>
        {accepted ? 'Chauffeur en route !' : 'Demander'}
      </header>
      <div className="flex-1 flex">
        <div className="flex-1 relative">
          <LeafletMap
            pickup={{ lat: info.lat, lng: info.lng }}
            dropoff={dest ? { lat: dest.lat, lng: dest.lng } : null}
            routePath={dest ? [[info.lat, info.lng], [dest.lat, dest.lng]] : null}
            height="100%"
            zoom={13}
          />
          {!accepted && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative">
                <div className="absolute -inset-32 rounded-full opacity-30 animate-ping" style={{ background: ORANGE }} />
                <div className="absolute -inset-20 rounded-full opacity-50 animate-pulse" style={{ background: ORANGE }} />
                <div className="relative w-16 h-20 bg-black rounded-t-full flex items-center justify-center text-white text-3xl" style={{ borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%' }}>
                  <span>👤</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="w-96 bg-white p-8 flex flex-col items-center justify-center">
          {!accepted ? (
            <>
              <p className="text-xl font-semibold mb-3">Réservation #{bookingNo}</p>
              <p className="text-gray-500 text-center mb-6">Recherche d'un chauffeur disponible…</p>
              <div className="w-20 h-20 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
              <button onClick={onDone} className="mt-10 px-8 py-3 text-white font-bold rounded-md" style={{ background: ORANGE }} data-testid="searching-done-btn">
                Retour à l'accueil
              </button>
            </>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-4 text-5xl">✓</div>
              <p className="text-2xl font-bold mb-2">Chauffeur trouvé !</p>
              <p className="text-gray-500 mb-6">Réservation #{bookingNo}</p>
              <div className="w-full bg-orange-50 rounded-xl p-4 space-y-2">
                <p className="font-bold text-lg" data-testid="driver-name">{driver?.name || 'Chauffeur'}</p>
                <p className="text-sm text-gray-600">{driver?.vehicle_model} · {driver?.vehicle_number}</p>
                <p className="text-sm">📞 {driver?.phone}</p>
                <p className="text-sm">⭐ {driver?.rating?.toFixed(1) || '5.0'}</p>
              </div>
              <button onClick={onDone} className="mt-8 px-8 py-3 text-white font-bold rounded-md" style={{ background: ORANGE }} data-testid="success-done-btn">
                Terminer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ===================== Main App =====================

const STEPS = { SPLASH: 'splash', UNLOCK: 'unlock', HOME: 'home', FORM: 'form', VEHICLE: 'vehicle', DEST: 'dest', SEARCH: 'search' };

export default function KioskApp() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(STEPS.SPLASH);
  const [token, setToken] = useState(localStorage.getItem(KIOSK_TOKEN_KEY) || params.get('token') || '');
  const [info, setInfo] = useState(null);
  const [nearestDriver, setNearestDriver] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [booking, setBooking] = useState(null);
  const [destination, setDestination] = useState(null);

  // 1) Splash for 1.5s
  useEffect(() => {
    const t = setTimeout(() => setStep(token ? STEPS.HOME : STEPS.UNLOCK), 1500);
    return () => clearTimeout(t);
  }, [token]);

  // 2) Load kiosk info when token is available
  const loadInfo = useCallback(async () => {
    if (!token) return;
    try {
      const data = await kioskAPI.getInfo(token);
      setInfo(data);
    } catch (e) {
      toast.error('Borne invalide ou désactivée');
      localStorage.removeItem(KIOSK_TOKEN_KEY);
      setToken('');
      setStep(STEPS.UNLOCK);
    }
  }, [token]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  // 3) Refresh nearest driver ETA every 20s on Home screen
  useEffect(() => {
    if (step !== STEPS.HOME || !token) return;
    const fetchNd = () => kioskAPI.nearestDriver(token).then(setNearestDriver).catch(() => {});
    fetchNd();
    const i = setInterval(fetchNd, 20000);
    return () => clearInterval(i);
  }, [step, token]);

  const handleUnlock = (newToken) => {
    setToken(newToken);
    setStep(STEPS.HOME);
  };

  const handleLogout = () => {
    localStorage.removeItem(KIOSK_TOKEN_KEY);
    setToken('');
    setInfo(null);
    setStep(STEPS.UNLOCK);
  };

  const handleBook = async (dest, estimate) => {
    try {
      const res = await kioskAPI.book(token, {
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email || null,
        phone: customer.phone,
        dest_lat: dest.lat,
        dest_lng: dest.lng,
        dest_address: dest.address,
        vehicle_type: vehicle.key,
      });
      setBooking(res);
      setDestination(dest);
      setStep(STEPS.SEARCH);
    } catch (e) {
      toast.error('Erreur de réservation : ' + (e.response?.data?.detail || e.message));
    }
  };

  const goHome = () => {
    setCustomer(null);
    setVehicle(null);
    setBooking(null);
    setDestination(null);
    setStep(STEPS.HOME);
  };

  // ============= Render =============
  if (step === STEPS.SPLASH) return <KioskSplash />;
  if (step === STEPS.UNLOCK) return <KioskUnlock onUnlock={handleUnlock} />;
  if (!info) return <KioskSplash />;

  if (step === STEPS.HOME) {
    return (
      <KioskHome
        info={info}
        nearestDriver={nearestDriver}
        onStart={() => setStep(STEPS.FORM)}
        onLogout={handleLogout}
        onChangeLang={(v) => setInfo({ ...info, language: v })}
        onChangeCurrency={(v) => setInfo({ ...info, currency: v })}
      />
    );
  }
  if (step === STEPS.FORM) {
    return <KioskCustomerForm onBack={() => setStep(STEPS.HOME)} onNext={(c) => { setCustomer(c); setStep(STEPS.VEHICLE); }} />;
  }
  if (step === STEPS.VEHICLE) {
    return (
      <KioskVehicleSelect
        vehicles={info.vehicles}
        currency={info.currency}
        selected={vehicle?.key}
        onBack={() => setStep(STEPS.FORM)}
        onSelect={(k) => setVehicle(info.vehicles.find(v => v.key === k))}
        onNext={() => vehicle && setStep(STEPS.DEST)}
      />
    );
  }
  if (step === STEPS.DEST) {
    return <KioskDestination info={info} vehicle={vehicle} onBack={() => setStep(STEPS.VEHICLE)} onConfirm={handleBook} />;
  }
  if (step === STEPS.SEARCH) {
    return <KioskSearching info={info} dest={destination} bookingNo={booking?.booking_no} rideId={booking?.ride_id} onDone={goHome} />;
  }
  return null;
}
