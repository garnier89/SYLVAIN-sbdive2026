import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { realEstateAPI } from '../../../services/api';
import {
  ArrowLeft, Bed, Bathtub, Ruler, MapPin, Buildings, Star, Phone, ChatCircleText, Check, X, CurrencyEur,
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fmtPrice, catLabel, rentSuffix } from './realEstateConstants';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const PropertyDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [inq, setInq] = useState({ message: '', offer_amount: '', contact_phone: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    realEstateAPI.get(id).then((r) => setP(r.data)).catch(() => toast.error('Annonce introuvable')).finally(() => setLoading(false));
  }, [id]);

  const sendInquiry = async () => {
    setSending(true);
    try {
      await realEstateAPI.createInquiry(id, {
        message: inq.message,
        offer_amount: inq.offer_amount ? parseFloat(inq.offer_amount) : null,
        contact_phone: inq.contact_phone,
      });
      toast.success('Votre demande a été envoyée au propriétaire !');
      setShowContact(false);
      setInq({ message: '', offer_amount: '', contact_phone: '' });
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de l\'envoi'); } finally { setSending(false); }
  };

  if (loading) return <div className="mobile-container min-h-screen bg-white flex items-center justify-center text-gray-400">Chargement...</div>;
  if (!p) return <div className="mobile-container min-h-screen bg-white flex items-center justify-center text-gray-400">Introuvable.</div>;

  const images = p.images || [];
  const details = [
    p.bedrooms != null && { icon: Bed, label: `${p.bedrooms} ch.` },
    p.bathrooms != null && { icon: Bathtub, label: `${p.bathrooms} sdb` },
    p.area_sqm != null && { icon: Ruler, label: `${p.area_sqm} m²` },
  ].filter(Boolean);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="property-detail-page">
      {/* Gallery */}
      <div className="relative h-64 bg-gray-200">
        {images.length > 0
          ? <img src={images[activeImg]} alt={p.title} className="w-full h-full object-cover" data-testid="property-main-image" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300"><Buildings size={56} weight="duotone" /></div>}
        <button onClick={() => navigate(-1)} className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center" data-testid="property-back-btn"><ArrowLeft size={20} /></button>
        {p.is_featured && (
          <span className="absolute top-3 right-3 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow"><Star size={12} weight="fill" /> Sponsorisé</span>
        )}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => <span key={i} className={`w-2 h-2 rounded-full ${i === activeImg ? 'bg-white' : 'bg-white/50'}`} />)}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-white">
          {images.map((img, i) => (
            <button key={i} onClick={() => setActiveImg(i)} className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${i === activeImg ? 'border-[#FF5000]' : 'border-transparent'}`}>
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF5000]/10 text-[#FF5000]">{p.listing_type === 'rent' ? 'À louer' : 'À vendre'}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{catLabel(p.category)}{p.property_subtype ? ` · ${p.property_subtype}` : ''}</span>
          </div>
          <p className="text-2xl font-extrabold text-[#FF5000]" data-testid="property-price">{fmtPrice(p.price)}<span className="text-sm font-medium text-gray-400">{p.listing_type === 'rent' ? ` ${rentSuffix(p.rent_period)}` : ''}</span></p>
          <h1 className="text-lg font-bold text-gray-900 mt-1" data-testid="property-title">{p.title}</h1>
          {(p.address || p.city) && <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin size={15} /> {p.address || p.city}</p>}
          {details.length > 0 && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
              {details.map((d, i) => <span key={i} className="flex items-center gap-1.5 text-sm text-gray-700 font-medium"><d.icon size={18} weight="duotone" className="text-gray-400" /> {d.label}</span>)}
            </div>
          )}
        </div>

        {p.description && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Description</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.description}</p>
          </div>
        )}

        {(p.amenities || []).length > 0 && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Équipements</p>
            <div className="flex flex-wrap gap-2">
              {p.amenities.map((a) => <span key={a} className="flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full"><Check size={13} className="text-green-500" /> {a}</span>)}
            </div>
          </div>
        )}

        {p.lat != null && p.lng != null && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 h-44" data-testid="property-map">
            <MapContainer center={[p.lat, p.lng]} zoom={14} className="w-full h-full" style={{ height: '100%' }} zoomControl={false} scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[p.lat, p.lng]} />
            </MapContainer>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-[#FF5000]/10 flex items-center justify-center font-bold text-[#FF5000]">{(p.owner_name || 'P')[0].toUpperCase()}</div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-sm">{p.owner_name || 'Propriétaire'}</p>
            <p className="text-xs text-gray-500">Annonceur · {p.views || 0} vues</p>
          </div>
        </div>
      </div>

      {/* Sticky contact bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-100 p-3 flex gap-3 z-20">
        {p.owner_phone && (
          <a href={`tel:${p.owner_phone}`} data-testid="property-call-btn" className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-2xl font-semibold">
            <Phone size={18} weight="fill" /> Appeler
          </a>
        )}
        <button onClick={() => setShowContact(true)} data-testid="property-contact-btn" className="flex-1 flex items-center justify-center gap-2 bg-[#FF5000] text-white py-3 rounded-2xl font-semibold">
          <ChatCircleText size={18} weight="fill" /> Faire une offre
        </button>
      </div>

      {/* Contact / offer modal */}
      {showContact && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center" onClick={() => setShowContact(false)}>
          <div className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()} data-testid="property-contact-modal">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Contacter le propriétaire</h3>
              <button onClick={() => setShowContact(false)} className="text-gray-400"><X size={22} /></button>
            </div>
            <div className="relative">
              <CurrencyEur size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="number" value={inq.offer_amount} onChange={(e) => setInq({ ...inq, offer_amount: e.target.value })} placeholder="Votre offre (optionnel)" data-testid="inquiry-offer-input"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
            </div>
            <textarea value={inq.message} onChange={(e) => setInq({ ...inq, message: e.target.value })} placeholder="Votre message au propriétaire..." data-testid="inquiry-message-input"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none h-24" />
            <input value={inq.contact_phone} onChange={(e) => setInq({ ...inq, contact_phone: e.target.value })} placeholder="Votre téléphone (pour être rappelé)" data-testid="inquiry-phone-input"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            <button onClick={sendInquiry} disabled={sending} data-testid="inquiry-send-btn" className="w-full bg-[#FF5000] text-white py-3 rounded-2xl font-semibold disabled:opacity-60">
              {sending ? 'Envoi...' : 'Envoyer la demande'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyDetailPage;
