import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Path, Trash, Share, Car, WhatsappLogo, Copy, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { itinerariesAPI } from '../../services/api';

const fmtDur = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m} min`;
};

const MyItinerariesPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    itinerariesAPI.list()
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shareUrl = (c) => `${window.location.origin}/circuit/${c.share_token}`;

  const copyLink = (c) => {
    const url = shareUrl(c);
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast.success('Lien copié')).catch(() => {});
    else toast.success('Lien : ' + url);
  };

  const nativeShare = (c) => {
    const url = shareUrl(c);
    if (navigator.share) navigator.share({ title: c.title, text: `Découvrez mon circuit « ${c.title} »`, url }).catch(() => {});
    else copyLink(c);
  };

  const remove = async (c) => {
    if (!window.confirm(`Supprimer le circuit « ${c.title} » ?`)) return;
    try {
      await itinerariesAPI.remove(c.id);
      setItems((arr) => arr.filter((x) => x.id !== c.id));
      toast.success('Circuit supprimé');
    } catch { toast.error('Suppression impossible'); }
  };

  const reserve = (c) => {
    const ordered = (c.places || []).filter((p) => p.lat != null && p.lng != null);
    if (!ordered.length) { toast.error('Aucune étape géolocalisée'); return; }
    try {
      sessionStorage.setItem('sb_taxi_itinerary', JSON.stringify(
        ordered.map((p) => ({ address: p.address || p.name, lat: p.lat, lng: p.lng })),
      ));
    } catch { /* ignore */ }
    navigate('/taxi');
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="my-circuits-page">
      <div className="sticky top-0 z-40 bg-[#FF4500] px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="circuits-back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">Mes circuits</h1>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center" data-testid="circuits-empty">
            <Path size={36} className="mx-auto mb-3 text-gray-300" weight="duotone" />
            <p className="text-sm text-gray-500 mb-4">Aucun circuit enregistré pour le moment.</p>
            <button onClick={() => navigate('/nearby')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF4500] text-white text-sm font-bold" data-testid="circuits-create-btn">
              <Plus size={16} weight="bold" /> Créer un circuit
            </button>
          </div>
        ) : (
          items.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" data-testid={`circuit-${c.id}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-extrabold text-gray-900 truncate">{c.title}</h2>
                    {c.city && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {c.city}</p>}
                  </div>
                  <button onClick={() => remove(c)} className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0" data-testid={`circuit-delete-${c.id}`}>
                    <Trash size={16} className="text-red-500" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">{(c.places || []).length} étape{(c.places || []).length > 1 ? 's' : ''}</span>
                  {c.route_info?.total_day_min != null && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Journée ~{fmtDur(c.route_info.total_day_min)}</span>
                  )}
                </div>

                <div className="mt-3 space-y-1.5">
                  {(c.places || []).slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-2" data-testid={`circuit-${c.id}-step-${i}`}>
                      <span className="w-5 h-5 rounded-full bg-[#FF4500] text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-sm text-gray-700 truncate">{p.name}</span>
                    </div>
                  ))}
                  {(c.places || []).length > 5 && (
                    <p className="text-[11px] text-gray-400 pl-7">+ {(c.places || []).length - 5} autre(s)</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 border-t border-gray-100 divide-x divide-gray-100">
                <button onClick={() => nativeShare(c)} className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-violet-700" data-testid={`circuit-share-${c.id}`}>
                  <Share size={16} weight="fill" /> Partager
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Découvrez mon circuit « ${c.title} » : ${shareUrl(c)}`)}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-[#25D366]"
                  data-testid={`circuit-whatsapp-${c.id}`}
                >
                  <WhatsappLogo size={16} weight="fill" /> WhatsApp
                </a>
                <button onClick={() => reserve(c)} className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-[#FF4500]" data-testid={`circuit-reserve-${c.id}`}>
                  <Car size={16} weight="fill" /> Réserver
                </button>
              </div>

              <button onClick={() => copyLink(c)} className="w-full py-2 text-[11px] font-semibold text-gray-400 border-t border-gray-100 flex items-center justify-center gap-1.5" data-testid={`circuit-copy-${c.id}`}>
                <Copy size={12} /> Copier le lien de partage
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MyItinerariesPage;
