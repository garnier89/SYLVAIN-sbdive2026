import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { MapPin, Car, Clock, CheckCircle, XCircle, ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';

const statusConfig = {
  pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  accepted: { label: 'Acceptee', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  arriving: { label: 'En route', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  in_progress: { label: 'En cours', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  completed: { label: 'Terminee', color: 'text-green-400', bg: 'bg-green-500/10' },
  cancelled: { label: 'Annulee', color: 'text-red-400', bg: 'bg-red-500/10' },
};

const AdminRides = () => {
  const [rides, setRides] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadRides(); }, [filter]);

  const loadRides = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (filter) params.status = filter;
      const r = await adminAPI.listRides(params);
      setRides(r.data.rides); setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-5 lg:p-6 space-y-5" data-testid="admin-rides-page">
      <div>
        <h1 className="text-2xl font-bold text-white">Courses</h1>
        <p className="text-gray-500 text-sm">{total} courses au total</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {[{ key: '', label: 'Toutes' }, { key: 'pending', label: 'En attente' }, { key: 'in_progress', label: 'En cours' },
          { key: 'completed', label: 'Terminees' }, { key: 'cancelled', label: 'Annulees' }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              filter === f.key ? 'bg-[#FF4500] text-white' : 'bg-[#161923] text-gray-400 border border-gray-800'}`}
            data-testid={`filter-${f.key || 'all'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Rides List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-[#FF4500]/30 border-t-[#FF4500] rounded-full animate-spin mx-auto" /></div>
        ) : rides.length === 0 ? (
          <div className="bg-[#161923] border border-gray-800 rounded-xl p-12 text-center">
            <Car size={40} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500">Aucune course trouvee</p>
          </div>
        ) : rides.map((ride, i) => {
          const s = statusConfig[ride.status] || statusConfig.pending;
          return (
            <div key={ride.id || i} className="bg-[#161923] border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
              data-testid={`ride-row-${i}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${s.bg} ${s.color}`}>{s.label}</span>
                  {ride.booking_no && <span className="text-gray-600 text-xs font-mono">#{ride.booking_no}</span>}
                </div>
                <span className="text-[#FF4500] font-bold text-sm">{(ride.final_fare || ride.estimated_fare || 0).toFixed(2)} &euro;</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-white text-xs truncate">{ride.pickup_address || 'N/A'}</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-red-500/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <MapPin size={8} className="text-red-400" />
                  </div>
                  <p className="text-gray-400 text-xs truncate">{ride.dropoff_address || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-600">
                <span>Client: {ride.user_id?.slice(0, 12)}</span>
                {ride.driver_name && <span>Chauffeur: {ride.driver_name}</span>}
                {ride.vehicle_type && <span className="capitalize">{ride.vehicle_type}</span>}
                {ride.created_at && <span className="ml-auto">{new Date(ride.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminRides;
