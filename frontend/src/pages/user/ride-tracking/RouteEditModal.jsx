/**
 * RouteEditModal — Modification d'itinéraire en cours de course.
 * Le passager peut changer le départ (avant le démarrage), la destination, et
 * ajouter/supprimer des arrêts intermédiaires, même après acceptation/démarrage.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { X, Plus, MapPin, FlagCheckered, Check } from '@phosphor-icons/react';
import GooglePlacesInput from '../../../components/GooglePlacesInput';
import { rideAPI } from '../../../services/api';

const RouteEditModal = ({ open, ride, onClose, onUpdated }) => {
  const inProgress = ride?.status === 'in_progress';
  const [pickup, setPickup] = useState(ride ? { address: ride.pickup_address, lat: ride.pickup_lat, lng: ride.pickup_lng } : null);
  const [dropoff, setDropoff] = useState(ride ? { address: ride.dropoff_address, lat: ride.dropoff_lat, lng: ride.dropoff_lng } : null);
  const [stops, setStops] = useState((ride?.stops || []).map((s) => ({ address: s.address, lat: s.lat, lng: s.lng })));
  const [saving, setSaving] = useState(false);

  if (!open || !ride) return null;

  const addStop = () => setStops((s) => [...s, { address: '', lat: null, lng: null }]);
  const setStop = (i, p) => setStops((s) => s.map((st, idx) => (idx === i ? p : st)));
  const removeStop = (i) => setStops((s) => s.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!dropoff?.lat) { toast.error('Choisissez une destination'); return; }
    if (!inProgress && !pickup?.lat) { toast.error('Choisissez un point de départ'); return; }
    setSaving(true);
    try {
      const payload = {
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
        stops: stops.filter((s) => s?.lat).map((s) => ({ address: s.address, lat: s.lat, lng: s.lng })),
      };
      if (!inProgress && pickup?.lat) {
        payload.pickup_lat = pickup.lat; payload.pickup_lng = pickup.lng; payload.pickup_address = pickup.address;
      }
      const r = await rideAPI.updateRoute(ride.id, payload);
      toast.success('Itinéraire mis à jour. Le chauffeur a été notifié.');
      onUpdated?.(r.data);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Échec de la mise à jour');
    } finally { setSaving(false); }
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[70] bg-black/50 flex items-end justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} data-testid="route-edit-modal">
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-[#0B1426]">Modifier l'itinéraire</h3>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" data-testid="route-edit-close"><X size={20} /></button>
          </div>

          {/* Pickup (locked once in progress) */}
          <div className="mb-3">
            <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><MapPin size={11} /> Départ</label>
            {inProgress ? (
              <p className="text-sm text-slate-400 mt-1" data-testid="route-edit-pickup-locked">{ride.pickup_address} (verrouillé)</p>
            ) : (
              <GooglePlacesInput value={pickup?.address || ''} onSelect={setPickup} placeholder="Lieu de prise en charge" testId="route-edit-pickup" />
            )}
          </div>

          {/* Stops */}
          {stops.map((s, i) => (
            <div key={`edit-stop-${i}`} className="mb-3 flex items-end gap-1" data-testid={`route-edit-stop-${i}`}>
              <div className="flex-1 min-w-0">
                <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-400">Arrêt {i + 1}</label>
                <GooglePlacesInput value={s?.address || ''} onSelect={(p) => setStop(i, p)} placeholder="Arrêt intermédiaire" testId={`route-edit-stop-input-${i}`} />
              </div>
              <button onClick={() => removeStop(i)} className="p-2 text-gray-400 hover:text-red-500" data-testid={`route-edit-remove-stop-${i}`}><X size={16} /></button>
            </div>
          ))}

          {/* Dropoff */}
          <div className="mb-3">
            <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><FlagCheckered size={11} /> Destination</label>
            <GooglePlacesInput value={dropoff?.address || ''} onSelect={setDropoff} placeholder="Où allez-vous ?" testId="route-edit-dropoff" />
          </div>

          <button onClick={addStop} className="text-sm font-semibold text-blue-600 flex items-center gap-1 mb-5" data-testid="route-edit-add-stop">
            <Plus size={16} weight="bold" /> Ajouter un arrêt
          </button>

          <button onClick={save} disabled={saving} data-testid="route-edit-save"
            className="w-full py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: '#FFC107', color: '#0B1426' }}>
            <Check size={20} weight="bold" /> {saving ? 'Mise à jour…' : 'Valider les modifications'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RouteEditModal;
