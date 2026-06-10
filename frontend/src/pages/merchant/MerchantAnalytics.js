import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { TrendUp, TrendDown, CurrencyEur, Package, Star, Clock, Sparkle, Lightning, WarningCircle, ArrowsClockwise } from '@phosphor-icons/react';
import { merchantAPI } from '../../services/api';

const PERIODS = [
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
];

const Trend = ({ pct }) => {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <div className="flex items-center gap-1 mt-1">
      {up ? <TrendUp size={14} className="text-green-500" /> : <TrendDown size={14} className="text-red-500" />}
      <span className={`text-xs ${up ? 'text-green-600' : 'text-red-600'}`}>{up ? '+' : ''}{pct}%</span>
    </div>
  );
};

const MerchantAnalytics = () => {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const loadAnalytics = useCallback(async (p) => {
    try {
      const res = await merchantAPI.getAnalytics(p);
      setData(res.data);
    } catch (err) { console.error('analytics error', err?.message); }
  }, []);

  const loadInsights = useCallback(async (p) => {
    setLoadingAi(true);
    setInsights(null);
    try {
      const res = await merchantAPI.getAiInsights(p);
      setInsights(res.data.insights);
    } catch (err) { console.error('ai insights error', err?.message); }
    finally { setLoadingAi(false); }
  }, []);

  useEffect(() => {
    loadAnalytics(period);
    loadInsights(period);
  }, [period, loadAnalytics, loadInsights]);

  const series = data?.series || [];
  const maxVal = Math.max(1, ...series.map((d) => d.value));

  return (
    <div className="p-6" data-testid="merchant-analytics">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1" data-testid="analytics-period-switch">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${period === p.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              data-testid={`period-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards (real data) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><CurrencyEur size={16} /> Revenu</div>
          <p className="text-2xl font-bold text-gray-900" data-testid="kpi-revenue">{(data?.revenue ?? 0).toFixed(2)} €</p>
          <Trend pct={data?.revenue_trend_pct} />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Package size={16} /> Commandes</div>
          <p className="text-2xl font-bold text-gray-900" data-testid="kpi-orders">{data?.orders ?? 0}</p>
          <Trend pct={data?.orders_trend_pct} />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Star size={16} /> Panier moyen</div>
          <p className="text-2xl font-bold text-gray-900" data-testid="kpi-aov">{(data?.avg_order_value ?? 0).toFixed(2)} €</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Clock size={16} /> Jour le + actif</div>
          <p className="text-2xl font-bold text-orange-600" data-testid="kpi-busiest">{data?.busiest_dow || '—'}</p>
        </CardContent></Card>
      </div>

      {/* AI Insights */}
      <Card className="mb-6 border-violet-200 bg-violet-50/40" data-testid="ai-insights-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-violet-800">
            <Sparkle size={18} weight="fill" className="text-violet-600" /> Insights IA
            {insights?.source === 'ai' && <Badge className="bg-violet-100 text-violet-700 text-[10px]">Gemini</Badge>}
          </CardTitle>
          <button onClick={() => loadInsights(period)} disabled={loadingAi} className="text-violet-600 disabled:opacity-50" data-testid="refresh-ai-btn" aria-label="Rafraîchir">
            <ArrowsClockwise size={16} className={loadingAi ? 'animate-spin' : ''} />
          </button>
        </CardHeader>
        <CardContent>
          {loadingAi && !insights ? (
            <p className="text-sm text-gray-500" data-testid="ai-loading">Analyse en cours…</p>
          ) : insights ? (
            <div className="space-y-3 text-sm">
              <p className="text-gray-800 font-medium" data-testid="ai-summary">{insights.summary}</p>
              <div className="flex items-start gap-2 text-gray-700" data-testid="ai-forecast">
                <TrendUp size={16} className="text-violet-500 mt-0.5 shrink-0" />
                <span><b>Prévision :</b> {insights.forecast}</span>
              </div>
              {insights.popular?.length > 0 && (
                <div data-testid="ai-popular">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Produits phares</p>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.popular.map((p, i) => <Badge key={i} className="bg-amber-100 text-amber-800">{p}</Badge>)}
                  </div>
                </div>
              )}
              {insights.promos?.length > 0 && (
                <div data-testid="ai-promos">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><Lightning size={12} className="text-orange-500" /> Recommandations promo</p>
                  <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                    {insights.promos.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {insights.stock_alerts?.length > 0 && (
                <div data-testid="ai-stock">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><WarningCircle size={12} className="text-red-500" /> Alertes stock</p>
                  <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                    {insights.stock_alerts.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Indisponible pour le moment.</p>
          )}
        </CardContent>
      </Card>

      {/* Sales chart (real series) */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Ventes — {PERIODS.find((p) => p.id === period)?.label}</CardTitle></CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="text-center text-gray-400 py-6">Aucune donnée</p>
          ) : (
            <div className="flex items-end justify-between gap-1.5 h-40" data-testid="sales-chart">
              {series.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[9px] text-gray-400">{d.value > 0 ? Math.round(d.value) : ''}</span>
                  <div className="w-full bg-orange-100 rounded-t-md relative" style={{ height: `${(d.value / maxVal) * 100}%`, minHeight: d.value > 0 ? 4 : 0 }}>
                    <div className="absolute inset-0 bg-orange-500 rounded-t-md opacity-80" />
                  </div>
                  <span className="text-[9px] text-gray-500 font-medium truncate w-full text-center">{d.label}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top products (real) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Produits les plus vendus</CardTitle></CardHeader>
        <CardContent>
          {(data?.top_products || []).length === 0 ? (
            <p className="text-center text-gray-400 py-6">Aucune vente sur la période</p>
          ) : (
            <div className="space-y-2" data-testid="top-products">
              {data.top_products.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{p.qty} vendus</p>
                    <p className="text-xs text-gray-500">{(p.revenue || 0).toFixed(2)} €</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MerchantAnalytics;
