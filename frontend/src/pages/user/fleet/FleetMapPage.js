import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CaretRight, Gauge } from '@phosphor-icons/react';
import { fleetAPI } from '../../../services/api';
import FleetMap from './FleetMap';
import { statusMeta, vtypeMeta, fmtAgo } from './fleetShared';

const FleetMapPage = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const center = useRef(null);

  const load = useCallback(() => {
    fleetAPI.vehicles().then((r) => {
      const vs = r.data.vehicles || [];
      setVehicles(vs);
      if (!center.current) {
        const withPos = vs.find((v) => v.live?.lat != null);
        if (withPos) center.current = { lat: withPos.live.lat, lng: withPos.live.lng };
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    fleetAPI.geofences().then((r) => setGeofences(r.data.geofences || [])).catch(() => {});
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const moving = vehicles.filter((v) => v.live?.status === 'moving').length;

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-6" data-testid="fleet-map-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <h1 className="text-base font-extrabold text-gray-900">Carte temps réel</h1>
          <p className="text-[11px] text-gray-400">{vehicles.length} véhicule(s) • {moving} en route</p>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live</span>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" /></div>
        ) : vehicles.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-500" data-testid="no-vehicles">
            <p className="text-sm">Aucun véhicule. Ajoutez-en un ou activez la démo depuis l'accueil SB Tracking.</p>
            <button onClick={() => navigate('/sb-tracking/vehicules')} className="mt-4 bg-blue-700 text-white font-bold text-sm px-5 py-2.5 rounded-full">Ajouter un véhicule</button>
          </div>
        ) : (
          <>
            <FleetMap center={center.current} vehicles={vehicles} geofences={geofences} selectedId={selectedId} onSelect={(v) => setSelectedId(v.id)} height={360} />
            <div className="mt-4 space-y-2">
              {vehicles.map((v) => {
                const sm = statusMeta(v.live?.status);
                const VIcon = vtypeMeta(v.vtype).Icon;
                return (
                  <button key={v.id} onClick={() => navigate(`/sb-tracking/vehicules/${v.id}`)}
                    className={`w-full bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm text-left ${selectedId === v.id ? 'ring-2 ring-blue-500' : ''}`} data-testid={`map-vehicle-${v.id}`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: sm.color + '22' }}>
                      <VIcon size={20} weight="fill" style={{ color: sm.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-900 truncate">{v.name} <span className="text-[10px] text-gray-400 font-normal">{v.plate}</span></p>
                      <p className="text-[11px] flex items-center gap-2">
                        <span className={`font-bold ${sm.text}`}>{sm.label}</span>
                        <span className="text-gray-400 flex items-center gap-0.5"><Gauge size={11} /> {Math.round(v.live?.speed || 0)} km/h</span>
                        <span className="text-gray-300">{fmtAgo(v.live?.ts)}</span>
                      </p>
                    </div>
                    <CaretRight size={16} className="text-gray-300" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FleetMapPage;
