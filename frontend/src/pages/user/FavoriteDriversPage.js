import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Heart, Car, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import TopDriversWidget from '../../components/TopDriversWidget';

const API = process.env.REACT_APP_BACKEND_URL;

const Avatar = ({ name }) => (
  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold shrink-0">
    {(name || '?').charAt(0).toUpperCase()}
  </div>
);

const FavoriteDriversPage = () => {
  const navigate = useNavigate();
  const [favs, setFavs] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rf, rr] = await Promise.all([
        fetch(`${API}/api/phase1/favorite-drivers`, { credentials: 'include' }),
        fetch(`${API}/api/phase1/recent-drivers`, { credentials: 'include' }),
      ]);
      if (rf.ok) setFavs(await rf.json());
      if (rr.ok) setRecent(await rr.json());
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (driver_id) => {
    try {
      await fetch(`${API}/api/phase1/favorite-drivers/${driver_id}`, { method: 'DELETE', credentials: 'include' });
      toast.success('Retiré des favoris');
      load();
    } catch { toast.error('Erreur'); }
  };

  const add = async (driver_id) => {
    if (favs.length >= 2) { toast.error('Maximum 2 favoris — retirez-en un d\'abord'); return; }
    try {
      const r = await fetch(`${API}/api/phase1/favorite-drivers/${driver_id}`, { method: 'POST', credentials: 'include' });
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast.error(e.detail || 'Impossible d\'ajouter'); return; }
      toast.success('Ajouté à vos favoris');
      load();
    } catch { toast.error('Erreur'); }
  };

  const atMax = favs.length >= 2;

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-8" data-testid="favorite-drivers-page">
      <div className="bg-white px-5 py-4 flex items-center gap-3 border-b border-gray-200">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-bold text-gray-800">Chauffeurs favoris</h1>
        <span className="ml-auto text-xs font-bold text-gray-400" data-testid="fav-count">{favs.length}/2</span>
      </div>
      <p className="px-5 py-3 text-xs text-gray-500">Vos courses et livraisons sont proposées en priorité à vos chauffeurs favoris (le même visage de confiance à chaque trajet).</p>

      {loading ? <p className="text-center text-gray-400 text-sm py-6">Chargement...</p> : (
        <>
          {favs.length === 0 ? (
            <div className="mx-5 bg-white rounded-2xl p-6 text-center" data-testid="empty-state">
              <Heart size={32} className="mx-auto mb-2 text-gray-300" weight="duotone" />
              <p className="text-sm text-gray-500">Aucun chauffeur favori</p>
              <p className="text-[11px] text-gray-400 mt-1">Ajoutez-en un ci-dessous ou après une course en le notant.</p>
            </div>
          ) : (
            <div className="mx-5 space-y-2">
              {favs.map((d) => (
                <div key={d.driver_id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`fav-${d.driver_id}`}>
                  <Avatar name={d.name} />
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

          {/* Add / replace from drivers you rode with recently */}
          {recent.length > 0 && (
            <div className="mt-6" data-testid="recent-drivers-section">
              <div className="px-5 flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-gray-700">Ajouter un chauffeur</h2>
                {atMax && <span className="text-[11px] text-gray-400">Retirez-en un pour changer</span>}
              </div>
              <div className="mx-5 space-y-2">
                {recent.map((d) => (
                  <div key={d.driver_id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`recent-${d.driver_id}`}>
                    <Avatar name={d.name} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 truncate">{d.name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        <Car size={11} />{d.vehicle_model || d.vehicle_type} · <Star size={11} weight="fill" className="text-amber-400" />{d.rating?.toFixed(1)}
                      </p>
                    </div>
                    <button onClick={() => add(d.driver_id)} disabled={atMax}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 ${atMax ? 'bg-gray-100 text-gray-400' : 'bg-orange-50 text-orange-600'}`}
                      data-testid={`add-${d.driver_id}`}>
                      <Plus size={12} weight="bold" /> Ajouter
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Chauffeurs de la plateforme */}
          <div className="mt-6">
            <TopDriversWidget />
          </div>
        </>
      )}
    </div>
  );
};

export default FavoriteDriversPage;
