import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Ticket, CalendarBlank, MapPin, Star } from '@phosphor-icons/react';
import { eventsAPI } from '../../../services/api';
import { EVENT_CATEGORIES, catMeta, fmtEventDate, fmtPrice, minPrice } from './eventsShared';

const EventsPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await eventsAPI.list({ ...(cat ? { category: cat } : {}), ...(search ? { q: search } : {}) });
      setEvents(r.data.items || []);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, [cat, search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const featured = events.filter((e) => e.is_featured);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="events-page">
      <div className="bg-gradient-to-br from-[#7C2D12] via-[#B91C1C] to-[#FF4500] px-4 pt-5 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-white leading-none">SB Événement</h1>
            <p className="text-[11px] text-white/80 mt-1">Billets + transport, en un seul endroit</p>
          </div>
          <button onClick={() => navigate('/my-tickets')} className="flex items-center gap-1.5 bg-white text-[#B91C1C] font-bold text-xs px-3 py-2 rounded-full" data-testid="my-tickets-btn">
            <Ticket size={15} weight="fill" /> Mes billets
          </button>
        </div>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un événement, une ville..."
            className="w-full bg-white border-0 rounded-full pl-10 pr-3 h-11 text-sm outline-none"
            data-testid="events-search"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 pt-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button onClick={() => setCat('')} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${!cat ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="cat-all">Tout</button>
        {EVENT_CATEGORIES.map((c) => (
          <button key={c.slug} onClick={() => setCat(c.slug)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${cat === c.slug ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid={`cat-${c.slug}`}>
            <c.Icon size={14} weight="fill" /> {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#B91C1C] rounded-full animate-spin" /></div>
      ) : events.length === 0 ? (
        <div className="px-4 mt-10 text-center text-gray-500" data-testid="events-empty">
          <CalendarBlank size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm">Aucun événement pour cette recherche</p>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-5">
          {!cat && !search && featured.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-2">À la une</h2>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                {featured.map((e) => (
                  <button key={e.id} onClick={() => navigate(`/events/${e.id}`)} className="shrink-0 w-64 text-left bg-white rounded-2xl overflow-hidden shadow-sm" data-testid={`featured-${e.id}`}>
                    <div className="h-32 bg-gray-100 relative">
                      {e.image && <img src={e.image} alt={e.title} className="w-full h-full object-cover" />}
                      <span className="absolute top-2 left-2 bg-[#B91C1C] text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Star size={10} weight="fill" /> À la une</span>
                    </div>
                    <div className="p-3">
                      <p className="font-bold text-sm text-gray-900 line-clamp-1">{e.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1"><CalendarBlank size={12} /> {fmtEventDate(e.starts_at)}</p>
                      <p className="text-[13px] font-extrabold text-[#B91C1C] mt-1.5">dès {fmtPrice(minPrice(e.tiers))}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {events.map((e) => {
              const m = catMeta(e.category);
              return (
                <button key={e.id} onClick={() => navigate(`/events/${e.id}`)} className="w-full text-left bg-white rounded-2xl overflow-hidden shadow-sm flex" data-testid={`event-${e.id}`}>
                  <div className="w-28 shrink-0 bg-gray-100">
                    {e.image && <img src={e.image} alt={e.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-3 flex-1 min-w-0">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}><m.Icon size={11} weight="fill" /> {m.label}</span>
                    <p className="font-bold text-sm text-gray-900 mt-1 line-clamp-1">{e.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1"><CalendarBlank size={12} /> {fmtEventDate(e.starts_at)}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1 line-clamp-1"><MapPin size={12} /> {e.venue_name}, {e.city}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[13px] font-extrabold text-[#B91C1C]">dès {fmtPrice(minPrice(e.tiers))}</p>
                      {e.sold_out && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Complet</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsPage;
