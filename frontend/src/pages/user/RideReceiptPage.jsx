/**
 * RideReceiptPage — "Résumé de paiement" (V3Cube invoice) shown when a ride
 * completes: full fare breakdown + payment mode + inline driver rating
 * (stars, favourite toggle, comment, Sauter / Soumettre).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Star, Heart, CheckCircle, Gift, ShareNetwork, X } from '@phosphor-icons/react';
import { rideAPI } from '../../services/api';

const API = process.env.REACT_APP_BACKEND_URL;
const PAYMENT_LABELS = { cash: 'Espèces', card: 'Carte', sbpaygo: 'SB PayGo', wallet: 'Portefeuille' };

const Line = ({ label, sub, value, strong }) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <p className={`text-sm ${strong ? 'font-extrabold text-gray-900' : 'text-gray-600'}`}>{label}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
    <p className={`text-sm ${strong ? 'font-extrabold text-gray-900' : 'font-semibold text-gray-700'}`}>{value}</p>
  </div>
);

const RideReceiptPage = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);
  const [stars, setStars] = useState(5);
  const [favorite, setFavorite] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [referral, setReferral] = useState(null);
  const [reviewPrompt, setReviewPrompt] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewMode, setReviewMode] = useState('rate'); // 'rate' | 'feedback'
  const [reviewComment, setReviewComment] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await rideAPI.get(rideId); setRide(data); }
    catch { toast.error('Course introuvable'); navigate('/home'); }
  }, [rideId, navigate]);
  useEffect(() => { load(); }, [load]);

  // Referral banner data + store-review prompt eligibility (viral / conversion)
  useEffect(() => {
    fetch(`${API}/api/referral/my-code`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setReferral(d); }).catch(() => {});
    fetch(`${API}/api/config/review-prompt`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setReviewPrompt(d); if (d.show) setShowReview(true); } })
      .catch(() => {});
  }, []);

  const shareReferral = () => {
    if (!referral?.code) return;
    const text = `Rejoignez SB Drive VTC avec mon code ${referral.code} et gagnez ${referral.amount_per_referral}${referral.currency} de bonus !`;
    if (navigator.share) {
      navigator.share({ title: 'SB Drive VTC', text, url: window.location.origin }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(referral.code);
      toast.success('Code copié !');
    }
  };

  const markReviewSeen = () => {
    fetch(`${API}/api/config/review-prompt/seen`, { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  const pickReviewStars = (s) => {
    setReviewStars(s);
    if (s >= 4) {
      markReviewSeen();
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '');
      const url = (isIOS ? reviewPrompt?.ios_url : reviewPrompt?.android_url) || reviewPrompt?.android_url || reviewPrompt?.ios_url;
      if (url) window.open(url, '_blank', 'noopener');
      setShowReview(false);
      toast.success('Merci ! Cela nous aide énormément 🙏');
    } else {
      setReviewMode('feedback');
    }
  };

  const submitReviewFeedback = () => {
    fetch(`${API}/api/config/review-prompt/feedback`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: reviewStars, comment: reviewComment.trim() }),
    }).catch(() => {});
    setShowReview(false);
    toast.success('Merci pour votre retour, nous allons nous améliorer.');
  };

  const dismissReview = () => { markReviewSeen(); setShowReview(false); };

  if (!ride) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gray-200 border-t-[#FF5000] rounded-full animate-spin" /></div>;
  }

  const fb = ride.fare_breakdown || {};
  const cur = (n) => `${(n || 0).toFixed(2)} €`;
  const total = fb.total != null ? fb.total : (ride.final_fare || ride.estimated_fare || 0);
  const dt = ride.completed_at ? new Date(ride.completed_at) : new Date();
  const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const submit = async (skip = false) => {
    if (!skip) {
      setSubmitting(true);
      try {
        await rideAPI.rate(rideId, { rating: stars, comment: comment.trim() || null, favorite_driver: favorite });
        toast.success('Merci pour votre évaluation !');
      } catch { toast.error("Échec de l'envoi"); setSubmitting(false); return; }
    }
    navigate('/home');
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="ride-receipt-page">
      {/* Header with total */}
      <div className="bg-[#0B1426] text-white px-5 pt-10 pb-8 text-center relative">
        <h1 className="text-base font-bold tracking-wide">Résumé de paiement</h1>
        <p className="text-5xl font-black mt-4 tracking-tight" data-testid="receipt-total">{cur(total)}</p>
        <p className="text-sm text-white/70 mt-2">Merci d&apos;utiliser notre service</p>
        {ride.booking_no && <p className="text-xs text-white/50 mt-1">Balade #{ride.booking_no}</p>}
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Route */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
              <span className="w-px h-7 bg-gray-200 my-1" />
              <span className="w-3.5 h-3.5 rounded-sm bg-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400">Lieu de ramassage</p>
              <p className="text-sm font-semibold text-gray-900 mb-3">{ride.pickup_address}</p>
              <p className="text-[11px] text-gray-400">Point de chute</p>
              <p className="text-sm font-semibold text-gray-900">{ride.dropoff_address}</p>
            </div>
          </div>
          <div className="h-px bg-gray-100 my-3" />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{dateStr}</span><span>à {timeStr}</span>
          </div>
        </div>

        {/* Charges */}
        <div className="bg-white rounded-2xl shadow-sm p-4" data-testid="receipt-charges">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Des charges</p>
          <p className="text-sm font-bold text-[#FF5000] capitalize mb-1">{fb.vehicle_label || ride.vehicle_type}</p>
          <Line label="Tarif de base" value={cur(fb.base_fare)} />
          <Line label="Distance" sub={`${(fb.distance_km || 0).toFixed(2)} km`} value={cur(fb.distance_charge)} />
          <Line label="Temps" sub={`${fb.time_seconds || 0} secondes`} value={cur(fb.time_charge)} />
          {fb.min_adjustment > 0 && <Line label="Le minimum" sub={cur(fb.min_fare)} value={cur(fb.min_adjustment)} />}
          <div className="h-px bg-gray-100 my-1" />
          <Line label="Total" value={cur(total)} strong />
        </div>

        {/* Payment mode */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Modes de paiement</p>
          <Line label={PAYMENT_LABELS[ride.payment_method] || ride.payment_method} value={cur(total)} />
        </div>

        {/* Ride profile / business trip reason (notes de frais) */}
        {ride.ride_profile && (
          <div className="bg-white rounded-2xl shadow-sm p-4" data-testid="receipt-ride-profile">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Profil de course</p>
            <Line label="Profil" value={ride.ride_profile} />
            {ride.business_trip_reason && <Line label="Motif professionnel" value={ride.business_trip_reason} />}
          </div>
        )}

        {/* Rating */}
        <div className="bg-white rounded-2xl shadow-sm p-5" data-testid="receipt-rating">
          <p className="text-center text-base font-bold text-gray-900 mb-4">Comment était ta balade ?</p>
          <div className="flex justify-center gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setStars(s)} data-testid={`star-${s}`} className="active:scale-90 transition-transform">
                <Star size={40} weight={s <= stars ? 'fill' : 'regular'} className={s <= stars ? 'text-amber-400' : 'text-gray-300'} />
              </button>
            ))}
          </div>
          <button onClick={() => setFavorite((v) => !v)} data-testid="favorite-toggle"
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold mb-3 transition-colors ${favorite ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-gray-200 text-gray-600'}`}>
            <Heart size={18} weight={favorite ? 'fill' : 'regular'} /> Pilote préféré
          </button>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Tapez pour écrire un commentaire..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none" data-testid="rating-comment" />
          <div className="flex gap-3 mt-4">
            <button onClick={() => submit(true)} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-bold" data-testid="skip-rating-btn">Sauter</button>
            <button onClick={() => submit(false)} disabled={submitting} className="flex-1 py-3 rounded-xl bg-[#FF5000] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60" data-testid="submit-rating-btn">
              <CheckCircle size={18} weight="fill" /> {submitting ? 'Envoi…' : 'Soumettre'}
            </button>
          </div>
        </div>

        {/* Referral banner — convert at the moment of satisfaction (viral loop) */}
        {referral?.code && (
          <div className="rounded-2xl p-4 shadow-sm bg-gradient-to-br from-[#FF5000] to-[#ff7a3d] text-white" data-testid="receipt-referral-banner">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Gift size={24} weight="fill" className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold leading-tight">Invitez un ami, gagnez {referral.amount_per_referral}{referral.currency}</p>
                <p className="text-[12px] text-white/85 mt-0.5">Votre code : <span className="font-bold tracking-wide" data-testid="receipt-referral-code">{referral.code}</span></p>
              </div>
              <button onClick={shareReferral} className="shrink-0 flex items-center gap-1.5 bg-white text-[#FF5000] font-extrabold text-sm px-4 py-2.5 rounded-full active:scale-95 transition-transform" data-testid="receipt-referral-share-btn">
                <ShareNetwork size={16} weight="bold" /> Inviter
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Store-review prompt — discreet bottom sheet after N completed rides */}
      {showReview && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/40" data-testid="store-review-sheet">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pb-8">
            <div className="flex items-start justify-between">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
              <button onClick={dismissReview} className="text-gray-400" data-testid="store-review-close"><X size={20} /></button>
            </div>
            {reviewMode === 'rate' ? (
              <div className="text-center">
                <h3 className="text-lg font-black text-[#0B1426]">Vous aimez SB Drive VTC ?</h3>
                <p className="text-sm text-gray-500 mt-1 mb-4">Donnez-nous votre avis, ça nous aide énormément.</p>
                <div className="flex justify-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => pickReviewStars(s)} data-testid={`store-review-star-${s}`} className="active:scale-90 transition-transform">
                      <Star size={38} weight={s <= reviewStars ? 'fill' : 'regular'} className={s <= reviewStars ? 'text-amber-400' : 'text-gray-300'} />
                    </button>
                  ))}
                </div>
                <button onClick={dismissReview} className="mt-3 w-full py-2.5 text-sm font-semibold text-gray-500" data-testid="store-review-later">Plus tard</button>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-black text-[#0B1426] text-center">Comment pouvons-nous nous améliorer ?</h3>
                <p className="text-sm text-gray-500 mt-1 mb-3 text-center">Votre retour va directement à notre équipe.</p>
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={4} placeholder="Dites-nous ce qui n'a pas été…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none" data-testid="store-review-feedback-input" />
                <button onClick={submitReviewFeedback} className="mt-4 w-full py-3.5 rounded-xl bg-[#0B1426] text-white font-bold" data-testid="store-review-feedback-submit">Envoyer mon retour</button>
                <button onClick={dismissReview} className="mt-2 w-full py-2.5 text-sm font-semibold text-gray-500" data-testid="store-review-feedback-skip">Plus tard</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RideReceiptPage;
