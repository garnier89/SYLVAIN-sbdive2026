import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Plus, Trash, Phone, Lightning, MapPin, Bag } from '@phosphor-icons/react';
import { toast } from 'sonner';
import GooglePlacesInput from '../../components/GooglePlacesInput';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * RunnerPage — "Coursier Express" / "Delivery Genie" service.
 *
 * Two modes:
 *   - simple: one pickup → one delivery point (fast single-drop).
 *   - multiple: one pickup → N delivery points (courier-for-the-day).
 *
 * Variants via ?mode=genie query param:
 *   - genie: Genie buys items on user's behalf from chosen store.
 *   - default: standard courier (pick-up & deliver).
 */
const RunnerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isGenie = searchParams.get('mode') === 'genie';
  const [mode, setMode] = useState('simple');
  const [pickup, setPickup] = useState(null);
  const [pickupNote, setPickupNote] = useState('');
  const [packageType, setPackageType] = useState('document');
  const [submitting, setSubmitting] = useState(false);

  // simple mode
  const [drop, setDrop] = useState(null);
  const [dropContact, setDropContact] = useState({ name: '', phone: '' });

  // multiple mode
  const [stops, setStops] = useState([
    { address: null, name: '', phone: '', note: '' },
  ]);

  const packageTypes = [
    { id: 'document', label: 'Document', baseFee: 5 },
    { id: 'small', label: 'Petit colis (<2kg)', baseFee: 8 },
    { id: 'medium', label: 'Colis moyen (<10kg)', baseFee: 12 },
    { id: 'food', label: 'Nourriture', baseFee: 6 },
  ];

  const addStop = () => {
    if (stops.length >= 5) { toast.error('Max 5 arrêts'); return; }
    setStops([...stops, { address: null, name: '', phone: '', note: '' }]);
  };
  const removeStop = (idx) => setStops(stops.filter((_, i) => i !== idx));
  const updateStop = (idx, field, value) => setStops(stops.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  const estimateFare = () => {
    const pkg = packageTypes.find(p => p.id === packageType);
    if (!pkg) return 0;
    if (mode === 'simple') {
      if (!pickup?.lat || !drop?.lat) return pkg.baseFee;
      const dist = haversine(pickup.lat, pickup.lng, drop.lat, drop.lng);
      return Math.round((pkg.baseFee + dist * 1.5) * 100) / 100;
    }
    // multiple mode
    const validStops = stops.filter(s => s.address?.lat);
    if (!pickup?.lat || validStops.length === 0) return pkg.baseFee;
    let total = pkg.baseFee;
    let prev = pickup;
    validStops.forEach(s => {
      total += haversine(prev.lat, prev.lng, s.address.lat, s.address.lng) * 1.5;
      prev = s.address;
    });
    // +3 EUR per extra stop
    total += Math.max(0, validStops.length - 1) * 3;
    return Math.round(total * 100) / 100;
  };

  const handleSubmit = async () => {
    if (!pickup) { toast.error('Lieu de ramassage requis'); return; }
    if (mode === 'simple') {
      if (!drop) { toast.error('Destination requise'); return; }
      if (!dropContact.phone.trim()) { toast.error('Téléphone du destinataire requis'); return; }
    } else {
      const valid = stops.filter(s => s.address?.lat && s.phone.trim());
      if (valid.length === 0) { toast.error('Ajoutez au moins un arrêt avec téléphone'); return; }
    }
    setSubmitting(true);
    try {
      const payload = {
        service_type: isGenie ? 'genie' : 'runner',
        mode,
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        pickup_note: pickupNote,
        package_type: packageType,
        estimated_fare: estimateFare(),
        drops: mode === 'simple'
          ? [{ address: drop.address, lat: drop.lat, lng: drop.lng, name: dropContact.name, phone: dropContact.phone }]
          : stops.filter(s => s.address?.lat).map(s => ({
              address: s.address.address, lat: s.address.lat, lng: s.address.lng,
              name: s.name, phone: s.phone, note: s.note,
            })),
      };
      const res = await fetch(`${API}/api/phase2/runner/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('order failed');
      toast.success('Commande coursier créée !');
      navigate('/history');
    } catch (e) { console.error(e); toast.error("Impossible de créer la commande"); }
    finally { setSubmitting(false); }
  };

  const fare = estimateFare();

  return (
    <div className="min-h-screen bg-white pb-8" data-testid="runner-page">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {isGenie ? <Bag size={18} className="text-blue-500" weight="duotone" /> : <Lightning size={18} className="text-amber-500" weight="duotone" />}
            {isGenie ? 'Delivery Genie' : 'Coursier Express'}
          </h1>
          <p className="text-xs text-gray-500">{isGenie ? 'Un Genie achète vos articles à votre place' : 'Livraison rapide dans votre ville (< 1 h)'}</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode('simple')}
            className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${mode === 'simple' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`}
            data-testid="mode-simple"
          >
            📦 Envoi simple
            <p className="text-[10px] font-normal mt-0.5">1 point → 1 point</p>
          </button>
          <button
            onClick={() => setMode('multiple')}
            className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${mode === 'multiple' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`}
            data-testid="mode-multiple"
          >
            🗂️ Tournée (multiple)
            <p className="text-[10px] font-normal mt-0.5">1 point → plusieurs arrêts</p>
          </button>
        </div>

        {/* Package type */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Type de colis</label>
          <div className="grid grid-cols-2 gap-2">
            {packageTypes.map(p => (
              <button
                key={p.id}
                onClick={() => setPackageType(p.id)}
                className={`py-2 px-3 rounded-lg border text-sm transition-all ${packageType === p.id ? 'border-amber-500 bg-amber-50 text-amber-700 font-semibold' : 'border-gray-200 text-gray-600'}`}
                data-testid={`pkg-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pickup */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1 flex items-center gap-1">
            <MapPin size={12} className="text-green-500" /> Lieu de ramassage
          </label>
          <GooglePlacesInput
            placeholder="Adresse de ramassage"
            value={pickup?.address || ''}
            testId="runner-pickup"
            onSelect={(r) => setPickup({ address: r.address, lat: r.lat, lng: r.lng })}
          />
          <input
            type="text"
            placeholder="Note pour le coursier (ex: étage, code...)"
            value={pickupNote}
            onChange={(e) => setPickupNote(e.target.value)}
            className="w-full mt-2 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400"
            data-testid="runner-pickup-note"
          />
        </div>

        {/* Drops */}
        {mode === 'simple' ? (
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1 flex items-center gap-1">
              <MapPin size={12} className="text-red-500" /> Destination
            </label>
            <GooglePlacesInput
              placeholder="Adresse de livraison"
              value={drop?.address || ''}
              testId="runner-drop"
              onSelect={(r) => setDrop({ address: r.address, lat: r.lat, lng: r.lng })}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input type="text" placeholder="Nom destinataire" value={dropContact.name}
                onChange={(e) => setDropContact({ ...dropContact, name: e.target.value })}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400" data-testid="drop-name" />
              <input type="tel" placeholder="Téléphone *" value={dropContact.phone}
                onChange={(e) => setDropContact({ ...dropContact, phone: e.target.value })}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400" data-testid="drop-phone" />
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                <MapPin size={12} className="text-red-500" /> Arrêts ({stops.length}/5)
              </label>
              <button onClick={addStop} className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1" data-testid="add-stop">
                <Plus size={14} /> Ajouter un arrêt
              </button>
            </div>
            <div className="space-y-3">
              {stops.map((s, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2" data-testid={`stop-${idx}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500">Arrêt {idx + 1}</span>
                    {stops.length > 1 && (
                      <button onClick={() => removeStop(idx)} className="text-red-400 hover:text-red-600" data-testid={`remove-stop-${idx}`}>
                        <Trash size={14} />
                      </button>
                    )}
                  </div>
                  <GooglePlacesInput
                    placeholder="Adresse"
                    value={s.address?.address || ''}
                    testId={`runner-stop-${idx}`}
                    onSelect={(r) => updateStop(idx, 'address', { address: r.address, lat: r.lat, lng: r.lng })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Nom" value={s.name} onChange={(e) => updateStop(idx, 'name', e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-amber-400" />
                    <input type="tel" placeholder="Téléphone *" value={s.phone} onChange={(e) => updateStop(idx, 'phone', e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-amber-400" />
                  </div>
                  <input type="text" placeholder="Note (ex: code, étage...)" value={s.note} onChange={(e) => updateStop(idx, 'note', e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-amber-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fare summary */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between" data-testid="fare-summary">
          <div>
            <p className="text-xs text-amber-800">Tarif estimé</p>
            <p className="text-2xl font-bold text-amber-900">{fare.toFixed(2)} EUR</p>
          </div>
          <Package size={36} className="text-amber-500" weight="duotone" />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white py-4 rounded-xl font-bold text-base transition-colors"
          data-testid="submit-runner-btn"
        >
          {submitting ? 'Envoi...' : `Commander · ${fare.toFixed(2)} EUR`}
        </button>
      </div>
    </div>
  );
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default RunnerPage;
