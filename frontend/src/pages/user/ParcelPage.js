import { useLocale } from '../../contexts/LocaleContext';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { parcelAPI, placesAPI } from '../../services/api';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import {
  ArrowLeft, Package, Motorcycle, CaretRight, Plus, Trash, MapPin, FlagCheckered, CheckCircle, NavigationArrow, MapTrifold, ShieldCheck, Signature
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import SavedAddressChips from '../../components/SavedAddressChips';
import MapLocationPicker from '../../components/MapLocationPicker';
import { Switch } from '../../components/ui/switch';
import { locateWithFallback } from '../../lib/userLocation';

let stopSeq = 0;
const emptyStop = () => ({ _id: ++stopSeq, lat: null, lng: null, address: '', recipient_name: '', recipient_phone: '' });

const ParcelPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [step, setStep] = useState('choose');
  const [deliveryMode, setDeliveryMode] = useState(null); // single | multi
  const [vehicleType, setVehicleType] = useState(null); // box | moto
  const [pickup, setPickup] = useState({ lat: null, lng: null, address: '' });
  const [stops, setStops] = useState([emptyStop()]); // drop-off points
  const [mapPicker, setMapPicker] = useState(null); // null | { kind:'pickup' } | { kind:'stop', index }
  const [locating, setLocating] = useState(false);
  const [estimation, setEstimation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [insurance, setInsurance] = useState(false);
  const [signatureRequired, setSignatureRequired] = useState(false);

  const startDelivery = (mode, vehicle) => {
    setDeliveryMode(mode); setVehicleType(vehicle);
    setPickup({ lat: null, lng: null, address: '' });
    setStops([emptyStop()]);
    setStep('map');
  };

  // Saisie/sélection d'une adresse (autocomplétion Google, géoloc ou carte)
  const applyPickup = (loc) => {
    setPickup({ lat: loc.lat, lng: loc.lng, address: loc.address || '' });
    if (loc.address && loc.lat != null) placesAPI.addRecent({ address: loc.address, lat: loc.lat, lng: loc.lng }).catch(() => {});
  };
  const applyStop = (idx, loc) => {
    setStops((s) => s.map((st, i) => (i === idx ? { ...st, lat: loc.lat, lng: loc.lng, address: loc.address || st.address } : st)));
    if (loc.address && loc.lat != null) placesAPI.addRecent({ address: loc.address, lat: loc.lat, lng: loc.lng }).catch(() => {});
  };

  const useMyLocationForPickup = async () => {
    setLocating(true);
    try {
      const loc = await locateWithFallback({ preferGps: true });
      applyPickup(loc);
      toast.success('Position détectée');
    } catch (e) {
      toast.error("Impossible d'obtenir votre position. Saisissez l'adresse.");
    } finally { setLocating(false); }
  };

  const onMapConfirm = (loc) => {
    if (mapPicker?.kind === 'pickup') applyPickup(loc);
    else if (mapPicker?.kind === 'stop') applyStop(mapPicker.index, loc);
    setMapPicker(null);
  };

  const addStop = () => setStops((s) => [...s, emptyStop()]);
  const removeStop = (idx) => setStops((s) => s.filter((_, i) => i !== idx));
  const setStopField = (idx, field, value) => setStops((s) => s.map((st, i) => (i === idx ? { ...st, [field]: value } : st)));

  const allStopsPlaced = stops.length > 0 && stops.every((s) => s.lat && s.lng);
  const canEstimate = pickup.lat && allStopsPlaced;

  const getEstimate = async () => {
    if (!canEstimate) return;
    const data = await runEstimate(insurance);
    if (data) setStep('confirm');
  };

  const runEstimate = async (insuranceVal) => {
    if (!canEstimate) return null;
    setLoading(true);
    try {
      const res = await parcelAPI.estimate({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        stops: stops.map((s) => ({ lat: s.lat, lng: s.lng, recipient_name: s.recipient_name, recipient_phone: s.recipient_phone })),
        vehicle_type: vehicleType,
        insurance: insuranceVal,
      });
      setEstimation(res.data);
      return res.data;
    } catch (e) { toast.error('Échec du calcul du prix'); return null; } finally { setLoading(false); }
  };

  const toggleInsurance = async (val) => {
    setInsurance(val);
    await runEstimate(val);
  };

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await parcelAPI.create({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        stops: stops.map((s) => ({ lat: s.lat, lng: s.lng, recipient_name: s.recipient_name, recipient_phone: s.recipient_phone })),
        vehicle_type: vehicleType, payment_method: paymentMethod,
        insurance, signature_required: signatureRequired,
      });
      if (res.data?.payment_fallback_to_cash) {
        toast.info('Solde insuffisant — la course sera payée en espèces.');
      }
      setStep('success');
      const pid = res.data?.id;
      setTimeout(() => navigate(pid ? `/track/parcel/${pid}` : '/history'), 2200);
    } catch (e) { toast.error('Échec de la commande'); } finally { setLoading(false); }
  };

  // ===== CHOOSE SCREEN =====
  if (step === 'choose') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/home')} data-testid="parcel-back-btn"><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">Livraison de Colis</h1>
        </div>
        <div className="bg-gradient-to-r from-[#E03D00] to-[#FF4500] p-6 flex items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-extrabold text-yellow-400 leading-tight">Livraison<br />de Colis</h2>
            <p className="text-white/80 text-sm mt-2">Envoyez vos colis instantanément ou programmez pour plus tard.</p>
          </div>
          <Package size={80} weight="duotone" className="text-white/30" />
        </div>

        <div className="p-4">
          <h3 className="text-xl font-bold text-gray-900">Livraison Simple</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">Envoyez un colis d&apos;un point de ramassage vers une seule destination.</p>
          <div className="space-y-3">
            <button onClick={() => startDelivery('single', 'box')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all" data-testid="single-box-btn">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0"><Package size={28} weight="duotone" className="text-teal-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Box</p><p className="text-sm text-gray-500">Grand colis ? Envoyez-le vers une seule destination !</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
            <button onClick={() => startDelivery('single', 'moto')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50/50 transition-all" data-testid="single-moto-btn">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0"><Motorcycle size={28} weight="duotone" className="text-red-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Moto Send</p><p className="text-sm text-gray-500">Petit paquet transportable en moto ou voiture.</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
          </div>
        </div>

        <div className="p-4 pt-0">
          <h3 className="text-xl font-bold text-gray-900">Livraison Multiple</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">Un seul coursier, plusieurs points de dépôt en une seule course.</p>
          <div className="space-y-3">
            <button onClick={() => startDelivery('multi', 'box')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all" data-testid="multi-box-btn">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0"><Package size={28} weight="duotone" className="text-teal-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Box</p><p className="text-sm text-gray-500">Trop de gros colis ? Plusieurs destinations en une fois !</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
            <button onClick={() => startDelivery('multi', 'moto')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50/50 transition-all" data-testid="multi-moto-btn">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0"><Motorcycle size={28} weight="duotone" className="text-red-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Moto Send</p><p className="text-sm text-gray-500">Plusieurs petits paquets à différentes adresses.</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== MAP / ADDRESSES SCREEN =====
  if (step === 'map') {
    const isMulti = deliveryMode === 'multi';
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col">
        <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('choose')} data-testid="parcel-map-back-btn"><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">{isMulti ? 'Livraison Multiple' : 'Livraison Simple'} — {vehicleType === 'box' ? 'Box' : 'Moto'}</h1>
        </div>

        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {/* Pickup */}
          <div className="space-y-2" data-testid="parcel-pickup-section">
            <div className="flex items-center gap-2">
              <MapPin size={18} weight="fill" className="text-green-500" />
              <span className="text-sm font-bold text-gray-900">Adresse de ramassage</span>
            </div>
            <SavedAddressChips
              accent="#16a34a"
              testIdPrefix="parcel-pickup-addr"
              selected={pickup.lat != null ? pickup : null}
              onSelect={(loc) => setPickup({ lat: loc.lat, lng: loc.lng, address: loc.address || '' })}
            />
            <GooglePlacesInput
              placeholder="Saisissez l'adresse de ramassage"
              value={pickup.address}
              testId="parcel-pickup-input"
              iconColor="#16a34a"
              onChange={(addr) => setPickup((p) => ({ ...p, address: addr }))}
              onSelect={(loc) => applyPickup(loc)}
            />
            <div className="flex gap-2">
              <button type="button" onClick={useMyLocationForPickup} disabled={locating}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 text-xs font-semibold disabled:opacity-60"
                data-testid="parcel-pickup-mylocation-btn">
                <NavigationArrow size={15} weight="fill" /> {locating ? 'Localisation…' : 'Ma position'}
              </button>
              <button type="button" onClick={() => setMapPicker({ kind: 'pickup' })}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-xs font-semibold"
                data-testid="parcel-pickup-map-btn">
                <MapTrifold size={15} weight="fill" /> Choisir sur la carte
              </button>
            </div>
          </div>

          {/* Drop-offs */}
          {stops.map((s, i) => (
            <div key={s._id} className="space-y-2 border-t border-gray-100 pt-4" data-testid={`parcel-stop-${i}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlagCheckered size={16} weight="fill" className="text-red-500" />
                  <span className="text-sm font-bold text-gray-900">Dépôt {i + 1}</span>
                </div>
                {isMulti && stops.length > 1 && (
                  <button onClick={() => removeStop(i)} className="text-rose-500 p-1" data-testid={`parcel-stop-remove-${i}`}><Trash size={16} /></button>
                )}
              </div>
              <GooglePlacesInput
                placeholder={`Adresse du dépôt ${i + 1}`}
                value={s.address}
                testId={`parcel-stop-input-${i}`}
                iconColor="#ef4444"
                onChange={(addr) => setStopField(i, 'address', addr)}
                onSelect={(loc) => applyStop(i, loc)}
              />
              <button type="button" onClick={() => setMapPicker({ kind: 'stop', index: i })}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-xs font-semibold"
                data-testid={`parcel-stop-map-btn-${i}`}>
                <MapTrifold size={15} weight="fill" /> Choisir sur la carte
              </button>
              {isMulti && (
                <div className="grid grid-cols-2 gap-2">
                  <input value={s.recipient_name} onChange={(e) => setStopField(i, 'recipient_name', e.target.value)} placeholder="Destinataire" className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm" data-testid={`parcel-stop-name-${i}`} />
                  <input value={s.recipient_phone} onChange={(e) => setStopField(i, 'recipient_phone', e.target.value)} placeholder="Téléphone" className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm" data-testid={`parcel-stop-phone-${i}`} />
                </div>
              )}
            </div>
          ))}

          {isMulti && (
            <button onClick={addStop} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[#FF4500] text-[#FF4500] text-sm font-semibold" data-testid="parcel-add-stop-btn">
              <Plus size={16} weight="bold" /> Ajouter un point de dépôt
            </button>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white">
          <Button className="w-full rounded-2xl h-12 bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold" disabled={!canEstimate || loading} onClick={getEstimate} data-testid="parcel-estimate-btn">
            {loading ? 'Calcul...' : `Estimer le prix${isMulti ? ` · ${stops.length} dépôt${stops.length > 1 ? 's' : ''}` : ''}`}
          </Button>
        </div>

        <MapLocationPicker
          open={!!mapPicker}
          showTargetToggle={false}
          title={mapPicker?.kind === 'pickup' ? 'Ramassage' : 'Point de dépôt'}
          initial={mapPicker?.kind === 'pickup' ? pickup : (mapPicker?.kind === 'stop' ? stops[mapPicker.index] : null)}
          onConfirm={onMapConfirm}
          onClose={() => setMapPicker(null)}
        />
      </div>
    );
  }

  // ===== CONFIRM SCREEN =====
  if (step === 'confirm') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('map')} data-testid="parcel-confirm-back-btn"><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">Confirmer l&apos;envoi</h1>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between"><span className="text-gray-600">Points de dépôt</span><span className="font-bold" data-testid="confirm-stops-count">{estimation?.stops_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Distance totale</span><span className="font-bold">{estimation?.total_distance_km?.toFixed(1)} km</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Durée estimée</span><span className="font-bold">~{Math.round(estimation?.total_duration_mins || 0)} min</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Type</span><span className="font-bold">{vehicleType === 'box' ? 'Box' : 'Moto Send'}</span></div>
            <div className="flex justify-between text-lg pt-1 border-t border-blue-100"><span className="text-gray-600">Prix total</span><span className="font-bold text-[#FF4500]" data-testid="confirm-total-fare">{money(estimation?.estimated_fare || 0)}</span></div>
          </div>

          {/* Per-leg breakdown */}
          {(estimation?.legs || []).length > 1 && (
            <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100" data-testid="parcel-legs-breakdown">
              {estimation.legs.map((l) => (
                <div key={l.index} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-700">Dépôt {l.index + 1}{l.recipient_name ? ` · ${l.recipient_name}` : ''}</span>
                  <span className="text-gray-500">{l.distance_km.toFixed(1)} km · <span className="font-semibold text-gray-800">{money(l.fare)}</span></span>
                </div>
              ))}
            </div>
          )}

          {/* Options de livraison */}
          <div className="space-y-2" data-testid="parcel-options-section">
            <div className="flex items-center justify-between rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck size={22} weight="duotone" className="text-emerald-600 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-900">Assurance colis</p>
                  <p className="text-xs text-gray-500">Couverture en cas de perte ou casse (+{money(estimation?.insurance_fee || 2)})</p>
                </div>
              </div>
              <Switch checked={insurance} onCheckedChange={toggleInsurance} data-testid="parcel-insurance-toggle" />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <Signature size={22} weight="duotone" className="text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-900">Signature à la réception</p>
                  <p className="text-xs text-gray-500">Le destinataire signe à la livraison (remise en main propre)</p>
                </div>
              </div>
              <Switch checked={signatureRequired} onCheckedChange={setSignatureRequired} data-testid="parcel-signature-toggle" />
            </div>
          </div>

          {/* Moyen de paiement */}
          <div data-testid="parcel-payment-section">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Moyen de paiement</h3>
            <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} total={estimation?.estimated_fare || 0} testidPrefix="parcel-pay" />
          </div>

          <Button className="w-full rounded-2xl h-14 bg-[#FF4500] hover:bg-[#E03D00] text-white text-lg font-semibold" disabled={loading} onClick={confirm} data-testid="parcel-confirm-btn">
            {loading ? 'Envoi...' : `Confirmer · ${money(estimation?.estimated_fare || 0)}`}
          </Button>
        </div>
      </div>
    );
  }

  // ===== SUCCESS =====
  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center" data-testid="parcel-success">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6"><CheckCircle size={40} weight="fill" className="text-green-600" /></div>
      <h2 className="text-2xl font-bold mb-2">Colis confirmé !</h2>
      <p className="text-gray-500">Un coursier va récupérer votre colis et livrer {stops.length > 1 ? `vos ${stops.length} points de dépôt` : 'votre destination'}. Suivez dans l&apos;historique.</p>
    </div>
  );
};

export default ParcelPage;
