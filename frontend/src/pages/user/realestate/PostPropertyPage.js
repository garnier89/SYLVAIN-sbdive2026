import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { realEstateAPI } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { ArrowLeft, Camera, X, MapPin } from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LISTING_TYPES, CATEGORIES, SUBTYPES, RENT_PERIODS, AMENITIES, COUNTRIES } from './realEstateConstants';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
const Picker = ({ onSelect }) => { useMapEvents({ click(e) { onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); } }); return null; };

const Field = ({ label, children }) => (
  <div><label className="text-sm font-semibold text-gray-700 block mb-1.5">{label}</label>{children}</div>
);
const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm';

const PostPropertyPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const editing = !!id;
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({
    listing_type: 'sale', category: 'residential', property_subtype: '', title: '', description: '',
    price: '', rent_period: 'month', bedrooms: '', bathrooms: '', area_sqm: '', furnished: false,
    amenities: [], images: [], address: '', city: '', country: 'FR', lat: null, lng: null,
    owner_name: '', owner_phone: '',
  });
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (editing) {
      realEstateAPI.get(id).then((r) => {
        const d = r.data;
        setF((prev) => ({ ...prev, ...d, price: String(d.price ?? ''), bedrooms: d.bedrooms ?? '', bathrooms: d.bathrooms ?? '', area_sqm: d.area_sqm ?? '', amenities: d.amenities || [], images: d.images || [] }));
      }).catch(() => toast.error('Annonce introuvable'));
    } else if (user) {
      setF((prev) => ({ ...prev, owner_name: user.name || '', owner_phone: user.phone || '' }));
    }
  }, [id, editing, user]);

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const toggleAmenity = (a) => setF((prev) => ({ ...prev, amenities: prev.amenities.includes(a) ? prev.amenities.filter((x) => x !== a) : [...prev.amenities, a] }));

  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    const remaining = 12 - f.images.length;
    files.slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setF((prev) => ({ ...prev, images: [...prev.images, reader.result] }));
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };
  const removeImage = (i) => setF((prev) => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }));

  const submit = async () => {
    if (!f.title || f.title.length < 3) return toast.error('Titre requis (min. 3 caractères)');
    if (!f.price || parseFloat(f.price) <= 0) return toast.error('Prix requis');
    setLoading(true);
    const payload = {
      listing_type: f.listing_type, category: f.category, property_subtype: f.property_subtype || null,
      title: f.title, description: f.description, price: parseFloat(f.price),
      rent_period: f.listing_type === 'rent' ? f.rent_period : null,
      bedrooms: f.bedrooms !== '' ? parseInt(f.bedrooms) : null,
      bathrooms: f.bathrooms !== '' ? parseInt(f.bathrooms) : null,
      area_sqm: f.area_sqm !== '' ? parseFloat(f.area_sqm) : null,
      furnished: f.category === 'residential' ? f.furnished : null,
      amenities: f.amenities, images: f.images, address: f.address, city: f.city, country: f.country,
      lat: f.lat, lng: f.lng, owner_name: f.owner_name, owner_phone: f.owner_phone,
    };
    try {
      if (editing) await realEstateAPI.update(id, payload);
      else await realEstateAPI.create(payload);
      toast.success(editing ? 'Annonce mise à jour' : 'Annonce publiée !');
      navigate('/real-estate/my');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } finally { setLoading(false); }
  };

  const subtypes = SUBTYPES[f.category] || [];

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="post-property-page">
      <div className="bg-[#FF5000] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="text-white" data-testid="post-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-lg">{editing ? 'Modifier l\'annonce' : 'Publier une annonce'}</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Type */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <Field label="Type d'annonce">
            <div className="grid grid-cols-2 gap-2">
              {LISTING_TYPES.map((t) => (
                <button key={t.id} onClick={() => set('listing_type', t.id)} data-testid={`post-type-${t.id}`}
                  className={`py-2.5 rounded-xl border text-sm font-bold ${f.listing_type === t.id ? 'border-[#FF5000] bg-[#FF5000]/10 text-[#FF5000]' : 'border-gray-200 text-gray-500'}`}>{t.label}</button>
              ))}
            </div>
          </Field>
          <Field label="Catégorie">
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => { set('category', c.id); set('property_subtype', ''); }} data-testid={`post-cat-${c.id}`}
                  className={`py-2.5 rounded-xl border text-xs font-bold ${f.category === c.id ? 'border-[#FF5000] bg-[#FF5000]/10 text-[#FF5000]' : 'border-gray-200 text-gray-500'}`}>{c.emoji}<br />{c.label}</button>
              ))}
            </div>
          </Field>
          {subtypes.length > 0 && (
            <Field label="Sous-type">
              <select value={f.property_subtype} onChange={(e) => set('property_subtype', e.target.value)} className={inputCls} data-testid="post-subtype">
                <option value="">— Choisir —</option>
                {subtypes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
        </div>

        {/* Main info */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <Field label="Titre"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex: Bel appartement T3 avec balcon" className={inputCls} data-testid="post-title" /></Field>
          <Field label="Description"><textarea value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Décrivez le bien..." className={`${inputCls} resize-none h-24`} data-testid="post-description" /></Field>
          <Field label={f.listing_type === 'rent' ? 'Loyer (€)' : 'Prix (€)'}>
            <div className="flex gap-2">
              <input type="number" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="0" className={inputCls} data-testid="post-price" />
              {f.listing_type === 'rent' && (
                <select value={f.rent_period} onChange={(e) => set('rent_period', e.target.value)} className="border border-gray-200 rounded-xl px-2 text-sm" data-testid="post-rent-period">
                  {RENT_PERIODS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              )}
            </div>
          </Field>
        </div>

        {/* Property specs */}
        {f.category !== 'land' && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Chambres"><input type="number" value={f.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} className={inputCls} data-testid="post-bedrooms" /></Field>
              <Field label="SdB"><input type="number" value={f.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} className={inputCls} data-testid="post-bathrooms" /></Field>
              <Field label="Surface m²"><input type="number" value={f.area_sqm} onChange={(e) => set('area_sqm', e.target.value)} className={inputCls} data-testid="post-area" /></Field>
            </div>
            {f.category === 'residential' && (
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.furnished} onChange={(e) => set('furnished', e.target.checked)} data-testid="post-furnished" /> Meublé</label>
            )}
          </div>
        )}
        {f.category === 'land' && (
          <div className="bg-white rounded-2xl p-4">
            <Field label="Surface (m²)"><input type="number" value={f.area_sqm} onChange={(e) => set('area_sqm', e.target.value)} className={inputCls} data-testid="post-area" /></Field>
          </div>
        )}

        {/* Photos */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Photos ({f.images.length}/12)</p>
          <div className="grid grid-cols-3 gap-2">
            {f.images.map((img, i) => (
              <div key={img} className="relative aspect-square rounded-xl overflow-hidden">
                <img src={img} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeImage(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center" data-testid={`post-remove-img-${i}`}><X size={14} /></button>
              </div>
            ))}
            {f.images.length < 12 && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer" data-testid="post-add-photo">
                <Camera size={24} /><span className="text-[10px] mt-1">Ajouter</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
              </label>
            )}
          </div>
        </div>

        {/* Amenities */}
        {f.category !== 'land' && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Équipements</p>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((a) => (
                <button key={a} onClick={() => toggleAmenity(a)} data-testid={`post-amenity-${a}`}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border ${f.amenities.includes(a) ? 'bg-[#FF5000]/10 border-[#FF5000] text-[#FF5000]' : 'bg-white border-gray-200 text-gray-600'}`}>{a}</button>
              ))}
            </div>
          </div>
        )}

        {/* Location */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <Field label="Pays / localité">
            <select value={f.country} onChange={(e) => set('country', e.target.value)} className={inputCls} data-testid="post-country">
              {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Adresse"><input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Rue, quartier" className={inputCls} data-testid="post-address" /></Field>
          <Field label="Ville"><input value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Ville" className={inputCls} data-testid="post-city" /></Field>
          <button onClick={() => setSelecting((s) => !s)} className="flex items-center gap-2 text-sm font-semibold text-[#FF5000]" data-testid="post-toggle-map">
            <MapPin size={16} /> {f.lat ? `Position définie (${f.lat.toFixed(4)}, ${f.lng.toFixed(4)})` : 'Placer sur la carte'}
          </button>
          {selecting && (
            <div className="rounded-xl overflow-hidden h-48">
              <MapContainer center={[f.lat || 48.8566, f.lng || 2.3522]} zoom={12} className="w-full h-full" style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Picker onSelect={(c) => { set('lat', c.lat); set('lng', c.lng); }} />
                {f.lat && <Marker position={[f.lat, f.lng]} />}
              </MapContainer>
            </div>
          )}
        </div>

        {/* Owner contact */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <Field label="Nom du contact"><input value={f.owner_name} onChange={(e) => set('owner_name', e.target.value)} className={inputCls} data-testid="post-owner-name" /></Field>
          <Field label="Téléphone"><input value={f.owner_phone} onChange={(e) => set('owner_phone', e.target.value)} placeholder="+33..." className={inputCls} data-testid="post-owner-phone" /></Field>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-100 p-3 z-20">
        <button onClick={submit} disabled={loading} data-testid="post-submit-btn" className="w-full bg-[#FF5000] text-white py-3.5 rounded-2xl font-bold disabled:opacity-60">
          {loading ? 'Publication...' : (editing ? 'Enregistrer les modifications' : 'Publier l\'annonce')}
        </button>
      </div>
    </div>
  );
};

export default PostPropertyPage;
