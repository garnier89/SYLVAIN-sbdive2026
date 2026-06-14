/**
 * AutoPartsPage — SB Auto Pièces e-commerce: catalogue (filtres type/catégorie/
 * compatibilité/recherche), fiche produit, panier, checkout (livraison/retrait),
 * et "Mes commandes" avec suivi de statut.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, MagnifyingGlass, ShoppingCart, Plus, Minus, Trash, Package, CheckCircle,
  Gear, ShieldCheck, CircleNotch, BatteryHigh, Funnel, Drop, Car, Motorcycle, Wrench,
  Truck, Storefront, ClockCounterClockwise, Star, X,
} from '@phosphor-icons/react';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const CAT_ICON = {
  moteur: Gear, freinage: ShieldCheck, pneus: CircleNotch, batteries: BatteryHigh, filtres: Funnel,
  huiles: Drop, accessoires_auto: Car, pieces_moto: Motorcycle, casques: ShieldCheck, accessoires_moto: Wrench,
};
const STATUS_FLOW = ['confirmed', 'preparing', 'shipped', 'delivered'];
const STATUS_LABEL = { confirmed: 'Confirmée', preparing: 'Préparation', shipped: 'Expédiée', ready: 'Prête au retrait', delivered: 'Livrée', cancelled: 'Annulée' };
const PAYMENTS = [{ k: 'sbpay', l: 'SB Pay' }, { k: 'cash', l: 'Espèces' }, { k: 'card', l: 'Carte' }];
const CART_KEY = 'sb_auto_parts_cart';

const ProductImg = ({ p, size = 56 }) => {
  const Ic = CAT_ICON[p.category] || Package;
  return p.image
    ? <img src={p.image.startsWith('http') ? p.image : `${API}${p.image}`} alt={p.name} style={{ width: size, height: size }} className="rounded-xl object-cover flex-shrink-0" />
    : <div style={{ width: size, height: size }} className="rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0"><Ic size={size * 0.45} className="text-blue-500" weight="fill" /></div>;
};

const AutoPartsPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [deliveryFee, setDeliveryFee] = useState(5.9);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [screen, setScreen] = useState('shop'); // shop | product | cart | checkout | done | orders
  const [active, setActive] = useState(null);
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } });
  const [checkout, setCheckout] = useState({ fulfillment: 'delivery', address: '', payment: 'sbpay', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [orders, setOrders] = useState([]);
  const [garage, setGarage] = useState([]);
  const [brands, setBrands] = useState([]);
  const [vehicle, setVehicle] = useState(null); // selected vehicle for compatibility
  const [vForm, setVForm] = useState({ brand: '', model: '', year: '', vehicle_type: 'auto' });

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    fetch(`${API}/api/auto-parts/categories`).then(r => r.json())
      .then(d => { setCategories(d.categories || []); setDeliveryFee(d.delivery_fee ?? 5.9); }).catch(() => {});
    fetch(`${API}/api/auto-parts/brands`).then(r => r.json()).then(d => setBrands(d.brands || [])).catch(() => {});
    loadGarage();
  }, []);

  const loadGarage = async () => {
    try { const r = await fetch(`${API}/api/auto-parts/garage`, { credentials: 'include' }); setGarage(await r.json()); } catch { /* */ }
  };
  const addVehicle = async () => {
    if (!vForm.brand) { toast.error('Choisissez une marque'); return; }
    try {
      const r = await fetch(`${API}/api/auto-parts/garage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(vForm),
      });
      if (r.ok) { toast.success('Véhicule ajouté'); setVForm({ brand: '', model: '', year: '', vehicle_type: 'auto' }); loadGarage(); }
    } catch { toast.error('Erreur réseau'); }
  };
  const removeVehicle = async (id) => {
    try { await fetch(`${API}/api/auto-parts/garage/${id}`, { method: 'DELETE', credentials: 'include' }); if (vehicle?.id === id) setVehicle(null); loadGarage(); } catch { /* */ }
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (category) params.set('category', category);
      if (q.trim()) params.set('q', q.trim());
      if (vehicle?.brand) params.set('brand', vehicle.brand);
      const r = await fetch(`${API}/api/auto-parts/products?${params}`);
      setProducts(await r.json());
    } catch { /* */ } finally { setLoading(false); }
  }, [type, category, q, vehicle]);
  useEffect(() => { const t = setTimeout(loadProducts, 250); return () => clearTimeout(t); }, [loadProducts]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const addToCart = (p, qty = 1) => {
    setCart(prev => {
      const ex = prev.find(i => i.product_id === p.id);
      if (ex) return prev.map(i => i.product_id === p.id ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { product_id: p.id, name: p.name, brand: p.brand, price: p.price, image: p.image, category: p.category, qty }];
    });
    toast.success('Ajouté au panier');
  };
  const setQty = (id, qty) => setCart(prev => qty <= 0 ? prev.filter(i => i.product_id !== id) : prev.map(i => i.product_id === id ? { ...i, qty } : i));

  const placeOrder = async () => {
    if (checkout.fulfillment === 'delivery' && !checkout.address.trim()) { toast.error('Indiquez votre adresse'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/auto-parts/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          items: cart.map(i => ({ product_id: i.product_id, qty: i.qty })),
          fulfillment: checkout.fulfillment, address: checkout.address, payment_method: checkout.payment, notes: checkout.notes,
        }),
      });
      const data = await r.json();
      if (r.ok) { setDone(data); setCart([]); setScreen('done'); }
      else toast.error(data.detail || 'Échec de la commande');
    } catch { toast.error('Erreur réseau'); } finally { setSubmitting(false); }
  };

  const openOrders = async () => {
    setScreen('orders');
    try { const r = await fetch(`${API}/api/auto-parts/orders`, { credentials: 'include' }); setOrders(await r.json()); } catch { /* */ }
  };

  // ── Orders ──
  if (screen === 'orders') {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="auto-orders">
        <Header title="Mes commandes" onBack={() => setScreen('shop')} />
        <div className="p-4 space-y-3">
          {orders.length === 0 ? <Empty text="Aucune commande" /> : orders.map(o => {
            const idx = STATUS_FLOW.indexOf(o.status);
            return (
              <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`order-${o.id}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900 text-sm">#{o.id.slice(-6)} · {o.items.length} article(s)</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${o.status === 'cancelled' ? 'bg-rose-50 text-rose-600' : o.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{STATUS_LABEL[o.status]}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</p>
                {o.status !== 'cancelled' && (
                  <div className="flex items-center gap-1 mt-3">
                    {STATUS_FLOW.map((s, i) => (
                      <div key={s} className={`flex-1 h-1.5 rounded-full ${i <= idx ? 'bg-blue-500' : 'bg-gray-100'}`} />
                    ))}
                  </div>
                )}
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-gray-400 text-xs">{o.fulfillment === 'delivery' ? 'Livraison' : 'Retrait'}</span>
                  <span className="font-bold text-gray-900">{money(Number(o.total))}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Done ──
  if (screen === 'done' && done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center" data-testid="auto-order-done">
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-5"><CheckCircle size={48} weight="fill" className="text-green-500" /></div>
        <h1 className="text-xl font-bold text-gray-900">Commande confirmée !</h1>
        <p className="text-sm text-gray-500 mt-2">Commande #{done.id.slice(-6)} · {done.items.length} article(s). {done.fulfillment === 'delivery' ? 'Livraison en préparation.' : 'Disponible bientôt en retrait.'}</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full mt-5 flex justify-between text-sm"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900">{money(Number(done.total))}</span></div>
        <button onClick={() => { setDone(null); setScreen('shop'); }} className="w-full mt-5 bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm" data-testid="auto-done-shop">Continuer mes achats</button>
        <button onClick={openOrders} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="auto-done-orders">Voir mes commandes</button>
      </div>
    );
  }

  // ── Cart ──
  if (screen === 'cart') {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="auto-cart">
        <Header title="Mon panier" onBack={() => setScreen('shop')} />
        <div className="p-4 space-y-3">
          {cart.length === 0 ? <Empty text="Votre panier est vide" /> : cart.map(i => (
            <div key={i.product_id} className="bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3" data-testid={`cart-item-${i.product_id}`}>
              <ProductImg p={i} size={52} />
              <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 text-sm truncate">{i.name}</p><p className="text-xs text-gray-500">{i.brand}</p><p className="text-sm font-bold text-blue-600 mt-0.5">{money(i.price)}</p></div>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(i.product_id, i.qty - 1)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center" data-testid={`dec-${i.product_id}`}><Minus size={14} /></button>
                <span className="w-5 text-center text-sm font-bold" data-testid={`qty-${i.product_id}`}>{i.qty}</span>
                <button onClick={() => setQty(i.product_id, i.qty + 1)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center" data-testid={`inc-${i.product_id}`}><Plus size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
            <div className="flex justify-between mb-2 text-sm"><span className="text-gray-500">Sous-total</span><span className="font-bold">{money(cartTotal)}</span></div>
            <button onClick={() => setScreen('checkout')} className="w-full py-4 rounded-xl font-bold text-white bg-blue-600" data-testid="goto-checkout">Commander · {cartTotal.toFixed(2)}€</button>
          </div>
        )}
      </div>
    );
  }

  // ── Checkout ──
  if (screen === 'checkout') {
    const total = cartTotal + (checkout.fulfillment === 'delivery' ? deliveryFee : 0);
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="auto-checkout">
        <Header title="Finaliser la commande" onBack={() => setScreen('cart')} />
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Mode de réception</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCheckout({ ...checkout, fulfillment: 'delivery' })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${checkout.fulfillment === 'delivery' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid="fulfill-delivery"><Truck size={16} /> Livraison</button>
              <button onClick={() => setCheckout({ ...checkout, fulfillment: 'pickup' })} className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${checkout.fulfillment === 'pickup' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid="fulfill-pickup"><Storefront size={16} /> Retrait magasin</button>
            </div>
            {checkout.fulfillment === 'delivery' && (
              <input value={checkout.address} onChange={e => setCheckout({ ...checkout, address: e.target.value })} placeholder="Adresse de livraison" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-2" data-testid="checkout-address" />
            )}
          </div>
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Paiement</p>
            <div className="flex gap-2">
              {PAYMENTS.map(pm => (
                <button key={pm.k} onClick={() => setCheckout({ ...checkout, payment: pm.k })} className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold ${checkout.payment === pm.k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid={`checkout-pay-${pm.k}`}>{pm.l}</button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 space-y-1.5 text-sm" data-testid="checkout-summary">
            <div className="flex justify-between"><span className="text-gray-500">Sous-total</span><span>{money(cartTotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{checkout.fulfillment === 'delivery' ? 'Livraison' : 'Retrait'}</span><span>{checkout.fulfillment === 'delivery' ? money(deliveryFee) : 'Gratuit'}</span></div>
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100"><span>Total</span><span data-testid="checkout-total">{money(total)}</span></div>
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={placeOrder} disabled={submitting} className="w-full py-4 rounded-xl font-bold text-white bg-blue-600 disabled:opacity-60" data-testid="place-order-btn">{submitting ? 'Commande…' : `Payer · ${total.toFixed(2)}€`}</button>
        </div>
      </div>
    );
  }

  // ── Product detail ──
  if (screen === 'product' && active) {
    return (
      <div className="mobile-container min-h-screen bg-white pb-28" data-testid="auto-product">
        <Header title={active.brand} onBack={() => setScreen('shop')} />
        <div className="p-4">
          <div className="flex justify-center py-4"><ProductImg p={active} size={160} /></div>
          <h1 className="text-lg font-bold text-gray-900">{active.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Star size={14} weight="fill" className="text-amber-400" />{active.rating}</span>
            <span>· {active.brand}</span>
            <span className={`text-xs ${active.stock > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>· {active.stock > 0 ? 'En stock' : 'Rupture'}</span>
          </div>
          <p className="text-2xl font-black text-blue-600 mt-3">{money(active.price)}</p>
          <p className="text-sm text-gray-600 mt-3">{active.description}</p>
          {active.compat?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-500">Compatibilité</p>
              <div className="flex flex-wrap gap-1.5 mt-1">{active.compat.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{c}</span>)}</div>
            </div>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={() => { addToCart(active); setScreen('shop'); }} disabled={active.stock <= 0} className="w-full py-4 rounded-xl font-bold text-white bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2" data-testid="add-to-cart-btn"><ShoppingCart size={18} weight="fill" /> Ajouter au panier</button>
        </div>
      </div>
    );
  }

  // ── Mon garage ──
  if (screen === 'garage') {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-6" data-testid="auto-garage">
        <Header title="Mon garage" onBack={() => setScreen('shop')} />
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-500">Enregistrez vos véhicules pour ne voir que les pièces compatibles.</p>
          {garage.map(v => (
            <div key={v.id} className="bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3" data-testid={`garage-vehicle-${v.id}`}>
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                {v.vehicle_type === 'moto' ? <Motorcycle size={20} className="text-blue-600" weight="fill" /> : <Car size={20} className="text-blue-600" weight="fill" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{v.brand} {v.model}</p>
                <p className="text-xs text-gray-500">{v.year || '—'} · {v.vehicle_type === 'moto' ? 'Moto' : 'Auto'}</p>
              </div>
              <button onClick={() => { setVehicle(v); setScreen('shop'); }} className="text-xs font-semibold text-blue-600 px-2" data-testid={`select-vehicle-${v.id}`}>Choisir</button>
              <button onClick={() => removeVehicle(v.id)} className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center" data-testid={`del-vehicle-${v.id}`}><Trash size={15} className="text-rose-500" /></button>
            </div>
          ))}
          <div className="bg-white rounded-2xl p-4 space-y-2 border border-dashed border-blue-200" data-testid="add-vehicle-form">
            <p className="text-xs font-bold text-gray-500">Ajouter un véhicule</p>
            <select value={vForm.brand} onChange={e => setVForm({ ...vForm, brand: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="vehicle-brand">
              <option value="">Marque…</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input value={vForm.model} onChange={e => setVForm({ ...vForm, model: e.target.value })} placeholder="Modèle" className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="vehicle-model" />
              <input value={vForm.year} onChange={e => setVForm({ ...vForm, year: e.target.value })} placeholder="Année" className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="vehicle-year" />
            </div>
            <div className="flex gap-2">
              {[{ k: 'auto', l: 'Auto' }, { k: 'moto', l: 'Moto' }].map(t => (
                <button key={t.k} onClick={() => setVForm({ ...vForm, vehicle_type: t.k })} className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${vForm.vehicle_type === t.k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid={`vehicle-type-${t.k}`}>{t.l}</button>
              ))}
            </div>
            <button onClick={addVehicle} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5" data-testid="add-vehicle-btn"><Plus size={16} /> Ajouter à mon garage</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Shop (default) ──
  const autoCats = categories.filter(c => !type || c.type === type);
  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-6" data-testid="auto-parts-page">
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">Auto Pièces & Motos</h1>
          <button onClick={openOrders} className="text-white" data-testid="open-orders-btn"><ClockCounterClockwise size={22} /></button>
          <button onClick={() => setScreen('cart')} className="relative text-white" data-testid="open-cart-btn">
            <ShoppingCart size={24} weight="fill" />
            {cartCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-blue-900 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center" data-testid="cart-badge">{cartCount}</span>}
          </button>
        </div>
        <div className="bg-white rounded-xl flex items-center px-3 py-2.5">
          <MagnifyingGlass size={18} className="text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une pièce, une marque…" className="flex-1 ml-2 text-sm outline-none" data-testid="search-input" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Mon garage */}
        <div className="flex items-center gap-2">
          <button onClick={() => setScreen('garage')} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex items-center gap-2 text-sm font-semibold text-gray-700" data-testid="open-garage-btn">
            <Car size={18} weight="fill" className="text-blue-600" />
            Mon garage
            {garage.length > 0 && <span className="ml-auto text-xs text-gray-400">{garage.length} véhicule{garage.length > 1 ? 's' : ''}</span>}
          </button>
        </div>
        {vehicle && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-center gap-2" data-testid="active-vehicle-banner">
            {vehicle.vehicle_type === 'moto' ? <Motorcycle size={18} weight="fill" className="text-blue-600" /> : <Car size={18} weight="fill" className="text-blue-600" />}
            <p className="text-sm font-semibold text-blue-800 flex-1 truncate">Compatible : {vehicle.brand} {vehicle.model}</p>
            <button onClick={() => setVehicle(null)} className="w-7 h-7 rounded-lg bg-white flex items-center justify-center" data-testid="clear-vehicle-btn"><X size={14} className="text-blue-600" /></button>
          </div>
        )}

        {/* Type toggle */}
        <div className="flex gap-2" data-testid="type-toggle">
          {[{ k: '', l: 'Tout' }, { k: 'auto', l: 'Auto' }, { k: 'moto', l: 'Moto' }].map(t => (
            <button key={t.k} onClick={() => { setType(t.k); setCategory(''); }} className={`px-4 py-2 rounded-full text-sm font-semibold ${type === t.k ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid={`type-${t.k || 'all'}`}>{t.l}</button>
          ))}
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" data-testid="category-chips">
          <button onClick={() => setCategory('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${!category ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="cat-all">Toutes</button>
          {autoCats.map(c => {
            const Ic = CAT_ICON[c.id] || Package;
            return (
              <button key={c.id} onClick={() => setCategory(category === c.id ? '' : c.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1 ${category === c.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid={`cat-${c.id}`}>
                <Ic size={13} weight="fill" /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Product grid */}
        {loading ? (
          <div className="flex justify-center py-12"><CircleNotch size={28} className="text-blue-300 animate-spin" /></div>
        ) : products.length === 0 ? <Empty text="Aucun produit trouvé" /> : (
          <div className="grid grid-cols-2 gap-3" data-testid="product-grid">
            {products.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col" data-testid={`product-${p.id}`}>
                <button onClick={() => { setActive(p); setScreen('product'); }} className="p-3 flex flex-col items-center text-center">
                  <ProductImg p={p} size={88} />
                  <p className="font-bold text-gray-900 text-xs mt-2 leading-tight line-clamp-2 h-8">{p.name}</p>
                  <p className="text-[11px] text-gray-400">{p.brand}</p>
                  <p className="text-sm font-black text-blue-600 mt-1">{money(p.price)}</p>
                </button>
                <button onClick={() => addToCart(p)} disabled={p.stock <= 0} className="mx-3 mb-3 py-2 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50" data-testid={`add-${p.id}`}>
                  <Plus size={14} weight="bold" /> Ajouter
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="auto-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold truncate">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-400">{text}</div>
);

export default AutoPartsPage;
