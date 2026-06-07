import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CaretLeft, Trophy, TrendUp, TrendDown, Star, Lightning, MapPin } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const DriverScorePage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/drivers/my-score-history`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-400 text-sm">Chargement...</div>;
  if (!data) return <div className="p-6 text-gray-500 text-sm">Impossible de charger votre score.</div>;

  const { current_points, current_palette, next_palette, history, totals } = data;
  const palColor = current_palette?.color || '#9CA3AF';
  const minPts = current_palette?.min_points ?? 0;
  const maxPts = current_palette?.max_points ?? 100;
  const pctInPalette = Math.max(0, Math.min(100, ((current_points - minPts) / Math.max(1, (maxPts - minPts))) * 100));

  // Build chart series from history (oldest → newest), reconstructing running totals
  const series = (() => {
    const reversed = [...history].reverse(); // oldest first
    let running = current_points - reversed.reduce((s, e) => s + (e.delta || 0), 0);
    return reversed.map((e, i) => {
      running += e.delta || 0;
      return { idx: i + 1, points: running, at: e.at };
    });
  })();

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-24" data-testid="driver-score-page">
      {/* Header */}
      <div className="px-4 pt-6 pb-8 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${palColor} 0%, ${palColor}DD 100%)` }}>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="score-back-btn">
            <CaretLeft size={22} weight="bold" />
          </button>
          <h1 className="text-lg font-bold">Mon score</h1>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-white/80 text-xs uppercase font-bold tracking-wide">Palette actuelle</p>
            <div className="flex items-center gap-2 mt-1">
              <Trophy size={26} weight="fill" />
              <p className="text-2xl font-bold" data-testid="current-palette-name">{current_palette?.name || '—'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white/80 text-xs uppercase font-bold tracking-wide">Points</p>
            <p className="text-4xl font-bold tabular-nums" data-testid="current-points">{current_points}</p>
          </div>
        </div>

        {/* Progress to next palette */}
        <div className="mt-5 bg-white/15 rounded-xl p-3">
          {next_palette ? (
            <>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-white/90">→ Prochain palier : <span className="font-bold">{next_palette.name}</span></span>
                <span className="font-bold" data-testid="points-to-next">{next_palette.points_to_reach} pts restants</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${pctInPalette}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-white/90 text-center font-medium" data-testid="max-palette-reached">
              🏆 Vous êtes au plus haut palier !
            </p>
          )}
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* Totals */}
        <div className="grid grid-cols-3 gap-3" data-testid="score-totals">
          <TotalCard icon={TrendUp} color="#10B981" label="Gagnés" value={totals.gained} testId="total-gained" />
          <TotalCard icon={TrendDown} color="#EF4444" label="Perdus" value={totals.lost} testId="total-lost" />
          <TotalCard icon={Star} color="#F59E0B" label="Entrées" value={totals.entries} testId="total-entries" />
        </div>

        {/* Chart */}
        {series.length > 0 && (
          <div className="bg-white rounded-2xl p-4" data-testid="score-chart">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm text-gray-800">Évolution des points</h3>
              <span className="text-[10px] text-gray-400">{series.length} évènements</span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={series}>
                <XAxis dataKey="idx" hide />
                <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(v) => [`${v} pts`, 'Score']}
                  labelFormatter={() => ''}
                />
                <ReferenceLine y={minPts} stroke="#9CA3AF" strokeDasharray="3 3" label={{ value: `${current_palette?.name} min`, fontSize: 9, fill: '#9CA3AF' }} />
                {next_palette && <ReferenceLine y={next_palette.min_points} stroke={next_palette.color} strokeDasharray="3 3" label={{ value: next_palette.name, fontSize: 9, fill: next_palette.color }} />}
                <Line type="monotone" dataKey="points" stroke={palColor} strokeWidth={2.5} dot={{ r: 3, fill: palColor }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* History */}
        <div className="bg-white rounded-2xl overflow-hidden" data-testid="score-history">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-bold text-sm text-gray-800">Historique récent</h3>
          </div>
          {history.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10" data-testid="no-history">
              Aucun ajustement de points pour l'instant.<br />
              Acceptez des courses prioritaires pour gagner des points.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {history.map((e, i) => {
                const positive = (e.delta || 0) > 0;
                const Icon = positive ? Lightning : TrendDown;
                const colorBg = positive ? 'bg-emerald-50' : 'bg-rose-50';
                const colorText = positive ? 'text-emerald-700' : 'text-rose-700';
                const colorIcon = positive ? '#10B981' : '#EF4444';
                const dateStr = e.at ? new Date(e.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <div key={`${e.at || 'h'}-${e.ride_id || i}`} className="px-4 py-3 flex items-center gap-3" data-testid={`history-entry-${i}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${colorBg}`}>
                      <Icon size={16} weight="fill" style={{ color: colorIcon }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{e.reason || '—'}</p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400">
                        {e.ride_id && (
                          <span className="flex items-center gap-0.5"><MapPin size={10} />#{e.ride_id.slice(-6)}</span>
                        )}
                        <span>{dateStr}</span>
                      </div>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${colorText}`}>
                      {positive ? '+' : ''}{e.delta}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TotalCard = ({ icon: Icon, color, label, value, testId }) => (
  <div className="bg-white rounded-xl p-3" data-testid={testId}>
    <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: color + '20' }}>
      <Icon size={14} weight="fill" style={{ color }} />
    </div>
    <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
    <p className="text-[10px] text-gray-500">{label}</p>
  </div>
);

export default DriverScorePage;
