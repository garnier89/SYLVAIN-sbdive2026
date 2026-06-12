import React, { useState, useEffect } from 'react';
import { X, Car, Package, Plus, Minus, Trash } from '@phosphor-icons/react';
import { adminAPI, merchantAPI } from '../../services/api';
import { toast } from 'sonner';

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
const lbl = 'text-xs font-medium text-gray-600 block mb-1';

const Shell = ({ title, icon: Icon, color, onClose, children, footer, testid }) => (
  <div className="fixed inset-0 z-[2900] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid={testid}>
      <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Icon size={18} style={{ color }} />{title}</h3>
        <button onClick={onClose} className="text-gray-400" data-testid={`${testid}-close`}><X size={22} /></button>
      </div>
      <div className="p-4 space-y-3">{children}</div>
      <div className="p-4 border-t border-gray-100 sticky bottom-0 bg-white">{footer}</div>
    </div>
  </div>
);

export const ManualRideModal = ({ onClose, onCreated }) => {
  const [f, setF] = useState({
    customer_name: '', customer_phone: '', pickup_address: '', dropoff_address: '',
    vehicle_type: 'sb', payment_method: 'cash', estimated_fare: '', scheduled_at: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.customer_phone.trim() && !f.customer_name.trim()) { toast.error('Renseignez le client (nom + téléphone)'); return; }
    if (!f.pickup_address.trim() || !f.dropoff_address.trim()) { toast.error('Adresses de départ et d\'arrivée requises'); return; }
    setSaving(true);
    try {
      const payload = { ...f };
      if (payload.estimated_fare === '') delete payload.estimated_fare;
      if (payload.scheduled_at === '') delete payload.scheduled_at;
      else payload.scheduled_at = new Date(payload.scheduled_at).toISOString();
      await adminAPI.createManualRide(payload);
      toast.success('Réservation créée ✅');
      onCreated(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de la création'); }
    finally { setSaving(false); }
  };

  return (
    <Shell title="Réservation manuelle (course)" icon={Car} color="#DC2626" onClose={onClose} testid="manual-ride-modal"
      footer={<button onClick={submit} disabled={saving} className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm disabled:opacity-50" data-testid="manual-ride-submit">{saving ? 'Création…' : 'Créer la réservation'}</button>}>
      <p className="text-xs font-semibold text-gray-500 uppercase">Client</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Nom du client</label><input className={field} value={f.customer_name} onChange={(e) => set('customer_name', e.target.value)} data-testid="manual-ride-name" /></div>
        <div><label className={lbl}>Téléphone</label><input className={field} value={f.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="+596…" data-testid="manual-ride-phone" /></div>
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase pt-2 border-t border-gray-100">Trajet</p>
      <div><label className={lbl}>Adresse de départ *</label><input className={field} value={f.pickup_address} onChange={(e) => set('pickup_address', e.target.value)} data-testid="manual-ride-pickup" /></div>
      <div><label className={lbl}>Adresse d'arrivée *</label><input className={field} value={f.dropoff_address} onChange={(e) => set('dropoff_address', e.target.value)} data-testid="manual-ride-dropoff" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={lbl}>Véhicule</label><input className={field} value={f.vehicle_type} onChange={(e) => set('vehicle_type', e.target.value)} placeholder="sb" data-testid="manual-ride-vehicle" /></div>
        <div><label className={lbl}>Paiement</label>
          <select className={field + ' bg-white'} value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)} data-testid="manual-ride-payment">
            <option value="cash">Espèces</option><option value="card">Carte</option><option value="wallet">SB Pay</option>
          </select>
        </div>
        <div><label className={lbl}>Tarif (€)</label><input type="number" className={field} value={f.estimated_fare} onChange={(e) => set('estimated_fare', e.target.value)} placeholder="auto" data-testid="manual-ride-fare" /></div>
      </div>
      <div><label className={lbl}>Planifier pour (optionnel)</label><input type="datetime-local" className={field} value={f.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} data-testid="manual-ride-schedule" /></div>
      <div><label className={lbl}>Notes</label><input className={field} value={f.notes} onChange={(e) => set('notes', e.target.value)} data-testid="manual-ride-notes" /></div>
    </Shell>
  );
};

export const ManualOrderModal = ({ onClose, onCreated }) => {
  const [kind, setKind] = useState('courier');
  const [f, setF] = useState({ customer_name: '', customer_phone: '', delivery_address: '', amount: '', package_description: '', payment_method: 'cash', merchant_id: '' });
  const [merchants, setMerchants] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({}); // product_id -> qty
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (kind === 'merchant' && merchants.length === 0) {
      merchantAPI.list().then((r) => setMerchants(r.data?.merchants || r.data || [])).catch(() => {});
    }
  }, [kind, merchants.length]);

  useEffect(() => {
    if (kind === 'merchant' && f.merchant_id) {
      merchantAPI.getProducts(f.merchant_id).then((r) => setProducts(r.data?.products || r.data || [])).catch(() => setProducts([]));
      setCart({});
    }
  }, [f.merchant_id, kind]);

  const setQty = (pid, delta) => setCart((c) => {
    const q = Math.max(0, (c[pid] || 0) + delta);
    const n = { ...c }; if (q === 0) delete n[pid]; else n[pid] = q; return n;
  });

  const submit = async () => {
    if (!f.customer_phone.trim() && !f.customer_name.trim()) { toast.error('Renseignez le client'); return; }
    if (!f.delivery_address.trim()) { toast.error('Adresse de livraison requise'); return; }
    setSaving(true);
    try {
      const base = { kind, customer_name: f.customer_name, customer_phone: f.customer_phone, delivery_address: f.delivery_address, payment_method: f.payment_method };
      if (kind === 'merchant') {
        if (!f.merchant_id) { toast.error('Choisissez un marchand'); setSaving(false); return; }
        const items = Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity }));
        if (items.length === 0) { toast.error('Ajoutez au moins un produit'); setSaving(false); return; }
        await adminAPI.createManualOrder({ ...base, merchant_id: f.merchant_id, items });
      } else {
        await adminAPI.createManualOrder({ ...base, amount: parseFloat(f.amount || 0), package_description: f.package_description });
      }
      toast.success('Commande créée ✅');
      onCreated(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de la création'); }
    finally { setSaving(false); }
  };

  const cartTotal = products.filter((p) => cart[p.id]).reduce((s, p) => s + p.price * cart[p.id], 0);

  return (
    <Shell title="Nouvelle commande" icon={Package} color="#7C3AED" onClose={onClose} testid="manual-order-modal"
      footer={<button onClick={submit} disabled={saving} className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm disabled:opacity-50" data-testid="manual-order-submit">{saving ? 'Création…' : 'Créer la commande'}</button>}>
      <div className="flex gap-2">
        {[{ v: 'courier', l: 'Coursier' }, { v: 'delivery', l: 'Livraison' }, { v: 'merchant', l: 'Marchand' }].map((k) => (
          <button key={k.v} onClick={() => setKind(k.v)} data-testid={`manual-order-kind-${k.v}`}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 ${kind === k.v ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600'}`}>{k.l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Nom du client</label><input className={field} value={f.customer_name} onChange={(e) => set('customer_name', e.target.value)} data-testid="manual-order-name" /></div>
        <div><label className={lbl}>Téléphone</label><input className={field} value={f.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="+596…" data-testid="manual-order-phone" /></div>
      </div>
      <div><label className={lbl}>Adresse de livraison *</label><input className={field} value={f.delivery_address} onChange={(e) => set('delivery_address', e.target.value)} data-testid="manual-order-address" /></div>

      {kind === 'merchant' ? (
        <>
          <div><label className={lbl}>Marchand *</label>
            <select className={field + ' bg-white'} value={f.merchant_id} onChange={(e) => set('merchant_id', e.target.value)} data-testid="manual-order-merchant">
              <option value="">Choisir…</option>
              {merchants.map((m) => <option key={m.id} value={m.id}>{m.store_name}</option>)}
            </select>
          </div>
          {f.merchant_id && (
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-52 overflow-y-auto">
              {products.length === 0 ? <p className="p-3 text-xs text-gray-400">Aucun produit disponible.</p> : products.map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2.5" data-testid={`manual-order-product-${p.id}`}>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800 truncate">{p.name}</p><p className="text-xs text-gray-500">{p.price?.toFixed(2)} €</p></div>
                  <button onClick={() => setQty(p.id, -1)} className="w-7 h-7 rounded bg-gray-100"><Minus size={13} /></button>
                  <span className="w-5 text-center text-sm font-bold" data-testid={`manual-order-qty-${p.id}`}>{cart[p.id] || 0}</span>
                  <button onClick={() => setQty(p.id, 1)} className="w-7 h-7 rounded bg-violet-100 text-violet-700" data-testid={`manual-order-add-${p.id}`}><Plus size={13} /></button>
                </div>
              ))}
            </div>
          )}
          {cartTotal > 0 && <p className="text-right text-sm font-bold text-gray-800">Sous-total : {cartTotal.toFixed(2)} €</p>}
        </>
      ) : (
        <>
          <div><label className={lbl}>Montant (€)</label><input type="number" className={field} value={f.amount} onChange={(e) => set('amount', e.target.value)} data-testid="manual-order-amount" /></div>
          <div><label className={lbl}>Description du colis</label><input className={field} value={f.package_description} onChange={(e) => set('package_description', e.target.value)} data-testid="manual-order-desc" /></div>
        </>
      )}
      <div><label className={lbl}>Paiement</label>
        <select className={field + ' bg-white'} value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)} data-testid="manual-order-payment">
          <option value="cash">Espèces</option><option value="card">Carte</option><option value="wallet">SB Pay</option>
        </select>
      </div>
    </Shell>
  );
};
