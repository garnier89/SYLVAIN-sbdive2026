import React, { useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const AdminHeatView = () => {
  const [heatmapOn, setHeatmapOn] = useState(true);
  const [gradient, setGradient] = useState('default');

  return (
    <div className="p-6" data-testid="admin-heat-view">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>Heat View</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Location label */}
      <div className="border border-gray-200 rounded px-4 py-3 bg-gray-50 mb-4 flex items-center gap-2">
        <span className="text-gray-500">&#9679;</span>
        <span className="text-sm text-gray-700 font-medium">Locations</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <button onClick={() => setHeatmapOn(!heatmapOn)}
          className={`px-5 py-2.5 rounded text-sm font-bold transition-colors ${
            heatmapOn ? 'bg-[#3b82f6] text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
          data-testid="toggle-heatmap">
          Toggle Heatmap
        </button>
        <button onClick={() => setGradient(g => g === 'default' ? 'warm' : 'default')}
          className="bg-[#3b82f6] text-white px-5 py-2.5 rounded text-sm font-bold hover:bg-blue-600 transition-colors"
          data-testid="change-gradient">
          Change Gradient
        </button>
        <button className="bg-white border border-gray-300 text-gray-600 px-5 py-2.5 rounded text-sm font-bold hover:bg-gray-50 transition-colors"
          data-testid="change-radius">
          Change Radius
        </button>
        <button className="bg-white border border-gray-300 text-gray-600 px-5 py-2.5 rounded text-sm font-bold hover:bg-gray-50 transition-colors"
          data-testid="change-opacity">
          Change Opacity
        </button>
      </div>

      {/* Map */}
      <div className="h-[500px] rounded-lg overflow-hidden border border-gray-200">
        <MapContainer center={[48.8566, 2.3522]} zoom={11} className="w-full h-full" zoomControl={true}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
        </MapContainer>
      </div>
    </div>
  );
};

export default AdminHeatView;
