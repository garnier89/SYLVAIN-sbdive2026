import React from 'react';
import { useLocale } from '../../../contexts/LocaleContext';

/** Today's earnings header + the 4 round stat circles (trips, rating, upcoming, pending). */
export const DriverStatsRow = ({
  earnings,
  totalTrips,
  rating,
  upcomingCount,
  availableRidesCount,
  availableDeliveriesCount,
  onEarningsBreakdown,
  onUpcoming,
  onPending,
}) => {
  const { t } = useLocale();
  const stats = [
    { value: totalTrips || 0, label: t('driver.trips_today'), color: '#D1E8E2' },
    { value: (rating || 5.0).toFixed(1), label: t('driver.avg_rating'), color: '#F8D7DA' },
    {
      value: upcomingCount, label: t('driver.jobs_upcoming'), color: '#FFF3CD',
      testId: 'stat-upcoming', onClick: onUpcoming,
      blink: upcomingCount > 0 ? '#F59E0B' : null,
    },
    {
      value: availableRidesCount + availableDeliveriesCount, label: t('driver.jobs_pending'), color: '#D4EDDA',
      testId: 'stat-pending', onClick: onPending,
      dots: [
        ...(availableRidesCount ? [{ c: '#F59E0B', t: 'pending-yellow-dot' }] : []),
        ...(availableDeliveriesCount ? [{ c: '#2F9BFF', t: 'pending-blue-dot' }] : []),
      ],
    },
  ];

  return (
    <>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#DCEAF6' }}>
        <span className="text-base font-bold text-gray-800">{t('driver.earnings_today')}</span>
        <button
          type="button"
          onClick={onEarningsBreakdown}
          className="flex items-center gap-1.5 group"
          data-testid="open-earnings-breakdown-btn"
          aria-label="Voir le détail des revenus"
        >
          <span className="text-base font-bold text-gray-800 group-hover:text-[#FF4500] transition-colors">
            {(earnings || 0).toFixed(2)} EUR
          </span>
          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[11px] font-bold group-hover:bg-blue-200">
            i
          </span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 px-4 py-4 bg-white">
        {stats.map((stat) => (
          <button key={stat.label} type="button" onClick={stat.onClick} disabled={!stat.onClick}
            className="flex flex-col items-center text-center disabled:cursor-default group" data-testid={stat.testId}>
            <div
              className={`relative w-16 h-16 aspect-square rounded-full flex items-center justify-center mb-2 transition-transform duration-150 enabled:group-active:scale-95 enabled:group-hover:-translate-y-0.5 ${stat.blink ? 'animate-pulse' : ''}`}
              style={{
                background: `radial-gradient(circle at 50% 32%, #FFFFFF 0%, ${stat.color} 78%)`,
                boxShadow: stat.blink
                  ? `0 0 0 3px ${stat.blink}, 0 4px 10px rgba(0,0,0,0.08)`
                  : `inset 0 1px 2px rgba(255,255,255,0.7), 0 4px 10px rgba(0,0,0,0.06)`,
              }}
            >
              <span className="text-xl font-extrabold text-gray-800 tabular-nums">{stat.value}</span>
              {(stat.dots || []).map((d, i) => (
                <span key={d.t} data-testid={d.t} className="absolute w-3 h-3 rounded-full ring-2 ring-white animate-pulse"
                  style={{ background: d.c, top: 1, right: i * 12 }} />
              ))}
            </div>
            <span className="text-[10px] text-gray-500 leading-tight whitespace-pre-line">{stat.label}</span>
          </button>
        ))}
      </div>
    </>
  );
};

export default DriverStatsRow;
