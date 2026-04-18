import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DriverBottomNav } from './DriverProfilePage';
import { Button } from '../../components/ui/button';
import { Bell, Car, Package, CheckCircle, Clock, Star, MapPin, ArrowLeft, Trash } from '@phosphor-icons/react';

const mockNotifications = [
  { id: 1, type: 'ride', title: 'Nouvelle course disponible', desc: 'Fort-de-France vers Aeroport', time: '2 min', read: false },
  { id: 2, type: 'earning', title: 'Paiement recu', desc: '+23.50 EUR pour course #4521', time: '15 min', read: false },
  { id: 3, type: 'system', title: 'Documents verifies', desc: 'Votre carte VTC a ete approuvee', time: '1h', read: true },
  { id: 4, type: 'ride', title: 'Course annulee', desc: 'Le client a annule la course #4518', time: '2h', read: true },
  { id: 5, type: 'promo', title: 'Bonus du week-end', desc: 'Gagnez 20% de plus ce samedi !', time: '5h', read: true },
  { id: 6, type: 'system', title: 'Mise a jour disponible', desc: 'Nouvelle version de l\'app disponible', time: '1j', read: true },
  { id: 7, type: 'earning', title: 'Virement effectue', desc: '347.50 EUR verses sur votre compte', time: '2j', read: true },
];

const typeConfig = {
  ride: { icon: Car, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  earning: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
  system: { icon: Bell, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  promo: { icon: Star, color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

const DriverNotificationsPage = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(mockNotifications);

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const deleteNotif = (id) => setNotifications(prev => prev.filter(n => n.id !== id));
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-notifications">
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/chauffeur/home')} className="text-white"><ArrowLeft size={20} /></Button>
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          {unreadCount > 0 && <span className="bg-amber-500 text-gray-950 text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead} className="text-amber-400 text-xs">Tout marquer lu</Button>
        )}
      </div>

      <div className="px-5 space-y-2">
        {notifications.map(notif => {
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
                <p className="text-xs text-gray-500 mt-0.5">{notif.desc}</p>
                <p className="text-[10px] text-gray-600 mt-1">{notif.time}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:text-red-400 flex-shrink-0" onClick={() => deleteNotif(notif.id)}>
                <Trash size={14} />
              </Button>
            </div>
          );
        })}
        {notifications.length === 0 && (
          <div className="text-center py-16">
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
