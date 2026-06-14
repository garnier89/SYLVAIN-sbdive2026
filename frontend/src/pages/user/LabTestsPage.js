/**
 * LabTestsPage — SB Labo (patient) /analyses.
 * Catalogue d'analyses (multi-sélection) → réservation (domicile/labo, labo,
 * créneau, SB Pay/espèces) → Mes analyses (statut + résultats PDF + annulation).
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, MagnifyingGlass, Flask, CircleNotch, CheckCircle, ClockCounterClockwise,
  House, Storefront, Wallet, Money, DownloadSimple, TestTube, Drop, Pill, Virus, ShareNetwork, X,
} from '@phosphor-icons/react';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const LAB = `${API}/api/lab`;
const CAT_ICON = { hematologie: Drop, biochimie: Flask, hormonologie: Flask, serologie: Virus, urine: Flask, vitamines: Pill };
const SLOTS = ['07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '11:00', '12:00'];
const STATUS = {
  pending: { l: 'En attente', c: 'bg-indigo-50 text-indigo-600' },
  confirmed: { l: 'Labo confirmé', c: 'bg-indigo-50 text-indigo-600' },
  results_ready: { l: 'Résultats prêts', c: 'bg-emerald-50 text-emerald-600' },
  cancelled: { l: 'Annulé', c: 'bg-rose-50 text-rose-600' },
};

const LabTestsPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]); // analysis ids
  const [screen, setScreen] = useState('shop'); // shop | book | done | orders
  const [labs, setLabs] = useState([]);
  const [form, setForm] = useState({ at_home: false, address: '', provider_id: '', date: '', time: '', payment: 'sbpay' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [orders, setOrders] = useState({ upcoming: [], past: [] });
  const [shareFor, setShareFor] = useState(null); // order being shared
  const [shareEmail, setShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    fetch(`${LAB}/catalog`).then(r => r.json()).then(d => { setCfg(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const analyses = (cfg?.analyses || []).filter(a =>
    (!category || a.category === category) && (!q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase())));
  const selected = (cfg?.analyses || []).filter(a => cart.includes(a.id));
  const subtotal = selected.reduce((s, a) => s + Number(a.price), 0);
  const total = subtotal + (form.at_home ? Number(cfg?.home_surcharge || 0) : 0);
  const toggle = (id) => setCart(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);

  const goBook = async () => {
    if (!cart.length) return;
    setForm({ at_home: false, address: '', provider_id: '', date: '', time: '', payment: 'sbpay' });
    setScreen('book');
    try { const r = await fetch(`${LAB.replace('/lab', '')}/pro-services/lab/providers`); setLabs(await r.json()); } catch { setLabs([]); }
  };

  const submit = async () => {
    if (!form.date || !form.time) { toast.error('Choisissez une date et un créneau'); return; }
    if (form.at_home && !form.address.trim()) { toast.error('Indiquez votre adresse'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${LAB}/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ analysis_ids: cart, at_home: form.at_home, address: form.address, provider_id: form.provider_id || null, scheduled_date: form.date, scheduled_time: form.time, payment_method: form.payment }),
      });
      const d = await r.json();
      if (r.ok) { setDone(d); setCart([]); setScreen('done'); } else toast.error(d.detail || 'Échec');
    } catch { toast.error('Erreur réseau'); } finally { setSubmitting(false); }
  };

  const openOrders = async () => {
    setScreen('orders');
    try { const r = await fetch(`${LAB}/orders`, { credentials: 'include' }); setOrders(await r.json()); } catch { /* */ }
  };
  const cancelOrder = async (id) => {
    try {
      const r = await fetch(`${LAB}/orders/${id}/cancel`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) { toast.success('Commande annulée'); openOrders(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };
  const downloadResults = async (id) => {
    try {
      const r = await fetch(`${LAB}/orders/${id}/results/pdf`, { credentials: 'include' });
      if (!r.ok) { toast.error('Résultats indisponibles'); return; }
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `resultats-${id.slice(-8)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { toast.error('Erreur réseau'); }
  };
  const shareResults = async () => {
    const email = shareEmail.trim().toLowerCase();
    if (!email) { toast.error('Saisissez l\'email de votre médecin'); return; }
    setSharing(true);
    try {
      const r = await fetch(`${LAB}/orders/${shareFor.id}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ practitioner_email: email }),
      });
      const d = await r.json();
      if (r.ok) { toast.success(`Résultats partagés avec ${d.shared_with || 'votre médecin'}`); setShareFor(null); setShareEmail(''); }
      else toast.error(d.detail || 'Échec du partage');
    } catch { toast.error('Erreur réseau'); } finally { setSharing(false); }
  };
  if (screen === 'done' && done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center" data-testid="lab-done">
        <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mb-5"><CheckCircle size={48} weight="fill" className="text-indigo-500" /></div>
        <h1 className="text-xl font-bold text-gray-900">Commande confirmée !</h1>
        <p className="text-sm text-gray-500 mt-2">{(done.analyses || []).length} analyse(s) · {done.scheduled_date} à {done.scheduled_time}. {done.status === 'pending' ? 'Un laboratoire va prendre en charge votre prélèvement.' : 'Laboratoire confirmé.'} Vous recevrez vos résultats en ligne.</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full mt-5 flex justify-between text-sm"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900">{money(Number(done.total))}</span></div>
        <button onClick={() => { setDone(null); setScreen('shop'); }} className="w-full mt-5 bg-indigo-600 text-white py-3.5 rounded-xl font-semibold text-sm" data-testid="done-back">Retour aux analyses</button>
        <button onClick={openOrders} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="done-orders">Voir mes analyses</button>
      </div>
    );
  }

  // ── My orders ──
  if (screen === 'orders') {
    const Row = ({ o }) => (
      <div className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`order-${o.id}`}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-900 text-sm">{(o.analyses || []).map(a => a.name).slice(0, 2).join(', ')}{(o.analyses || []).length > 2 ? `… +${o.analyses.length - 2}` : ''}</p>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${(STATUS[o.status] || {}).c}`}>{(STATUS[o.status] || {}).l}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{o.scheduled_date} à {o.scheduled_time} · {o.at_home ? 'À domicile' : 'Au labo'}{o.provider_name ? ` · ${o.provider_name}` : ''}</p>
        <div className="flex justify-between items-center mt-2">
          <span className="font-bold text-gray-900 text-sm">{money(Number(o.total))}</span>
          <div className="flex gap-2">
            {['pending', 'confirmed'].includes(o.status) && <button onClick={() => cancelOrder(o.id)} className="text-xs font-semibold text-rose-600 px-2 py-1" data-testid={`cancel-${o.id}`}>Annuler</button>}
            {o.status === 'results_ready' && <button onClick={() => { setShareFor(o); setShareEmail(''); }} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1" data-testid={`share-${o.id}`}><ShareNetwork size={13} weight="bold" /> Mon médecin</button>}
            {o.status === 'results_ready' && <button onClick={() => downloadResults(o.id)} className="text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-lg flex items-center gap-1" data-testid={`results-${o.id}`}><DownloadSimple size={13} /> Résultats</button>}
          </div>
        </div>
      </div>
    );
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="lab-orders">
        <Header title="Mes analyses" onBack={() => setScreen('shop')} />
        <div className="p-4 space-y-4">
          <div><p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">En cours</p>
            {orders.upcoming.length === 0 ? <Empty text="Aucune analyse en cours" /> : <div className="space-y-3">{orders.upcoming.map(o => <Row key={o.id} o={o} />)}</div>}</div>
          {orders.past.length > 0 && <div><p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Historique</p><div className="space-y-3">{orders.past.map(o => <Row key={o.id} o={o} />)}</div></div>}
        </div>
        {shareFor && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => !sharing && setShareFor(null)} data-testid="share-sheet">
            <div className="bg-white w-full max-w-[430px] rounded-t-2xl p-5 pb-8" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-gray-900">Partager avec mon médecin</h3>
                <button onClick={() => setShareFor(null)} disabled={sharing} data-testid="share-close"><X size={20} className="text-gray-400" /></button>
              </div>
              <p className="text-xs text-gray-500 mb-4">Votre médecin recevra une notification et pourra consulter vos résultats lors d'une consultation. Il doit être inscrit comme praticien SB Santé.</p>
              <input value={shareEmail} onChange={e => setShareEmail(e.target.value)} type="email" placeholder="email@medecin.fr" className="w-full border border-gray-200 rounded-lg px-3 py-3 text-sm mb-3" data-testid="share-email-input" />
              <button onClick={shareResults} disabled={sharing} className="w-full py-3.5 rounded-xl font-bold text-white bg-indigo-600 disabled:opacity-60 flex items-center justify-center gap-2" data-testid="share-submit">
                {sharing ? <CircleNotch size={16} className="animate-spin" /> : <ShareNetwork size={16} weight="bold" />}{sharing ? 'Partage…' : 'Partager mes résultats'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Booking ──
  if (screen === 'book') {
    const sel = (on) => on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200';
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="lab-book">
        <Header title="Réserver mes analyses" onBack={() => setScreen('shop')} />
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Analyses ({selected.length})</p>
            {selected.map(a => (
              <div key={a.id} className="flex justify-between text-sm py-1" data-testid={`sel-${a.id}`}>
                <span className="text-gray-700">{a.name}{a.prep && a.prep !== 'Aucune préparation' ? <span className="text-[10px] text-amber-600 ml-1">· {a.prep}</span> : ''}</span>
                <span className="font-semibold">{money(Number(a.price))}</span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Prélèvement</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm({ ...form, at_home: false })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${sel(!form.at_home)}`} data-testid="loc-lab"><Storefront size={16} /> Au laboratoire</button>
              <button onClick={() => setForm({ ...form, at_home: true })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${sel(form.at_home)}`} data-testid="loc-home"><House size={16} /> À domicile (+{cfg?.home_surcharge}€)</button>
            </div>
            {form.at_home && <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Adresse du prélèvement" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-2" data-testid="book-address" />}
          </div>

          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Laboratoire</p>
            <button onClick={() => setForm({ ...form, provider_id: '' })} className={`w-full flex items-center gap-3 p-2 rounded-xl border mb-2 ${!form.provider_id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`} data-testid="lab-any">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center"><Flask size={18} className="text-indigo-600" weight="fill" /></div>
              <div className="text-left flex-1"><p className="text-sm font-semibold text-gray-900">Premier disponible</p><p className="text-xs text-gray-400">Un labo prend en charge</p></div>
            </button>
            {labs.map(l => (
              <button key={l.id} onClick={() => setForm({ ...form, provider_id: l.id })} className={`w-full flex items-center gap-3 p-2 rounded-xl border mb-2 ${form.provider_id === l.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`} data-testid={`lab-${l.id}`}>
                {l.photo ? <img src={l.photo} alt={l.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gray-100" />}
                <div className="text-left flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{l.name}</p><p className="text-xs text-amber-500">⭐ {l.rating}</p></div>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Date & créneau (matin)</p>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} min={new Date().toISOString().split('T')[0]} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-2" data-testid="book-date" />
            <div className="grid grid-cols-4 gap-2">
              {SLOTS.map(s => <button key={s} onClick={() => setForm({ ...form, time: s })} className={`py-2 rounded-lg text-xs font-semibold border ${sel(form.time === s)}`} data-testid={`slot-${s}`}>{s}</button>)}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Paiement</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm({ ...form, payment: 'sbpay' })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${sel(form.payment === 'sbpay')}`} data-testid="pay-sbpay"><Wallet size={16} /> SB Pay</button>
              <button onClick={() => setForm({ ...form, payment: 'cash' })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${sel(form.payment === 'cash')}`} data-testid="pay-cash"><Money size={16} /> Espèces</button>
            </div>
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">Total {form.at_home ? '(domicile inclus)' : ''}</span><span className="font-bold" data-testid="book-total">{money(total)}</span></div>
          <button onClick={submit} disabled={submitting} className="w-full py-4 rounded-xl font-bold text-white bg-indigo-600 disabled:opacity-60" data-testid="confirm-order">{submitting ? 'Réservation…' : `${form.payment === 'sbpay' ? 'Payer & réserver' : 'Réserver'} · ${total.toFixed(2)}€`}</button>
        </div>
      </div>
    );
  }

  // ── Shop ──
  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="lab-page">
      <div className="bg-gradient-to-br from-indigo-500 to-violet-600 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">SB Labo — Analyses</h1>
          <button onClick={openOrders} className="text-white" data-testid="my-orders-btn"><ClockCounterClockwise size={22} /></button>
        </div>
        <div className="bg-white rounded-xl flex items-center px-3 py-2.5">
          <MagnifyingGlass size={18} className="text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une analyse…" className="flex-1 ml-2 text-sm outline-none" data-testid="search-input" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" data-testid="category-chips">
          <button onClick={() => setCategory('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${!category ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="cat-all">Tout</button>
          {(cfg?.categories || []).map(c => (
            <button key={c.id} onClick={() => setCategory(category === c.id ? '' : c.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1 ${category === c.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid={`cat-${c.id}`}>
              {React.createElement(CAT_ICON[c.id] || Flask, { size: 13, weight: 'fill' })} {c.label}
            </button>
          ))}
        </div>

        {loading ? <div className="flex justify-center py-12"><CircleNotch size={28} className="text-indigo-300 animate-spin" /></div>
          : analyses.length === 0 ? <Empty text="Aucune analyse trouvée" /> : (
            <div className="space-y-2" data-testid="analysis-list">
              {analyses.map(a => {
                const on = cart.includes(a.id);
                return (
                  <button key={a.id} onClick={() => toggle(a.id)} className={`w-full bg-white rounded-2xl p-4 border flex items-center gap-3 text-left ${on ? 'border-indigo-500' : 'border-gray-100'}`} data-testid={`analysis-${a.id}`}>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>{on && <CheckCircle size={18} weight="fill" className="text-white" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{a.name}</p>
                      {a.prep && a.prep !== 'Aucune préparation' && <p className="text-[11px] text-amber-600">{a.prep}</p>}
                    </div>
                    <p className="font-black text-indigo-600 text-sm">{money(a.price)}</p>
                  </button>
                );
              })}
            </div>
          )}
      </div>

      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={goBook} className="w-full py-4 rounded-xl font-bold text-white bg-indigo-600 flex items-center justify-between px-5" data-testid="goto-book">
            <span>Panier · {cart.length} analyse(s)</span><span>{money(subtotal)} →</span>
          </button>
        </div>
      )}
    </div>
  );
};

const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="lab-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold truncate">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-400">{text}</div>
);

export default LabTestsPage;
