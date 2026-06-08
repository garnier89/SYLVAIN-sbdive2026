import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Car, Camera, Tag, ShieldCheck, Hourglass } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { kycAPI, marketplaceAPI } from '../../services/api';

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const FUELS = ['Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL'];
const TRANS = ['Manuelle', 'Automatique'];
const EMPTY = {
  title: '', brand: '', model: '', year: '', mileage: '', fuel: 'Essence', transmission: 'Manuelle',
  price: '', listing_type: 'sell', rent_period: 'day', location: '', description: '', purchasable: false,
};

const PostVehiclePage = () => {
  const navigate = useNavigate();
  const [kyc, setKyc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [img, setImg] = useState(null);
  const [posting, setPosting] = useState(false);
  const imgRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let alive = true;
    kycAPI.me().then((r) => { if (alive) setKyc(r.data); })
      .catch(() => { if (alive) setKyc({ can_sell: false, status: 'none' }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pickImg = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image trop volumineuse (max 5 Mo)'); return; }
    setImg(await fileToDataUrl(file));
  };

  const submit = async () => {
    if (!form.title.trim() || !form.price) { toast.error('Titre et prix requis'); return; }
    setPosting(true);
    try {
      await marketplaceAPI.createListing({
        title: form.title.trim(),
        price: Number(form.price),
        kind: 'vehicle', type: 'cars', category: 'cars',
        listing_type: form.listing_type,
        rent_period: form.listing_type === 'rent' ? form.rent_period : null,
        purchasable: form.listing_type === 'sell' ? !!form.purchasable : false,
        location: form.location,
        description: form.description,
        vehicle: {
          brand: form.brand.trim(), model: form.model.trim(),
          year: form.year ? Number(form.year) : null,
          mileage: form.mileage ? Number(form.mileage) : null,
          fuel: form.fuel, transmission: form.transmission,
        },
        images: img ? [img] : [],
      });
      toast.success('Véhicule publié sur le Marketplace !');
      navigate('/marketplace/cars');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Publication impossible'); }
    finally { setPosting(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="post-vehicle-page">
      <div className="bg-gradient-to-br from-blue-700 to-indigo-900 text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="back-button"><ArrowLeft size={24} /></button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Car size={26} weight="fill" /> Vendre ou louer un véhicule</h1>
        <p className="text-sm text-white/80 mt-1">Renseignez les caractéristiques de votre véhicule.</p>
      </div>

      <div className="px-4 -mt-3">
        {loading ? (
          <div className="py-16 flex justify-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : !kyc?.can_sell ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm text-center" data-testid="kyc-required">
            {kyc?.status === 'pending'
              ? <><Hourglass size={28} weight="fill" className="text-amber-500 mx-auto mb-2" /><p className="text-sm font-semibold text-gray-800">Vos documents sont en cours de vérification.</p></>
              : <><ShieldCheck size={28} weight="fill" className="text-emerald-600 mx-auto mb-2" /><p className="text-sm font-semibold text-gray-800">Vérification d'identité requise pour vendre.</p></>}
            <button onClick={() => navigate('/ma-galerie')} className="mt-3 bg-emerald-600 text-white rounded-xl px-5 py-2.5 font-bold text-sm" data-testid="go-kyc-btn">Vérifier mon identité</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Titre (ex. Peugeot 208 GT Line)" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-title" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Marque" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-brand" />
              <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Modèle" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-model" />
              <input type="number" value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="Année" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-year" />
              <input type="number" value={form.mileage} onChange={(e) => set('mileage', e.target.value)} placeholder="Kilométrage" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-mileage" />
              <select value={form.fuel} onChange={(e) => set('fuel', e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-fuel">
                {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={form.transmission} onChange={(e) => set('transmission', e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-transmission">
                {TRANS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Sell vs rent */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => set('listing_type', 'sell')} className={`rounded-xl py-2.5 text-sm font-bold border ${form.listing_type === 'sell' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid="vehicle-mode-sell">À vendre</button>
              <button onClick={() => set('listing_type', 'rent')} className={`rounded-xl py-2.5 text-sm font-bold border ${form.listing_type === 'rent' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid="vehicle-mode-rent">À louer</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Tag size={15} className="absolute left-3 top-3 text-gray-400" />
                <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder={form.listing_type === 'rent' ? 'Prix / période (€)' : 'Prix (€)'} className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm" data-testid="vehicle-price" />
              </div>
              {form.listing_type === 'rent' && (
                <select value={form.rent_period} onChange={(e) => set('rent_period', e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-rent-period">
                  <option value="day">par jour</option>
                  <option value="month">par mois</option>
                </select>
              )}
            </div>

            <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Ville / localisation" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-location" />
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Description (état, options...)" rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="vehicle-description" />

            {form.listing_type === 'sell' && (
              <label className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 cursor-pointer" data-testid="vehicle-purchasable-toggle">
                <input type="checkbox" checked={form.purchasable} onChange={(e) => set('purchasable', e.target.checked)} className="w-4 h-4 accent-emerald-600" data-testid="vehicle-purchasable" />
                <span className="text-xs text-gray-700"><b>Prix fixe — achetable en ligne</b> (paiement direct, commission déduite). Décochez pour « sur contact / négociable ».</span>
              </label>
            )}

            <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => pickImg(e.target.files?.[0])} />
            <button onClick={() => imgRef.current?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-500 flex items-center justify-center gap-2" data-testid="vehicle-photo-btn">
              <Camera size={16} /> {img ? 'Photo ajoutée ✓' : 'Ajouter une photo'}
            </button>
            <button onClick={submit} disabled={posting} className="w-full bg-blue-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50" data-testid="post-vehicle-btn">
              {posting ? 'Publication…' : 'Publier le véhicule'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostVehiclePage;
