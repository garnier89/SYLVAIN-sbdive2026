import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import {
  ArrowLeft, FloppyDisk, Translate, Plus, Trash, Camera, X, CaretDown, CaretUp, Sparkle,
} from '@phosphor-icons/react';
import { CURRENCIES, LANGUAGES, DAYS, ICON_TYPES, ZONES, FARE_STRATEGIES, currencySymbol } from './vehicleTypeConstants';

const API = process.env.REACT_APP_BACKEND_URL;

const Section = ({ title, desc, children }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
    <h3 className="text-sm font-bold text-gray-800">{title}</h3>
    {desc && <p className="text-xs text-gray-500 mb-3">{desc}</p>}
    <div className={desc ? '' : 'mt-3'}>{children}</div>
  </div>
);

const Field = ({ label, children, hint }) => (
  <div>
    <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
  </div>
);

const Toggle = ({ checked, onChange, label, testid }) => (
  <button type="button" onClick={() => onChange(!checked)} data-testid={testid}
    aria-pressed={checked} data-state={checked ? 'on' : 'off'}
    className="flex items-center justify-between w-full py-2">
    <span className="text-sm text-gray-700">{label}</span>
    <span className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-[#FF5000]' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  </button>
);

const num = (v) => (v === '' || v === null || v === undefined ? '' : v);

const WeekSchedule = ({ value, onChange, currency, testidPrefix }) => {
  const days = value?.days || {};
  const setDay = (id, patch) => {
    const next = { ...days };
    next[id] = { start: '', end: '', price: '', ...next[id], ...patch };
    onChange({ ...value, days: next });
  };
  const removeDay = (id) => { const next = { ...days }; delete next[id]; onChange({ ...value, days: next }); };
  return (
    <div className="mt-2 space-y-1.5">
      {DAYS.map((d) => {
        const active = !!days[d.id];
        const row = days[d.id] || {};
        return (
          <div key={d.id} className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => (active ? removeDay(d.id) : setDay(d.id, {}))} data-testid={`${testidPrefix}-day-${d.id}`}
              className={`w-20 shrink-0 text-left px-2 py-1.5 rounded-lg border ${active ? 'bg-[#FF5000]/10 border-[#FF5000] text-[#FF5000] font-semibold' : 'border-gray-200 text-gray-500'}`}>
              {d.label}
            </button>
            <input type="time" disabled={!active} value={row.start || ''} onChange={(e) => setDay(d.id, { start: e.target.value })}
              data-testid={`${testidPrefix}-${d.id}-start`}
              className="border border-gray-200 rounded-lg px-2 py-1.5 disabled:bg-gray-50 disabled:text-gray-300 flex-1" />
            <span className="text-gray-300">→</span>
            <input type="time" disabled={!active} value={row.end || ''} onChange={(e) => setDay(d.id, { end: e.target.value })}
              data-testid={`${testidPrefix}-${d.id}-end`}
              className="border border-gray-200 rounded-lg px-2 py-1.5 disabled:bg-gray-50 disabled:text-gray-300 flex-1" />
            <div className="relative w-24">
              <input type="number" disabled={!active} placeholder="Prix" value={num(row.price)} onChange={(e) => setDay(d.id, { price: e.target.value })}
                data-testid={`${testidPrefix}-${d.id}-price`}
                className="border border-gray-200 rounded-lg pl-2 pr-6 py-1.5 disabled:bg-gray-50 disabled:text-gray-300 w-full" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">{currencySymbol(currency)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ImageUpload = ({ label, value, onChange, testid }) => {
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <Field label={label} hint="PNG transparent recommandé · 360×360">
      {value ? (
        <div className="relative w-28 h-28 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
          <img src={value} alt={label} className="w-full h-full object-contain" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"><X size={13} /></button>
        </div>
      ) : (
        <label className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer" data-testid={testid}>
          <Camera size={22} /><span className="text-[10px] mt-1">Importer</span>
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
      )}
    </Field>
  );
};

const inputCls = 'w-full';

export default function VehicleTypeEditor({ item, onSaved, onCancel }) {
  const editing = !!item?.slug && item._isExisting;
  const [f, setF] = useState({
    slug: '', name_fr: '', name_en: '', name_translations: {}, name_rental: '', category: 'ride',
    icon_type: 'Car', show_as: 'list', info: '', currency: 'EUR', display_order: 99,
    allow_whatsapp_booking: false, enable_pool: false, assist_available: false, pet_friendly: false,
    ask_otp_before_ride: false, fare_model_strategy: 'incremental', pool_percentage: 90,
    price_per_km: 1.5, price_per_min: 0.3, min_fare: 10, base_fare: 5, commission_percent: 15,
    zone_overrides: [],
    user_cancel_time_limit: 5, user_cancel_charges: 4, waiting_time_limit: 1, waiting_charges: 20, intransit_waiting_fee_per_min: 0.3,
    person_capacity: 4,
    peak_slot1: { enabled: false, days: {} }, peak_slot2: { enabled: false, days: {} }, night_charges: { enabled: false, days: {} },
    image_unselected: null, image_selected: null,
    ...item,
  });
  const [showTranslations, setShowTranslations] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const sym = currencySymbol(f.currency);

  const autoTranslate = async () => {
    const base = f.name_fr || f.name_en;
    if (!base) { toast.error('Renseignez d\'abord le nom (FR ou EN)'); return; }
    setTranslating(true);
    try {
      const res = await fetch(`${API}/api/admin/vehicle-types/translate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ text: base, langs: LANGUAGES.map((l) => l.code) }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Échec');
      const data = await res.json();
      setF((p) => ({ ...p, name_translations: { ...p.name_translations, ...data.translations } }));
      toast.success('Traductions générées ✨');
    } catch (e) { toast.error(e.message || 'Échec de la traduction'); } finally { setTranslating(false); }
  };
  const copyFrEverywhere = () => {
    const base = f.name_fr || f.name_en;
    if (!base) return;
    const t = {}; LANGUAGES.forEach((l) => { t[l.code] = f.name_translations[l.code] || base; });
    setF((p) => ({ ...p, name_translations: t }));
    toast.success('Nom copié dans toutes les langues');
  };

  const addZone = () => set('zone_overrides', [...f.zone_overrides, { _id: crypto.randomUUID(), zone: ZONES[0], price_per_km: f.price_per_km, price_per_min: f.price_per_min, base_fare: f.base_fare, min_fare: f.min_fare }]);
  const updZone = (i, patch) => set('zone_overrides', f.zone_overrides.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  const delZone = (i) => set('zone_overrides', f.zone_overrides.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!f.slug?.trim()) { toast.error('Slug requis'); return; }
    if (!f.name_fr?.trim()) { toast.error('Nom (FR) requis'); return; }
    setSaving(true);
    const payload = {
      ...f,
      name_translations: { ...f.name_translations, fr: f.name_translations.fr || f.name_fr, en: f.name_translations.en || f.name_en },
      price_per_km: parseFloat(f.price_per_km) || 0, price_per_min: parseFloat(f.price_per_min) || 0,
      min_fare: parseFloat(f.min_fare) || 0, base_fare: parseFloat(f.base_fare) || 0,
      commission_percent: parseFloat(f.commission_percent) || 0,
      pool_percentage: parseFloat(f.pool_percentage) || 0,
      user_cancel_time_limit: parseInt(f.user_cancel_time_limit) || 0, user_cancel_charges: parseFloat(f.user_cancel_charges) || 0,
      waiting_time_limit: parseInt(f.waiting_time_limit) || 0, waiting_charges: parseFloat(f.waiting_charges) || 0,
      intransit_waiting_fee_per_min: parseFloat(f.intransit_waiting_fee_per_min) || 0,
      person_capacity: parseInt(f.person_capacity) || 1, display_order: parseInt(f.display_order) || 99,
    };
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API}/api/admin/vehicle-types/${f.slug}` : `${API}/api/admin/vehicle-types`;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).detail || 'Échec');
      toast.success(editing ? 'Type de véhicule mis à jour' : 'Type de véhicule créé');
      onSaved();
    } catch (e) { toast.error(e.message || 'Échec'); } finally { setSaving(false); }
  };

  const priceField = (label, key, step = '0.01') => (
    <Field label={label}>
      <div className="relative">
        <Input type="number" step={step} value={num(f[key])} onChange={(e) => set(key, e.target.value)} className="pr-8" data-testid={`vt-${key}`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{key === 'commission_percent' ? '%' : sym}</span>
      </div>
    </Field>
  );

  return (
    <div className="p-6 max-w-4xl" data-testid="vehicle-type-editor">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={onCancel} data-testid="vt-editor-back"><ArrowLeft size={20} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">{editing ? `Modifier · ${f.name_fr || f.slug}` : 'Nouveau type de véhicule'}</h1>
          <p className="text-xs text-gray-500">Configurez les informations techniques et d'affichage de cette catégorie.</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-[#FF5000] text-white" data-testid="vt-editor-save"><FloppyDisk size={16} className="mr-1.5" />{saving ? '...' : 'Enregistrer'}</Button>
      </div>

      {/* Identity & display */}
      <Section title="Identité & Affichage" desc="Nom, catégorie, icône et présentation du type de véhicule.">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Slug (identifiant) *"><Input value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} disabled={editing} placeholder="ex: berline" data-testid="vt-slug" /></Field>
          <Field label="Nom (Français) *"><Input value={f.name_fr} onChange={(e) => set('name_fr', e.target.value)} placeholder="ex: Berline" data-testid="vt-name-fr" /></Field>
          <Field label="Nom (English)"><Input value={f.name_en} onChange={(e) => set('name_en', e.target.value)} placeholder="ex: Sedan" data-testid="vt-name-en" /></Field>
          <Field label="Nom pour Location"><Input value={f.name_rental} onChange={(e) => set('name_rental', e.target.value)} data-testid="vt-name-rental" /></Field>
          <Field label="Catégorie"><Input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="ride" /></Field>
          <Field label="Type d'icône / Map">
            <select value={f.icon_type} onChange={(e) => set('icon_type', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" data-testid="vt-icon-type">
              {ICON_TYPES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Affichage">
            <select value={f.show_as} onChange={(e) => set('show_as', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" data-testid="vt-show-as">
              <option value="list">Liste</option>
              <option value="grid">Grille</option>
            </select>
          </Field>
          <Field label="Devise">
            <select value={f.currency} onChange={(e) => set('currency', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" data-testid="vt-currency">
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label} ({c.symbol})</option>)}
            </select>
          </Field>
          <Field label="Ordre d'affichage"><Input type="number" value={num(f.display_order)} onChange={(e) => set('display_order', e.target.value)} data-testid="vt-order" /></Field>
        </div>
        <div className="mt-3">
          <Field label="Description"><textarea value={f.info} onChange={(e) => set('info', e.target.value)} placeholder="Taxi basique pour les trajets quotidiens." className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-20 resize-none" data-testid="vt-info" /></Field>
        </div>
        {/* Multilingual */}
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setShowTranslations((s) => !s)} className="flex items-center gap-1.5 text-sm font-semibold text-gray-700" data-testid="vt-toggle-translations">
              <Translate size={16} /> Traductions multilingues ({LANGUAGES.length} langues) {showTranslations ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyFrEverywhere} data-testid="vt-copy-all">Copier partout</Button>
              <Button type="button" size="sm" onClick={autoTranslate} disabled={translating} className="bg-[#0B1426] text-white" data-testid="vt-auto-translate"><Sparkle size={14} className="mr-1" />{translating ? 'Traduction...' : 'Traduire automatiquement'}</Button>
            </div>
          </div>
          {showTranslations && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3" data-testid="vt-translations-grid">
              {LANGUAGES.map((l) => (
                <div key={l.code}>
                  <label className="text-[11px] text-gray-500">{l.label}</label>
                  <Input value={f.name_translations[l.code] || ''} onChange={(e) => set('name_translations', { ...f.name_translations, [l.code]: e.target.value })} className="h-8 text-sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Feature toggles */}
      <Section title="Fonctionnalités de la course">
        <div className="grid md:grid-cols-2 gap-x-8 divide-y md:divide-y-0">
          <Toggle checked={f.allow_whatsapp_booking} onChange={(v) => set('allow_whatsapp_booking', v)} label="Réservation via WhatsApp" testid="vt-wa" />
          <Toggle checked={f.enable_pool} onChange={(v) => set('enable_pool', v)} label="Activer Pool (course partagée)" testid="vt-pool" />
          <Toggle checked={f.assist_available} onChange={(v) => set('assist_available', v)} label="Assistance disponible" testid="vt-assist" />
          <Toggle checked={f.pet_friendly} onChange={(v) => set('pet_friendly', v)} label="Animaux acceptés" testid="vt-pet" />
        </div>
      </Section>

      {/* Security & fare strategy */}
      <Section title="Sécurité & Stratégie tarifaire">
        <Toggle checked={f.ask_otp_before_ride} onChange={(v) => set('ask_otp_before_ride', v)} label="Demander un code OTP avant de démarrer la course" testid="vt-otp" />
        <Field label="Modèle de tarification">
          <select value={f.fare_model_strategy} onChange={(e) => set('fare_model_strategy', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" data-testid="vt-fare-strategy">
            {FARE_STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        {f.enable_pool && <p className="text-[11px] text-amber-600 mt-1">⚠️ Pool activé → seul le modèle « Fixe » s'applique.</p>}
        {f.enable_pool && (
          <div className="mt-4 border-t border-gray-100 pt-3" data-testid="vt-pool-pricing">
            <Field label="Pourcentage Pool (%) *" hint="1ʳᵉ place = plein tarif. Chaque place suivante coûte ce % du tarif plein. Ex : tarif 10€ et Pool % = 80 → 2 places = 10€ + 8€ = 18€.">
              <div className="relative max-w-[180px]">
                <Input type="number" step="0.01" value={num(f.pool_percentage)} onChange={(e) => set('pool_percentage', e.target.value)} className="pr-8" data-testid="vt-pool-percentage" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
              </div>
            </Field>
          </div>
        )}
      </Section>

      {/* Base pricing */}
      <Section title="Tarification de base" desc="Tarifs appliqués par défaut (zone « Toutes »).">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {priceField(`Prix / km`, 'price_per_km')}
          {priceField(`Prix / min`, 'price_per_min')}
          {priceField(`Tarif minimum`, 'min_fare')}
          {priceField(`Tarif de base`, 'base_fare')}
          {priceField(`Commission`, 'commission_percent')}
        </div>
        {/* Zone overrides */}
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Surcoûts par zone / localité</p>
            <Button type="button" variant="outline" size="sm" onClick={addZone} data-testid="vt-add-zone"><Plus size={14} className="mr-1" />Ajouter une zone</Button>
          </div>
          {f.zone_overrides.length === 0 && <p className="text-xs text-gray-400">Aucun surcoût. Le tarif de base s'applique partout.</p>}
          {f.zone_overrides.map((z, i) => (
            <div key={z._id ?? `zone-${i}`} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end mb-2 bg-gray-50 rounded-lg p-2" data-testid={`vt-zone-${i}`}>
              <Field label="Zone">
                <select value={z.zone} onChange={(e) => updZone(i, { zone: e.target.value })} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm">
                  {ZONES.map((zn) => <option key={zn} value={zn}>{zn}</option>)}
                </select>
              </Field>
              <Field label="Prix/km"><Input type="number" value={num(z.price_per_km)} onChange={(e) => updZone(i, { price_per_km: e.target.value })} className="h-9" /></Field>
              <Field label="Prix/min"><Input type="number" value={num(z.price_per_min)} onChange={(e) => updZone(i, { price_per_min: e.target.value })} className="h-9" /></Field>
              <Field label="Base"><Input type="number" value={num(z.base_fare)} onChange={(e) => updZone(i, { base_fare: e.target.value })} className="h-9" /></Field>
              <Field label="Min"><Input type="number" value={num(z.min_fare)} onChange={(e) => updZone(i, { min_fare: e.target.value })} className="h-9" /></Field>
              <Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => delZone(i)} data-testid={`vt-zone-del-${i}`}><Trash size={16} /></Button>
            </div>
          ))}
        </div>
      </Section>

      {/* Waiting & cancellation */}
      <Section title="Temps & frais d'attente / annulation">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Délai annulation gratuite (min)"><Input type="number" value={num(f.user_cancel_time_limit)} onChange={(e) => set('user_cancel_time_limit', e.target.value)} data-testid="vt-cancel-time" /></Field>
          {priceField(`Frais d'annulation`, 'user_cancel_charges')}
          <Field label="Limite de temps d'attente (min)"><Input type="number" value={num(f.waiting_time_limit)} onChange={(e) => set('waiting_time_limit', e.target.value)} /></Field>
          {priceField(`Frais d'attente`, 'waiting_charges')}
          {priceField(`Frais d'attente en course / min`, 'intransit_waiting_fee_per_min')}
        </div>
      </Section>

      {/* Capacity & surge */}
      <Section title="Capacité & Surcharges horaires" desc="Capacité passagers et ajustements tarifaires automatiques (heures de pointe, nuit).">
        <Field label="Places / capacité passagers" hint="Hors prestataire de service">
          <Input type="number" value={num(f.person_capacity)} onChange={(e) => set('person_capacity', e.target.value)} className="max-w-[140px]" data-testid="vt-capacity" />
        </Field>
        {[
          { key: 'peak_slot1', label: 'Surcharge heure de pointe — Créneau 1' },
          { key: 'peak_slot2', label: 'Surcharge heure de pointe — Créneau 2' },
          { key: 'night_charges', label: 'Tarif de nuit' },
        ].map((s) => (
          <div key={s.key} className="mt-4 border-t border-gray-100 pt-3">
            <Toggle checked={f[s.key].enabled} onChange={(v) => set(s.key, { ...f[s.key], enabled: v })} label={s.label} testid={`vt-${s.key}-toggle`} />
            {f[s.key].enabled && <WeekSchedule value={f[s.key]} onChange={(v) => set(s.key, v)} currency={f.currency} testidPrefix={`vt-${s.key}`} />}
          </div>
        ))}
      </Section>

      {/* Images */}
      <Section title="Images du véhicule">
        <div className="flex gap-6">
          <ImageUpload label="Image (non sélectionné) *" value={f.image_unselected} onChange={(v) => set('image_unselected', v)} testid="vt-img-unselected" />
          <ImageUpload label="Image (sélectionné) *" value={f.image_selected} onChange={(v) => set('image_selected', v)} testid="vt-img-selected" />
        </div>
      </Section>

      <div className="flex gap-2 pb-10">
        <Button onClick={save} disabled={saving} className="bg-[#FF5000] text-white" data-testid="vt-editor-save-bottom"><FloppyDisk size={16} className="mr-1.5" />{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}
