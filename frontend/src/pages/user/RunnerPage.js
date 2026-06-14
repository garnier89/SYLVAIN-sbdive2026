import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Plus, Trash, Lightning, MapPin, Bag, NavigationArrow } from '@phosphor-icons/react';
import { toast } from 'sonner';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import SavedAddressChips from '../../components/SavedAddressChips';
import { locateWithFallback } from '../../lib/userLocation';
import { parcelAPI, placesAPI } from '../../services/api';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';

// Coursier Express runs on the tested "parcels" engine (live driver dispatch + tracking).
const PKG_TO_VEHICLE = { document: 'moto', small: 'moto', food: 'moto', medium: 'box' };

const PACKAGE_TYPES = [
  { id: 'document', label: 'Document' },
  { id: 'small', label: 'Petit colis (<2kg)' },
  { id: 'medium', label: 'Colis moyen (<10kg)' },
  { id: 'food', label: 'Nourriture' },
];

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
  const [locating, setLocating] = useState(false);

  const useMyLocationForPickup = async () => {
    setLocating(true);
    try {
      const loc = await locateWithFallback({ preferGps: true });
      setPickup({ address: loc.address || 'Position actuelle', lat: loc.lat, lng: loc.lng });
      if (loc.address && loc.lat != null) placesAPI.addRecent({ address: loc.address, lat: loc.lat, lng: loc.lng }).catch(() => {});
      toast.success('Position détectée');
    } catch (e) {
      toast.error("Impossible d'obtenir votre position. Saisissez l'adresse.");
    } finally { setLocating(false); }
  };
  const [packageType, setPackageType] = useState('document');
  const [submitting, setSubmitting] = useState(false);
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Delivery Genie (concierge shopping) — what to buy, target store, budget
  const [genieItems, setGenieItems] = useState('');
  const [genieStore, setGenieStore] = useState('');
  const [genieBudget, setGenieBudget] = useState('');

  // simple mode
  const [drop, setDrop] = useState(null);
  const [dropContact, setDropContact] = useState({ name: '', phone: '' });

  // multiple mode — each stop carries a stable _key for React reconciliation
  const [stops, setStops] = useState(() => [
    { _key: `stop_${Date.now()}_0`, address: null, name: '', phone: '', note: '' },
  ]);

  const addStop = () => {
    if (stops.length >= 5) { toast.error('Max 5 arrêts'); return; }
    setStops([...stops, { _key: `stop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, address: null, name: '', phone: '', note: '' }]);
  };
  const removeStop = (idx) => setStops(stops.filter((_, i) => i !== idx));
  const updateStop = (idx, field, value) => setStops(stops.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  // Live fare via the parcels engine (authoritative — same value used at creation)
  useEffect(() => {
    let cancelled = false;
    const computeFare = async () => {
      const st = mode === 'simple'
        ? (drop?.lat ? [{ lat: drop.lat, lng: drop.lng }] : [])
        : stops.filter((s) => s.address?.lat).map((s) => ({ lat: s.address.lat, lng: s.address.lng }));
      if (!pickup?.lat || st.length === 0) {
        if (!cancelled) setEstimatedFare(0);
        return;
      }
      try {
        const res = await parcelAPI.estimate({ pickup_lat: pickup.lat, pickup_lng: pickup.lng, stops: st, vehicle_type: PKG_TO_VEHICLE[packageType] || 'moto' });
        if (!cancelled) setEstimatedFare(res.data.estimated_fare || 0);
      } catch (e) { console.debug('[Runner] fare estimate failed:', e?.message || e); /* keep previous estimate */ }
    };
    computeFare();
    return () => { cancelled = true; };
  }, [pickup, drop, stops, mode, packageType]);

  const handleSubmit = async () => {
    if (!pickup) { toast.error('Lieu de ramassage requis'); return; }
    if (isGenie && !genieItems.trim()) { toast.error('Indiquez ce que le Genie doit acheter'); return; }
    let st;
    if (mode === 'simple') {
      if (!drop) { toast.error('Destination requise'); return; }
      if (!dropContact.phone.trim()) { toast.error('Téléphone du destinataire requis'); return; }
      st = [{ address: drop.address, lat: drop.lat, lng: drop.lng, recipient_name: dropContact.name, recipient_phone: dropContact.phone, note: pickupNote }];
    } else {
      st = stops.filter((s) => s.address?.lat && s.phone.trim()).map((s) => ({
        address: s.address.address, lat: s.address.lat, lng: s.address.lng,
        recipient_name: s.name, recipient_phone: s.phone, note: s.note,
      }));
      if (st.length === 0) { toast.error('Ajoutez au moins un arrêt avec téléphone'); return; }
    }
    setSubmitting(true);
    try {
      const res = await parcelAPI.create({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        pickup_address: pickup.address,
        stops: st,
        vehicle_type: PKG_TO_VEHICLE[packageType] || 'moto',
        payment_method: paymentMethod,
        ...(isGenie ? {
          service_variant: 'genie',
          genie_items: genieItems.trim(),
          genie_store: genieStore.trim() || null,
          genie_budget: genieBudget ? parseFloat(genieBudget) : null,
        } : {}),
      });
      const pid = res.data?.id;
      if (res.data?.payment_fallback_to_cash) {
        toast.info('Solde insuffisant — la course sera payée en espèces.');
      }
      toast.success('Commande coursier créée ! Un coursier va la prendre en charge.');
      navigate(pid ? `/track/parcel/${pid}` : '/history');
    } catch (e) { console.error(e); toast.error("Impossible de créer la commande"); }
    finally { setSubmitting(false); }
  };

  const fare = estimatedFare;

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
        {/* Delivery Genie — concierge shopping list */}
        {isGenie && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3" data-testid="genie-section">
            <div className="flex items-center gap-2">
              <Bag size={18} className="text-indigo-500" weight="fill" />
              <h3 className="text-sm font-bold text-indigo-900">Votre liste de courses</h3>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Que voulez-vous acheter ? *</label>
              <textarea
                value={genieItems}
                onChange={(e) => setGenieItems(e.target.value)}
                placeholder="Ex : 2 baguettes, 1 L de lait, 6 œufs, 1 paquet de café…"
                rows={4}
                className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 resize-none"
                data-testid="genie-items"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Magasin cible</label>
                <input
                  type="text"
                  value={genieStore}
                  onChange={(e) => setGenieStore(e.target.value)}
                  placeholder="Ex : Carrefour Dillon"
                  className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                  data-testid="genie-store"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Budget estimé (EUR)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={genieBudget}
                  onChange={(e) => setGenieBudget(e.target.value)}
                  placeholder="Ex : 30"
                  className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                  data-testid="genie-budget"
                />
              </div>
            </div>
            <p className="text-[11px] text-indigo-700/80 leading-relaxed">
              Le Genie achète vos articles et vous les livre. Le coût des articles est réglé en plus de la course (remboursé au Genie à la livraison).
            </p>
          </div>
        )}

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
            {PACKAGE_TYPES.map(p => (
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
          <SavedAddressChips
            accent="#16a34a"
            testIdPrefix="runner-pickup-addr"
            selected={pickup?.lat != null ? pickup : null}
            onSelect={(loc) => setPickup({ address: loc.address, lat: loc.lat, lng: loc.lng })}
            className="mb-2"
          />
          <GooglePlacesInput
            placeholder="Adresse de ramassage"
            value={pickup?.address || ''}
            testId="runner-pickup"
            onSelect={(r) => { setPickup({ address: r.address, lat: r.lat, lng: r.lng }); placesAPI.addRecent({ address: r.address, lat: r.lat, lng: r.lng }).catch(() => {}); }}
          />
          <button type="button" onClick={useMyLocationForPickup} disabled={locating}
            className="mt-2 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-xs font-semibold disabled:opacity-60"
            data-testid="runner-pickup-mylocation-btn">
            <NavigationArrow size={15} weight="fill" /> {locating ? 'Localisation…' : 'Ma position'}
          </button>
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
              onSelect={(r) => { setDrop({ address: r.address, lat: r.lat, lng: r.lng }); placesAPI.addRecent({ address: r.address, lat: r.lat, lng: r.lng }).catch(() => {}); }}
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
                <div key={s._key} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2" data-testid={`stop-${idx}`}>
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

        {/* Moyen de paiement */}
        <div data-testid="runner-payment-section">
          <h3 className="text-sm font-bold text-gray-900 mb-2">Moyen de paiement</h3>
          <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} total={fare} testidPrefix="runner-pay" />
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

export default RunnerPage;
