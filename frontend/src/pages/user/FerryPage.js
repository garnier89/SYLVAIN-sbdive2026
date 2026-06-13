import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft, Boat, ArrowsDownUp, CalendarBlank, Minus, Plus, Clock,
  ArrowRight, Ticket, CheckCircle, Car, Anchor, CircleNotch, Users, Coins, CreditCard,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ferryAPI } from '../../services/api';

const SEA = '#0EA5E9';
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }); } catch { return s; } };
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
const cleanPort = (label) => (label || '').replace(/\s*\(.*?\)\s*$/, '').trim();

const Stepper = ({ label, sub, value, onChange, min = 0 }) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <p className="font-semibold text-slate-800 text-sm">{label}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} data-testid={`ferry-${label}-minus`}
        className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center disabled:opacity-30 active:scale-95"><Minus size={14} weight="bold" /></button>
      <span className="w-5 text-center font-bold" data-testid={`ferry-${label}-val`}>{value}</span>
      <button onClick={() => onChange(value + 1)} data-testid={`ferry-${label}-plus`}
        className="w-8 h-8 rounded-full text-white flex items-center justify-center active:scale-95" style={{ background: SEA }}><Plus size={14} weight="bold" /></button>
    </div>
  </div>
);

export default function FerryPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('search'); // search | results | passengers | ticket
  const [ports, setPorts] = useState([]);
  const [form, setForm] = useState({ from: '', to: '', date: todayStr(), adults: 1, children: 0 });
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState({ route: null, time: '' });
  const [booking, setBooking] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState('sbpay'); // sbpay | cash | card
  const [myTickets, setMyTickets] = useState(null); // null=hidden, [] or list when shown

  useEffect(() => { ferryAPI.ports().then((r) => setPorts(r.data.ports || [])).catch(() => {}); }, []);

  // Return from Stripe Checkout (?ferry_session=...) → confirm and show the ticket.
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('ferry_session');
    if (!sid) return;
    setPaying(true);
    ferryAPI.stripeStatus(sid)
      .then((r) => {
        if (r.data?.payment_status === 'paid' && r.data?.booking) {
          setBooking(r.data.booking); setStep('ticket');
        } else {
          toast.error('Paiement non confirmé.');
        }
      })
      .catch(() => toast.error('Paiement non confirmé.'))
      .finally(() => { setPaying(false); window.history.replaceState({}, '', '/ferry'); });
  }, []);

  const portName = useCallback((id) => {
    const p = ports.find((x) => x.id === id);
    return p ? `${p.city} (${p.island})` : '';
  }, [ports]);

  const swap = () => setForm((f) => ({ ...f, from: f.to, to: f.from }));

  const search = async () => {
    setSearching(true);
    try {
      const params = {};
      if (form.from) params.from_port = form.from;
      if (form.to) params.to_port = form.to;
      const r = await ferryAPI.routes(params);
      setResults(r.data.routes || []);
      setStep('results');
    } catch { toast.error('Recherche impossible'); } finally { setSearching(false); }
  };

  const total = useMemo(() => {
    if (!pick.route) return 0;
    return Math.round((form.adults * pick.route.price_adult + form.children * pick.route.price_child) * 100) / 100;
  }, [pick.route, form.adults, form.children]);

  const confirm = async () => {
    setPaying(true);
    try {
      if (payMethod === 'card') {
        const r = await ferryAPI.stripeCheckout({
          route_id: pick.route.id, adults: form.adults, children: form.children,
          travel_date: form.date, departure_time: pick.time,
          origin_url: window.location.origin,
        });
        if (r.data?.url) { window.location.href = r.data.url; return; }
        toast.error('Paiement carte indisponible');
        return;
      }
      const r = await ferryAPI.book({
        route_id: pick.route.id, adults: form.adults, children: form.children,
        travel_date: form.date, departure_time: pick.time, payment_method: payMethod,
      });
      setBooking(r.data);
      setStep('ticket');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Réservation impossible');
    } finally { setPaying(false); }
  };

  const goVtcToPort = () => {
    const dest = cleanPort(booking.from_label);
    navigate('/course?mode=standard', { state: { prefill: { dropoff: dest }, source: 'voice' } });
  };

  const loadTickets = () => { ferryAPI.myBookings().then((r) => setMyTickets(r.data.bookings || [])).catch(() => setMyTickets([])); };

  // ---- Header ----
  const Header = ({ title, back }) => (
    <div className="sticky top-0 z-20 bg-white/90 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-slate-100">
      <button onClick={back} data-testid="ferry-back" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center active:scale-95"><ArrowLeft size={18} weight="bold" /></button>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: SEA }}><Boat size={18} weight="fill" /></span>
        <h1 className="text-lg font-extrabold text-slate-900">{title}</h1>
      </div>
    </div>
  );

  // ================= SEARCH =================
  if (step === 'search') {
    return (
      <div className="min-h-screen bg-slate-50 pb-10" data-testid="ferry-page">
        <Header title="SB Ferry" back={() => navigate('/home')} />
        <div className="relative h-36 overflow-hidden flex items-end" style={{ background: `linear-gradient(135deg, ${SEA}, #0369A1)` }}>
          <Anchor size={120} weight="fill" className="absolute -right-4 -top-4 text-white/10" />
          <div className="relative p-4 text-white">
            <p className="text-xl font-extrabold leading-tight">Votre billet de bateau</p>
            <p className="text-sm text-white/85">Inter-îles & navettes locales aux Antilles</p>
          </div>
        </div>

        <div className="p-4 -mt-6 relative">
          <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Départ</label>
              <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} data-testid="ferry-from"
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm font-medium bg-slate-50">
                <option value="">Tous les ports</option>
                {ports.map((p) => <option key={p.id} value={p.id}>{p.city} ({p.island})</option>)}
              </select>
            </div>
            <div className="flex justify-center">
              <button onClick={swap} data-testid="ferry-swap" className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center active:scale-95 -my-1 z-10"><ArrowsDownUp size={16} className="text-sky-600" /></button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Arrivée</label>
              <select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} data-testid="ferry-to"
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm font-medium bg-slate-50">
                <option value="">Tous les ports</option>
                {ports.map((p) => <option key={p.id} value={p.id}>{p.city} ({p.island})</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><CalendarBlank size={13} weight="fill" /> Date</label>
              <input type="date" min={todayStr()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="ferry-date"
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm font-medium bg-slate-50" />
            </div>
            <div className="border-t border-slate-100 pt-1">
              <Stepper label="Adultes" sub="13 ans et +" value={form.adults} min={1} onChange={(v) => setForm({ ...form, adults: v })} />
              <Stepper label="Enfants" sub="2–12 ans" value={form.children} onChange={(v) => setForm({ ...form, children: v })} />
            </div>
            <button onClick={search} disabled={searching} data-testid="ferry-search-btn"
              className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[0.99]" style={{ background: SEA }}>
              {searching ? <CircleNotch size={18} className="animate-spin" /> : <>Rechercher un bateau <ArrowRight size={18} weight="bold" /></>}
            </button>
          </div>

          <button onClick={loadTickets} data-testid="ferry-my-tickets-btn" className="w-full mt-4 text-sm font-bold text-sky-600 flex items-center justify-center gap-2">
            <Ticket size={16} weight="fill" /> Mes billets
          </button>

          {myTickets && (
            <div className="mt-3 space-y-2" data-testid="ferry-my-tickets">
              {myTickets.length === 0 ? <p className="text-center text-slate-400 text-sm py-4">Aucun billet pour le moment.</p> :
                myTickets.map((b) => (
                  <div key={b.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3" data-testid={`ferry-ticket-${b.id}`}>
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: SEA }}><Boat size={16} weight="fill" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">{cleanPort(b.from_label)} → {cleanPort(b.to_label)}</p>
                      <p className="text-xs text-slate-400">{fmtDate(b.travel_date)} · {b.departure_time} · {b.adults + b.children} pax · {b.booking_ref}</p>
                    </div>
                    <span className="text-sm font-extrabold text-slate-700">{b.total} €</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ================= RESULTS =================
  if (step === 'results') {
    return (
      <div className="min-h-screen bg-slate-50 pb-10" data-testid="ferry-results-page">
        <Header title="Trajets disponibles" back={() => setStep('search')} />
        <div className="px-4 py-3 text-sm text-slate-500">{fmtDate(form.date)} · {form.adults + form.children} passager(s)</div>
        <div className="px-4 space-y-3" data-testid="ferry-results">
          {results.length === 0 ? (
            <div className="text-center text-slate-400 py-16">Aucun trajet pour cette recherche.</div>
          ) : results.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4" data-testid={`ferry-route-${r.id}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: SEA, background: '#E0F2FE' }}>{r.company_name}</span>
                <span className="text-[11px] font-semibold text-slate-400">{r.route_type === 'local' ? 'Navette locale' : 'Inter-îles'} · {fmtDur(r.duration_min)}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-extrabold text-slate-900">{cleanPort(r.from_label)}</p>
                <ArrowRight size={16} weight="bold" className="text-slate-300" />
                <p className="font-extrabold text-slate-900">{cleanPort(r.to_label)}</p>
              </div>
              <p className="text-sm text-slate-500 mb-3">À partir de <span className="font-bold text-slate-800">{r.price_child} €</span> (enfant) · {r.price_adult} € (adulte)</p>
              <p className="text-xs font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Clock size={12} weight="fill" /> Horaires</p>
              <div className="flex flex-wrap gap-2">
                {(r.departure_times || []).map((t) => (
                  <button key={t} onClick={() => { setPick({ route: r, time: t }); setStep('passengers'); }} data-testid={`ferry-time-${r.id}-${t}`}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 active:scale-95 hover:border-sky-400">{t}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ================= PASSENGERS / PAY =================
  if (step === 'passengers' && pick.route) {
    const r = pick.route;
    return (
      <div className="min-h-screen bg-slate-50 pb-28" data-testid="ferry-pay-page">
        <Header title="Confirmer & payer" back={() => setStep('results')} />
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="font-extrabold text-slate-900">{cleanPort(r.from_label)}</p>
              <ArrowRight size={16} weight="bold" className="text-slate-300" />
              <p className="font-extrabold text-slate-900">{cleanPort(r.to_label)}</p>
            </div>
            <p className="text-sm text-slate-500">{r.company_name} · {fmtDate(form.date)} · départ <span className="font-bold text-slate-800">{pick.time}</span> · {fmtDur(r.duration_min)}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Users size={13} weight="fill" /> Passagers</p>
            <div className="flex justify-between text-sm py-1"><span>{form.adults} adulte(s) × {r.price_adult} €</span><span className="font-semibold">{(form.adults * r.price_adult).toFixed(2)} €</span></div>
            {form.children > 0 && <div className="flex justify-between text-sm py-1"><span>{form.children} enfant(s) × {r.price_child} €</span><span className="font-semibold">{(form.children * r.price_child).toFixed(2)} €</span></div>}
            <div className="border-t border-slate-100 mt-2 pt-2 flex justify-between font-extrabold"><span>Total</span><span style={{ color: SEA }}>{total.toFixed(2)} €</span></div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4" data-testid="ferry-payment-method">
            <p className="text-xs font-bold text-slate-400 uppercase mb-3">Mode de paiement</p>
            <div className="space-y-2">
              {[
                { id: 'sbpay', label: 'SB Pay', desc: 'Paiement depuis votre portefeuille', testid: 'ferry-pay-sbpay' },
                { id: 'cash', label: 'Espèces au port', desc: 'Réservez maintenant, payez à l\u2019embarcadère', testid: 'ferry-pay-cash' },
                { id: 'card', label: 'Carte bancaire', desc: 'Paiement sécurisé par carte', testid: 'ferry-pay-card' },
              ].map((m) => {
                const active = payMethod === m.id;
                return (
                  <button key={m.id} onClick={() => setPayMethod(m.id)} data-testid={m.testid}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${active ? 'border-sky-500 bg-sky-50' : 'border-slate-100'}`}>
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${active ? 'text-white' : 'bg-slate-100 text-slate-400'}`} style={active ? { background: SEA } : {}}>
                      {m.id === 'sbpay' ? <CheckCircle size={18} weight="fill" /> : m.id === 'cash' ? <Coins size={18} weight="fill" /> : <CreditCard size={18} weight="fill" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-slate-800 text-sm">{m.label}</span>
                      <span className="block text-xs text-slate-400">{m.desc}</span>
                    </span>
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${active ? 'border-sky-500 bg-sky-500' : 'border-slate-300'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-4 bg-white border-t border-slate-100 z-40">
          <button onClick={confirm} disabled={paying} data-testid="ferry-pay-btn"
            className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[0.99]" style={{ background: SEA }}>
            {paying ? <CircleNotch size={18} className="animate-spin" /> : (payMethod === 'cash' ? `Réserver · ${total.toFixed(2)} € à payer au port` : payMethod === 'card' ? `Payer par carte ${total.toFixed(2)} €` : `Payer ${total.toFixed(2)} €`)}
          </button>
        </div>
      </div>
    );
  }

  // ================= TICKET =================
  if (step === 'ticket' && booking) {
    return (
      <div className="min-h-screen bg-slate-50 pb-10" data-testid="ferry-ticket-page">
        <Header title="Votre billet" back={() => { setStep('search'); setBooking(null); }} />
        <div className="p-4 space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2" data-testid="ferry-success">
            <CheckCircle size={20} weight="fill" className="text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-800">Billet confirmé — bon voyage !</p>
          </div>

          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="p-4 text-white" style={{ background: `linear-gradient(135deg, ${SEA}, #0369A1)` }}>
              <p className="text-xs opacity-80">{booking.company_name}</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-lg font-extrabold">{cleanPort(booking.from_label)}</p>
                <Boat size={18} weight="fill" />
                <p className="text-lg font-extrabold">{cleanPort(booking.to_label)}</p>
              </div>
              <p className="text-sm opacity-90 mt-1">{fmtDate(booking.travel_date)} · départ {booking.departure_time}</p>
            </div>
            <div className="p-5 flex flex-col items-center">
              <div className="bg-white p-2 rounded-xl border border-slate-100">
                <QRCodeSVG value={booking.qr_payload} size={160} fgColor="#0F172A" data-testid="ferry-qr" />
              </div>
              <p className="mt-3 text-xs text-slate-400">Référence</p>
              <p className="font-extrabold tracking-wider text-slate-900" data-testid="ferry-ref">{booking.booking_ref}</p>
              <div className="grid grid-cols-3 gap-3 w-full mt-4 text-center">
                <div><p className="text-[11px] text-slate-400">Passagers</p><p className="font-bold text-slate-800">{booking.adults + booking.children}</p></div>
                <div><p className="text-[11px] text-slate-400">Durée</p><p className="font-bold text-slate-800">{fmtDur(booking.duration_min)}</p></div>
                <div><p className="text-[11px] text-slate-400">Payé</p><p className="font-bold text-slate-800">{booking.total} €</p></div>
              </div>
            </div>
          </div>

          {/* Correspondance VTC vers le port de départ */}
          <button onClick={goVtcToPort} data-testid="ferry-vtc-btn"
            className="w-full bg-[#0B1426] text-white rounded-2xl p-4 flex items-center gap-3 active:scale-[0.99]">
            <span className="w-11 h-11 rounded-xl bg-[#FF5000] flex items-center justify-center shrink-0"><Car size={22} weight="fill" /></span>
            <span className="flex-1 text-left">
              <span className="block font-extrabold">Aller au port en SB Drive VTC</span>
              <span className="block text-xs text-white/70">Destination : {cleanPort(booking.from_label)} · soyez à quai avant {booking.departure_time}</span>
            </span>
            <ArrowRight size={18} weight="bold" />
          </button>

          <button onClick={() => { setStep('search'); setBooking(null); }} data-testid="ferry-new-search" className="w-full text-sm font-bold text-slate-500 py-2">Nouvelle recherche</button>
        </div>
      </div>
    );
  }

  return null;
}
