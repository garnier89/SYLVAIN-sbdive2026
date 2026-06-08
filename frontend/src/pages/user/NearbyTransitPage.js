/**
 * NearbyTransitPage — écran « Transports autour de moi » (données GTFS RÉELLES).
 *
 * Affiche les arrêts de bus / TCSP / navette maritime proches (Martinique),
 * avec distance, lignes et prochains horaires THÉORIQUES (transport.data.gouv.fr,
 * sans Navitia). Chaque arrêt propose « Réserver un VTC jusqu'à cet arrêt ».
 *
 * ⚠️ Temps réel indisponible — horaires théoriques GTFS.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Bus, Boat, Train, MapPin, NavigationArrow, Clock, CarProfile,
  ArrowsClockwise, WarningCircle, CaretRight,
} from '@phosphor-icons/react';
import { transportAPI } from '../../services/api';
import NearbyTransitMap from './transport/NearbyTransitMap';

// Fort-de-France (centre) — repli si la géoloc est indisponible / hors Martinique.
const FDF = { lat: 14.6036, lng: -61.0730 };

const MODE = {
  bus: { Icon: Bus, label: 'Bus', color: '#2563EB', bg: '#EFF6FF' },
  tcsp: { Icon: Bus, label: 'TCSP', color: '#DC2626', bg: '#FEF2F2' },
  ferry: { Icon: Boat, label: 'Navette', color: '#0EA5E9', bg: '#ECFEFF' },
  tram: { Icon: Train, label: 'Tram', color: '#0891B2', bg: '#ECFEFF' },
  metro: { Icon: Train, label: 'Métro', color: '#7C3AED', bg: '#F5F3FF' },
  rail: { Icon: Train, label: 'Train', color: '#475569', bg: '#F1F5F9' },
};
const modeMeta = (m) => MODE[m] || MODE.bus;

const etaLabel = (m) => (m <= 0 ? "à l'instant" : m === 1 ? '1 min' : `${m} min`);

const NearbyTransitPage = () => {
  const navigate = useNavigate();
  const [center, setCenter] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [farNote, setFarNote] = useState(false);
  const [now, setNow] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const triedFallback = useRef(false);

  const fetchNearby = useCallback(async (lat, lng, isFallback = false) => {
    setLoading(true);
    try {
      const r = await transportAPI.nearby({ lat, lng });
      const list = r.data.stops || [];
      const hasGtfs = list.some((s) => s.source === 'gtfs');
      // Si l'utilisateur est loin de la Martinique, on recadre sur Fort-de-France une fois.
      if (!hasGtfs && !isFallback && !triedFallback.current) {
        triedFallback.current = true;
        setFarNote(true);
        setCenter(FDF);
        return fetchNearby(FDF.lat, FDF.lng, true);
      }
      setStops(list);
      setNow(r.data.now || '');
    } catch (e) {
      toast.error('Impossible de charger les transports proches');
    } finally {
      setLoading(false);
    }
    return undefined;
  }, []);

  const locate = useCallback((announce = false) => {
    if (!navigator.geolocation) { setCenter(FDF); fetchNearby(FDF.lat, FDF.lng, false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(c); fetchNearby(c.lat, c.lng, false);
        if (announce) toast.success('Position actualisée');
      },
      () => { setCenter(FDF); fetchNearby(FDF.lat, FDF.lng, false); if (announce) toast.error('Localisation indisponible'); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, [fetchNearby]);

  useEffect(() => { locate(false); }, [locate]);

  const bookVtcToStop = (s) => {
    navigate(`/course?mode=standard&dlat=${s.lat}&dlng=${s.lng}&daddr=${encodeURIComponent(s.name)}`);
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F8F9FA] pb-10" data-testid="nearby-transit-page">
      {/* Header */}
      <div className="bg-[#0B1426] text-white px-5 pt-12 pb-5">
        <button onClick={() => navigate(-1)} className="mb-4" data-testid="nearby-back"><ArrowLeft size={24} /></button>
        <p className="text-xs tracking-[0.2em] uppercase font-bold text-[#FF5000]">SB Drive · Martinique</p>
        <h1 className="text-3xl font-black tracking-tight mt-1">Transports autour de moi</h1>
        <p className="text-sm text-white/60 mt-1">Bus · TCSP · navettes — arrêts proches{now ? ` · ${now}` : ''}</p>
        <div className="flex gap-2 mt-4">
          <button onClick={() => locate(true)} className="flex-1 bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold active:scale-[0.98] transition-transform" data-testid="nearby-locate-btn">
            <NavigationArrow size={16} weight="fill" className="text-[#FF5000]" /> Ma position
          </button>
          <button onClick={() => center && fetchNearby(center.lat, center.lng, true)} className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-center" data-testid="nearby-refresh-btn" title="Actualiser">
            <ArrowsClockwise size={16} />
          </button>
        </div>
      </div>

      {/* Map */}
      {center && (
        <div className="border-b border-[#E2E8F0]">
          <NearbyTransitMap center={center} stops={stops} selectedId={selectedId} />
        </div>
      )}

      {/* Theoretical schedule notice */}
      <div className="px-5 pt-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2" data-testid="theoretical-notice">
          <WarningCircle size={16} className="text-amber-500 flex-shrink-0" weight="fill" />
          <p className="text-[11px] text-amber-700 leading-snug">Temps réel indisponible — horaire théorique (GTFS transport.data.gouv.fr).</p>
        </div>
        {farNote && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-2" data-testid="far-note">
            <p className="text-[11px] text-blue-700">Vous semblez loin de la Martinique — affichage centré sur Fort‑de‑France.</p>
          </div>
        )}
      </div>

      {/* Stops list */}
      <div className="px-5 pt-3 space-y-3">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
        ) : stops.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 text-center" data-testid="nearby-empty">
            <Bus size={36} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Aucun arrêt de transport public à proximité.</p>
          </div>
        ) : (
          stops.map((s) => {
            const meta = modeMeta((s.lines && s.lines[0] && s.lines[0].mode) || s.type);
            const SIcon = meta.Icon;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                onMouseEnter={() => setSelectedId(s.id)}
                className="bg-white rounded-2xl border border-[#E2E8F0] p-4 shadow-sm"
                data-testid={`nearby-stop-${s.id}`}>
                <div className="flex items-start gap-2.5">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.bg }}>
                    <SIcon size={20} weight="duotone" style={{ color: meta.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#0B1426] text-sm leading-tight">{s.name}</p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <MapPin size={11} />
                      {s.distance_m != null ? `${s.distance_m} m` : (s.zone || 'Martinique')}
                    </p>
                  </div>
                </div>

                {/* Lines + theoretical next departures */}
                <div className="mt-3 space-y-2">
                  {(s.lines || []).length === 0 && (
                    <p className="text-xs text-slate-400">Aucun passage théorique à venir aujourd'hui.</p>
                  )}
                  {(s.lines || []).map((ln) => {
                    const lmeta = modeMeta(ln.mode);
                    return (
                      <div key={ln.line_id} className="flex items-center gap-2.5 py-1.5 border-t border-gray-100 first:border-t-0" data-testid={`nearby-line-${ln.line_id}`}>
                        <span className="text-[11px] font-black text-white px-2 py-1 rounded-md flex-shrink-0 min-w-[34px] text-center" style={{ backgroundColor: ln.color || lmeta.color }}>
                          {ln.code}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: lmeta.color }}>{lmeta.label}</p>
                          <p className="text-xs font-semibold text-[#0B1426] truncate flex items-center gap-1">
                            <CaretRight size={9} /> {ln.destination || ln.name}
                          </p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          {(ln.departures || []).slice(0, 3).map((d, i) => (
                            <span key={i} data-testid={`nearby-dep-${ln.line_id}-${i}`}
                              className={`text-[10px] font-bold px-1.5 py-1 rounded-md ${i === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}
                              title={etaLabel(d.eta_min)}>
                              <Clock size={9} className="inline mr-0.5" weight="bold" />{d.time}
                            </span>
                          ))}
                          {(ln.departures || []).length === 0 && <span className="text-[10px] text-slate-400">—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* VTC to this stop */}
                <button onClick={() => bookVtcToStop(s)} data-testid={`book-vtc-stop-${s.id}`}
                  className="w-full mt-3 py-2.5 text-xs font-black rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.99] transition-transform"
                  style={{ backgroundColor: '#FF5000', color: '#0B1426' }}>
                  <CarProfile size={16} weight="fill" /> Réserver un VTC jusqu'à cet arrêt
                </button>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NearbyTransitPage;
