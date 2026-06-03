import React, { useEffect, useState } from 'react';
import { MapPin } from '@phosphor-icons/react';
import AdminGoogleMap from '../../components/admin/AdminGoogleMap';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminHeatView = () => {
  const [heatmapOn, setHeatmapOn] = useState(true);
  const [data, setData] = useState([]);
  const [mapType, setMapType] = useState('roadmap');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Try driver-heatmap endpoint (active drivers density), fallback to rides clusters
        let res = await fetch(`${API}/api/admin/heatmap/drivers`, { credentials: 'include' });
        if (!res.ok) {
          res = await fetch(`${API}/api/admin/heatmap/rides`, { credentials: 'include' });
        }
        if (res.ok) {
          const d = await res.json();
          if (!cancelled) {
            const points = (d.items || d.points || []).map((p) => [
              p.lat || p.lattitude,
              p.lng || p.lng || p.longitude,
              p.weight || 1,
            ]);
            setData(points);
          }
        }
      } catch (e) {
        console.warn('heatmap load failed:', e?.message || e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="p-6" data-testid="admin-heat-view">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>
        Heat View
      </h1>
      <hr className="border-gray-200 mb-5" />

      <div className="border border-gray-200 rounded px-4 py-3 bg-gray-50 mb-4 flex items-center gap-2">
        <MapPin size={16} className="text-blue-500" />
        <span className="text-sm text-gray-700 font-medium">
          Densité ({data.length} points) — actualisé toutes les 30s
        </span>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={() => setHeatmapOn(!heatmapOn)}
          className={`px-5 py-2.5 rounded text-sm font-bold transition-colors ${
            heatmapOn ? 'bg-[#3b82f6] text-white' : 'bg-white border border-gray-300 text-gray-600'
          }`}
          data-testid="toggle-heatmap"
        >
          Toggle Heatmap
        </button>
        <select
          value={mapType}
          onChange={(e) => setMapType(e.target.value)}
          className="bg-white border border-gray-300 px-3 py-2.5 rounded text-sm font-bold text-gray-600"
          data-testid="map-type-select"
        >
          <option value="roadmap">Plan</option>
          <option value="satellite">Satellite</option>
          <option value="hybrid">Hybride</option>
          <option value="terrain">Terrain</option>
        </select>
      </div>

      <div className="h-[500px] rounded-lg overflow-hidden border border-gray-200" data-testid="heatmap-container">
        <AdminGoogleMap
          center={{ lat: 48.8566, lng: 2.3522 }}
          zoom={11}
          mapType={mapType}
          heatmapData={heatmapOn ? data : []}
        />
      </div>

      {loading && <p className="text-xs text-gray-400 mt-2">Chargement des données...</p>}
    </div>
  );
};

export default AdminHeatView;
