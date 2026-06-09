import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Clock, SealPercent, ForkKnife, Lightning, Storefront } from '@phosphor-icons/react';
import { ImageUpload, GalleryUpload } from '../../components/ImageUpload';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche' };
const FLASH_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const defaultHours = () => DAY_KEYS.reduce((acc, d) => { acc[d] = { closed: false, slots: [['09:00', '19:00']] }; return acc; }, {});

const MerchantSettings = () => {
  const [vitrine, setVitrine] = useState(null);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/merchants/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m) setVitrine({
          store_name: m.store_name, address: m.address,
          cuisine: m.cuisine || '', discount_pct: m.discount_pct || 0,
          delivery_fee: m.delivery_fee ?? 2.5, eta_min: m.eta_min || 30,
          image_url: m.image_url || '', banner_url: m.banner_url || '', gallery: m.gallery || [],
          phone: m.phone || '', description: m.description || '', storefront_category: m.storefront_category || '',
          hours: m.hours && Object.keys(m.hours).length ? m.hours : defaultHours(),
          flash: m.flash_discount || { enabled: false, pct: 20, start_time: '14:00', end_time: '17:00', days: [] },
          flash_active: m.flash_active,
        });
      })
      .catch(() => {});
    fetch(`${API}/api/merchants/meta/categories`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
  }, []);

  const save = async (extra = {}) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/merchants/me`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuisine: vitrine.cuisine, description: vitrine.description,
          discount_pct: Number(vitrine.discount_pct) || 0,
          delivery_fee: Number(vitrine.delivery_fee) || 0,
          eta_min: Number(vitrine.eta_min) || 30,
          image_url: vitrine.image_url || '', banner_url: vitrine.banner_url || '',
          gallery: vitrine.gallery || [], phone: vitrine.phone || '',
          storefront_category: vitrine.storefront_category || '',
          hours: vitrine.hours, flash_discount: { ...vitrine.flash, pct: Number(vitrine.flash.pct) || 0 },
          ...extra,
        }),
      });
      if (res.ok) { const m = await res.json(); setVitrine((v) => ({ ...v, ...m, flash: m.flash_discount || v.flash })); toast.success('Boutique mise à jour !'); }
      else toast.error("Échec de l'enregistrement");
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const toggleFlashDay = (i) => setVitrine((v) => {
    const days = v.flash.days.includes(i) ? v.flash.days.filter((d) => d !== i) : [...v.flash.days, i];
    return { ...v, flash: { ...v.flash, days } };
  });

  const setDayClosed = (d, closed) => setVitrine((v) => ({ ...v, hours: { ...v.hours, [d]: { ...v.hours[d], closed } } }));
  const setSlot = (d, idx, pos, val) => setVitrine((v) => {
    const slots = (v.hours[d].slots || []).map((s) => [...s]);
    if (!slots[idx]) slots[idx] = ['', ''];
    slots[idx][pos] = val;
    return { ...v, hours: { ...v.hours, [d]: { ...v.hours[d], slots } } };
  });
  const addSlot = (d) => setVitrine((v) => {
    const slots = [...(v.hours[d].slots || [])];
    if (slots.length < 2) slots.push(['14:00', '18:00']);
    return { ...v, hours: { ...v.hours, [d]: { ...v.hours[d], slots } } };
  });
  const removeSlot = (d, idx) => setVitrine((v) => {
    const slots = (v.hours[d].slots || []).filter((_, i) => i !== idx);
    return { ...v, hours: { ...v.hours, [d]: { ...v.hours[d], slots } } };
  });

  if (!vitrine) return <div className="p-6 text-gray-500">Chargement de votre boutique…</div>;

  return (
    <div className="p-6" data-testid="merchant-settings">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Vitrine de la boutique</h1>
      <p className="text-gray-500 mb-6">{vitrine.store_name} · {vitrine.address}</p>

      <div className="grid gap-6 max-w-2xl">
        {/* Vitrine & Réduction */}
        <Card className="border-orange-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ForkKnife size={18} className="text-orange-500" /> Vitrine & Réduction</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ImageUpload label="Logo / photo de la boutique" value={vitrine.image_url} onChange={(url) => setVitrine({ ...vitrine, image_url: url })} testId="vitrine-logo-upload" />
            <ImageUpload label="Bannière (en-tête de la boutique)" value={vitrine.banner_url} onChange={(url) => setVitrine({ ...vitrine, banner_url: url })} testId="vitrine-banner-upload" />
            <GalleryUpload label="Galerie boutique" value={vitrine.gallery} max={12} onChange={(g) => setVitrine({ ...vitrine, gallery: g })} testId="vitrine-gallery-upload" />
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
              <Input value={vitrine.description} onChange={(e) => setVitrine({ ...vitrine, description: e.target.value })} placeholder="Présentez votre boutique…" data-testid="vitrine-description" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Type de cuisine</label>
              <Input value={vitrine.cuisine} onChange={(e) => setVitrine({ ...vitrine, cuisine: e.target.value })} placeholder="Ex : Italien, Japonais…" data-testid="vitrine-cuisine" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><SealPercent size={14} className="text-red-500" /> Réduction (%)</label>
              <Input type="number" min="0" max="90" step="1" value={vitrine.discount_pct} onChange={(e) => setVitrine({ ...vitrine, discount_pct: e.target.value })} data-testid="vitrine-discount" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Frais de livraison (€)</label>
                <Input type="number" min="0" step="0.5" value={vitrine.delivery_fee} onChange={(e) => setVitrine({ ...vitrine, delivery_fee: e.target.value })} data-testid="vitrine-delivery" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Délai (min)</label>
                <Input type="number" min="1" step="5" value={vitrine.eta_min} onChange={(e) => setVitrine({ ...vitrine, eta_min: e.target.value })} data-testid="vitrine-eta" />
              </div>
            </div>
            <Button onClick={() => save()} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="save-vitrine-btn">
              {saving ? 'Enregistrement…' : 'Enregistrer la vitrine'}
            </Button>
          </CardContent>
        </Card>

        {/* Contact & Catégorie */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Storefront size={18} /> Contact & Catégorie</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Téléphone</label>
              <Input value={vitrine.phone} onChange={(e) => setVitrine({ ...vitrine, phone: e.target.value })} placeholder="+596 6 00 00 00 00" data-testid="merchant-phone" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Catégorie de commerce</label>
              <select value={vitrine.storefront_category} onChange={(e) => setVitrine({ ...vitrine, storefront_category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" data-testid="merchant-category">
                <option value="">Choisir…</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Button onClick={() => save()} disabled={saving} className="bg-gray-800 hover:bg-gray-900 text-white" data-testid="save-contact-btn">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </CardContent>
        </Card>

        {/* Horaires d'ouverture structurés */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock size={18} /> Horaires d'ouverture</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {DAY_KEYS.map((d) => {
              const day = vitrine.hours[d] || { closed: false, slots: [] };
              return (
                <div key={d} className="border rounded-lg p-3" data-testid={`hours-row-${d}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 text-sm">{DAY_LABELS[d]}</span>
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={!!day.closed} onChange={(e) => setDayClosed(d, e.target.checked)} data-testid={`hours-closed-${d}`} /> Fermé
                    </label>
                  </div>
                  {!day.closed && (
                    <div className="space-y-2">
                      {(day.slots || []).map((slot, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input type="time" value={slot[0]} onChange={(e) => setSlot(d, idx, 0, e.target.value)} className="w-32" data-testid={`hours-${d}-${idx}-open`} />
                          <span className="text-gray-400">–</span>
                          <Input type="time" value={slot[1]} onChange={(e) => setSlot(d, idx, 1, e.target.value)} className="w-32" data-testid={`hours-${d}-${idx}-close`} />
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => removeSlot(d, idx)} data-testid={`hours-${d}-${idx}-remove`}>✕</Button>
                        </div>
                      ))}
                      {(day.slots || []).length < 2 && (
                        <button type="button" onClick={() => addSlot(d)} className="text-xs text-orange-600 font-medium" data-testid={`hours-${d}-add`}>+ Ajouter un créneau (coupure)</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <Button onClick={() => save()} disabled={saving} className="bg-gray-800 hover:bg-gray-900 text-white" data-testid="save-hours-btn">
              {saving ? 'Enregistrement…' : 'Enregistrer les horaires'}
            </Button>
          </CardContent>
        </Card>

        {/* Réduction flash */}
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightning size={18} weight="fill" className="text-amber-500" /> Réduction flash
              {vitrine.flash_active && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">ACTIVE</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={vitrine.flash.enabled} onChange={(e) => setVitrine({ ...vitrine, flash: { ...vitrine.flash, enabled: e.target.checked } })} className="w-4 h-4 text-amber-500 rounded" data-testid="flash-enabled" />
              <span className="text-sm text-gray-700">Activer une réduction sur un créneau horaire</span>
            </label>
            {vitrine.flash.enabled && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Réduction (%)</label>
                    <Input type="number" min="0" max="90" value={vitrine.flash.pct} onChange={(e) => setVitrine({ ...vitrine, flash: { ...vitrine.flash, pct: e.target.value } })} data-testid="flash-pct" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Début</label>
                    <Input type="time" value={vitrine.flash.start_time} onChange={(e) => setVitrine({ ...vitrine, flash: { ...vitrine.flash, start_time: e.target.value } })} data-testid="flash-start" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Fin</label>
                    <Input type="time" value={vitrine.flash.end_time} onChange={(e) => setVitrine({ ...vitrine, flash: { ...vitrine.flash, end_time: e.target.value } })} data-testid="flash-end" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-2">Jours (vide = tous les jours)</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {FLASH_DAYS.map((d, i) => (
                      <button key={d} type="button" onClick={() => toggleFlashDay(i)} data-testid={`flash-day-${i}`}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vitrine.flash.days.includes(i) ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{d}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <Button onClick={() => save()} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-flash-btn">
              {saving ? 'Enregistrement…' : 'Enregistrer la réduction flash'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MerchantSettings;
