import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Tag, Plus, Trash, PencilSimple, Percent, Calendar, CheckCircle } from '@phosphor-icons/react';

const MerchantPromotions = () => {
  const [promos, setPromos] = useState([
    { id: 'promo_1', code: 'BIENVENUE10', type: 'percent', value: 10, min_order: 15, max_uses: 100, used: 23, active: true, expires: '2026-06-30' },
    { id: 'promo_2', code: 'LIVRAISON', type: 'flat', value: 2.50, min_order: 20, max_uses: 50, used: 12, active: true, expires: '2026-05-15' },
    { id: 'promo_3', code: 'WEEKEND20', type: 'percent', value: 20, min_order: 25, max_uses: 200, used: 87, active: false, expires: '2026-04-01' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', type: 'percent', value: '', min_order: '', max_uses: '', expires: '' });

  const handleAdd = () => {
    const newPromo = {
      id: `promo_${Date.now()}`, code: form.code.toUpperCase(), type: form.type,
      value: parseFloat(form.value) || 0, min_order: parseFloat(form.min_order) || 0,
      max_uses: parseInt(form.max_uses) || 100, used: 0, active: true, expires: form.expires,
    };
    setPromos(prev => [...prev, newPromo]);
    setShowForm(false);
    setForm({ code: '', type: 'percent', value: '', min_order: '', max_uses: '', expires: '' });
  };

  const toggleActive = (id) => setPromos(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  const handleDelete = (id) => setPromos(prev => prev.filter(p => p.id !== id));

  return (
    <div className="p-6" data-testid="merchant-promotions">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Promotions</h1>
          <p className="text-sm text-gray-500 mt-1">{promos.filter(p => p.active).length} promotions actives</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setShowForm(!showForm)} data-testid="add-promo-btn">
          <Plus size={16} className="mr-1" /> Nouvelle promo
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6" data-testid="promo-form">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input placeholder="Code promo (ex: PROMO20)" value={form.code} onChange={e => setForm({...form, code: e.target.value})} data-testid="promo-code-input" />
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="percent">Pourcentage (%)</option>
              <option value="flat">Montant fixe (EUR)</option>
            </select>
            <Input type="number" placeholder={form.type === 'percent' ? 'Valeur (%)' : 'Montant (EUR)'} value={form.value} onChange={e => setForm({...form, value: e.target.value})} />
            <Input type="number" placeholder="Commande min (EUR)" value={form.min_order} onChange={e => setForm({...form, min_order: e.target.value})} />
            <Input type="number" placeholder="Utilisations max" value={form.max_uses} onChange={e => setForm({...form, max_uses: e.target.value})} />
            <Input type="date" value={form.expires} onChange={e => setForm({...form, expires: e.target.value})} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleAdd} className="bg-orange-500 text-white" data-testid="save-promo-btn">Creer</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {promos.map(promo => (
          <div key={promo.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4" data-testid={`promo-${promo.id}`}>
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
              {promo.type === 'percent' ? <Percent size={22} className="text-orange-500" /> : <Tag size={22} className="text-orange-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 font-mono">{promo.code}</span>
                <Badge className={promo.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{promo.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {promo.type === 'percent' ? `-${promo.value}%` : `-${promo.value}EUR`} | Min: {promo.min_order}EUR | {promo.used}/{promo.max_uses} utilisations | Expire: {promo.expires}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => toggleActive(promo.id)}>{promo.active ? 'Desactiver' : 'Activer'}</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => handleDelete(promo.id)}><Trash size={16} /></Button>
            </div>
          </div>
        ))}
        {promos.length === 0 && <div className="text-center py-12 text-gray-400">Aucune promotion</div>}
      </div>
    </div>
  );
};

export default MerchantPromotions;
