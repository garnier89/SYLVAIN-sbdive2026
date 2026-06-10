import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CurrencyEur, TrendUp, Car, Star, CalendarBlank, Clock, MapPin, ArrowRight, Receipt, ArrowLeft } from '@phosphor-icons/react';
import { driverAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';

const DriverEarningsPage = () => {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('today');

  useEffect(() => {
    loadEarnings();
  }, []);

  const loadEarnings = async () => {
    try {
      const res = await driverAPI.getEarnings();
      setData(res.data);
    } catch (err) {
      console.error('Earnings load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const earnings = data || { today: 0, week: 0, month: 0, total: 0, today_trips: 0, week_trips: 0, total_trips: 0, rating: 5.0, recent_rides: [] };
  const tabValues = { today: earnings.today, week: earnings.week, month: earnings.month };

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-earnings-page">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center flex-shrink-0" data-testid="back-btn" aria-label="Retour">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-2xl font-bold text-white truncate" data-testid="earnings-title">{t('driver.my_earnings')}</h1>
        </div>
        <button onClick={() => navigate('/chauffeur/reports')}
          className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-amber-400 text-xs font-semibold px-3 py-2 rounded-xl"
          data-testid="weekly-reports-link">
          <Receipt size={16} /> {t('driver.weekly_reports')}
        </button>
      </div>

      {/* Earnings Card */}
      <div className="mx-5 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-5 shadow-xl shadow-amber-500/20">
        <p className="text-amber-100 text-sm font-medium">{t('driver.total_earnings')}</p>
        <p className="text-4xl font-bold text-white mt-1" data-testid="total-earnings">{earnings.total.toFixed(2)} &euro;</p>
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-1.5">
            <Car size={16} className="text-amber-100" />
            <span className="text-amber-100 text-sm">{earnings.total_trips} {t('driver.rides_word')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Star size={16} weight="fill" className="text-amber-100" />
            <span className="text-amber-100 text-sm">{earnings.rating.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 mt-6">
        {[{ key: 'today', label: t('driver.today') }, { key: 'week', label: t('driver.week') }, { key: 'month', label: t('driver.month') }].map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              tab === tb.key ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-gray-800 text-gray-400'}`}
            data-testid={`tab-${tb.key}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mx-5 mt-4 rounded-2xl bg-gray-900 border border-gray-800 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">{tab === 'today' ? t('driver.earnings_day_title') : tab === 'week' ? t('driver.earnings_week_title') : t('driver.earnings_month_title')}</p>
            <p className="text-3xl font-bold text-white mt-1" data-testid="tab-earnings">{tabValues[tab].toFixed(2)} &euro;</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <TrendUp size={24} className="text-amber-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <p className="text-white font-bold text-lg">{tab === 'today' ? earnings.today_trips : tab === 'week' ? earnings.week_trips : earnings.total_trips}</p>
            <p className="text-gray-400 text-xs">{t('driver.trips')}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <p className="text-white font-bold text-lg">{earnings.rating.toFixed(1)}</p>
            <p className="text-gray-400 text-xs">{t('driver.rating')}</p>
          </div>
        </div>
      </div>

      {/* Recent Rides */}
      <div className="px-5 mt-6">
        <h3 className="text-white font-bold text-base mb-3">{t('driver.recent_rides')}</h3>
        {earnings.recent_rides.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <Car size={40} className="text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{t('driver.no_completed_rides')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {earnings.recent_rides.slice(0, 8).map((ride) => (
              <div key={ride.created_at || ride.pickup_address} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Car size={18} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{ride.pickup_address || 'Course'}</p>
                  <p className="text-gray-500 text-xs truncate">{ride.dropoff_address || ''}</p>
                </div>
                <p className="text-amber-500 font-bold text-sm flex-shrink-0">+{(ride.estimated_fare || 0).toFixed(2)} &euro;</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <DriverBottomNav active="earnings" navigate={navigate} />
    </div>
  );
};

const NAV_ICONS = {
  home: (a) => <svg className={`w-6 h-6 ${a ? 'text-amber-500' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  history: (a) => <svg className={`w-6 h-6 ${a ? 'text-amber-500' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  earnings: (a) => <svg className={`w-6 h-6 ${a ? 'text-amber-500' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  profile: (a) => <svg className={`w-6 h-6 ${a ? 'text-amber-500' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
};

export const DriverBottomNav = ({ active, navigate }) => {
  const { t } = useLocale();
  const tabs = [
    { key: 'home', label: t('tabs.home'), icon: '/', path: '/chauffeur/home' },
    { key: 'history', label: t('driver.trips'), icon: 'h', path: '/chauffeur/history' },
    { key: 'earnings', label: t('driver.earnings_nav'), icon: 'e', path: '/chauffeur/earnings' },
    { key: 'profile', label: t('tabs.profile'), icon: 'p', path: '/chauffeur/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-gray-900 border-t border-gray-800 flex z-50" data-testid="driver-bottom-nav">
      {tabs.map(tb => (
        <button key={tb.key} onClick={() => navigate(tb.path)}
          className={`flex-1 flex flex-col items-center py-3 transition-colors ${active === tb.key ? 'text-amber-500' : 'text-gray-500'}`}
          data-testid={`nav-${tb.key}`}>
          {NAV_ICONS[tb.key](active === tb.key)}
          <span className="text-[10px] mt-1 font-medium">{tb.label}</span>
        </button>
      ))}
    </div>
  );
};

export default DriverEarningsPage;
