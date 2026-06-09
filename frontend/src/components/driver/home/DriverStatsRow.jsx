import React from 'react';
import { Path, Star, CalendarCheck, Timer } from '@phosphor-icons/react';
import { useLocale } from '../../../contexts/LocaleContext';

/** Today's earnings header + the 4 modern stat cards (trips, rating, upcoming, pending). */
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
    {
      value: totalTrips || 0, label: t('driver.trips_today'),
      Icon: Path, accent: '#10B981', tint: '#ECFDF5',
    },
    {
      value: (rating || 5.0).toFixed(1), label: t('driver.avg_rating'),
      Icon: Star, accent: '#F59E0B', tint: '#FFFBEB',
    },
    {
      value: upcomingCount, label: t('driver.jobs_upcoming'),
      Icon: CalendarCheck, accent: '#8B5CF6', tint: '#F5F3FF',
      testId: 'stat-upcoming', onClick: onUpcoming,
      blink: upcomingCount > 0 ? '#F59E0B' : null,
    },
    {
      value: availableRidesCount + availableDeliveriesCount, label: t('driver.jobs_pending'),
      Icon: Timer, accent: '#3B82F6', tint: '#EFF6FF',
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

      <div className="grid grid-cols-4 gap-2.5 px-4 py-4 bg-white">
        {stats.map((stat) => {
          const { Icon } = stat;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={stat.onClick}
              disabled={!stat.onClick}
              data-testid={stat.testId}
              className="group relative flex flex-col items-center justify-center rounded-2xl border border-gray-100 py-3 px-1 shadow-sm transition-transform duration-150 enabled:active:scale-95 enabled:hover:-translate-y-0.5 disabled:cursor-default"
              style={{ background: `linear-gradient(180deg, #FFFFFF 0%, ${stat.tint} 100%)` }}
            >
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center mb-1.5"
                style={{ background: stat.tint, boxShadow: stat.blink ? `0 0 0 2px ${stat.blink}` : 'none' }}
              >
                <Icon size={17} weight="fill" style={{ color: stat.accent }} className={stat.blink ? 'animate-pulse' : ''} />
              </span>
              <span className="text-xl font-extrabold text-gray-900 leading-none tabular-nums">{stat.value}</span>
              <span className="text-[9px] font-medium text-gray-400 mt-1.5 leading-tight whitespace-pre-line">{stat.label}</span>
              {(stat.dots || []).map((d, i) => (
                <span
                  key={d.t}
                  data-testid={d.t}
                  className="absolute w-2.5 h-2.5 rounded-full ring-2 ring-white animate-pulse"
                  style={{ background: d.c, top: 8, right: 8 + i * 12 }}
                />
              ))}
            </button>
          );
        })}
      </div>
    </>
  );
};

export default DriverStatsRow;
