import React, { useEffect, useState } from 'react';
import { UsersThree, MapPin, PaperPlaneTilt } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const timeAgo = (iso) => {
  try {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  } catch { return ''; }
};

/**
 * Dashboard card: clients currently waiting for a driver to come online,
 * grouped by zone — so ops can nudge drivers online where demand exists.
 */
const WaitingClientsPanel = () => {
  const [data, setData] = useState(null);
  const [sending, setSending] = useState(null);

  const notifyZone = async (zone) => {
    setSending(zone.zone_id);
    try {
      const r = await fetch(`${API}/api/admin/notifications/notify-zone-drivers`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: zone.zone_id }),
      });
      const d = r.ok ? await r.json() : null;
      if (d) {
        toast.success(d.notified > 0
          ? `${d.notified} chauffeur(s) hors-ligne notifié(s) à ${zone.name}`
          : `Aucun chauffeur hors-ligne localisé à ${zone.name}`);
      } else {
        toast.error('Échec de l\'envoi');
      }
    } catch {
      toast.error('Échec de l\'envoi');
    } finally {
      setSending(null);
    }
  };

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${API}/api/admin/notifications/waiting-clients`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setData(d); })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (!data) return null;
  const rows = data.by_zone || [];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5" data-testid="waiting-clients-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-[#FF5000]/10 flex items-center justify-center">
            <UsersThree size={20} className="text-[#FF5000]" weight="duotone" />
          </div>
          <h3 className="font-bold text-gray-900">Clients en attente d'un chauffeur</h3>
        </div>
        <span className="text-2xl font-extrabold text-[#FF5000]" data-testid="waiting-clients-total">{data.total || 0}</span>
      </div>

      {data.total === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">Aucun client en attente actuellement 🎉</p>
      ) : (
        <div className="space-y-2">
          {rows.map((z) => (
            <button
              key={z.zone_id}
              onClick={() => notifyZone(z)}
              disabled={sending === z.zone_id}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-[#FF5000]/5 transition-colors group disabled:opacity-60"
              data-testid="waiting-zone-row"
              title={`Notifier les chauffeurs hors-ligne de ${z.name}`}
            >
              <span className="flex items-center gap-2 text-sm text-gray-800 min-w-0">
                <MapPin size={16} className="text-gray-400 flex-shrink-0" />
                <span className="truncate">{z.name}</span>
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="hidden group-hover:flex items-center gap-1 text-[11px] font-bold text-[#FF5000]">
                  <PaperPlaneTilt size={13} /> {sending === z.zone_id ? 'Envoi…' : 'Notifier'}
                </span>
                {z.last_push?.at && (
                  <span className="text-[10px] text-gray-400" title={`${z.last_push.count} notifié(s) ${z.last_push.source === 'auto' ? '(auto)' : ''}`}>
                    {z.last_push.source === 'auto' ? '🤖 ' : ''}{timeAgo(z.last_push.at)}
                  </span>
                )}
                <span className="text-sm font-bold text-gray-900 bg-white border border-gray-200 rounded-full px-2.5 py-0.5">{z.count}</span>
              </span>
            </button>
          ))}
          {data.hors_zone > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-500">Hors zone</span>
              <span className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-full px-2.5 py-0.5">{data.hors_zone}</span>
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3">Cliquez une zone pour notifier ses chauffeurs hors-ligne. Alertes actives (2 h), refresh 30 s.</p>
    </div>
  );
};

export default WaitingClientsPanel;
