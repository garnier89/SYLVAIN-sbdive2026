import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { orderAPI, merchantAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLocale } from '../../contexts/LocaleContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { playAlert, unlockAudio } from '../../lib/driverAlert';
import { subscribeToPush, isPushSupported } from '../../lib/webpush';
import { toast } from 'sonner';
import {
  Package, Clock, CheckCircle, XCircle, Truck, MapPin, BellRinging, BellSlash, WifiHigh, WifiSlash, Pause, Play, DeviceMobile,
} from '@phosphor-icons/react';

const PAUSE_DURATIONS = [
  { label: '15 min', mins: 15 },
  { label: '30 min', mins: 30 },
  { label: '1 heure', mins: 60 },
  { label: "Jusqu'à réouverture", mins: null },
];

const STATUS_FR = {
  pending: 'En attente', accepted: 'Acceptée', preparing: 'En préparation',
  ready: 'Prête', picked_up: 'Récupérée', delivered: 'Livrée', cancelled: 'Annulée',
};
const STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-800', accepted: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800', ready: 'bg-cyan-100 text-cyan-800',
  picked_up: 'bg-indigo-100 text-indigo-800', delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};
const SPEED_BADGE = {
  express: { txt: '⚡ Express', cls: 'bg-amber-100 text-amber-700' },
  priority: { txt: '⭐ Prioritaire', cls: 'bg-purple-100 text-purple-700' },
  scheduled: { txt: '🕒 Programmée', cls: 'bg-blue-100 text-blue-700' },
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  return `il y a ${h} h`;
};

const MerchantOrders = () => {
  const { user } = useAuth();
  const { money } = useLocale();
  const { connected, on } = useWebSocket(user?.id);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(true);
  soundRef.current = soundOn;
  const [busyId, setBusyId] = useState(null);
  const [accepting, setAccepting] = useState(true);
  const [pauseUntil, setPauseUntil] = useState(null);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [pushOn, setPushOn] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');

  // Load store availability (pause state).
  useEffect(() => {
    merchantAPI.getMine().then((res) => {
      setAccepting(res.data.accepting_orders !== false);
      setPauseUntil(res.data.pause_until || null);
    }).catch(() => {});
  }, []);

  const setAvailability = async (acceptingNext, pauseMinutes) => {
    setShowPauseMenu(false);
    try {
      const res = await merchantAPI.setAvailability({ accepting_orders: acceptingNext, pause_minutes: pauseMinutes });
      setAccepting(res.data.accepting_orders);
      setPauseUntil(res.data.pause_until || null);
      toast.success(acceptingNext ? 'Commandes réactivées ✅' : 'Boutique en pause ⏸️');
    } catch (e) {
      toast.error('Échec de la mise à jour');
    }
  };

  const enablePush = async () => {
    if (!isPushSupported()) { toast.error("Les notifications ne sont pas supportées sur cet appareil/navigateur."); return; }
    const res = await subscribeToPush();
    if (res.ok) { setPushOn(true); toast.success('Notifications activées — vous serez alerté même app fermée.'); }
    else if (res.reason === 'denied') toast.error('Notifications bloquées. Autorisez-les dans les réglages du navigateur.');
    else toast.error("Impossible d'activer les notifications.");
  };

  const loadOrders = useCallback(async () => {
    try {
      const response = await orderAPI.list({ limit: 50 });
      setOrders(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Load orders error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000); // fallback poll
    return () => clearInterval(interval);
  }, [loadOrders]);

  // Real-time: new orders + status changes push from the backend.
  useEffect(() => {
    const offNew = on('new_order', (msg) => {
      if (soundRef.current) { try { playAlert(); } catch (_) { /* */ } }
      toast.success(`Nouvelle commande · ${money(msg.total || 0)}`, { duration: 8000 });
      loadOrders();
    });
    const offStatus = on('order_status', () => loadOrders());
    const offAssigned = on('order_driver_assigned', () => loadOrders());
    return () => { offNew?.(); offStatus?.(); offAssigned?.(); };
  }, [on, loadOrders, money]);

  const updateOrderStatus = async (orderId, newStatus) => {
    setBusyId(orderId);
    // Optimistic update for snappy UX.
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    try {
      await orderAPI.updateStatus(orderId, newStatus);
      toast.success(`Commande ${STATUS_FR[newStatus]?.toLowerCase()}`);
    } catch (error) {
      toast.error("Échec de la mise à jour");
      loadOrders();
    } finally {
      setBusyId(null);
    }
  };

  const filterOrders = (status) => {
    if (status === 'pending') return orders.filter((o) => o.status === 'pending');
    if (status === 'active') return orders.filter((o) => ['accepted', 'preparing', 'ready'].includes(o.status));
    if (status === 'completed') return orders.filter((o) => ['picked_up', 'delivered', 'cancelled'].includes(o.status));
    return orders;
  };

  const enableSound = () => { unlockAudio(); setSoundOn((v) => !v); };

  const OrderCard = ({ order }) => {
    const Icon = { pending: Clock, accepted: CheckCircle, preparing: Package, ready: CheckCircle, picked_up: Truck, delivered: CheckCircle, cancelled: XCircle }[order.status] || Clock;
    const speed = SPEED_BADGE[order.delivery_speed];
    const isNew = order.status === 'pending' && (Date.now() - new Date(order.created_at).getTime()) < 60000;
    return (
      <Card className={`transition-shadow hover:shadow-md ${isNew ? 'ring-2 ring-orange-400' : ''}`} data-testid={`order-card-${order.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-bold text-lg text-gray-900">#{order.id.slice(-6)}</p>
              <p className="text-xs text-gray-500">{timeAgo(order.created_at)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className={`${STATUS_STYLE[order.status] || 'bg-gray-100'} flex items-center gap-1`}>
                <Icon size={13} /> {STATUS_FR[order.status] || order.status}
              </Badge>
              <div className="flex gap-1">
                {speed && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${speed.cls}`} data-testid={`speed-${order.id}`}>{speed.txt}</span>}
                {order.group_status === 'grouped' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🌱 Groupée</span>}
              </div>
            </div>
          </div>

          <div className="border-t border-b py-3 my-3 space-y-1.5">
            {(order.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.quantity}× {item.name}</span>
                <span className="text-gray-500">{money((item.price || 0) * (item.quantity || 1))}</span>
              </div>
            ))}
            {order.special_instructions && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">📝 {order.special_instructions}</p>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
            <MapPin size={14} className="text-red-500 shrink-0" />
            <span className="truncate">{order.delivery_address || '—'}</span>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xl font-bold text-orange-600">{money(order.total || 0)}</p>
            <div className="flex gap-2">
              {order.status === 'pending' && (
                <>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                    disabled={busyId === order.id}
                    onClick={() => updateOrderStatus(order.id, 'cancelled')} data-testid={`reject-${order.id}`}>
                    Refuser
                  </Button>
                  <Button size="sm" style={{ backgroundColor: '#f97316' }} className="text-white"
                    disabled={busyId === order.id}
                    onClick={() => updateOrderStatus(order.id, 'accepted')} data-testid={`accept-${order.id}`}>
                    Accepter
                  </Button>
                </>
              )}
              {order.status === 'accepted' && (
                <Button size="sm" style={{ backgroundColor: '#f97316' }} className="text-white"
                  disabled={busyId === order.id}
                  onClick={() => updateOrderStatus(order.id, 'preparing')} data-testid={`prepare-${order.id}`}>
                  Commencer la préparation
                </Button>
              )}
              {order.status === 'preparing' && (
                <Button size="sm" style={{ backgroundColor: '#22c55e' }} className="text-white"
                  disabled={busyId === order.id}
                  onClick={() => updateOrderStatus(order.id, 'ready')} data-testid={`ready-${order.id}`}>
                  Marquer prête
                </Button>
              )}
              {order.status === 'ready' && (
                <Badge className="bg-green-100 text-green-800 px-3 py-1.5">En attente du livreur</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const Empty = ({ icon: Icon, label }) => (
    <Card><CardContent className="p-12 text-center text-gray-500"><Icon size={48} className="mx-auto mb-4 opacity-50" /><p>{label}</p></CardContent></Card>
  );

  const Grid = ({ list }) => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{list.map((o) => <OrderCard key={o.id} order={o} />)}</div>
  );

  return (
    <div className="p-6 space-y-6" data-testid="merchant-orders">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Commandes</h1>
          <p className="text-gray-500 flex items-center gap-2">
            Gérez vos commandes en temps réel
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${connected ? 'text-green-600' : 'text-gray-400'}`} data-testid="ws-status">
              {connected ? <WifiHigh size={14} /> : <WifiSlash size={14} />}
              {connected ? 'En direct' : 'Hors ligne'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={enablePush} data-testid="push-toggle" className="gap-2">
            <DeviceMobile size={16} className={pushOn ? 'text-green-500' : 'text-gray-400'} />
            {pushOn ? 'Alertes activées' : 'Activer les alertes'}
          </Button>
          <Button variant="outline" size="sm" onClick={enableSound} data-testid="sound-toggle" className="gap-2">
            {soundOn ? <BellRinging size={16} className="text-orange-500" /> : <BellSlash size={16} className="text-gray-400" />}
            {soundOn ? 'Son activé' : 'Son coupé'}
          </Button>
          <div className="relative">
            {accepting ? (
              <Button variant="outline" size="sm" onClick={() => setShowPauseMenu((v) => !v)} data-testid="pause-toggle"
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                <Pause size={16} weight="fill" /> Mettre en pause
              </Button>
            ) : (
              <Button size="sm" onClick={() => setAvailability(true)} data-testid="resume-btn"
                style={{ backgroundColor: '#22c55e' }} className="gap-2 text-white">
                <Play size={16} weight="fill" /> Reprendre
              </Button>
            )}
            {showPauseMenu && accepting && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 p-2 z-20" data-testid="pause-menu">
                <p className="text-xs text-gray-500 px-2 py-1">Suspendre les commandes pendant…</p>
                {PAUSE_DURATIONS.map((d) => (
                  <button key={d.label} onClick={() => setAvailability(false, d.mins)}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-amber-50 text-gray-700"
                    data-testid={`pause-${d.mins || 'indef'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!accepting && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3" data-testid="paused-banner">
          <Pause size={20} weight="fill" className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">Boutique en pause</p>
            <p className="text-sm text-amber-700">
              Vous ne recevez plus de nouvelles commandes{pauseUntil ? ` jusqu'à ${new Date(pauseUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : " jusqu'à réouverture manuelle"}.
            </p>
          </div>
          <Button size="sm" onClick={() => setAvailability(true)} style={{ backgroundColor: '#22c55e' }} className="text-white">Reprendre</Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="pending" data-testid="tab-pending">En attente ({filterOrders('pending').length})</TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">En cours ({filterOrders('active').length})</TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">Terminées ({filterOrders('completed').length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Card key={i} className="animate-pulse"><CardContent className="p-4 h-48" /></Card>)}</div>
          ) : filterOrders('pending').length === 0 ? (
            <Empty icon={CheckCircle} label="Aucune commande en attente" />
          ) : <Grid list={filterOrders('pending')} />}
        </TabsContent>
        <TabsContent value="active" className="mt-6">
          {filterOrders('active').length === 0 ? <Empty icon={Package} label="Aucune commande en cours" /> : <Grid list={filterOrders('active')} />}
        </TabsContent>
        <TabsContent value="completed" className="mt-6">
          {filterOrders('completed').length === 0 ? <Empty icon={Truck} label="Aucune commande terminée" /> : <Grid list={filterOrders('completed')} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MerchantOrders;
