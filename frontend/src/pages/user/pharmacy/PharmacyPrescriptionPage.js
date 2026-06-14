import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { pharmacyAPI } from '../../../services/api';
import { ArrowLeft, Camera, CheckCircle, Prescription, X } from '@phosphor-icons/react';
import PharmacyMapPicker from './PharmacyMapPicker';

const PharmacyPrescriptionPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pharmacies, setPharmacies] = useState([]);
  const [image, setImage] = useState(null); // base64
  const [coords, setCoords] = useState(null);
  const [form, setForm] = useState({ pharmacy_id: '', delivery_address: '', recipient_name: '', recipient_phone: '', prescription_note: searchParams.get('note') || '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { pharmacyAPI.pharmacies().then((r) => setPharmacies(r.data || [])).catch(() => {}); }, []);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error('Image trop lourde (max 5 Mo)');
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!image) return toast.error('Photographiez votre ordonnance');
    if (!coords) return toast.error('Indiquez le lieu de livraison sur la carte');
    if (!form.recipient_name || !form.recipient_phone) return toast.error('Nom et téléphone requis');
    setSubmitting(true);
    try {
      await pharmacyAPI.createOrder({
        order_type: 'prescription',
        prescription_image: image,
        prescription_note: form.prescription_note,
        pharmacy_id: form.pharmacy_id || undefined,
        delivery_address: form.delivery_address,
        delivery_lat: coords.lat, delivery_lng: coords.lng,
        recipient_name: form.recipient_name, recipient_phone: form.recipient_phone,
      });
      setDone(true);
      setTimeout(() => navigate('/pharmacy/orders'), 2400);
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec de l\'envoi'); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center" data-testid="prescription-success">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6"><CheckCircle size={40} weight="fill" className="text-green-600" /></div>
        <h2 className="text-2xl font-bold mb-2">Ordonnance envoyée !</h2>
        <p className="text-gray-500">La pharmacie va vérifier et vous proposer un devis. Suivez l'avancement dans « Mes commandes ».</p>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="pharmacy-prescription-page">
      <div className="bg-white px-4 pt-5 pb-3 border-b border-gray-100 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/pharmacy')} className="p-1" data-testid="rx-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Prescription size={20} weight="duotone" className="text-[#FF4500]" /> Commander sur ordonnance</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Upload */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-2 block">Photo de l'ordonnance</label>
          {image ? (
            <div className="relative">
              <img src={image} alt="ordonnance" className="w-full h-52 object-cover rounded-2xl border border-gray-200" data-testid="rx-image-preview" />
              <button onClick={() => setImage(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center" data-testid="rx-remove-image"><X size={16} weight="bold" /></button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-52 rounded-2xl border-2 border-dashed border-gray-300 bg-white cursor-pointer" data-testid="rx-upload-label">
              <Camera size={40} weight="duotone" className="text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">Touchez pour ajouter une photo</span>
              <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" data-testid="rx-file-input" />
            </label>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600">Pharmacie (optionnel)</label>
          <select value={form.pharmacy_id} onChange={(e) => setForm({ ...form, pharmacy_id: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm" data-testid="rx-pharmacy-select">
            <option value="">Pharmacie la plus proche</option>
            {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600">Note pour la pharmacie (optionnel)</label>
          <textarea value={form.prescription_note} onChange={(e) => setForm({ ...form, prescription_note: e.target.value })} rows={2} placeholder="Ex: générique accepté, 2 boîtes…" className="w-full mt-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm" data-testid="rx-note-input" />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600">Adresse de livraison</label>
          <input value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} placeholder="Ex: 10 rue de la Paix" className="w-full mt-1 mb-2 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm" data-testid="rx-address-input" />
          <PharmacyMapPicker value={coords} onChange={setCoords} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="Nom destinataire" className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm" data-testid="rx-name-input" />
          <input value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} placeholder="Téléphone" className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm" data-testid="rx-phone-input" />
        </div>

        <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-xs text-orange-800">
          💡 Le prix des médicaments sera confirmé par la pharmacie après vérification de l'ordonnance. Vous serez notifié du devis.
        </div>

        <button onClick={submit} disabled={submitting} className="w-full bg-[#FF4500] text-white rounded-2xl py-3.5 font-bold disabled:opacity-60" data-testid="rx-submit-btn">
          {submitting ? 'Envoi…' : 'Envoyer l\'ordonnance'}
        </button>
      </div>
    </div>
  );
};

export default PharmacyPrescriptionPage;
