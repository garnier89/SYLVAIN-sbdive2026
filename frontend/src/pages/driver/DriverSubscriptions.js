/**
 * Driver subscriptions page — V3Cube driver_subscription_plan integration.
 * Plans : Free / Pro / VIP / Elite Annual avec commissions décroissantes.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Crown, CheckCircle, X, Star, TrendUp, Lightning, ShieldStar } from '@phosphor-icons/react';
import { subscriptionsAPI } from '../../api/v3cubeAPI';

const PLAN_ACCENTS = {
  Free: { color: 'bg-gray-500', icon: CheckCircle, gradient: 'from-gray-400 to-gray-500' },
  Pro: { color: 'bg-blue-600', icon: TrendUp, gradient: 'from-blue-500 to-blue-600' },
  VIP: { color: 'bg-amber-500', icon: Crown, gradient: 'from-amber-400 to-orange-500' },
  'Elite Annual': { color: 'bg-purple-600', icon: ShieldStar, gradient: 'from-purple-500 to-fuchsia-600' },
};

export default function DriverSubscriptions() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([subscriptionsAPI.listPlans(), subscriptionsAPI.my()]);
      setPlans(p.items || []);
      setCurrent(m);
    } catch (e) { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const subscribe = async (plan) => {
    if (!window.confirm(`Confirmer la souscription au plan ${plan.name} (${plan.price.toFixed(2)} €) ? Le montant sera débité de votre wallet.`)) return;
    setSubscribing(plan.id);
    try {
      await subscriptionsAPI.subscribe(plan.id, 'wallet');
      toast.success(`Plan ${plan.name} activé !`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur souscription');
    } finally { setSubscribing(null); }
  };

  const cancel = async () => {
    if (!window.confirm('Annuler le renouvellement automatique ? Votre plan reste actif jusqu\'à expiration.')) return;
    try {
      await subscriptionsAPI.cancel();
      toast.success('Renouvellement annulé');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  if (loading) return <div className="p-10">Chargement…</div>;

  const activePlanName = current?.plan?.name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20" data-testid="driver-subscriptions-page">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">←</button>
          <h1 className="text-2xl font-bold">Mes abonnements</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Current plan banner */}
        {current && !current.is_default && current.subscription && (
          <div className={`rounded-2xl p-6 mb-8 text-white shadow-xl bg-gradient-to-r ${PLAN_ACCENTS[activePlanName]?.gradient || 'from-blue-500 to-purple-600'}`} data-testid="current-subscription-banner">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm opacity-80">Votre plan actuel</p>
                <h2 className="text-3xl font-black flex items-center gap-2 mt-1">
                  {PLAN_ACCENTS[activePlanName] && React.createElement(PLAN_ACCENTS[activePlanName].icon, { size: 32, weight: 'duotone' })}
                  {activePlanName}
                </h2>
                <p className="text-sm opacity-90 mt-2">
                  Expire le {new Date(current.subscription.expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm opacity-90">Commission : <strong>{current.subscription.commission_pct_locked}%</strong></p>
              </div>
              <button onClick={cancel} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2 rounded-lg font-semibold" data-testid="cancel-subscription-btn">
                Annuler le renouvellement
              </button>
            </div>
          </div>
        )}

        {current?.is_default && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 text-blue-800 text-sm" data-testid="free-plan-banner">
            Vous êtes actuellement sur le <strong>plan Free</strong> (commission 20%). Passez à un plan supérieur pour réduire votre commission et bénéficier d'avantages.
          </div>
        )}

        {/* Plans grid */}
        <h2 className="text-xl font-bold mb-4 text-gray-800">Choisir un plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(plan => {
            const accent = PLAN_ACCENTS[plan.name] || PLAN_ACCENTS.Free;
            const Icon = accent.icon;
            const isActive = activePlanName === plan.name;
            const isFree = plan.is_default;
            return (
              <div key={plan.id} className={`bg-white rounded-2xl shadow-md overflow-hidden border-2 transition-all ${isActive ? 'border-green-500 ring-2 ring-green-200' : 'border-transparent hover:shadow-xl'}`} data-testid={`plan-card-${plan.name.toLowerCase().replace(/\s/g, '-')}`}>
                <div className={`bg-gradient-to-r ${accent.gradient} p-5 text-white text-center`}>
                  <Icon size={42} weight="duotone" className="mx-auto mb-2" />
                  <h3 className="text-2xl font-black">{plan.name}</h3>
                  <p className="text-3xl font-black mt-2">
                    {plan.price === 0 ? 'Gratuit' : `${plan.price.toFixed(2)} €`}
                    {plan.duration_days > 0 && <span className="text-sm font-normal opacity-80"> / {plan.duration_days === 365 ? 'an' : 'mois'}</span>}
                  </p>
                </div>
                <div className="p-5 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-800">{plan.commission_pct}%</span>
                    <span className="text-xs text-gray-500">commission</span>
                  </div>
                  <ul className="space-y-1.5 text-sm pt-2 border-t">
                    {(plan.perks || []).map((perk, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-700">
                        <CheckCircle size={16} weight="fill" className="text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                  {!isFree && !isActive && (
                    <button
                      onClick={() => subscribe(plan)}
                      disabled={subscribing === plan.id}
                      className={`w-full mt-4 py-2.5 text-white font-bold rounded-lg ${accent.color} hover:opacity-90 disabled:opacity-50`}
                      data-testid={`subscribe-${plan.name.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {subscribing === plan.id ? 'Souscription…' : `Souscrire`}
                    </button>
                  )}
                  {isActive && (
                    <p className="text-center mt-4 text-green-600 font-semibold text-sm flex items-center justify-center gap-2">
                      <CheckCircle size={18} weight="fill" /> Plan actif
                    </p>
                  )}
                  {isFree && !isActive && (
                    <p className="text-center mt-4 text-gray-400 italic text-xs">Plan par défaut</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 mt-8 text-center">
          Paiement débité de votre <a className="underline" href="/chauffeur/finance">wallet SB PayGo</a>. Cartes bancaires Stripe à venir.
        </p>
      </div>
    </div>
  );
}
