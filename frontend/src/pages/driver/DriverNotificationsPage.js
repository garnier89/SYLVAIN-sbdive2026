import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DriverBottomNav } from './DriverProfilePage';
import { Button } from '../../components/ui/button';
import { driverAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Bell, Car, CheckCircle, Star, ArrowLeft, Trash, FileText } from '@phosphor-icons/react';
import { toast } from 'sonner';

const typeConfig = {
  ride: { icon: Car, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  earning: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
  system: { icon: Bell, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  promo: { icon: Star, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  driver_document_reviewed: { icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
};

const DriverNotificationsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on } = useWebSocket(user?.id);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    driverAPI.getNotifications()
      .then((r) => setNotifications(r.data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    driverAPI.getNotifications()
      .then((r) => { if (active) setNotifications(r.data); })
      .catch(() => { if (active) toast.error('Erreur de chargement'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Live refresh when a new notification (e.g. document reviewed) arrives.
  useEffect(() => {
    const off = on('driver_document_reviewed', () => {
      driverAPI.getNotifications().then((r) => setNotifications(r.data)).catch(() => {});
    });
    return off;
  }, [on]);

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await driverAPI.markAllNotificationsRead(); } catch { load(); }
  };

  const deleteNotif = async (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try { await driverAPI.deleteNotification(id); } catch { toast.error('Échec de la suppression'); load(); }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-notifications">
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/chauffeur/home')} className="text-white"><ArrowLeft size={20} /></Button>
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          {unreadCount > 0 && <span className="bg-amber-500 text-gray-950 text-xs font-bold px-2 py-0.5 rounded-full" data-testid="notif-unread-count">{unreadCount}</span>}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead} className="text-amber-400 text-xs" data-testid="notif-mark-all-read">Tout marquer lu</Button>
        )}
      </div>

      <div className="px-5 space-y-2">
        {loading && <p className="text-gray-500 text-center py-10 text-sm">Chargement…</p>}
        {!loading && notifications.map((notif) => {
          const config = typeConfig[notif.type] || typeConfig.system;
          const Icon = config.icon;
          return (
            <div key={notif.id} className={`bg-gray-900 border rounded-xl p-3 flex items-start gap-3 ${notif.read ? 'border-gray-800' : 'border-amber-500/30'}`} data-testid={`notif-${notif.id}`}>
              <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon size={18} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${notif.read ? 'text-gray-400' : 'text-white'}`}>{notif.title}</p>
                  {!notif.read && <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{notif.body || notif.desc}</p>
                <p className="text-[10px] text-gray-600 mt-1">{timeAgo(notif.created_at)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:text-red-400 flex-shrink-0" onClick={() => deleteNotif(notif.id)} data-testid={`notif-delete-${notif.id}`}>
                <Trash size={14} />
              </Button>
            </div>
          );
        })}
        {!loading && notifications.length === 0 && (
          <div className="text-center py-16" data-testid="notif-empty">
            <Bell size={40} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">Aucune notification</p>
          </div>
        )}
      </div>
      <DriverBottomNav />
    </div>
  );
};

export default DriverNotificationsPage;
