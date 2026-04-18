import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Star, Medal, Car, ArrowLeft, Crown } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const TopDriversPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('composite');

  useEffect(() => {
    fetch(`${API}/api/drivers/top`)
      .then(r => r.json())
      .then(d => { setDrivers(d.drivers || []); setMode(d.mode || 'composite'); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Gold, Silver, Bronze

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white" data-testid="top-drivers-page">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 30% 20%, #FFD700 0%, transparent 50%), radial-gradient(circle at 70% 80%, #00B578 0%, transparent 50%)' }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-10 pb-12">
          <Link to="/" className="inline-flex items-center gap-2 text-slate-300 hover:text-white text-sm mb-8" data-testid="back-home">
            <ArrowLeft size={16} /> Retour
          </Link>
          <div className="text-center">
            <div className="inline-flex items-center gap-3 mb-4 px-5 py-2 rounded-full bg-amber-500/20 border border-amber-400/30">
              <Crown size={20} weight="fill" className="text-amber-400" />
              <span className="text-amber-300 font-bold tracking-widest text-xs uppercase">Top Chauffeurs SB Drive</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent mb-3">
              Nos chauffeurs d'elite
            </h1>
            <p className="text-slate-300 max-w-xl mx-auto">
              Classement base sur les points, les courses et la note moyenne. Ces chauffeurs incarnent l'excellence SB Drive VTC.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        {loading ? (
          <div className="text-center py-20 text-slate-400">Chargement du classement...</div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-20 text-slate-400">Aucun chauffeur classe pour le moment.</div>
        ) : (
          <>
            {/* Podium top 3 */}
            <div className="grid grid-cols-3 gap-4 md:gap-6 mb-10" data-testid="podium">
              {[drivers[1], drivers[0], drivers[2]].filter(Boolean).map((d, idx) => {
                const rank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                const color = podiumColors[rank - 1];
                const heights = { 1: 'pt-6 pb-10', 2: 'pt-8 pb-8', 3: 'pt-10 pb-6' };
                return (
                  <div key={d.driver_id} className={`relative rounded-3xl ${heights[rank]} px-4 text-center`}
                    style={{ background: `linear-gradient(180deg, ${color}20 0%, transparent 100%)`, border: `1px solid ${color}40` }}
                    data-testid={`podium-${rank}`}>
                    {rank === 1 && <Crown size={28} weight="fill" className="mx-auto mb-2" style={{ color }} />}
                    <div className="relative inline-block mb-3">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl font-black"
                        style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}80 100%)`, color: '#1e293b' }}>
                        {d.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-slate-900" style={{ background: color }}>
                        #{rank}
                      </div>
                    </div>
                    <p className="font-bold truncate">{d.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{d.vehicle_model || d.vehicle_type}</p>
                    <div className="mt-3 flex items-center justify-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-amber-300"><Star size={12} weight="fill" />{d.rating}</span>
                      <span className="text-slate-400">{d.total_trips} courses</span>
                    </div>
                    <div className="mt-2 text-2xl font-black" style={{ color }}>{Math.round(d.composite_score)}</div>
                  </div>
                );
              })}
            </div>

            {/* Rest of ranking */}
            <div className="space-y-3" data-testid="rest-of-ranking">
              {drivers.slice(3).map((d, i) => (
                <div key={d.driver_id} className="flex items-center gap-4 bg-slate-800/50 hover:bg-slate-800 transition-colors backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4"
                  data-testid={`rank-${i + 4}`}>
                  <span className="text-2xl font-black text-slate-500 w-10">#{i + 4}</span>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-slate-900 font-bold text-lg"
                    style={{ background: 'linear-gradient(135deg, #64748B 0%, #94A3B8 100%)' }}>
                    {d.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{d.name}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-2"><Car size={12} />{d.vehicle_model || d.vehicle_type}</p>
                  </div>
                  <div className="hidden md:flex items-center gap-5 text-sm">
                    <span className="flex items-center gap-1 text-amber-300"><Star size={14} weight="fill" />{d.rating}</span>
                    <span className="text-slate-400">{d.total_trips} courses</span>
                    <span className="text-slate-400">{d.points} pts</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-emerald-400">{Math.round(d.composite_score)}</div>
                    <div className="text-[10px] text-slate-500">SCORE</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* CTA */}
        <div className="mt-16 text-center bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-400/20 rounded-3xl p-8">
          <Medal size={40} weight="fill" className="mx-auto mb-3 text-amber-400" />
          <h2 className="text-2xl font-bold mb-2">Vous etes chauffeur ?</h2>
          <p className="text-slate-300 mb-5 max-w-md mx-auto">Rejoignez SB Drive VTC et grimpez dans le classement. Plus de courses, plus de points, plus de priorite.</p>
          <Link to="/chauffeur" className="inline-block px-8 py-3 rounded-full bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 transition-colors" data-testid="become-driver-cta">
            Devenir chauffeur
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TopDriversPage;
