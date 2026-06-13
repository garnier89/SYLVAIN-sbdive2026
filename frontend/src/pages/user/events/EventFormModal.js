import React, { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { EVENT_CATEGORIES, BLANK_PREMIUM_PASS } from './eventsShared';
import PremiumPassFields from './PremiumPassFields';

const BLANK = {
  title: '', category: 'concert', description: '', image: '', venue_name: '', address: '',
  city: '', lat: '', lng: '', starts_at: '', ends_at: '', organizer_name: '',
  is_featured: false, status: 'active', tiers: [{ name: 'Standard', price: 0, quantity_total: 100 }],
  premium_pass: { ...BLANK_PREMIUM_PASS },
};

const toLocalInput = (iso) => { if (!iso) return ''; try { return new Date(iso).toISOString().slice(0, 16); } catch { return ''; } };

/** Shared create/edit event form (used by the organizer space). */
const EventFormModal = ({ initial, onClose, onSave, accent = '#B91C1C' }) => {
  const [form, setForm] = useState(() => initial ? {
    ...initial, lat: initial.lat ?? '', lng: initial.lng ?? '',
    starts_at: toLocalInput(initial.starts_at), ends_at: toLocalInput(initial.ends_at),
    tiers: (initial.tiers || []).map((t) => ({ ...t })),
    premium_pass: { ...BLANK_PREMIUM_PASS, ...(initial.premium_pass || {}) },
  } : { ...BLANK, tiers: [{ ...BLANK.tiers[0] }], premium_pass: { ...BLANK_PREMIUM_PASS } });
  const [saving, setSaving] = useState(false);

  const setTier = (i, k, v) => setForm((f) => ({ ...f, tiers: f.tiers.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));
  const addTier = () => setForm((f) => ({ ...f, tiers: [...f.tiers, { name: '', price: 0, quantity_total: 100 }] }));
  const delTier = (i) => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));

  const submit = async () => {
    if (!form.title || !form.starts_at) return;
    setSaving(true);
    const payload = {
      ...form,
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      tiers: form.tiers.map((t) => ({ ...t, price: Number(t.price || 0), quantity_total: Number(t.quantity_total || 0) })),
      premium_pass: {
        ...form.premium_pass,
        price: Number(form.premium_pass.price || 0),
        quantity_total: Number(form.premium_pass.quantity_total || 0),
        perks: (Array.isArray(form.premium_pass.perks) ? form.premium_pass.perks : []).map((p) => String(p).trim()).filter(Boolean),
      },
    };
    try { await onSave(payload); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" data-testid="event-form">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{form.id ? 'Éditer' : 'Nouvel'} événement</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <F label="Titre"><input className="oinp" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="f-title" /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Catégorie">
              <select className="oinp" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="f-category">
                {EVENT_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </F>
            <F label="Statut">
              <select className="oinp" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="f-status">
                <option value="active">Publié</option><option value="draft">Brouillon</option>
              </select>
            </F>
          </div>
          <F label="Description"><textarea className="oinp" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
          <F label="Image (URL)"><input className="oinp" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Lieu"><input className="oinp" value={form.venue_name} onChange={(e) => setForm({ ...form, venue_name: e.target.value })} /></F>
            <F label="Ville"><input className="oinp" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></F>
          </div>
          <F label="Adresse"><input className="oinp" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Latitude"><input className="oinp" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></F>
            <F label="Longitude"><input className="oinp" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Début"><input type="datetime-local" className="oinp" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} data-testid="f-starts" /></F>
            <F label="Fin"><input type="datetime-local" className="oinp" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></F>
          </div>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2"><p className="font-bold text-sm">Billets</p><button onClick={addTier} className="text-xs font-bold" style={{ color: accent }} data-testid="add-tier">+ Ajouter</button></div>
            {form.tiers.map((t, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input className="oinp flex-1" placeholder="Nom" value={t.name} onChange={(e) => setTier(i, 'name', e.target.value)} data-testid={`tier-name-${i}`} />
                <input className="oinp w-20" type="number" placeholder="Prix" value={t.price} onChange={(e) => setTier(i, 'price', e.target.value)} data-testid={`tier-price-${i}`} />
                <input className="oinp w-20" type="number" placeholder="Qté" value={t.quantity_total} onChange={(e) => setTier(i, 'quantity_total', e.target.value)} data-testid={`tier-qty-${i}`} />
                {form.tiers.length > 1 && <button onClick={() => delTier(i)} className="text-red-500 text-lg px-1">×</button>}
              </div>
            ))}
          </div>
          <PremiumPassFields value={form.premium_pass} onChange={(pp) => setForm((f) => ({ ...f, premium_pass: pp }))} inputClass="oinp" accent={accent} />
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
          <button onClick={submit} disabled={saving} className="flex-1 text-white font-bold py-2.5 rounded-lg disabled:opacity-60" style={{ background: accent }} data-testid="save-event-btn">{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
      <style>{`.oinp{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font-size:14px;outline:none}.oinp:focus{border-color:${accent}}`}</style>
    </div>
  );
};

const F = ({ label, children }) => (
  <div><label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>{children}</div>
);

export default EventFormModal;
