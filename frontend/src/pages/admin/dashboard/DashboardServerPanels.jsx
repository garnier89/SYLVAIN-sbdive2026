import React from 'react';
import { Button } from '../../../components/ui/button';
import { Bell, CheckCircle, XCircle, Warning } from '@phosphor-icons/react';

const NOTIFICATIONS = [
  { user: 'felicia angliviel', action: 'PERMIS DE CONDUIRE VE...', time: '14 Hours ago' },
  { user: 'felicia angliviel', action: "CARTE D'IDENTITE VERSO...", time: '14 Hours ago' },
  { user: 'felicia angliviel', action: "CARTE D'IDENTITE RECT...", time: '14 Hours ago' },
  { user: 'felicia angliviel', action: 'PHOTO AVANT PLAQUE V...', time: '14 Hours ago' },
  { user: 'felicia angliviel', action: 'CARTE GRISE uploaded ...', time: '14 Hours ago' },
];

const CONTACT_REQUESTS = [
  { user: 'denver sv', message: 'Je risque de porter plai...', time: '1 Day ago' },
  { user: 'denver sv', message: "L'application qui a un b...", time: '1 Day ago' },
  { user: 'denver sv', message: "Vous vous etes trompe,...", time: '1 Day ago' },
  { user: 'Remy Latouchent', message: 'Je voudai encaisser mo...', time: '1 Day ago' },
  { user: 'Allan Narcissot', message: 'Je souhaite recuperer l...', time: '1 Day ago' },
];

const AlertRow = ({ title, sub, time }) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
    <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
      <Bell size={18} className="text-amber-500" weight="fill" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-800 truncate">{title}</p>
      <p className="text-xs text-gray-500 truncate">{sub}</p>
    </div>
    <span className="text-xs font-bold text-red-500 whitespace-nowrap flex-shrink-0">{time}</span>
  </div>
);

/** Server Statistics + Notification Alerts + Contact Us Form (bottom dashboard grid). */
export const DashboardServerPanels = ({ navigate }) => (
  <div className="grid lg:grid-cols-3 gap-5">
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800 text-base">Server Statistics</h3>
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate('/admin/monitoring')}>View</Button>
      </div>
      <p className="text-xs text-gray-500 mb-4">Last Updated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} AT {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
      <div className="space-y-3">
        <div className="flex items-center justify-between py-3 border-b border-gray-100">
          <div className="flex items-center gap-3"><CheckCircle size={24} className="text-green-500" weight="fill" /><span className="text-sm text-gray-700">Working</span></div>
          <span className="text-lg font-bold text-green-600">8</span>
        </div>
        <div className="flex items-center justify-between py-3 border-b border-gray-100">
          <div className="flex items-center gap-3"><XCircle size={24} className="text-red-500" weight="fill" /><span className="text-sm text-gray-700">Errors</span></div>
          <span className="text-lg font-bold text-red-600">2</span>
        </div>
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3"><Warning size={24} className="text-amber-500" weight="fill" /><span className="text-sm text-gray-700">Alerts</span></div>
          <span className="text-lg font-bold text-amber-600">0</span>
        </div>
      </div>
      <div className="flex justify-center gap-6 mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-[10px] text-gray-500">Working</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[10px] text-gray-500">Errors</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /><span className="text-[10px] text-gray-500">Alerts</span></div>
      </div>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800 text-base">Notification Alerts Panel</h3>
        <Button size="sm" className="bg-green-500 text-white text-[10px] h-7">View All</Button>
      </div>
      <div className="space-y-2 max-h-[280px] overflow-y-auto">
        {NOTIFICATIONS.map((n, i) => <AlertRow key={`${n.user}-${n.action}-${i}`} title={n.user} sub={n.action} time={n.time} />)}
      </div>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-base">Contact Us Form</h3>
          <p className="text-xs text-gray-500">Requests</p>
        </div>
        <Button size="sm" className="bg-green-500 text-white text-[10px] h-7" onClick={() => navigate('/admin/support')}>View All</Button>
      </div>
      <div className="space-y-2 max-h-[280px] overflow-y-auto">
        {CONTACT_REQUESTS.map((c, i) => <AlertRow key={`${c.user}-${c.message}-${i}`} title={c.user} sub={c.message} time={c.time} />)}
      </div>
    </div>
  </div>
);

export default DashboardServerPanels;
