import React, { useEffect, useState, useCallback, useMemo } from 'react';
import LeafletMap from '../../components/LeafletMap';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { MapPin, Car, User, Phone, Clock, ArrowsClockwise, Path } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_COLORS = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'En attente' },
  accepted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Acceptée' },
  arriving: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'En approche' },
  in_progress: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'En cours' },
};

const AdminLiveRides = () => {
  const [data, setData] = useState({ rides: [], counts: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [lastUpdate, setLastUpdate] = useState(null);

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

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return data.rides;
    return data.rides.filter(r => r.status === statusFilter);
  }, [data.rides, statusFilter]);

  const selectedRide = useMemo(
    () => filtered.find(r => r.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  // Map center: selected ride pickup, fallback to Paris
  const mapCenter = selectedRide?.pickup_lat
    ? { lat: selectedRide.pickup_lat, lng: selectedRide.pickup_lng }
    : { lat: 48.8566, lng: 2.3522 };

  const pickup = selectedRide?.pickup_lat ? { lat: selectedRide.pickup_lat, lng: selectedRide.pickup_lng } : null;
  const dropoff = selectedRide?.dropoff_lat ? { lat: selectedRide.dropoff_lat, lng: selectedRide.dropoff_lng } : null;
  const driver = selectedRide?.driver_lat ? { lat: selectedRide.driver_lat, lng: selectedRide.driver_lng } : null;

  const routePath = pickup && dropoff ? [pickup, dropoff] : [];

  return (
    <div className="p-6" data-testid="admin-live-rides">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Courses en direct</h1>
          <p className="text-sm text-gray-500 mt-1">
            Suivi temps réel des courses en cours · actualisation toutes les 5 s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={14} /> {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
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
                    return (
                      <button
                        key={ride.id}
                        onClick={() => setSelectedId(ride.id)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 transition-all ${
                          isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
                        }`}
                        data-testid={`live-ride-${ride.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-gray-800">
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
                          <p className="text-xs font-bold text-blue-600 ml-2">{ride.estimated_fare?.toFixed(0)}€</p>
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
