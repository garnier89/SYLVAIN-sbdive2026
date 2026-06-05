import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { pharmacyAPI } from '../../../services/api';
import { ArrowLeft, Pill, Prescription, ShoppingBag, ClockCounterClockwise, Star, Storefront } from '@phosphor-icons/react';

const PharmacyPage = () => {
  const navigate = useNavigate();
  const [pharmacies, setPharmacies] = useState([]);

  useEffect(() => {
    pharmacyAPI.pharmacies().then((r) => setPharmacies(r.data || [])).catch(() => {});
  }, []);

  return (
    <div className="mobile-container min-h-screen bg-white pb-10" data-testid="pharmacy-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FF4500] to-orange-600 text-white px-4 pt-5 pb-8 rounded-b-3xl">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-1" data-testid="pharmacy-back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold flex items-center gap-2"><Pill size={22} weight="fill" /> Pharmacie</h1>
          <button onClick={() => navigate('/pharmacy/orders')} className="ml-auto p-1" data-testid="pharmacy-orders-link">
            <ClockCounterClockwise size={22} />
          </button>
        </div>
        <p className="text-sm text-white/90 leading-relaxed">Vos médicaments livrés à domicile — sur ordonnance ou en parapharmacie.</p>
      </div>

      {/* Two main actions */}
      <div className="px-4 -mt-4 grid grid-cols-1 gap-3">
        <button
          onClick={() => navigate('/pharmacy/prescription')}
          className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
          data-testid="pharmacy-prescription-btn"
        >
          <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
            <Prescription size={30} weight="duotone" className="text-[#FF4500]" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900">Commander sur ordonnance</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Photographiez votre ordonnance, une pharmacie la prépare et un coursier vous livre.</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/pharmacy/catalog')}
          className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
          data-testid="pharmacy-catalog-btn"
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
            <ShoppingBag size={30} weight="duotone" className="text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900">Parcourir le catalogue</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Parapharmacie sans ordonnance : antidouleurs, vitamines, hygiène…</p>
          </div>
        </button>
      </div>

      {/* Partner pharmacies */}
      <div className="px-4 mt-6">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Storefront size={18} weight="duotone" className="text-[#FF4500]" /> Pharmacies partenaires</h3>
        <div className="space-y-3">
          {pharmacies.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 p-3 flex items-center gap-3" data-testid={`pharmacy-partner-${p.id}`}>
              {p.image_url && <img src={p.image_url} alt={p.name} className="w-14 h-14 rounded-lg object-cover" />}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 truncate">{p.name}</h4>
                <p className="text-xs text-gray-500 truncate">{p.address}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-amber-600 flex items-center gap-0.5"><Star size={11} weight="fill" /> {p.rating}</span>
                  <span className="text-[11px] text-gray-400">· {p.open_hours}</span>
                </div>
              </div>
            </div>
          ))}
          {pharmacies.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucune pharmacie disponible.</p>}
        </div>
      </div>
    </div>
  );
};

export default PharmacyPage;
