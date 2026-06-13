import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Megaphone, Users, PencilSimple, Trash, Ticket, Star, QrCode, ShieldCheck, ChartLineUp,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { organizerAPI } from '../../../services/api';
import { catMeta, fmtEventDate, fmtMoney } from './eventsShared';
import EventFormModal from './EventFormModal';
import OrganizerStaffModal from './OrganizerStaffModal';
import OrganizerAttendeesModal from './OrganizerAttendeesModal';
import OrganizerBoostModal from './OrganizerBoostModal';

const OrganizerDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ commission_percent: 10, boost_price_per_day: 9.99 });
  const [formEvent, setFormEvent] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [attendees, setAttendees] = useState(null);
  const [boostFor, setBoostFor] = useState(null);
  const [showStaff, setShowStaff] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    organizerAPI.dashboard()
      .then((r) => setData(r.data))
      .catch((e) => { if (e?.response?.status === 403) navigate('/organizer', { replace: true }); })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => { load(); organizerAPI.settings().then((r) => setSettings(r.data)).catch(() => {}); }, [load]);

  const saveEvent = async (payload) => {
    try {
      if (formEvent && formEvent.id) await organizerAPI.updateEvent(formEvent.id, payload);
      else await organizerAPI.createEvent(payload);
      toast.success('Événement enregistré');
      setFormEvent(undefined); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (ev) => {
    if (!window.confirm(`Supprimer « ${ev.title} » ?`)) return;
    try { await organizerAPI.deleteEvent(ev.id); toast.success('Supprimé'); load(); } catch { toast.error('Erreur'); }
  };

  const openAttendees = async (ev) => {
    try { const r = await organizerAPI.attendees(ev.id); setAttendees({ title: ev.title, ...r.data }); } catch { toast.error('Erreur'); }
  };

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-50"><div className="w-8 h-8 border-2 border-red-200 border-t-[#B91C1C] rounded-full animate-spin" /></div>;
  if (!data) return null;
  const t = data.totals;

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="organizer-dashboard-page">
      <div className="bg-gradient-to-br from-[#7C2D12] via-[#B91C1C] to-[#FF4500] px-4 pt-4 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/events')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} className="text-white" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-white truncate">{data.profile.name}</h1>
            <p className="text-[11px] text-white/80">Espace organisateur • SB Événement Pro</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Événements" value={t.events} />
          <Stat label="Places vendues" value={t.seats} />
          <Stat label="Recette nette" value={fmtMoney(t.net)} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Stat label="Recette brute" value={fmtMoney(t.gross)} small />
          <Stat label={`Commission (${settings.commission_percent}%)`} value={`- ${fmtMoney(t.commission)}`} small />
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">Mes événements</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowStaff(true)} className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded-full" data-testid="manage-staff-btn"><ShieldCheck size={14} weight="fill" className="text-[#B91C1C]" /> Contrôleurs</button>
            <button onClick={() => setFormEvent(null)} className="flex items-center gap-1.5 bg-[#B91C1C] text-white text-xs font-bold px-3 py-2 rounded-full" data-testid="create-event-btn"><Plus size={14} weight="bold" /> Créer</button>
          </div>
        </div>

        {data.events.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500" data-testid="no-events">
            <Ticket size={36} className="mx-auto mb-2 text-gray-300" weight="duotone" />
            <p className="text-sm">Aucun événement. Créez le premier !</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.events.map((ev) => {
              const m = catMeta(ev.category);
              return (
                <div key={ev.id} className="bg-white rounded-2xl p-3 shadow-sm" data-testid={`org-event-${ev.id}`}>
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0">{ev.image && <img src={ev.image} alt={ev.title} className="w-full h-full object-cover" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}>{m.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ev.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{ev.status === 'active' ? 'Publié' : 'Brouillon'}</span>
                        {ev.boost_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5"><Star size={9} weight="fill" /> Sponsorisé</span>}
                      </div>
                      <p className="font-bold text-sm text-gray-900 mt-1 line-clamp-1">{ev.title}</p>
                      <p className="text-[11px] text-gray-500">{fmtEventDate(ev.starts_at)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-2 text-center bg-gray-50 rounded-xl py-2">
                    <MiniStat label="Cmd" value={ev.stats.orders} />
                    <MiniStat label="Places" value={ev.stats.seats} />
                    <MiniStat label="Entrés" value={ev.stats.checked_in_seats || 0} />
                    <MiniStat label="Net" value={fmtMoney(ev.stats.net)} />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Act onClick={() => navigate(`/organizer/events/${ev.id}/live`)} Icon={ChartLineUp} label="Jour J" testid={`live-${ev.id}`} primary />
                    <Act onClick={() => navigate(`/organizer/events/${ev.id}/checkin`)} Icon={QrCode} label="Scanner" testid={`scan-${ev.id}`} />
                    <Act onClick={() => setBoostFor(ev)} Icon={Megaphone} label="" testid={`boost-${ev.id}`} />
                    <Act onClick={() => openAttendees(ev)} Icon={Users} label="" testid={`attendees-${ev.id}`} />
                    <Act onClick={() => setFormEvent(ev)} Icon={PencilSimple} label="" testid={`edit-${ev.id}`} />
                    <Act onClick={() => remove(ev)} Icon={Trash} label="" testid={`del-${ev.id}`} danger />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {formEvent !== undefined && (
        <EventFormModal initial={formEvent} onClose={() => setFormEvent(undefined)} onSave={saveEvent} />
      )}

      {attendees && <OrganizerAttendeesModal data={attendees} onClose={() => setAttendees(null)} />}

      {boostFor && (
        <OrganizerBoostModal event={boostFor} pricePerDay={settings.boost_price_per_day}
          onClose={() => setBoostFor(null)}
          onDone={() => { setBoostFor(null); load(); }} />
      )}

      {showStaff && <OrganizerStaffModal events={data.events} onClose={() => setShowStaff(false)} />}
    </div>
  );
};

const Stat = ({ label, value, small }) => (
  <div className={`bg-white/15 rounded-xl ${small ? 'py-2' : 'py-3'} text-center`}>
    <p className={`${small ? 'text-sm' : 'text-lg'} font-extrabold text-white`}>{value}</p>
    <p className="text-[10px] text-white/70">{label}</p>
  </div>
);
const MiniStat = ({ label, value }) => (<div><p className="text-sm font-extrabold text-gray-900">{value}</p><p className="text-[9px] text-gray-400">{label}</p></div>);
const Act = ({ onClick, Icon, label, testid, primary, danger }) => (
  <button onClick={onClick} data-testid={testid}
    className={`flex items-center justify-center gap-1 ${label ? 'flex-1' : 'w-10'} py-2 rounded-xl text-xs font-bold ${primary ? 'bg-[#FF4500] text-white' : danger ? 'border border-red-200 text-red-500' : 'border border-gray-200 text-gray-600'}`}>
    <Icon size={15} weight={primary ? 'fill' : 'regular'} />{label}
  </button>
);

export default OrganizerDashboard;
