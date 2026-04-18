import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Star, CaretRight } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const TopDriversWidget = () => {
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/drivers/top`)
      .then(r => r.json())
      .then(d => setDrivers((d.drivers || []).slice(0, 3)))
      .catch(() => {});
  }, []);

  if (drivers.length === 0) return null;

  return (
    <div className="mx-4 my-4 bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4" data-testid="top-drivers-widget">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy size={18} weight="fill" className="text-amber-500" />
          <h3 className="font-bold text-sm text-gray-800">Top chauffeurs</h3>
        </div>
        <Link to="/top-chauffeurs" className="text-xs text-amber-600 font-semibold flex items-center gap-1" data-testid="see-all-top">
          Voir tout <CaretRight size={12} />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {drivers.map((d, idx) => (
          <div key={d.driver_id} className="flex-shrink-0 bg-white rounded-xl p-3 min-w-[140px] shadow-sm" data-testid={`top-widget-${idx}`}>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ background: ['#FFD700', '#C0C0C0', '#CD7F32'][idx] || '#94A3B8' }}>
                #{idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate text-gray-800">{d.name}</p>
                <p className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Star size={10} weight="fill" className="text-amber-400" />{d.rating} · {d.total_trips}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopDriversWidget;
