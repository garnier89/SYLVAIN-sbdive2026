import React, { useState, useEffect } from 'react';
import { dispatcherAPI } from '../../services/api';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MagnifyingGlass, Phone } from '@phosphor-icons/react';
import 'leaflet/dist/leaflet.css';

const statusCards = [
  { label: 'Available', color: 'border-green-400', countKey: 'available', emoji: 'A' },
  { label: 'Not Available', color: 'border-yellow-400', countKey: 'unavailable', emoji: 'N' },
  { label: 'Way to Pickup', color: 'border-blue-400', countKey: 'to_pickup', emoji: 'P' },
  { label: 'Arrived / Reached Pickup', color: 'border-red-400', countKey: 'arrived', emoji: 'R' },
  { label: 'Way to Dropoff', color: 'border-purple-400', countKey: 'to_dropoff', emoji: 'D' },
];

const AdminGodsView = () => {
  const [tab, setTab] = useState('rides');
  const [drivers, setDrivers] = useState([]);
  const [rides, setRides] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); const iv = setInterval(loadData, 10000); return () => clearInterval(iv); }, []);

  const loadData = async () => {
    try {
      const r = await dispatcherAPI.getLiveData();
      setDrivers(r.data.drivers || []);
      setRides(r.data.rides || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const counts = {
    available: drivers.filter(d => d.is_online && !d.current_ride_id).length,
    unavailable: drivers.filter(d => !d.is_online).length,
    to_pickup: drivers.filter(d => d.current_ride_id && d.status === 'arriving').length,
    arrived: drivers.filter(d => d.current_ride_id && d.status === 'arrived').length,
    to_dropoff: drivers.filter(d => d.current_ride_id && d.status === 'in_progress').length,
  };

  const filteredDrivers = search
    ? drivers.filter(d => (d.user_name || '').toLowerCase().includes(search.toLowerCase()))
    : drivers;

  return (
    <div className="p-6" data-testid="admin-gods-view">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-light text-gray-800" style={{ fontFamily: 'Georgia, Times, serif' }}>God's View</h1>
        <div className="flex gap-1">
          {['rides', 'deliveries', 'jobs'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded text-sm font-bold transition-all ${
                tab === t ? 'bg-[#3b82f6] text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              data-testid={`gods-view-tab-${t}`}>
              {t === 'rides' ? 'Rides' : t === 'deliveries' ? 'Deliveries' : 'Jobs'}
            </button>
          ))}
        </div>
      </div>
      <hr className="border-gray-200 mb-5" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Panel - Driver List */}
        <div className="lg:col-span-1">
          {/* Status Cards */}
          <div className="flex flex-wrap gap-3 mb-4">
            {statusCards.map((s) => (
              <div key={s.countKey} className={`flex flex-col items-center px-3 py-2 bg-white border-2 ${s.color} rounded-lg min-w-[80px]`}>
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-1">
                  <span className="text-xs font-bold">{s.emoji}</span>
                </div>
                <span className="text-[10px] text-gray-600 text-center leading-tight">{s.label}</span>
                <span className="text-sm font-bold text-gray-800">({counts[s.countKey]})</span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${drivers.length ? (counts.available / Math.max(drivers.length, 1)) * 100 : 0}%` }} />
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Service Provider"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-400" data-testid="search-driver" />
          </div>

          {/* Driver Cards */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
            ) : filteredDrivers.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No service providers online</p>
            ) : filteredDrivers.map((d, i) => (
              <div key={d.id || i} onClick={() => setSelectedDriver(d)}
                className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-sm ${
                  selectedDriver?.id === d.id ? 'border-green-400 border-dashed bg-green-50' : 'border-gray-200 bg-white'}`}
                data-testid={`driver-card-${i}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold flex-shrink-0">
                    {(d.user_name || 'D')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{d.user_name || 'Driver'}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone size={10} /> {d.phone || 'N/A'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-gray-700">{d.vehicle_number || 'N/A'}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{d.vehicle_type || ''}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Map */}
        <div className="lg:col-span-2 relative">
          <div className="h-[600px] rounded-lg overflow-hidden border border-gray-200">
            <MapContainer center={[48.8566, 2.3522]} zoom={12} className="w-full h-full" zoomControl={true}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
              {drivers.filter(d => d.current_lat && d.current_lng).map((d) => (
                <Marker key={d.id || d.user_id} position={[d.current_lat, d.current_lng]}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-bold">Name: {d.user_name || 'Driver'}</p>
                      <p>Mobile: {d.phone || 'N/A'}</p>
                      <p>Email: {d.email || 'N/A'}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Driver Info Popup */}
          {selectedDriver && (
            <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 w-64 z-[1000]" data-testid="driver-popup">
              <button onClick={() => setSelectedDriver(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg font-bold">X</button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                  {(selectedDriver.user_name || 'D')[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">Name: {selectedDriver.user_name || 'Driver'}</p>
                  <p className="text-xs text-gray-600">Mobile: <span className="font-bold">{selectedDriver.phone || 'N/A'}</span></p>
                  <p className="text-xs text-gray-600">Email: <span className="text-blue-600">{selectedDriver.email || 'N/A'}</span></p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminGodsView;
