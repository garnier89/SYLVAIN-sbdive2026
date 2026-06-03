import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import LeafletMap from '../../components/LeafletMap';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { MapPin, Car, User, Phone, Clock, ArrowsClockwise, Path, Bell, SpeakerHigh, SpeakerSlash, Timer } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
const WS_URL = API.replace(/^http/, 'ws');

// Short data-URI "ping" sound (440Hz beep, 200ms) — works offline, no external asset needed
const PING_SOUND_URI = 'data:audio/wav;base64,UklGRiQEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAEAAB/gIB/f4F/foCBfn6BgH1+goB8foOAe36DgHt+g4B7foOAfH6CgH1+gn99f4F/fX+AgH1/gIB+gH+Afn9/gH9/foB/gH+AgH9/gIB/f4CAgH+AgIB/gICAgH+AgH9/f3+AgIB/f4CAf3+AgIB/f4CAgH9/gICAf3+AgIB/f4CAgH9/gICAf3+AgIB/f4CAgH+AgICAf4CAgH9/gICAgH+AgIB/f4CAgH+AgICAf4CAgIB/gICAgH+AgIB/f4CAgIB/gICAgH+AgIB/f4CAgIB/gICAgH9/gICAf4CAgIB/gICAf3+AgICAf4CAgIB/gICAf3+AgICAf4CAgIB/gICAf3+AgICAf4CAgH9/gICAgH+AgICAf3+AgICAf4CAgH9/gICAgH+AgIB/f4CAgIB/gICAf3+AgIB/f4CAgIB/gICAf3+AgIB/f4CAgH+AgICAf3+AgIB/f4CAgH+AgIB/f4CAgH9/gICAf4CAgH9/gICAf3+AgIB/f4CAgH+AgIB/f4CAgH9/gIB/gICAf3+AgH9/gICAgH+AgH9/gICAf3+AgH9/gICAgH+AgH9/gICAf3+AgH9/gICAf3+AgH9/gIB/f4CAf3+AgH9/gIB/f4CAf4CAf3+AgH+AgH9/gIB/gIB/f4CAf4CAf3+AgH+AgH9/gIB/gIB/f4CAf4CAf3+AgH+AgIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/gIB/';

const STATUS_COLORS = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'En attente' },
  accepted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Acceptée' },
  arriving: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'En approche' },
  in_progress: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'En cours' },
};

const AdminLiveRides = () => {
  const { user } = useAuth();
  const [data, setData] = useState({ rides: [], counts: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('admin_live_sound') !== 'off');
  const [flashIds, setFlashIds] = useState(new Set()); // rides currently flashing
  const [etas, setEtas] = useState({}); // { [ride_id]: { eta_min, distance_m, updated_at } }
  const audioRef = useRef(null);
  const wsRef = useRef(null);

  // Persist sound preference
  useEffect(() => { localStorage.setItem('admin_live_sound', soundOn ? 'on' : 'off'); }, [soundOn]);

  // Purge stale ETAs (>60s without update — the driver likely went offline or completed)
  useEffect(() => {
    const t = setInterval(() => {
      setEtas((prev) => {
        const now = Date.now();
        const next = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.updated_at < 60000) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/live-rides`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setLastUpdate(new Date());
      }
    } catch (err) { console.error('live-rides load error', err); }
    finally { setLoading(false); }
  }, []);

  // Initial + polling fallback (every 15s — WS handles real-time deltas)
  useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [load]);

  // WebSocket subscription
  useEffect(() => {
    if (!user?.id) return;
    const clientId = `admin_${user.id}_${Date.now()}`;
    const ws = new WebSocket(`${WS_URL}/api/ws/${clientId}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'eta_update' && msg.ride_id) {
          setEtas((prev) => ({
            ...prev,
            [msg.ride_id]: {
              eta_min: msg.eta_min,
              distance_m: msg.distance_m,
              updated_at: Date.now(),
            },
          }));
          return;
        }
        if (msg.type === 'new_ride_request') {
          // Sound
          if (soundOn && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
          // Toast
          toast(`🚖 Nouvelle course #${msg.booking_no || msg.ride_id?.slice(-6)}`, {
            description: `${msg.pickup_address?.slice(0, 40)} → ${msg.dropoff_address?.slice(0, 40)} · ${msg.estimated_fare?.toFixed(2)}€`,
            duration: 6000,
          });
          // Flash effect (5s)
          setFlashIds((prev) => new Set([...prev, msg.ride_id]));
          setTimeout(() => {
            setFlashIds((prev) => {
              const next = new Set(prev);
              next.delete(msg.ride_id);
              return next;
            });
          }, 5000);
          // Reload to pull the full ride (with user info)
          load();
        }
      } catch (err) { console.error('WS parse error', err); }
    };
    ws.onerror = (e) => console.error('WS error', e);
    return () => { try { ws.close(); } catch {} };
  }, [user?.id, soundOn, load]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return data.rides;
    return data.rides.filter(r => r.status === statusFilter);
  }, [data.rides, statusFilter]);

  const selectedRide = useMemo(
    () => filtered.find(r => r.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  const mapCenter = selectedRide?.pickup_lat
    ? { lat: selectedRide.pickup_lat, lng: selectedRide.pickup_lng }
    : { lat: 48.8566, lng: 2.3522 };

  const pickup = selectedRide?.pickup_lat ? { lat: selectedRide.pickup_lat, lng: selectedRide.pickup_lng } : null;
  const dropoff = selectedRide?.dropoff_lat ? { lat: selectedRide.dropoff_lat, lng: selectedRide.dropoff_lng } : null;
  const driver = selectedRide?.driver_lat ? { lat: selectedRide.driver_lat, lng: selectedRide.driver_lng } : null;
  const routePath = pickup && dropoff ? [pickup, dropoff] : [];

  return (
    <div className="p-6" data-testid="admin-live-rides">
      <audio ref={audioRef} src={PING_SOUND_URI} preload="auto" />
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Courses en direct</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cockpit temps réel · WebSocket + auto-refresh 15s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={14} /> {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button
            onClick={() => setSoundOn(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              soundOn ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            data-testid="toggle-sound-btn"
            title={soundOn ? 'Son activé — cliquez pour désactiver' : 'Son désactivé — cliquez pour activer'}
          >
            {soundOn ? <SpeakerHigh size={14} /> : <SpeakerSlash size={14} />}
            {soundOn ? 'Son ON' : 'Son OFF'}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-sm hover:bg-blue-100"
            data-testid="refresh-live-rides-btn"
          >
            <ArrowsClockwise size={14} /> Rafraîchir
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-600 font-medium">En direct</span>
          </div>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'Toutes', count: data.total },
          { key: 'pending', label: 'En attente', count: data.counts?.pending || 0 },
          { key: 'accepted', label: 'Acceptées', count: data.counts?.accepted || 0 },
          { key: 'arriving', label: 'En approche', count: data.counts?.arriving || 0 },
          { key: 'in_progress', label: 'En cours', count: data.counts?.in_progress || 0 },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => setStatusFilter(p.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === p.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            data-testid={`filter-${p.key}-btn`}
          >
            {p.label} · {p.count}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="h-[560px]" data-testid="live-rides-map">
              <LeafletMap
                center={mapCenter}
                zoom={selectedRide ? 13 : 11}
                pickup={pickup}
                dropoff={dropoff}
                driver={driver}
                routePath={routePath}
              />
            </div>
            {selectedRide && (
              <div className="border-t border-gray-100 p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Course sélectionnée</p>
                    <p className="text-lg font-bold text-gray-800">
                      #{selectedRide.booking_no || selectedRide.id?.slice(-8)}
                    </p>
                  </div>
                  <Badge className={`${STATUS_COLORS[selectedRide.status]?.bg} ${STATUS_COLORS[selectedRide.status]?.text} border-0`}>
                    {STATUS_COLORS[selectedRide.status]?.label || selectedRide.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><User size={12} /> Passager</p>
                    <p className="font-medium">{selectedRide.passenger_name || selectedRide.user_id?.slice(-6)}</p>
                    {selectedRide.passenger_phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone size={12} /> {selectedRide.passenger_phone}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Car size={12} /> Chauffeur</p>
                    <p className="font-medium">{selectedRide.driver_name || 'Non assigné'}</p>
                    {selectedRide.driver_vehicle_number && (
                      <p className="text-xs text-gray-500 mt-0.5">{selectedRide.driver_vehicle_model} · {selectedRide.driver_vehicle_number}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={12} className="text-green-600" /> Départ</p>
                    <p className="text-sm truncate">{selectedRide.pickup_address}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={12} className="text-red-600" /> Arrivée</p>
                    <p className="text-sm truncate">{selectedRide.dropoff_address}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Path size={12} /> Distance</p>
                    <p className="font-medium">{selectedRide.distance_km} km</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Tarif</p>
                    <p className="font-bold text-blue-600">{selectedRide.estimated_fare?.toFixed(2)} €</p>
                  </div>
                  {etas[selectedRide.id]?.eta_min != null && (
                    <div className="col-span-2 mt-1 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                      <Timer size={16} className="text-emerald-600" weight="bold" />
                      <div className="flex-1">
                        <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">
                          ETA temps réel
                        </p>
                        <p className="text-sm text-emerald-800 font-bold">
                          {selectedRide.status === 'in_progress' ? 'Arrivée dans' : 'Chauffeur dans'}{' '}
                          {etas[selectedRide.id].eta_min} min
                          {etas[selectedRide.id].distance_m != null && (
                            <span className="text-xs text-emerald-600 font-normal ml-1">
                              · {(etas[selectedRide.id].distance_m / 1000).toFixed(1)} km
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Rides List */}
        <div>
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 text-sm">
                  {filtered.length} course{filtered.length > 1 ? 's' : ''} active{filtered.length > 1 ? 's' : ''}
                </h3>
              </div>
              <div className="max-h-[560px] overflow-y-auto" data-testid="live-rides-list">
                {loading ? (
                  <p className="text-gray-400 text-sm text-center py-8">Chargement...</p>
                ) : filtered.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-12" data-testid="no-active-rides">
                    Aucune course active
                  </p>
                ) : (
                  filtered.map(ride => {
                    const sc = STATUS_COLORS[ride.status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: ride.status };
                    const isSelected = selectedRide?.id === ride.id;
                    const isFlashing = flashIds.has(ride.id);
                    return (
                      <button
                        key={ride.id}
                        onClick={() => setSelectedId(ride.id)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 transition-all ${
                          isFlashing
                            ? 'bg-amber-100 border-l-4 border-l-amber-500 animate-pulse ring-2 ring-amber-300'
                            : isSelected
                            ? 'bg-blue-50 border-l-4 border-l-blue-500'
                            : 'hover:bg-gray-50'
                        }`}
                        data-testid={`live-ride-${ride.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                            {isFlashing && <Bell size={12} weight="fill" className="text-amber-600 animate-bounce" />}
                            #{ride.booking_no || ride.id?.slice(-6)}
                          </p>
                          <Badge className={`${sc.bg} ${sc.text} border-0 text-[10px]`}>
                            {sc.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 truncate flex items-center gap-1">
                          <User size={11} /> {ride.passenger_name || 'Passager'}
                        </p>
                        <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                          <Car size={11} /> {ride.driver_name || 'En recherche...'}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[11px] text-gray-400 truncate flex-1">
                            <MapPin size={10} className="inline mr-0.5" />
                            {ride.pickup_address?.slice(0, 20)} → {ride.dropoff_address?.slice(0, 20)}
                          </p>
                          <div className="flex items-center gap-1.5 ml-2">
                            {etas[ride.id]?.eta_min != null && (
                              <span
                                className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5"
                                data-testid={`ride-eta-${ride.id}`}
                                title={`ETA temps réel · MAJ il y a ${Math.round((Date.now() - etas[ride.id].updated_at) / 1000)}s`}
                              >
                                <Timer size={9} weight="bold" /> {etas[ride.id].eta_min}min
                              </span>
                            )}
                            <p className="text-xs font-bold text-blue-600">{ride.estimated_fare?.toFixed(0)}€</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminLiveRides;
