/**
 * RentalDriverFlow — driver experience for "Mise à disposition" (rental).
 * Phases: arriving (go to pickup) → meter running (live timer, add stops) → end (enter km) → complete.
 * Billing = package price + time/km overage (computed server-side on completion).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Clock, MapPin, Plus, Flag, X, ArrowLineDown, Phone } from '@phosphor-icons/react';
import { rideAPI } from '../../services/api';

const fmtDuration = (mins) => {
  const m = Math.max(0, Math.floor(mins));
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const money = (n) => `${Number(n || 0).toFixed(2)} €`;

const RentalDriverFlow = ({ ride, onFinished, onMinimize }) => {
  const [startedAt, setStartedAt] = useState(ride.rental_started_at || null);
  const [stops, setStops] = useState(ride.stops || []);
  const [nowTick, setNowTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [stopText, setStopText] = useState('');
  const [ending, setEnding] = useState(false);
  const [kmInput, setKmInput] = useState(String(ride.rental_km_included || 0));
  const intervalRef = useRef(null);

  const hoursInc = Number(ride.rental_hours_included || 0);
  const kmInc = Number(ride.rental_km_included || 0);
  const hrRate = Number(ride.rental_extra_hour_rate || 0);
  const kmRate = Number(ride.rental_extra_km_rate || 0);
  const pkgPrice = Number(ride.rental_package_price || ride.estimated_fare || 0);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const elapsedMin = startedAt ? Math.max(0, (nowTick - new Date(startedAt).getTime()) / 60000) : 0;
  const overageMin = Math.max(0, elapsedMin - hoursInc * 60);
  const liveOverageFee = (overageMin / 60) * hrRate; // km overage added at the end
  const projected = pkgPrice + liveOverageFee;

  const start = async () => {
    setBusy(true);
    try {
      const r = await rideAPI.rentalStart(ride.id);
      setStartedAt(r.data.rental_started_at);
      toast.success('Mise à disposition démarrée');
    } catch { toast.error('Impossible de démarrer'); }
    finally { setBusy(false); }
  };

  const addStop = async () => {
    if (!stopText.trim()) return;
    setBusy(true);
    try {
      const r = await rideAPI.rentalAddStop(ride.id, { address: stopText.trim() });
      setStops(r.data.stops);
      setStopText(''); setAddingStop(false);
      toast.success('Arrêt ajouté');
    } catch { toast.error('Échec ajout arrêt'); }
    finally { setBusy(false); }
  };

  const end = async () => {
    const km = parseFloat(kmInput);
    if (isNaN(km) || km < 0) return toast.error('Saisissez le kilométrage');
    setBusy(true);
    try {
      await rideAPI.rentalEnd(ride.id, km);
      await rideAPI.complete(ride.id, {});
      toast.success('Mise à disposition terminée');
      onFinished?.();
    } catch (e) { toast.error('Échec de la clôture'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-gradient-to-b from-[#0B1426] to-[#1E293B] text-white flex flex-col" data-testid="rental-driver-flow">
      <div className="flex items-center justify-between px-4 pt-12 pb-3">
        <span className="flex items-center gap-2 font-black text-lg"><Clock size={22} weight="fill" className="text-[#F59E0B]" /> Mise à disposition</span>
        {onMinimize && (
          <button onClick={onMinimize} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" data-testid="rental-minimize"><ArrowLineDown size={18} /></button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {/* Client + pickup */}
        <div className="bg-white/5 rounded-2xl p-3 mb-3">
          <p className="text-xs text-white/50 mb-1">Client</p>
          <div className="flex items-center justify-between">
            <span className="font-bold">{ride.user_name || ride.passenger_name || 'Client'}</span>
            {ride.user_phone && (
              <a href={`tel:${ride.user_phone}`} className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center" data-testid="rental-call"><Phone size={16} weight="fill" /></a>
            )}
          </div>
          <p className="text-sm text-white/70 mt-2 flex items-start gap-1.5"><MapPin size={15} weight="fill" className="text-emerald-400 mt-0.5 shrink-0" /> {ride.pickup_address}</p>
        </div>

        {/* Package summary */}
        <div className="bg-white/5 rounded-2xl p-3 mb-3 grid grid-cols-2 gap-2 text-center">
          <div><p className="text-[11px] text-white/50">Forfait</p><p className="font-black text-[#F59E0B]">{hoursInc}h · {kmInc} km</p></div>
          <div><p className="text-[11px] text-white/50">Prix forfait</p><p className="font-black">{money(pkgPrice)}</p></div>
        </div>

        {!startedAt ? (
          <p className="text-center text-white/60 text-sm mt-6 mb-2">Rejoignez le client puis démarrez le compteur.</p>
        ) : (
          <>
            {/* Live meter */}
            <div className="bg-white rounded-2xl p-4 mb-3 text-center text-[#0B1426]" data-testid="rental-meter">
              <p className="text-xs text-gray-400 font-semibold">Temps écoulé</p>
              <p className={`text-5xl font-black tabular-nums ${overageMin > 0 ? 'text-[#FF5000]' : 'text-[#0B1426]'}`} data-testid="rental-timer">{fmtDuration(elapsedMin)}</p>
              <p className="text-[11px] text-gray-400 mt-1">sur {hoursInc}h inclus{overageMin > 0 ? ` · +${fmtDuration(overageMin)} en supplément` : ''}</p>
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-[11px] text-gray-400">Suppl. temps</p><p className="font-bold text-[#FF5000]" data-testid="rental-overage-fee">{money(liveOverageFee)}</p></div>
                <div><p className="text-[11px] text-gray-400">Total projeté</p><p className="font-black" data-testid="rental-projected">{money(projected)}</p></div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">+ km supplémentaires ({money(kmRate)}/km au-delà de {kmInc} km) calculés à la clôture.</p>
            </div>

            {/* Stops */}
            <div className="bg-white/5 rounded-2xl p-3 mb-3">
              <p className="text-xs font-bold mb-2">Arrêts ({stops.length})</p>
              {stops.map((s, i) => (
                <p key={i} className="text-sm text-white/80 flex items-start gap-1.5 mb-1" data-testid={`rental-stop-item-${i}`}>
                  <MapPin size={14} weight="fill" className="text-[#F59E0B] mt-0.5 shrink-0" /> {s.address}
                </p>
              ))}
              {addingStop ? (
                <div className="flex gap-2 mt-2">
                  <input value={stopText} onChange={(e) => setStopText(e.target.value)} placeholder="Adresse de l'arrêt" className="flex-1 rounded-lg px-3 py-2 text-sm text-[#0B1426]" data-testid="rental-stop-input" autoFocus />
                  <button onClick={addStop} disabled={busy} className="px-3 rounded-lg bg-[#F59E0B] font-bold text-sm" data-testid="rental-stop-confirm">OK</button>
                  <button onClick={() => { setAddingStop(false); setStopText(''); }} className="w-9 rounded-lg bg-white/10 flex items-center justify-center"><X size={16} /></button>
                </div>
              ) : (
                <button onClick={() => setAddingStop(true)} className="w-full mt-2 py-2 rounded-lg border border-dashed border-white/30 text-sm font-semibold flex items-center justify-center gap-1.5" data-testid="rental-add-stop-btn">
                  <Plus size={15} /> Ajouter un arrêt
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom action */}
      <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[#0B1426] to-transparent">
        {!startedAt ? (
          <button onClick={start} disabled={busy} className="w-full py-4 rounded-2xl bg-[#F59E0B] text-[#0B1426] font-black text-lg active:scale-95 transition-transform disabled:opacity-50" data-testid="rental-start-btn">
            Démarrer la mise à disposition
          </button>
        ) : ending ? (
          <div className="bg-white rounded-2xl p-4 text-[#0B1426]" data-testid="rental-end-panel">
            <label className="text-sm font-bold flex items-center gap-1.5 mb-2"><Flag size={16} weight="fill" className="text-[#FF5000]" /> Kilométrage total parcouru</label>
            <input type="number" value={kmInput} onChange={(e) => setKmInput(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1" data-testid="rental-km-input" />
            <p className="text-[11px] text-gray-400 mb-3">{kmInc} km inclus · {money(kmRate)}/km au-delà</p>
            <div className="flex gap-2">
              <button onClick={() => setEnding(false)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-sm">Annuler</button>
              <button onClick={end} disabled={busy} className="flex-1 py-3 rounded-xl bg-[#FF5000] text-white font-black text-sm disabled:opacity-50" data-testid="rental-end-confirm">Terminer & facturer</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEnding(true)} className="w-full py-4 rounded-2xl bg-[#FF5000] text-white font-black text-lg active:scale-95 transition-transform" data-testid="rental-end-btn">
            Terminer la mise à disposition
          </button>
        )}
      </div>
    </div>
  );
};

export default RentalDriverFlow;
