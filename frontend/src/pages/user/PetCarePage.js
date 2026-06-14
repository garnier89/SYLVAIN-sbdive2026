/**
 * PetCarePage — modern "SB Animaux": reusable pet profiles, service booking
 * (service → pet → provider → date/slot/location/payment), and appointments.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, PawPrint, Scissors, House, Stethoscope, CalendarBlank, Plus, Trash,
  PencilSimple, MapPin, CheckCircle, Clock, CaretRight, Camera, ClockCounterClockwise, Dog,
  Syringe, Pill, FileText, ChartLineUp, Bell,
} from '@phosphor-icons/react';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const SVC_ICONS = { toilettage: Scissors, promenade: PawPrint, pension: House, veterinaire: Stethoscope };
const SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
const PAYMENTS = [{ k: 'sbpay', l: 'SB Pay' }, { k: 'cash', l: 'Espèces' }, { k: 'card', l: 'Carte' }];

const todayISO = () => new Date().toISOString().slice(0, 10);

const PetCarePage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [species, setSpecies] = useState([]);
  const [pets, setPets] = useState([]);
  const [screen, setScreen] = useState('home'); // home | pets | appointments | pet | provider | details | done
  const [service, setService] = useState(null);
  const [pet, setPet] = useState(null);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(null);
  const [booking, setBooking] = useState({ date: '', time_slot: '', location_type: 'onsite', address: '', notes: '', payment: 'sbpay' });
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [appts, setAppts] = useState({ upcoming: [], past: [] });
  const [healthPet, setHealthPet] = useState(null);
  const [reminders, setReminders] = useState([]);

  const loadPets = useCallback(async () => {
    try { const r = await fetch(`${API}/api/pet-care/pets`, { credentials: 'include' }); setPets(await r.json()); } catch { /* */ }
  }, []);
  useEffect(() => {
    fetch(`${API}/api/pet-care/services`, { credentials: 'include' }).then(r => r.json())
      .then(d => { setServices(d.services || []); setSpecies(d.species || []); }).catch(() => {});
    fetch(`${API}/api/pet-care/health/reminders`, { credentials: 'include' }).then(r => r.json())
      .then(d => setReminders(Array.isArray(d) ? d : [])).catch(() => {});
    loadPets();
  }, [loadPets]);

  // Estimate
  useEffect(() => {
    if (screen !== 'details' || !service) return;
    fetch(`${API}/api/pet-care/estimate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ service: service.id, location_type: booking.location_type }),
    }).then(r => r.json()).then(setEstimate).catch(() => {});
  }, [screen, service, booking.location_type]);

  const startBooking = (svc) => { setService(svc); setProvider(null); setPet(null); setScreen('pet'); };

  const pickPet = async (p) => {
    setPet(p);
    try {
      const r = await fetch(`${API}/api/pet-care/providers?category=${encodeURIComponent(service.category)}`, { credentials: 'include' });
      const data = await r.json();
      setProviders(Array.isArray(data) ? data : []);
    } catch { setProviders([]); }
    setScreen('provider');
  };

  const submit = async () => {
    if (!booking.date || !booking.time_slot) { toast.error('Choisissez une date et un créneau'); return; }
    if (booking.location_type === 'home' && !booking.address.trim()) { toast.error('Indiquez votre adresse'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/pet-care/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          service: service.id, pet_id: pet.id, provider_id: provider?.id, provider_name: provider?.name,
          date: booking.date, time_slot: booking.time_slot, location_type: booking.location_type,
          address: booking.address, notes: booking.notes, payment_method: booking.payment,
        }),
      });
      const data = await r.json();
      if (r.ok) { setDone(data); setScreen('done'); }
      else toast.error(data.detail || 'Échec de la réservation');
    } catch { toast.error('Erreur réseau'); }
    finally { setSubmitting(false); }
  };

  const openAppointments = async () => {
    setScreen('appointments');
    try { const r = await fetch(`${API}/api/pet-care/bookings`, { credentials: 'include' }); setAppts(await r.json()); } catch { /* */ }
  };
  const cancelAppt = async (id) => {
    try {
      const r = await fetch(`${API}/api/pet-care/bookings/${id}/cancel`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) { toast.success(d.refunded > 0 ? `Annulé · ${money(d.refunded)} remboursés` : 'Réservation annulée'); openAppointments(); }
      else toast.error(d.detail || 'Échec');
    } catch { toast.error('Erreur réseau'); }
  };

  // ── Pets manager ──
  if (screen === 'pets') {
    return <PetsManager pets={pets} species={species} onBack={() => setScreen('home')} reload={loadPets} money={money}
      onHealth={(p) => { setHealthPet(p); setScreen('health'); }} />;
  }

  // ── Health record (Carnet de santé) ──
  if (screen === 'health' && healthPet) {
    return <HealthRecord pet={healthPet} species={species} onBack={() => setScreen('pets')} />;
  }

  // ── Appointments ──
  if (screen === 'appointments') {
    const Row = ({ b, cancellable }) => {
      const Ic = SVC_ICONS[b.service] || PawPrint;
      return (
        <div className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`appt-${b.id}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0"><Ic size={20} className="text-amber-600" weight="fill" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">{b.service_label} · {b.pet_name}</p>
              <p className="text-xs text-gray-500 truncate">{b.provider_name || 'Prestataire'}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{b.date} · {b.time_slot} · {b.location_type === 'home' ? 'À domicile' : 'Sur place'} {b.status === 'cancelled' ? '· Annulé' : ''}</p>
            </div>
            <span className="font-bold text-gray-900 text-sm">{money(Number(b.total_price))}</span>
          </div>
          {cancellable && (
            <button onClick={() => cancelAppt(b.id)} className="w-full mt-3 text-rose-600 border border-rose-200 py-2 rounded-xl text-xs font-semibold" data-testid={`cancel-appt-${b.id}`}>Annuler</button>
          )}
        </div>
      );
    };
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="pet-appointments">
        <Header title="Mes rendez-vous" onBack={() => setScreen('home')} />
        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">À venir</p>
            {appts.upcoming.length === 0 ? <Empty text="Aucun rendez-vous à venir" /> :
              <div className="space-y-3">{appts.upcoming.map(b => <Row key={b.id} b={b} cancellable />)}</div>}
          </div>
          {appts.past.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2 mt-4">Historique</p>
              <div className="space-y-3">{appts.past.map(b => <Row key={b.id} b={b} />)}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Done ──
  if (screen === 'done' && done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center" data-testid="pet-booking-done">
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-5"><CheckCircle size={48} weight="fill" className="text-green-500" /></div>
        <h1 className="text-xl font-bold text-gray-900">Rendez-vous confirmé !</h1>
        <p className="text-sm text-gray-500 mt-2">{done.service_label} pour <b>{done.pet_name}</b> le {done.date} à {done.time_slot}.</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full mt-5 flex justify-between text-sm">
          <span className="text-gray-500">Total</span><span className="font-bold text-gray-900">{money(Number(done.total_price))}</span>
        </div>
        <button onClick={() => { setDone(null); setScreen('home'); }} className="w-full mt-5 bg-amber-500 text-white py-3.5 rounded-xl font-semibold text-sm" data-testid="pet-done-home">Terminé</button>
        <button onClick={openAppointments} className="w-full mt-2 text-gray-500 py-2 text-sm font-medium" data-testid="pet-done-appts">Voir mes rendez-vous</button>
      </div>
    );
  }

  // ── Booking: choose pet ──
  if (screen === 'pet' && service) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="pet-pick">
        <Header title={`${service.label} · Mon animal`} onBack={() => setScreen('home')} />
        <div className="p-4 space-y-3">
          {pets.length === 0 && <Empty text="Ajoutez d'abord un animal" />}
          {pets.map(p => (
            <button key={p.id} onClick={() => pickPet(p)} className="w-full bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3 text-left hover:border-amber-300" data-testid={`pick-pet-${p.id}`}>
              <PetAvatar pet={p} />
              <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 text-sm">{p.name}</p><p className="text-xs text-gray-500">{p.species}{p.breed ? ` · ${p.breed}` : ''}</p></div>
              <CaretRight size={18} className="text-gray-300" />
            </button>
          ))}
          <button onClick={() => setScreen('pets')} className="w-full border border-dashed border-amber-300 text-amber-600 rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-semibold" data-testid="add-pet-from-booking">
            <Plus size={16} /> Ajouter un animal
          </button>
        </div>
      </div>
    );
  }

  // ── Booking: choose provider ──
  if (screen === 'provider' && service) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="pet-provider">
        <Header title={`${service.label} · Prestataire`} onBack={() => setScreen('pet')} />
        <div className="p-4 space-y-3">
          {providers.length === 0 && <Empty text="Aucun prestataire — vous pouvez continuer sans" />}
          {providers.map(pr => (
            <button key={pr.id} onClick={() => { setProvider(pr); setScreen('details'); }} className="w-full bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3 text-left hover:border-amber-300" data-testid={`pick-provider-${pr.id}`}>
              {pr.image ? <img src={pr.image} alt={pr.name} className="w-12 h-12 rounded-xl object-cover" /> : <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center"><PawPrint size={22} className="text-amber-500" /></div>}
              <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 text-sm truncate">{pr.name}</p><p className="text-xs text-gray-500 truncate">{pr.address}</p><p className="text-[11px] text-amber-600">★ {pr.rating} · {pr.price_range}</p></div>
              <CaretRight size={18} className="text-gray-300" />
            </button>
          ))}
          <button onClick={() => { setProvider(null); setScreen('details'); }} className="w-full text-gray-500 py-2 text-sm font-medium" data-testid="skip-provider">Continuer sans choisir →</button>
        </div>
      </div>
    );
  }

  // ── Booking: details ──
  if (screen === 'details' && service) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-32" data-testid="pet-details">
        <Header title={`${service.label} · Détails`} onBack={() => setScreen('provider')} />
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 flex items-center gap-3" data-testid="pet-summary">
            <PetAvatar pet={pet} />
            <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 text-sm">{pet?.name} · {service.label}</p><p className="text-xs text-gray-500 truncate">{provider?.name || 'Sans prestataire'}</p></div>
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Date</label>
              <input type="date" min={todayISO()} value={booking.date} onChange={e => setBooking({ ...booking, date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-1" data-testid="pet-date" />
            </div>
            <div>
              <label className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Créneau</label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {SLOTS.map(s => (
                  <button key={s} onClick={() => setBooking({ ...booking, time_slot: s })} className={`py-2 rounded-lg text-sm font-semibold border ${booking.time_slot === s ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`} data-testid={`slot-${s}`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Lieu</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button onClick={() => setBooking({ ...booking, location_type: 'onsite' })} className={`py-2.5 rounded-lg text-sm font-semibold border ${booking.location_type === 'onsite' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`} data-testid="loc-onsite">Chez le prestataire</button>
                <button onClick={() => setBooking({ ...booking, location_type: 'home' })} className={`py-2.5 rounded-lg text-sm font-semibold border ${booking.location_type === 'home' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`} data-testid="loc-home">À domicile (+{money(10)})</button>
              </div>
            </div>
            {booking.location_type === 'home' && (
              <input value={booking.address} onChange={e => setBooking({ ...booking, address: e.target.value })} placeholder="Votre adresse" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="pet-address" />
            )}
            <textarea value={booking.notes} onChange={e => setBooking({ ...booking, notes: e.target.value })} placeholder="Précisions (optionnel)" className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none h-16" data-testid="pet-notes" />
          </div>

          <div className="bg-white rounded-2xl p-4">
            <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500 mb-2">Paiement</p>
            <div className="flex gap-2">
              {PAYMENTS.map(pm => (
                <button key={pm.k} onClick={() => setBooking({ ...booking, payment: pm.k })} className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold ${booking.payment === pm.k ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`} data-testid={`pet-payment-${pm.k}`}>{pm.l}</button>
              ))}
            </div>
          </div>

          {estimate && (
            <div className="bg-[#0B1426] text-white rounded-2xl p-4 flex items-center justify-between" data-testid="pet-estimate">
              <div className="text-xs text-white/70 space-y-0.5">
                <p>{service.label} : {money(estimate.base_price)}</p>
                {estimate.home_fee > 0 && <p>À domicile : {money(estimate.home_fee)}</p>}
              </div>
              <p className="text-3xl font-black" data-testid="pet-estimate-total">{money(estimate.total)}</p>
            </div>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={submit} disabled={submitting} className="w-full py-4 rounded-xl font-bold text-white bg-amber-500 disabled:opacity-60" data-testid="pet-confirm-btn">
            {submitting ? 'Réservation…' : `Confirmer · ${estimate ? Number(estimate.total).toFixed(2) : '—'}€`}
          </button>
        </div>
      </div>
    );
  }

  // ── Home (default) ──
  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="pet-care-page">
      <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">Services Animaux</h1>
          <button onClick={openAppointments} className="text-white flex items-center gap-1.5 text-xs font-medium bg-white/15 px-3 py-1.5 rounded-full" data-testid="open-appointments-btn">
            <ClockCounterClockwise size={16} /> Mes RDV
          </button>
        </div>
        <p className="text-sm text-white/85">Toilettage, garde, vétérinaire — pour vos compagnons</p>
      </div>

      <div className="p-4 space-y-4">
        {reminders.length > 0 && (
          <button onClick={() => setScreen('pets')} className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-center gap-3 text-left" data-testid="health-reminders-banner">
            <div className="w-9 h-9 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0"><Syringe size={18} className="text-white" weight="fill" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-rose-700 text-sm">{reminders.length} rappel{reminders.length > 1 ? 's' : ''} santé à venir</p>
              <p className="text-xs text-rose-500 truncate">{reminders[0].name} · {reminders[0].pet_name} · {reminders[0].next_due}</p>
            </div>
            <CaretRight size={18} className="text-rose-300" />
          </button>
        )}

        {/* My pets quick access */}
        <button onClick={() => setScreen('pets')} className="w-full bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3" data-testid="my-pets-btn">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><Dog size={22} className="text-amber-600" weight="fill" /></div>
          <div className="flex-1 text-left"><p className="font-bold text-gray-900 text-sm">Mes animaux</p><p className="text-xs text-gray-500">{pets.length} enregistré{pets.length > 1 ? 's' : ''}</p></div>
          <CaretRight size={18} className="text-gray-300" />
        </button>

        <div>
          <p className="text-sm font-bold text-gray-700 mb-3">Réserver un service</p>
          <div className="grid grid-cols-2 gap-3" data-testid="service-grid">
            {services.map(s => {
              const Ic = SVC_ICONS[s.id] || PawPrint;
              return (
                <button key={s.id} onClick={() => startBooking(s)} className="bg-white rounded-2xl p-4 border border-gray-100 text-left hover:border-amber-300 hover:shadow-md transition-all" data-testid={`service-${s.id}`}>
                  <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center mb-3"><Ic size={24} className="text-amber-600" weight="fill" /></div>
                  <p className="font-bold text-gray-900 text-sm">{s.label}</p>
                  <p className="text-xs text-gray-500 mt-1">dès {Number(s.base_price).toFixed(0)}€</p>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={() => navigate('/pet-care-partners')} className="w-full text-center text-sm font-semibold text-gray-500 py-3" data-testid="pet-directory-link">
          Voir l'annuaire des prestataires →
        </button>
      </div>
    </div>
  );
};

/* ---------- small shared pieces ---------- */
const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="pet-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">{text}</div>
);
const PetAvatar = ({ pet }) => (
  pet?.photo
    ? <img src={pet.photo.startsWith('http') ? pet.photo : `${API}${pet.photo}`} alt={pet?.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
    : <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0"><PawPrint size={22} className="text-amber-500" weight="fill" /></div>
);

/* ---------- Health record (Carnet de santé) ---------- */
const HEALTH_SECTIONS = [
  { kind: 'vaccine', key: 'vaccines', label: 'Vaccins', icon: Syringe, color: 'rose', hasDue: true },
  { kind: 'treatment', key: 'treatments', label: 'Traitements / Vermifuges', icon: Pill, color: 'violet', hasDue: true },
  { kind: 'document', key: 'documents', label: 'Ordonnances / Documents', icon: FileText, color: 'blue', hasDoc: true },
  { kind: 'weight', key: 'weights', label: 'Suivi du poids', icon: ChartLineUp, color: 'emerald', isWeight: true },
];

const HealthRecord = ({ pet, onBack }) => {
  const [data, setData] = useState({ vaccines: [], treatments: [], documents: [], weights: [], reminders: [] });
  const [adding, setAdding] = useState(null); // section.kind
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch(`${API}/api/pet-care/pets/${pet.id}/health`, { credentials: 'include' }); setData(await r.json()); } catch { /* */ }
  }, [pet.id]);
  useEffect(() => { load(); }, [load]);

  const openAdd = (kind) => { setForm({ kind, date: todayISO() }); setAdding(kind); };

  const uploadDoc = async (files) => {
    const file = files?.[0]; if (!file) return;
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await fetch(`${API}/api/uploads/image`, { method: 'POST', credentials: 'include', body: fd });
      const ud = await up.json();
      if (up.ok) setForm(f => ({ ...f, url: ud.url, name: f.name || file.name })); else toast.error('Échec upload');
    } catch { toast.error('Erreur upload'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/pet-care/pets/${pet.id}/health`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form),
      });
      const d = await r.json();
      if (r.ok) { toast.success('Ajouté'); setAdding(null); load(); } else toast.error(d.detail || 'Échec');
    } catch { toast.error('Erreur réseau'); } finally { setSaving(false); }
  };

  const del = async (id) => {
    try { await fetch(`${API}/api/pet-care/health/${id}`, { method: 'DELETE', credentials: 'include' }); load(); } catch { /* */ }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="pet-health">
      <Header title={`Carnet de santé · ${pet.name}`} onBack={onBack} />
      <div className="p-4 space-y-4">
        {data.reminders?.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-center gap-2" data-testid="health-due-banner">
            <Bell size={18} className="text-rose-500" weight="fill" />
            <p className="text-xs text-rose-700"><b>{data.reminders.length}</b> rappel(s) à venir — prochain : {data.reminders[0].name} le {data.reminders[0].next_due}</p>
          </div>
        )}

        {HEALTH_SECTIONS.map((sec) => {
          const items = data[sec.key] || [];
          const Ic = sec.icon;
          return (
            <div key={sec.kind} className="bg-white rounded-2xl p-4" data-testid={`health-section-${sec.kind}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-900 text-sm flex items-center gap-2"><Ic size={18} className={`text-${sec.color}-500`} weight="fill" /> {sec.label}</p>
                <button onClick={() => openAdd(sec.kind)} className={`text-xs font-semibold text-${sec.color}-600 flex items-center gap-1`} data-testid={`add-${sec.kind}`}><Plus size={14} /> Ajouter</button>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">Aucune entrée</p>
              ) : (
                <div className="space-y-1.5">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0" data-testid={`health-item-${it.id}`}>
                      <div className="flex-1 min-w-0">
                        {sec.isWeight ? (
                          <p className="text-sm text-gray-800"><b>{it.weight} kg</b> <span className="text-xs text-gray-400">· {it.date}</span></p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {sec.hasDoc && it.url ? <a href={`${API}${it.url}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{it.name}</a> : it.name}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {it.date}{it.next_due ? ` · prochain rappel : ${it.next_due}` : ''}
                            </p>
                          </>
                        )}
                      </div>
                      <button onClick={() => del(it.id)} className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center" data-testid={`del-health-${it.id}`}><Trash size={14} className="text-gray-400" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add entry sheet */}
      {adding && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setAdding(null)} data-testid="health-add-sheet">
          <div className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-gray-900">{HEALTH_SECTIONS.find(s => s.kind === adding)?.label}</p>
            {adding === 'weight' ? (
              <input type="number" value={form.weight || ''} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="Poids (kg)" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="health-weight-input" />
            ) : (
              <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={adding === 'document' ? 'Titre du document' : 'Nom (ex: Rage, Vermifuge…)'} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="health-name-input" />
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400">Date</label>
                <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="health-date-input" />
              </div>
              {['vaccine', 'treatment'].includes(adding) && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-400">Prochain rappel</label>
                  <input type="date" value={form.next_due || ''} onChange={(e) => setForm({ ...form, next_due: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="health-due-input" />
                </div>
              )}
            </div>
            {adding === 'document' && (
              <label className="flex items-center justify-center gap-2 border border-dashed border-blue-300 text-blue-600 rounded-lg py-3 text-sm font-semibold cursor-pointer" data-testid="health-doc-upload">
                <FileText size={16} /> {form.url ? 'Document ajouté ✓' : 'Téléverser le document'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadDoc(e.target.files)} />
              </label>
            )}
            <button onClick={save} disabled={saving} className="w-full bg-amber-500 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-60" data-testid="health-save-btn">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Pets manager (CRUD) ---------- */
const PetsManager = ({ pets, species, onBack, reload, onHealth }) => {
  const [editing, setEditing] = useState(null); // null | {} (new) | pet
  const blank = { name: '', species: species[0] || 'Chien', breed: '', age: '', weight: '', photo: '', notes: '' };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const openNew = () => { setForm(blank); setEditing('new'); };
  const openEdit = (p) => { setForm({ ...p }); setEditing(p.id); };

  const uploadPhoto = async (files) => {
    const file = files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await fetch(`${API}/api/uploads/image`, { method: 'POST', credentials: 'include', body: fd });
      const ud = await up.json();
      if (up.ok) setForm(f => ({ ...f, photo: ud.url })); else toast.error('Échec photo');
    } catch { toast.error('Erreur upload'); } finally { setUploading(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const r = await fetch(`${API}/api/pet-care/pets${isNew ? '' : `/${editing}`}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      });
      if (r.ok) { toast.success(isNew ? 'Animal ajouté' : 'Modifié'); setEditing(null); reload(); }
      else toast.error('Échec');
    } catch { toast.error('Erreur réseau'); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cet animal ?')) return;
    try { await fetch(`${API}/api/pet-care/pets/${id}`, { method: 'DELETE', credentials: 'include' }); reload(); } catch { /* */ }
  };

  if (editing) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="pet-edit">
        <Header title={editing === 'new' ? 'Nouvel animal' : 'Modifier'} onBack={() => setEditing(null)} />
        <div className="p-4 space-y-3">
          <div className="flex justify-center">
            <label className="relative cursor-pointer" data-testid="pet-photo-upload">
              {form.photo ? <img src={form.photo.startsWith('http') ? form.photo : `${API}${form.photo}`} alt="" className="w-24 h-24 rounded-2xl object-cover" />
                : <div className="w-24 h-24 rounded-2xl bg-amber-50 flex items-center justify-center"><Camera size={28} className="text-amber-400" /></div>}
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center"><Camera size={14} className="text-white" weight="fill" /></span>
              <input type="file" accept="image/*" className="hidden" onChange={e => uploadPhoto(e.target.files)} />
            </label>
          </div>
          {uploading && <p className="text-center text-xs text-amber-500">Envoi de la photo…</p>}
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nom" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="pet-form-name" />
          <select value={form.species} onChange={e => setForm({ ...form, species: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="pet-form-species">
            {species.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.breed} onChange={e => setForm({ ...form, breed: e.target.value })} placeholder="Race" className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="pet-form-breed" />
            <input value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} placeholder="Âge" className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="pet-form-age" />
          </div>
          <input value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="Poids (ex: 12 kg)" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" data-testid="pet-form-weight" />
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes santé / comportement (optionnel)" className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none h-20" data-testid="pet-form-notes" />
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-200 p-4">
          <button onClick={save} disabled={saving} className="w-full py-3.5 rounded-xl font-bold text-white bg-amber-500 disabled:opacity-60" data-testid="pet-save-btn">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="pets-manager">
      <Header title="Mes animaux" onBack={onBack} />
      <div className="p-4 space-y-3">
        {pets.length === 0 && <Empty text="Aucun animal enregistré" />}
        {pets.map(p => (
          <div key={p.id} className="bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3" data-testid={`pet-card-${p.id}`}>
            <PetAvatar pet={p} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">{p.name}</p>
              <p className="text-xs text-gray-500">{p.species}{p.breed ? ` · ${p.breed}` : ''}{p.age ? ` · ${p.age}` : ''}</p>
            </div>
            <button onClick={() => onHealth(p)} className="px-2.5 h-8 rounded-lg bg-rose-50 flex items-center gap-1 text-rose-600 text-xs font-semibold" data-testid={`health-pet-${p.id}`}><Syringe size={14} weight="fill" /> Carnet</button>
            <button onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center" data-testid={`edit-pet-${p.id}`}><PencilSimple size={16} className="text-gray-500" /></button>
            <button onClick={() => remove(p.id)} className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center" data-testid={`delete-pet-${p.id}`}><Trash size={16} className="text-rose-500" /></button>
          </div>
        ))}
        <button onClick={openNew} className="w-full border border-dashed border-amber-300 text-amber-600 rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-semibold" data-testid="add-pet-btn">
          <Plus size={16} /> Ajouter un animal
        </button>
      </div>
    </div>
  );
};

export default PetCarePage;