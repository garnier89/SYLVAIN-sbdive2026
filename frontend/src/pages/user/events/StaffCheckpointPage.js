import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, QrCode, CalendarBlank, MapPin, Ticket } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { organizerAPI } from '../../../services/api';
import { fmtEventDate } from './eventsShared';

/** Controller hub: redeem a code, then open the scanner for authorized events. */
const StaffCheckpointPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    organizerAPI.myStaffEvents().then((r) => setEvents(r.data.events || [])).catch(() => setEvents([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const join = async () => {
    if (!code.trim()) { toast.error('Entrez le code reçu'); return; }
    setJoining(true);
    try {
      const r = await organizerAPI.joinStaff(code.trim().toUpperCase());
      toast.success(`Accès activé • ${r.data.organizer_name || ''}`);
      setCode(''); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Code invalide'); }
    finally { setJoining(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="checkpoint-page">
      <div className="bg-gradient-to-br from-[#7C2D12] via-[#B91C1C] to-[#FF4500] px-4 pt-5 pb-6 rounded-b-3xl">
        <button onClick={() => navigate('/events')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center mb-3" data-testid="back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-xl font-extrabold text-white flex items-center gap-2"><ShieldCheck size={22} weight="fill" /> Contrôle d'accès</h1>
        <p className="text-[11px] text-white/80 mt-1">Scannez les billets des événements qui vous ont invité</p>
      </div>

      {/* Redeem code */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Entrez le code d'invitation</label>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="Ex. 5NX9TB" maxLength={8}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono tracking-wider outline-none focus:border-[#B91C1C]" data-testid="join-code-input" />
            <button onClick={join} disabled={joining} className="bg-[#B91C1C] text-white font-bold px-4 rounded-lg text-sm disabled:opacity-60" data-testid="join-btn">
              {joining ? '...' : 'Rejoindre'}
            </button>
          </div>
        </div>
      </div>

      {/* Authorized events */}
      <div className="px-4 mt-5">
        <h2 className="font-bold text-gray-900 mb-3">Événements à scanner</h2>
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-7 h-7 border-2 border-orange-200 border-t-[#B91C1C] rounded-full animate-spin" /></div>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500" data-testid="no-staff-events">
            <Ticket size={36} className="mx-auto mb-2 text-gray-300" weight="duotone" />
            <p className="text-sm">Aucun événement. Entrez un code d'invitation pour commencer.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3" data-testid={`staff-event-${e.id}`}>
                <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">{e.image && <img src={e.image} alt={e.title} className="w-full h-full object-cover" />}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900 line-clamp-1">{e.title}</p>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1"><CalendarBlank size={12} /> {fmtEventDate(e.starts_at)}</p>
                  {(e.venue_name || e.city) && <p className="text-[11px] text-gray-500 flex items-center gap-1 line-clamp-1"><MapPin size={12} /> {[e.venue_name, e.city].filter(Boolean).join(', ')}</p>}
                  <p className="text-[10px] text-gray-400 mt-0.5">par {e.organizer_name}</p>
                </div>
                <button onClick={() => navigate(`/organizer/events/${e.id}/checkin`)} className="bg-[#FF4500] text-white font-bold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5 shrink-0" data-testid={`scan-${e.id}`}>
                  <QrCode size={15} weight="fill" /> Scanner
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffCheckpointPage;
