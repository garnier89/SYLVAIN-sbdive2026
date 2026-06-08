import { useLocale } from '../../contexts/LocaleContext';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Star, Car, Clock, Lightning, ShieldCheck, MagnifyingGlass } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const ParkingPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [form, setForm] = useState({ vehicle_plate: '', duration_hours: 2, start_time: '' });
  const [loading, setLoading] = useState(true);
  const [bookingDone, setBookingDone] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/parking/spots`, { credentials: 'include' })
      .then(r => r.json()).then(d => { setSpots(d.spots || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleBook = async () => {
    if (!selectedSpot) return;
    try {
      const now = new Date();
      const startTime = form.start_time || now.toISOString();
      const endTime = new Date(new Date(startTime).getTime() + form.duration_hours * 3600000).toISOString();
      const res = await fetch(`${API}/api/parking/reservations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          spot_id: selectedSpot.id, spot_name: selectedSpot.name,
          vehicle_plate: form.vehicle_plate, start_time: startTime, end_time: endTime,
          duration_hours: form.duration_hours,
          total_price: (selectedSpot.price_per_hour * form.duration_hours).toFixed(2)
        })
      });
      if (res.ok) setBookingDone(true);
    } catch (e) { console.error(e); }
  };

  if (bookingDone) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8" data-testid="parking-success">
        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-4">
          <Car size={40} weight="duotone" className="text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Place réservée !</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Votre place au {selectedSpot.name} est confirmée pour {form.duration_hours}h.
        </p>
        <button onClick={() => navigate('/home')} className="bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold text-sm">
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  if (selectedSpot) {
    const totalPrice = (selectedSpot.price_per_hour * form.duration_hours).toFixed(2);
    return (
      <div className="mobile-container min-h-screen bg-white" data-testid="parking-booking">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={() => setSelectedSpot(null)} data-testid="back-from-booking"><ArrowLeft size={22} /></button>
          <h1 className="text-base font-bold">Réserver une place</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
            <h3 className="font-bold text-gray-900">{selectedSpot.name}</h3>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><MapPin size={12} />{selectedSpot.address}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-xs"><Star size={12} weight="fill" className="text-amber-400" />{selectedSpot.rating}</span>
              <span className="text-xs text-blue-600 font-bold">{selectedSpot.price_per_hour}€/h</span>
              <span className="text-xs text-green-600">{selectedSpot.available_spots} places dispo</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedSpot.features?.map((f, i) => (
                <span key={i} className="px-2 py-0.5 bg-white rounded-full text-[10px] text-gray-500 border border-gray-200">{f}</span>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Plaque d&apos;immatriculation</label>
            <input value={form.vehicle_plate} onChange={e => setForm({ ...form, vehicle_plate: e.target.value })}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm uppercase"
              placeholder="AA-123-BB" data-testid="vehicle-plate" />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Durée</label>
            <div className="flex gap-2">
              {[1, 2, 4, 8, 24].map(h => (
                <button key={h} onClick={() => setForm({ ...form, duration_hours: h })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${form.duration_hours === h ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                  data-testid={`duration-${h}`}>
                  {h}h
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{selectedSpot.price_per_hour}€/h x {form.duration_hours}h</span>
              <span className="font-bold text-gray-900">{money(Number(totalPrice))}</span>
            </div>
          </div>

          <button onClick={handleBook}
            className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors"
            data-testid="confirm-parking-booking">
            Réserver - {totalPrice}€
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="parking-page">
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white">Parking</h1>
        </div>
        <p className="text-sm text-white/80">Trouvez et réservez votre place de parking</p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : spots.map(spot => (
          <button key={spot.id} onClick={() => setSelectedSpot(spot)}
            className="w-full bg-white rounded-2xl overflow-hidden border border-gray-100 text-left"
            data-testid={`spot-${spot.id}`}>
            <div className="h-28 bg-cover bg-center bg-gradient-to-br from-slate-200 to-slate-300" style={{ backgroundImage: `url(${spot.image_url})` }} />
            <div className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{spot.name}</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={10} />{spot.address}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">{spot.price_per_hour}€/h</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-[10px]"><Star size={10} weight="fill" className="text-amber-400" />{spot.rating}</span>
                <span className="text-[10px] text-green-600">{spot.available_spots}/{spot.total_spots} places</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {spot.features?.slice(0, 3).map((f, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-gray-50 rounded text-[9px] text-gray-500">{f}</span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ParkingPage;
