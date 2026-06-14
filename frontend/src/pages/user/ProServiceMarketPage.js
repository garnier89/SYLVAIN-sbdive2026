/**
 * ProServiceMarketPage — marketplace de services à la demande, générique par verticale.
 * Utilisé pour `beauty` (rose) et `trades` (ambre). Catalogue → réservation
 * (domicile/sur place, prestataire, créneau, SB Pay/espèces) → Mes rendez-vous.
 * Carte « meilleur prestataire » (note + avis + prochains créneaux) pour la confiance.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, MagnifyingGlass, Scissors, Sparkle, HandSoap, Drop, PaintBrush, Eye,
  Wrench, Lightning, Bank, Hammer, PaintRoller, Toolbox, Broom, Plant, CookingPot, Gear,
  CircleNotch, Star, CheckCircle, ClockCounterClockwise, CaretRight, House, Storefront,
  X, Wallet, Money,
} from '@phosphor-icons/react';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const CAT_ICON = {
  coiffure: Scissors, visage: Sparkle, corps: HandSoap, epilation: Drop, onglerie: PaintBrush, maquillage: PaintBrush, regard: Eye,
  plomberie: Wrench, electricite: Lightning, maconnerie: Bank, menuiserie: Hammer, peinture: PaintRoller,
  bricolage: Toolbox, menage: Broom, jardinage: Plant, cuisine: CookingPot, mecanique: Gear,
};
const SLOTS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const STATUS_LABEL = { pending: 'En attente', confirmed: 'Confirmé', in_progress: 'En cours', completed: 'Terminé', cancelled: 'Annulé' };
const ACCENT = {
  pink: { grad: 'from-pink-500 to-rose-600', solid: 'bg-pink-600', text: 'text-pink-600', soft: 'bg-pink-50', icon: 'text-pink-500', iconBg: 'bg-pink-50', tint: 'bg-pink-100', ring: 'border-pink-500 bg-pink-50', spin: 'text-pink-300' },
  amber: { grad: 'from-amber-500 to-orange-600', solid: 'bg-amber-600', text: 'text-amber-600', soft: 'bg-amber-50', icon: 'text-amber-600', iconBg: 'bg-amber-50', tint: 'bg-amber-100', ring: 'border-amber-500 bg-amber-50', spin: 'text-amber-300' },
};

const Stars = ({ value, size = 14 }) => (
  <span className="inline-flex items-center gap-0.5 text-amber-400">
    <Star size={size} weight="fill" /><span className="text-gray-600 text-xs font-semibold">{value}</span>
  </span>
);

const ProServiceMarketPage = ({ vertical = 'beauty' }) => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const base = `${API}/api/pro-services/${vertical}`;
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [screen, setScreen] = useState('shop');
  const [providers, setProviders] = useState([]);
  const [best, setBest] = useState(null);
  const [nextSlots, setNextSlots] = useState([]);
  const [active, setActive] = useState(null);
  const [form, setForm] = useState({ at_home: false, address: '', provider_id: '', date: '', time: '', payment: 'sbpay' });
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [bookings, setBookings] = useState({ upcoming: [], past: [] });
  const [reviewFor, setReviewFor] = useState(null);
  const [review, setReview] = useState({ rating: 5, comment: '' });

  const c = ACCENT[cfg?.accent] || ACCENT.pink;
  const hasHome = (cfg?.home_surcharge ?? 0) > 0;

  useEffect(() => {
    setLoading(true);
    fetch(`${base}/config`).then(r => r.json()).then(d => { setCfg(d); setLoading(false); }).catch(() => setLoading(false));
  }, [base]);

  const services = (cfg?.services || []).filter(s =>
    (!category || s.category === category) &&
    (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())));

  const openBooking = async (svc) => {
    setActive(svc);
    setForm({ at_home: false, address: '', provider_id: '', date: '', time: '', payment: 'sbpay' });
    setBest(null); setNextSlots([]);
    setScreen('book');
    try {
      const r = await fetch(`${base}/providers?category=${svc.category}`);
      const list = await r.json();
      setProviders(list);
      if (list.length) {
        setBest(list[0]);
        fetch(`${base}/providers/${list[0].id}/next-slots`).then(r => r.json()).then(d => setNextSlots(d.slots || [])).catch(() => {});
      }
    } catch { setProviders([]); }
  };

  const refreshEstimate = useCallback(async (svc, at_home) => {
    if (!svc) return;
    try {
      const r = await fetch(`${base}/estimate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ service_id: svc.id, at_home }),
      });
      setEstimate(await r.json());
    } catch { /* */ }
  }, [base]);
  useEffect(() => { if (screen === 'book' && active) refreshEstimate(active, form.at_home); }, [screen, active, form.at_home, refreshEstimate]);

  const quickPick = (providerId, date, time) => setForm(f => ({ ...f, provider_id: providerId, date, time }));

  const submit = async () => {
    if (!form.date || !form.time) { toast.error('Choisissez une date et un créneau'); return; }
    if (form.at_home && !form.address.trim()) { toast.error('Indiquez votre adresse'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${base}/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          service_id: active.id, at_home: form.at_home, address: form.address,
          provider_id: form.provider_id || null, scheduled_date: form.date,
          scheduled_time: form.time, payment_method: form.payment,
        }),
      });
      const data = await r.json();
      if (r.ok) { setDone(data); setScreen('done'); } else toast.error(data.detail || 'Échec de la réservation');
    } catch { toast.error('Erreur réseau'); } finally { setSubmitting(false); }
  };

  const openBookings = async () => {
    setScreen('bookings');
    try { const r = await fetch(`${base}/bookings`, { credentials: 'include' }); setBookings(await r.json()); } catch { /* */ }
  };
  const cancelBooking = async (id) => {
    try {
      const r = await fetch(`${base}/bookings/${id}/cancel`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) { toast.success('Réservation annulée'); openBookings(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };
  const submitReview = async () => {
    try {
      const r = await fetch(`${base}/bookings/${reviewFor.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(review),
      });
      const d = await r.json();
      if (r.ok) { toast.success('Merci pour votre avis !'); setReviewFor(null); openBookings(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };

  // ── Done ──
  if (screen === 'done' && done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center" data-testid="pro-done">
        <div className={`w-20 h-20 rounded-full ${c.soft} flex items-center justify-center mb-5`}><CheckCircle size={48} weight="fill" className={c.icon} /></div>
        <h1 className="text-xl font-bold text-gray-900">Réservation confirmée !</h1>
        <p className="text-sm text-gray-500 mt-2">{done.service_name} · {done.scheduled_date} à {done.scheduled_time}. {done.status === 'pending' ? 'Un prestataire va accepter votre demande.' : 'Votre prestataire est confirmé.'}</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full mt-5 flex justify-between text-sm"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900">{money(Number(done.total))}</span></div>
        <button onClick={() => { setDone(null); setScreen('shop'); }} className={`w-full mt-5 ${c.solid} text-white py-3.5 rounded-xl font-semibold text-sm`} data-testid="done-back-shop">Retour aux services</button>
        <button onClick={openBookings} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="done-my-bookings">Voir mes rendez-vous</button>
      </div>
    );
  }

  // ── My bookings ──
  if (screen === 'bookings') {
    const Row = ({ b }) => (
      <div className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`booking-${b.id}`}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-900 text-sm">{b.service_name}</p>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${b.status === 'cancelled' ? 'bg-rose-50 text-rose-600' : b.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : `${c.soft} ${c.text}`}`}>{STATUS_LABEL[b.status]}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{b.scheduled_date} à {b.scheduled_time} · {b.at_home ? 'À domicile' : 'Sur place'}{b.provider_name ? ` · ${b.provider_name}` : ''}</p>
        <div className="flex justify-between items-center mt-2">
          <span className="font-bold text-gray-900 text-sm">{money(Number(b.total))}</span>
          <div className="flex gap-2">
            {['pending', 'confirmed'].includes(b.status) && <button onClick={() => cancelBooking(b.id)} className="text-xs font-semibold text-rose-600 px-2 py-1" data-testid={`cancel-${b.id}`}>Annuler</button>}
            {b.status === 'completed' && !b.reviewed && <button onClick={() => { setReviewFor(b); setReview({ rating: 5, comment: '' }); }} className={`text-xs font-semibold ${c.text} px-2 py-1 ${c.soft} rounded-lg`} data-testid={`review-${b.id}`}>Laisser un avis</button>}
          </div>
        </div>
      </div>
    );
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="pro-bookings">
        <Header title="Mes rendez-vous" onBack={() => setScreen('shop')} />
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">À venir</p>
            {bookings.upcoming.length === 0 ? <Empty text="Aucun rendez-vous à venir" /> : <div className="space-y-3">{bookings.upcoming.map(b => <Row key={b.id} b={b} />)}</div>}
          </div>
          {bookings.past.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Historique</p>
              <div className="space-y-3">{bookings.past.map(b => <Row key={b.id} b={b} />)}</div>
            </div>
          )}
        </div>
        {reviewFor && (
          <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={() => setReviewFor(null)}>
            <div className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-5" onClick={e => e.stopPropagation()} data-testid="review-sheet">
              <p className="font-bold text-gray-900">Votre avis sur {reviewFor.service_name}</p>
              <div className="flex gap-2 my-4 justify-center">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setReview({ ...review, rating: n })} data-testid={`star-${n}`}>
                    <Star size={32} weight={n <= review.rating ? 'fill' : 'regular'} className="text-amber-400" />
                  </button>
                ))}
              </div>
              <textarea value={review.comment} onChange={e => setReview({ ...review, comment: e.target.value })} placeholder="Un commentaire ? (facultatif)" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" rows={3} data-testid="review-comment" />
              <button onClick={submitReview} className={`w-full mt-3 ${c.solid} text-white py-3.5 rounded-xl font-semibold text-sm`} data-testid="submit-review">Envoyer mon avis</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Booking flow ──
  if (screen === 'book' && active) {
    const cashDisabled = active.online_only;
    const sel = (on) => on ? `${c.solid} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200';
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="pro-book">
        <Header title="Réserver" onBack={() => setScreen('shop')} />
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4">
            <p className="font-bold text-gray-900">{active.name}</p>
            <p className="text-sm text-gray-500">{active.duration_min} min · à partir de {money(active.price)}</p>
            {active.online_only && <span className="inline-block mt-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">Paiement en ligne requis</span>}
          </div>

          {/* Meilleur prestataire + prochains créneaux */}
          {best && (
            <div className="bg-white rounded-2xl p-4" data-testid="best-provider-card">
              <div className="flex items-center gap-3">
                {best.photo ? <img src={best.photo} alt={best.name} className="w-12 h-12 rounded-full object-cover" /> : <div className={`w-12 h-12 rounded-full ${c.tint}`} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><span className={`text-[10px] font-bold ${c.text} ${c.soft} px-1.5 py-0.5 rounded`}>TOP</span><p className="font-bold text-gray-900 text-sm truncate">{best.name}</p></div>
                  <p className="text-xs text-gray-500 mt-0.5">⭐ {best.rating} · {best.reviews_count} avis</p>
                </div>
              </div>
              {nextSlots.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] tracking-wide uppercase font-bold text-gray-400 mb-1.5">Prochains créneaux dispo</p>
                  <div className="flex gap-2 flex-wrap">
                    {nextSlots.map((s, i) => (
                      <button key={i} onClick={() => quickPick(best.id, s.date, s.time)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${form.provider_id === best.id && form.date === s.date && form.time === s.time ? sel(true) : 'bg-white text-gray-700 border-gray-200'}`} data-testid={`quick-slot-${i}`}>{s.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lieu */}
          {hasHome && (
            <div className="bg-white rounded-2xl p-4">
              <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Lieu</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ ...form, at_home: false })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${sel(!form.at_home)}`} data-testid="loc-salon"><Storefront size={16} /> Sur place</button>
                <button onClick={() => setForm({ ...form, at_home: true })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${sel(form.at_home)}`} data-testid="loc-home"><House size={16} /> À domicile (+{cfg?.home_surcharge}€)</button>
              </div>
              {form.at_home && <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Adresse de la prestation" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-2" data-testid="book-address" />}
            </div>
          )}
          {!hasHome && (
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Adresse de l'intervention" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="book-address" />
          )}

          {/* Prestataire */}
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Prestataire</p>
            <button onClick={() => setForm({ ...form, provider_id: '' })} className={`w-full flex items-center gap-3 p-2 rounded-xl border mb-2 ${!form.provider_id ? c.ring : 'border-gray-200'}`} data-testid="prov-any">
              <div className={`w-10 h-10 rounded-full ${c.tint} flex items-center justify-center`}><Sparkle size={18} className={c.text} weight="fill" /></div>
              <div className="text-left flex-1"><p className="text-sm font-semibold text-gray-900">Premier disponible</p><p className="text-xs text-gray-400">Un pro accepte votre demande</p></div>
            </button>
            {providers.map(p => (
              <button key={p.id} onClick={() => setForm({ ...form, provider_id: p.id })} className={`w-full flex items-center gap-3 p-2 rounded-xl border mb-2 ${form.provider_id === p.id ? c.ring : 'border-gray-200'}`} data-testid={`prov-${p.id}`}>
                {p.photo ? <img src={p.photo} alt={p.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gray-100" />}
                <div className="text-left flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p><Stars value={p.rating} /></div>
              </button>
            ))}
          </div>

          {/* Date & créneau */}
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Date & créneau</p>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} min={new Date().toISOString().split('T')[0]} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-2" data-testid="book-date" />
            <div className="grid grid-cols-3 gap-2">
              {SLOTS.map(s => (
                <button key={s} onClick={() => setForm({ ...form, time: s })} className={`py-2 rounded-lg text-sm font-semibold border ${sel(form.time === s)}`} data-testid={`slot-${s}`}>{s}</button>
              ))}
            </div>
          </div>

          {/* Paiement */}
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Paiement</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm({ ...form, payment: 'sbpay' })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${sel(form.payment === 'sbpay')}`} data-testid="pay-sbpay"><Wallet size={16} /> SB Pay</button>
              <button disabled={cashDisabled} onClick={() => setForm({ ...form, payment: 'cash' })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 ${sel(form.payment === 'cash')}`} data-testid="pay-cash"><Money size={16} /> Espèces</button>
            </div>
            {cashDisabled && <p className="text-[11px] text-violet-600 mt-1.5">Cette prestation se règle en ligne.</p>}
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">Total {form.at_home ? '(domicile inclus)' : ''}</span><span className="font-bold" data-testid="book-total">{money(Number(estimate?.total ?? active.price))}</span></div>
          <button onClick={submit} disabled={submitting} className={`w-full py-4 rounded-xl font-bold text-white ${c.solid} disabled:opacity-60`} data-testid="confirm-booking">{submitting ? 'Réservation…' : `${form.payment === 'sbpay' ? 'Payer & réserver' : 'Réserver'} · ${(estimate?.total ?? active.price).toFixed(2)}€`}</button>
        </div>
      </div>
    );
  }

  // ── Shop ──
  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-6" data-testid="pro-market-page">
      <div className={`bg-gradient-to-br ${c.grad} px-4 pt-4 pb-5`}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">{cfg?.label || 'Services'}</h1>
          <button onClick={() => navigate(`/pro/${vertical}`)} className="text-white text-xs font-semibold bg-white/15 px-2.5 py-1.5 rounded-full" data-testid="provider-space-link">Je suis pro</button>
          <button onClick={openBookings} className="text-white" data-testid="my-bookings-btn"><ClockCounterClockwise size={22} /></button>
        </div>
        <div className="bg-white rounded-xl flex items-center px-3 py-2.5">
          <MagnifyingGlass size={18} className="text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une prestation…" className="flex-1 ml-2 text-sm outline-none" data-testid="search-input" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" data-testid="category-chips">
          <button onClick={() => setCategory('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${!category ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="cat-all">Tout</button>
          {(cfg?.categories || []).map(cat => {
            const Ic = CAT_ICON[cat.id] || Sparkle;
            return (
              <button key={cat.id} onClick={() => setCategory(category === cat.id ? '' : cat.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1 ${category === cat.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid={`cat-${cat.id}`}>
                <Ic size={13} weight="fill" /> {cat.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><CircleNotch size={28} className={`${c.spin} animate-spin`} /></div>
        ) : services.length === 0 ? <Empty text="Aucune prestation trouvée" /> : (
          <div className="space-y-2" data-testid="service-list">
            {services.map(s => (
              <button key={s.id} onClick={() => openBooking(s)} className="w-full bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3 text-left" data-testid={`service-${s.id}`}>
                <div className={`w-11 h-11 rounded-xl ${c.iconBg} flex items-center justify-center flex-shrink-0`}>
                  {React.createElement(CAT_ICON[s.category] || Sparkle, { size: 20, weight: 'fill', className: c.icon })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.duration_min} min{s.online_only ? ' · en ligne' : ''}</p>
                </div>
                <div className="text-right">
                  <p className={`font-black ${c.text} text-sm`}>{money(s.price)}</p>
                  <CaretRight size={16} className="text-gray-300 ml-auto" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="pro-market-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold truncate">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-400">{text}</div>
);

export default ProServiceMarketPage;
