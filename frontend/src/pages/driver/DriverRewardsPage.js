import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, CurrencyEur, Clock, MapPin, CalendarCheck, Car, Motorcycle, Bicycle, CheckCircle, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const GREEN = '#00B578';

const DriverRewardsPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/drivers/my-active-rewards`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  const iconForType = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('moto')) return Motorcycle;
    if (t.includes('velo')) return Bicycle;
    return Car;
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-8" data-testid="driver-rewards-page">
      <div className="px-5 pt-5 pb-6 text-white" style={{ background: `linear-gradient(135deg, ${GREEN}, #059669)` }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2"><Gift size={20} weight="fill" />Mes Recompenses Actives</h1>
            <p className="text-[11px] text-white/80">Bonus en cours pour {data?.driver_vehicle_type || 'votre vehicule'}</p>
          </div>
        </div>
      </div>

      {loading ? <p className="text-center text-gray-400 text-sm py-8">Chargement...</p> : !data?.any_active ? (
        <div className="mx-5 mt-6 bg-white rounded-2xl p-8 text-center" data-testid="no-rewards">
          <Gift size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm font-bold text-gray-600">Aucune recompense active</p>
          <p className="text-[11px] text-gray-400 mt-1">Revenez plus tard ou verifiez les conditions d'eligibilite</p>
        </div>
      ) : (
        <div className="px-5 mt-5 space-y-5">
          {data.vehicle_rewards.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Regard Vehicule</p>
              <div className="space-y-2">
                {data.vehicle_rewards.map((r) => {
                  const Icon = iconForType(r.type);
                  return (
                    <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`reward-${r.id}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: GREEN + '20' }}>
                          <Icon size={22} weight="duotone" style={{ color: GREEN }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800">{r.type || 'Vehicule'}</p>
                          <p className="text-[11px] text-gray-500 truncate">{r.description || 'Bonus actif sur vos courses'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black" style={{ color: GREEN }}>+{(r.bonus_per_trip || 0).toFixed(2)}&euro;</p>
                          <p className="text-[9px] text-gray-400">par course</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <InfoChip icon={Clock} label={`${r.start_time || '00:00'} - ${r.end_time || '23:59'}`} />
                        <InfoChip icon={MapPin} label={r.zone || 'Toutes zones'} />
                        {(r.start_date || r.end_date) && <InfoChip icon={CalendarCheck} label={`${r.start_date || '—'} au ${r.end_date || '—'}`} />}
                        {r.min_trips > 0 && <InfoChip icon={CheckCircle} label={`Min ${r.min_trips} courses`} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.guarantees.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Garantie de chiffre d'affaires</p>
              <div className="space-y-2">
                {data.guarantees.map((g) => (
                  <div key={g.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`guarantee-${g.id}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F59E0B20' }}>
                        <CurrencyEur size={22} weight="bold" className="text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800">{g.name || 'Garantie CA'}</p>
                        <p className="text-[11px] text-gray-500 truncate">{g.description || 'L\'app complete la difference'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-amber-600">{(g.min_revenue || 0).toFixed(0)}&euro;</p>
                        <p className="text-[9px] text-gray-400">CA minimum garanti</p>
                      </div>
                    </div>
                    <div className={`rounded-lg p-2 mb-2 flex items-center gap-2 ${g.eligible ? 'bg-green-50' : 'bg-red-50'}`} data-testid={`guarantee-eligibility-${g.id}`}>
                      {g.eligible
                        ? <><CheckCircle size={14} className="text-green-600" weight="fill" /><span className="text-[11px] text-green-700 font-bold">Vous etes eligible</span></>
                        : <><XCircle size={14} className="text-red-500" weight="fill" /><span className="text-[11px] text-red-600 font-bold">Conditions non remplies</span></>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <InfoChip icon={Clock} label={`${g.start_hour} - ${g.end_hour}`} />
                      <InfoChip icon={MapPin} label={g.zone || 'Toutes'} />
                      <InfoChip icon={CheckCircle} label={`Acceptation >= ${g.acceptance_rate ?? 0}%`} highlight={data.driver_acceptance_rate >= (g.acceptance_rate ?? 0)} />
                      <InfoChip icon={XCircle} label={`Annulation <= ${g.max_cancellation ?? 100}%`} highlight={data.driver_cancellation_rate <= (g.max_cancellation ?? 100)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const InfoChip = ({ icon: Icon, label, highlight }) => (
  <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg ${highlight ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
    <Icon size={11} className={highlight ? 'text-green-600' : 'text-gray-400'} />
    <span className="font-medium truncate">{label}</span>
  </div>
);

export default DriverRewardsPage;
