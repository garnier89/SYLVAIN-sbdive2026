import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Heart, Car } from '@phosphor-icons/react';
import { toast } from 'sonner';
import TopDriversWidget from '../../components/TopDriversWidget';

const API = process.env.REACT_APP_BACKEND_URL;

const FavoriteDriversPage = () => {
  const navigate = useNavigate();
  const [favs, setFavs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/phase1/favorite-drivers`, { credentials: 'include' });
      if (r.ok) setFavs(await r.json());
    } catch { toast.error('Erreur'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (driver_id) => {
    try {
      await fetch(`${API}/api/phase1/favorite-drivers/${driver_id}`, { method: 'DELETE', credentials: 'include' });
      setFavs((f) => f.filter((x) => x.driver_id !== driver_id));
      toast.success('Retire des favoris');
    } catch { toast.error('Erreur'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-8" data-testid="favorite-drivers-page">
      <div className="bg-white px-5 py-4 flex items-center gap-3 border-b border-gray-200">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-bold text-gray-800">Chauffeurs favoris</h1>
      </div>
      <p className="px-5 py-3 text-xs text-gray-500">Les courses sont envoyees en priorite a vos chauffeurs favoris.</p>

      {loading ? <p className="text-center text-gray-400 text-sm py-6">Chargement...</p> :
       favs.length === 0 ? (
        <div className="mx-5 bg-white rounded-2xl p-8 text-center" data-testid="empty-state">
          <Heart size={36} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm text-gray-500">Aucun chauffeur favori</p>
          <p className="text-[11px] text-gray-400 mt-1">Apres une course, notez et ajoutez votre chauffeur en favori</p>
        </div>
      ) : (
        <div className="mx-5 space-y-2">
          {favs.map((d) => (
            <div key={d.driver_id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`fav-${d.driver_id}`}>
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold">
                {d.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 truncate">{d.name}</p>
                <p className="text-xs text-gray-500 flex items-center gap-2">
                  <Car size={11} />{d.vehicle_model || d.vehicle_type} · <Star size={11} weight="fill" className="text-amber-400" />{d.rating?.toFixed(1)}
                </p>
              </div>
              <button onClick={() => remove(d.driver_id)} className="px-3 py-1.5 rounded-full bg-red-50 text-red-500 text-xs font-bold" data-testid={`remove-${d.driver_id}`}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Top Chauffeurs de la plateforme (déplacé depuis UserHome) */}
      <div className="mt-6">
        <TopDriversWidget />
      </div>
    </div>
  );
};

export default FavoriteDriversPage;
