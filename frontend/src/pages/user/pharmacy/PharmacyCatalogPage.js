import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { pharmacyAPI } from '../../../services/api';
import { ArrowLeft, MagnifyingGlass, Plus, Minus, ShoppingCart, CheckCircle } from '@phosphor-icons/react';
import PharmacyMapPicker from './PharmacyMapPicker';

const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
const PAYMENTS = [
  { id: 'cash', label: 'Espèces à la livraison' },
  { id: 'wallet', label: 'SB Pay' },
  { id: 'card', label: 'Carte' },
];

const PharmacyCatalogPage = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({}); // { product_id: {product, qty} }
  const [checkout, setCheckout] = useState(false);
  const [form, setForm] = useState({ pharmacy_id: '', delivery_address: '', recipient_name: '', recipient_phone: '', payment_method: 'cash' });
  const [coords, setCoords] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [balances, setBalances] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const loadProducts = useCallback(() => {
    pharmacyAPI.products({ category: category !== 'all' ? category : undefined, search: search || undefined })
      .then((r) => setProducts(r.data || [])).catch(() => {});
  }, [category, search]);

  useEffect(() => {
    pharmacyAPI.categories().then((r) => setCategories(r.data.categories || [])).catch(() => {});
    pharmacyAPI.pharmacies().then((r) => setPharmacies(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(loadProducts, 250); return () => clearTimeout(t); }, [loadProducts]);

  const cartItems = Object.values(cart);
  const cartCount = cartItems.reduce((s, c) => s + c.qty, 0);
  const cartSubtotal = useMemo(() => cartItems.reduce((s, c) => s + c.product.price * c.qty, 0), [cartItems]);

  const total = estimate?.total ?? null;
  const isWalletPay = ['wallet', 'sbpaygo'].includes(form.payment_method);
  const selBalance = balances[form.payment_method];
  const insufficient = isWalletPay && total != null && (selBalance ?? 0) < total;
  const fmtBal = (v) => (v == null ? '—' : fmt(v));

  const addToCart = (p) => setCart((c) => ({ ...c, [p.id]: { product: p, qty: (c[p.id]?.qty || 0) + 1 } }));
  const decFromCart = (p) => setCart((c) => {
    const qty = (c[p.id]?.qty || 0) - 1;
    const next = { ...c };
    if (qty <= 0) delete next[p.id]; else next[p.id] = { product: p, qty };
    return next;
  });

  const openCheckout = () => {
    if (cartCount === 0) return toast.error('Votre panier est vide');
    setCheckout(true);
    pharmacyAPI.paymentMethods().then((r) => {
      const map = {};
      (r.data.methods || []).forEach((m) => { map[m.id] = m.balance; });
      setBalances(map);
    }).catch(() => {});
  };

  const rechargeSbpaygo = async () => {
    navigate('/wallet?action=topup');
  };

  // live estimate when coords/cart change in checkout
  useEffect(() => {
    if (!checkout || !coords) { setEstimate(null); return; }
    pharmacyAPI.estimate({
      items: cartItems.map((c) => ({ product_id: c.product.id, qty: c.qty })),
      pharmacy_id: form.pharmacy_id || undefined,
      delivery_lat: coords.lat, delivery_lng: coords.lng,
    }).then((r) => setEstimate(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout, coords, form.pharmacy_id, cartCount]);

  const submit = async () => {
    if (!coords) return toast.error('Indiquez le lieu de livraison sur la carte');
    if (!form.recipient_name || !form.recipient_phone) return toast.error('Nom et téléphone du destinataire requis');
    setSubmitting(true);
    try {
      await pharmacyAPI.createOrder({
        order_type: 'catalog',
        items: cartItems.map((c) => ({ product_id: c.product.id, qty: c.qty })),
        pharmacy_id: form.pharmacy_id || undefined,
        delivery_address: form.delivery_address,
        delivery_lat: coords.lat, delivery_lng: coords.lng,
        recipient_name: form.recipient_name, recipient_phone: form.recipient_phone,
        payment_method: form.payment_method,
      });
      setDone(true);
      setTimeout(() => navigate('/pharmacy/orders'), 2200);
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec de la commande'); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center" data-testid="pharmacy-order-success">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6"><CheckCircle size={40} weight="fill" className="text-green-600" /></div>
        <h2 className="text-2xl font-bold mb-2">Commande confirmée !</h2>
        <p className="text-gray-500">La pharmacie prépare votre commande. Suivez-la dans « Mes commandes ».</p>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="pharmacy-catalog-page">
      <div className="bg-white px-4 pt-5 pb-3 border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/pharmacy')} className="p-1" data-testid="catalog-back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-gray-900">Catalogue parapharmacie</h1>
        </div>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 text-sm outline-none" data-testid="catalog-search-input" />
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
          {[{ key: 'all', label: 'Tout' }, ...categories].map((c) => (
            <button key={c.key} onClick={() => setCategory(c.key)} data-testid={`catalog-cat-${c.key}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${category === c.key ? 'bg-[#FF4500] text-white border-[#FF4500]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        {products.map((p) => {
          const qty = cart[p.id]?.qty || 0;
          return (
            <div key={p.id} className="rounded-2xl bg-white border border-gray-200 p-3 flex flex-col" data-testid={`product-card-${p.id}`}>
              {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-24 object-cover rounded-lg mb-2" />}
              <h4 className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">{p.name}</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-[#FF4500]">{fmt(p.price)}</span>
                {qty === 0 ? (
                  <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-full bg-[#FF4500] text-white flex items-center justify-center" data-testid={`add-${p.id}`}><Plus size={16} weight="bold" /></button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => decFromCart(p)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center" data-testid={`dec-${p.id}`}><Minus size={14} weight="bold" /></button>
                    <span className="text-sm font-bold w-4 text-center" data-testid={`qty-${p.id}`}>{qty}</span>
                    <button onClick={() => addToCart(p)} className="w-7 h-7 rounded-full bg-[#FF4500] text-white flex items-center justify-center" data-testid={`inc-${p.id}`}><Plus size={14} weight="bold" /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {products.length === 0 && <p className="col-span-2 text-center text-sm text-gray-400 py-10">Aucun produit trouvé.</p>}
      </div>

      {/* Cart bar */}
      {cartCount > 0 && !checkout && (
        <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 z-30">
          <button onClick={openCheckout} className="w-full bg-[#FF4500] text-white rounded-2xl py-3.5 px-5 flex items-center justify-between shadow-lg" data-testid="open-checkout-btn">
            <span className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart size={20} weight="fill" /> {cartCount} article{cartCount > 1 ? 's' : ''}</span>
            <span className="text-sm font-bold">{fmt(cartSubtotal)} · Commander</span>
          </button>
        </div>
      )}

      {/* Checkout sheet */}
      {checkout && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setCheckout(false)}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="checkout-sheet">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900 mb-3">Finaliser la commande</h3>

            <label className="text-xs font-semibold text-gray-600">Pharmacie (optionnel)</label>
            <select value={form.pharmacy_id} onChange={(e) => setForm({ ...form, pharmacy_id: e.target.value })} className="w-full mt-1 mb-3 px-3 py-2 rounded-xl bg-gray-100 text-sm" data-testid="checkout-pharmacy-select">
              <option value="">Pharmacie la plus proche</option>
              {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <label className="text-xs font-semibold text-gray-600">Adresse de livraison</label>
            <input value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} placeholder="Ex: 10 rue de la Paix" className="w-full mt-1 mb-2 px-3 py-2 rounded-xl bg-gray-100 text-sm" data-testid="checkout-address-input" />
            <div className="mb-3"><PharmacyMapPicker value={coords} onChange={setCoords} /></div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="Nom destinataire" className="px-3 py-2 rounded-xl bg-gray-100 text-sm" data-testid="checkout-name-input" />
              <input value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} placeholder="Téléphone" className="px-3 py-2 rounded-xl bg-gray-100 text-sm" data-testid="checkout-phone-input" />
            </div>

            <label className="text-xs font-semibold text-gray-600">Paiement</label>
            <div className="grid grid-cols-2 gap-2 mt-1 mb-2">
              {PAYMENTS.map((pm) => (
                <button key={pm.id} onClick={() => setForm({ ...form, payment_method: pm.id })} data-testid={`pay-${pm.id}`}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left ${form.payment_method === pm.id ? 'bg-orange-50 border-[#FF4500] text-[#FF4500]' : 'bg-white border-gray-200 text-gray-600'}`}>
                  <div>{pm.label}</div>
                  {pm.id === 'wallet' && (
                    <div className="text-[10px] font-normal text-gray-400 mt-0.5" data-testid={`balance-${pm.id}`}>Solde : {fmtBal(balances[pm.id])}</div>
                  )}
                </button>
              ))}
            </div>

            {insufficient && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-3 mb-3 text-xs text-red-700 flex items-center justify-between gap-2" data-testid="insufficient-banner">
                <span>Solde insuffisant ({fmtBal(selBalance)}).</span>
                {form.payment_method === 'wallet'
                  ? <button onClick={() => navigate('/wallet')} className="font-bold text-[#FF4500] whitespace-nowrap" data-testid="recharge-wallet-btn">Recharger →</button>
                  : <button onClick={rechargeSbpaygo} className="font-bold text-[#FF4500] whitespace-nowrap" data-testid="recharge-sbpaygo-btn">Recharger SB PayGo →</button>}
              </div>
            )}

            <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1 mb-3" data-testid="checkout-summary">
              <div className="flex justify-between text-gray-600"><span>Sous-total</span><span>{fmt(estimate?.subtotal ?? cartSubtotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Livraison</span><span>{estimate ? fmt(estimate.delivery_fee) : '—'}</span></div>
              <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span data-testid="checkout-total">{estimate ? fmt(estimate.total) : '—'}</span></div>
            </div>

            <button onClick={submit} disabled={submitting || insufficient} className="w-full bg-[#FF4500] text-white rounded-2xl py-3.5 font-bold disabled:opacity-60" data-testid="confirm-order-btn">
              {submitting ? 'Envoi…' : insufficient ? 'Solde insuffisant' : 'Confirmer la commande'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacyCatalogPage;
