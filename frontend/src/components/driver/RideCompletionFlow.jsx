import React, { useState } from 'react';
import { toast } from 'sonner';
import { Money, CheckCircle, Star } from '@phosphor-icons/react';
import { rideAPI } from '../../services/api';

const Row = ({ label, value, strong, testId }) => (
  <div className={`flex items-center justify-between py-3 ${strong ? '' : 'border-b border-gray-100'}`}>
    <span className={`${strong ? 'text-gray-900 font-extrabold text-base' : 'text-gray-500 text-sm'}`}>{label}</span>
    <span className={`${strong ? 'text-gray-900 font-extrabold text-base' : 'text-gray-700 text-sm font-semibold'}`} data-testid={testId}>{value}</span>
  </div>
);

/**
 * RideCompletionFlow — V3Cube post-trip sequence:
 *   Frais supplémentaires → Facture détaillée (Collecte de paiement) → Laisser un
 *   commentaire (noter le passager) → "Course terminé".
 */
const RideCompletionFlow = ({ ride, waitingCharge = 0, onDone }) => {
  const [step, setStep] = useState('charges'); // charges | invoice | rate | success
  const [toll, setToll] = useState('');
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [confirmCharges, setConfirmCharges] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const cur = (n) => `${(Number(n) || 0).toFixed(2)} €`;

  const submitCharges = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const extra = {
        toll: parseFloat(toll) || 0,
        other: parseFloat(other) || 0,
        waiting: Number(waitingCharge) || 0,
        note: note || null,
      };
      await rideAPI.complete(ride.id, extra);
      const fresh = await rideAPI.get(ride.id);
      setBreakdown(fresh.data?.fare_breakdown || null);
      setConfirmCharges(false);
      setStep('invoice');
    } catch (e) {
      toast.error("Impossible de terminer la course. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const submitRating = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await rideAPI.ratePassenger(ride.id, { rating: rating || 5, comment: comment || null });
    } catch { /* non-blocking */ }
    setBusy(false);
    setStep('success');
  };

  const extrasTotal = (parseFloat(toll) || 0) + (parseFloat(other) || 0) + (Number(waitingCharge) || 0);
  const paymentLabel = ride.payment_method === 'cash' ? 'PAIEMENT EN ESPÈCES'
    : ride.payment_method === 'card' ? 'PAIEMENT PAR CARTE'
    : ride.payment_method === 'wallet' ? 'PAIEMENT PORTEFEUILLE'
    : ride.payment_method === 'sbpaygo' ? 'PAIEMENT SB PAYGO' : 'PAIEMENT';
  const collectCash = ride.payment_method === 'cash' || ride.payment_method === 'card';

  // ── STEP 1: Frais supplémentaires ───────────────────────────────────────
  if (step === 'charges') {
    return (
      <div className="fixed inset-0 z-[3000] bg-white flex flex-col" data-testid="extra-charges-screen">
        <div className="bg-[#0B0B0B] text-white text-center py-4 text-base font-bold">Frais supplémentaires</div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-sm font-bold text-gray-700">Frais de péage</label>
            <div className="flex items-center gap-2 mt-1 border border-gray-200 rounded-xl px-3 py-3">
              <span className="text-gray-500 font-bold">€</span>
              <input type="number" step="0.50" min="0" value={toll} onChange={(e) => setToll(e.target.value)} placeholder="0.00"
                className="flex-1 outline-none text-base font-semibold" data-testid="extra-toll-input" />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">Autres charges</label>
            <div className="flex items-center gap-2 mt-1 border border-gray-200 rounded-xl px-3 py-3">
              <span className="text-gray-500 font-bold">€</span>
              <input type="number" step="0.50" min="0" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0.00"
                className="flex-1 outline-none text-base font-semibold" data-testid="extra-other-input" />
            </div>
          </div>
          {waitingCharge > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 font-semibold" data-testid="extra-waiting-line">
              Attente : {cur(waitingCharge)}
            </div>
          )}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">Total des frais supplémentaires</span>
            <span className="text-base font-extrabold text-gray-900" data-testid="extra-total">{cur(extrasTotal)}</span>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Remarque (facultatif)…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" data-testid="extra-note-input" />
        </div>
        <div className="p-4 flex gap-3 border-t border-gray-100">
          <button onClick={submitCharges} disabled={busy} className="flex-1 py-3.5 rounded-2xl border border-gray-300 text-gray-700 font-bold disabled:opacity-50" data-testid="extra-skip-btn">Sauter</button>
          <button onClick={() => setConfirmCharges(true)} disabled={busy} className="flex-1 py-3.5 rounded-2xl text-white font-bold disabled:opacity-50" style={{ background: '#FF5000' }} data-testid="extra-submit-btn">Soumettre</button>
        </div>
        {confirmCharges && (
          <div className="absolute inset-0 z-[3100] bg-black/40 flex items-center justify-center p-6" data-testid="extra-confirm-dialog">
            <div className="bg-white rounded-2xl w-full max-w-sm p-5">
              <p className="text-base font-semibold text-gray-800 mb-5">Voulez-vous vraiment continuer avec des frais supplémentaires ?</p>
              <div className="flex justify-end gap-6">
                <button onClick={() => setConfirmCharges(false)} className="text-base font-bold text-gray-500" data-testid="extra-confirm-no">Non</button>
                <button onClick={submitCharges} disabled={busy} className="text-base font-bold text-emerald-600 disabled:opacity-50" data-testid="extra-confirm-yes">Oui</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── STEP 2: Facture détaillée + Collecte de paiement ────────────────────
  if (step === 'invoice') {
    const b = breakdown || {};
    const subtotal = b.subtotal ?? b.total ?? ride.final_fare ?? ride.estimated_fare ?? 0;
    const net = b.total_net ?? b.total ?? subtotal;
    const rounding = b.rounding ?? 0;
    const extra = b.extra_total || 0;
    const fareOnly = subtotal - extra;
    return (
      <div className="fixed inset-0 z-[3000] bg-[#0B0B0B] flex flex-col" data-testid="invoice-screen">
        <div className="text-white text-center pt-4 pb-2 text-lg font-semibold">Facture détaillée</div>
        <div className="text-center text-white text-4xl font-extrabold pb-3" data-testid="invoice-total-net">{cur(net)}</div>
        <div className="flex-1 bg-gray-100 rounded-t-3xl overflow-y-auto p-5">
          <div className="bg-white rounded-2xl p-5 text-center shadow-sm mb-4">
            <p className="text-gray-600">Merci d&apos;utiliser notre service</p>
            <p className="text-xl font-extrabold text-gray-900">Course #{(ride.booking_no || ride.id || '').toString().slice(-10)}</p>
          </div>
          <div className="space-y-3 mb-5 px-1">
            <div className="flex items-start gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-green-500 flex-shrink-0 mt-1" />
              <div><p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">Lieu de départ</p><p className="text-sm text-gray-800">{ride.pickup_address}</p></div>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 flex-shrink-0 mt-1" />
              <div><p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">Votre destination</p><p className="text-sm text-gray-800">{ride.dropoff_address}</p></div>
            </div>
          </div>
          <p className="text-lg font-extrabold text-gray-900 mb-2">DÉTAIL DE LA FACTURE</p>
          <div className="bg-white rounded-2xl px-4 py-2 shadow-sm">
            <p className="text-center text-xl font-extrabold text-gray-900 py-2">{b.vehicle_label || ride.vehicle_type || 'SB'}</p>
            <Row label="Tarif" value={cur(fareOnly)} testId="invoice-fare" />
            {extra > 0 && <Row label="Frais supplémentaires" value={cur(extra)} testId="invoice-extra" />}
            <Row label="Total" value={cur(subtotal)} testId="invoice-total" />
            <Row label="Arrondir" value={cur(rounding)} testId="invoice-rounding" />
            <Row label="Total net" value={cur(net)} strong testId="invoice-net" />
          </div>
        </div>
        <div className="bg-[#0B0B0B] px-5 pt-3 pb-2">
          <div className="flex items-center gap-3 text-white">
            <Money size={28} weight="fill" />
            <div>
              <p className="text-sm font-bold">{paymentLabel}</p>
              {collectCash && <p className="text-xs text-white/60">Veuillez percevoir le paiement du passager.</p>}
            </div>
          </div>
        </div>
        <button onClick={() => setStep('rate')} className="bg-[#0B0B0B] text-white text-base font-bold py-4 border-t border-white/10" data-testid="collect-payment-btn">
          COLLECTE DE PAIEMENT
        </button>
      </div>
    );
  }

  // ── STEP 3: Laisser un commentaire (noter le passager) ──────────────────
  if (step === 'rate') {
    return (
      <div className="fixed inset-0 z-[3000] bg-black/70 flex flex-col" data-testid="rate-passenger-screen">
        <div className="bg-[#0B0B0B] text-white text-center py-4 text-base font-bold">Laisser un commentaire</div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 mx-auto flex items-center justify-center mb-3 overflow-hidden">
              {ride.passenger_avatar ? <img src={ride.passenger_avatar} alt="" className="w-full h-full object-cover" /> : <Star size={28} className="text-gray-300" weight="fill" />}
            </div>
            <p className="text-lg font-extrabold text-gray-900 mb-3" data-testid="rate-passenger-name">{ride.passenger_name || 'Passager'}</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} data-testid={`rate-star-${n}`} aria-label={`${n} étoiles`}>
                  <Star size={34} weight="fill" className={n <= rating ? 'text-amber-400' : 'text-gray-300'} />
                </button>
              ))}
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Laissez un commentaire…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none mb-4" data-testid="rate-comment-input" />
            <button onClick={submitRating} disabled={busy} className="w-full py-3.5 rounded-2xl bg-[#0B0B0B] text-white font-bold disabled:opacity-50" data-testid="rate-submit-btn">Valider</button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 4: Course terminé ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[3000] bg-black/70 flex items-center justify-center p-6" data-testid="ride-complete-success">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center">
        <CheckCircle size={72} weight="fill" className="text-[#0B0B0B] mx-auto mb-3" />
        <p className="text-2xl font-extrabold text-gray-900 mb-2">Course terminé</p>
        <p className="text-sm text-gray-500 mb-5">Vous pouvez laisser un avis sur le Play Store ou l&apos;Apple Store. À bientôt.</p>
        <button onClick={onDone} className="w-full py-3.5 rounded-2xl bg-[#0B0B0B] text-white font-bold" data-testid="success-ok-btn">D&apos;accord merci</button>
      </div>
    </div>
  );
};

export default RideCompletionFlow;
