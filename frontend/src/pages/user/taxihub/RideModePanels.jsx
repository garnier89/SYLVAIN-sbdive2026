/**
 * RideModePanels — panneaux compacts spécifiques au mode, pour RideChoosePage.
 * Extraits de RideChoosePage.js (refacto sans changement de comportement).
 * Composants 100% pilotés par props (`p` = modePanelProps construit dans la page).
 *
 * - ModePanel : composite = ModeSpecificPanel + SchedulePanel (frères).
 * - SchedulePanel : carte « Programmer plus tard » / « Date & heure ».
 * - ModeSpecificPanel : panneau dédié selon le mode (aéroport, mise à dispo,
 *   chauffeur dédié, animaux, assistance, entreprise, pour un proche, intercité,
 *   pool, enchère).
 */
import React from 'react';
import {
  CalendarPlus, AirplaneTilt, Clock, Briefcase, Van, Minus, Plus, Info,
  PawPrint, HandHeart, UserPlus, MapTrifold, ShieldCheck, UsersThree, Gavel,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../../components/GooglePlacesInput';
import { RENTAL_PACKAGES } from './taxiHubConstants';
import { useLocale } from '../../../contexts/LocaleContext';
import { useAssistTypes } from '../../../hooks/useAssistTypes';

export const formatScheduled = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

// ── Mode-specific compact panels ────────────────────────────────────────
// Renders the mode-specific panel AND (independently) an optional schedule
// card — the two are siblings so neither shadows the other.
const ModePanel = (p) => (
  <>
    <ModeSpecificPanel {...p} />
    <SchedulePanel {...p} />
  </>
);

export const SchedulePanel = (p) => {
  const { mode } = p;
  const isDatetimeMode = mode.panel === 'datetime';
  const canScheduleToggle = !p.isRental && !p.isBuddy && !p.isBidding && p.schedulingAllowed;
  if (!isDatetimeMode && !canScheduleToggle) return null;
  const showPicker = isDatetimeMode || p.scheduleLater;
  return (
    <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3" data-testid="panel-schedule">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-[#0B1426]"><CalendarPlus size={18} className="text-[#FF5000]" /> {isDatetimeMode ? 'Date & heure' : 'Programmer plus tard'}</span>
        {!isDatetimeMode && (
          <button onClick={() => { const nv = !p.scheduleLater; p.setScheduleLater(nv); if (nv) p.setCalendarOpen(true); }} className={`w-11 h-6 rounded-full relative transition-colors ${p.scheduleLater ? 'bg-[#FF5000]' : 'bg-gray-300'}`} data-testid="panel-schedule-toggle">
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.scheduleLater ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        )}
      </div>
      {showPicker && (
        <button onClick={() => p.setCalendarOpen(true)} className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-left flex items-center justify-between hover:border-[#0B1426]" data-testid="panel-schedule-trigger">
          <span className={p.scheduledAt ? 'text-[#0B1426] font-semibold' : 'text-gray-400'}>{formatScheduled(p.scheduledAt) || 'Choisir une date'}</span>
          <CalendarPlus size={16} className="text-[#FF5000]" />
        </button>
      )}
    </div>
  );
};

export const ModeSpecificPanel = (p) => {
  const { money } = useLocale();
  const assistOptions = useAssistTypes();
  const { mode } = p;
  const card = 'mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3';

  if (mode.id === 'airport') {
    const sel = (p.airports || []).find((a) => a.id === p.airportId);
    const freeWait = sel?.free_wait_minutes || 45;
    return (
      <div className={card} data-testid="panel-flight">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1.5"><AirplaneTilt size={18} className="text-[#0EA5E9]" /> Transfert aéroport</label>
        {(p.airports || []).length > 0 && (
          <select value={p.airportId} onChange={(e) => p.setAirportId(e.target.value)} data-testid="panel-airport-select"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2">
            {p.airports.map((a) => <option key={a.id} value={a.id}>{a.name}{a.code ? ` (${a.code})` : ''}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input value={p.flightNumber} onChange={(e) => p.setFlightNumber(e.target.value)} placeholder="N° de vol (ex: AF1234)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-flight-input" />
          <input value={p.airportTerminal} onChange={(e) => p.setAirportTerminal(e.target.value)} placeholder="Terminal (ex: T1)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-flight-terminal" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Clock size={16} className="text-[#0EA5E9] shrink-0" />
          <input type="time" value={p.flightArrivalTime} onChange={(e) => p.setFlightArrivalTime(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-flight-arrival" />
        </div>
        {/* Luggage assistance */}
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-gray-700"><Briefcase size={16} className="text-[#0EA5E9]" /> Aide bagages {sel?.luggage_fee ? `(+${money(Number(sel.luggage_fee || 5))})` : ''}</span>
          <button onClick={() => p.setLuggageAssist(!p.luggageAssist)} data-testid="panel-luggage-toggle"
            className={`w-11 h-6 rounded-full relative transition-colors ${p.luggageAssist ? 'bg-[#FF5000]' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.luggageAssist ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        {p.luggageAssist && (
          <div className="mt-2 flex items-center justify-between" data-testid="panel-luggage-count-row">
            <span className="text-sm text-gray-600">Nombre de bagages</span>
            <div className="flex items-center gap-3">
              <button onClick={() => p.setLuggageCount(Math.max(1, p.luggageCount - 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-luggage-minus"><Minus size={14} /></button>
              <span className="font-black text-lg w-6 text-center" data-testid="panel-luggage-count">{p.luggageCount}</span>
              <button onClick={() => p.setLuggageCount(p.luggageCount + 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-luggage-plus"><Plus size={14} /></button>
            </div>
          </div>
        )}
        {/* Shared shuttle */}
        <div className="mt-2 flex items-center justify-between">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm text-gray-700"><Van size={16} className="text-[#10B981]" /> Navette partagée</span>
            <span className="text-[11px] text-gray-400 block ml-6">Jusqu'à -{Number(sel?.shuttle_discount_pct || 30)}% en partageant le trajet</span>
          </span>
          <button onClick={() => p.setSharedShuttle(!p.sharedShuttle)} data-testid="panel-shuttle-toggle"
            className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${p.sharedShuttle ? 'bg-[#FF5000]' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.sharedShuttle ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-sky-50 border border-sky-100 p-2.5" data-testid="panel-airport-freewait">
          <Clock size={15} weight="duotone" className="text-[#0EA5E9] mt-0.5 shrink-0" />
          <p className="text-[11px] text-sky-800 leading-snug"><b>{freeWait} min d'attente offertes</b> après l'atterrissage. Suivi de vol automatique : l'heure de prise en charge s'ajuste en cas de retard.</p>
        </div>
      </div>
    );
  }
  if (p.isRental) {
    const veh = p.vehPackages || [];
    const usingVeh = veh.length > 0;
    const selVeh = veh.find((x) => x.id === p.rentalPkg);
    const pkg = selVeh || RENTAL_PACKAGES.find((pk) => pk.slug === p.rentalPkg);
    const adminPkg = p.taxiOpts?.rental_packages?.packages?.find((x) => x.slug === p.rentalPkg);
    const hr = selVeh?.extra_hour_rate ?? adminPkg?.extra_hour_rate ?? 18;
    const km = selVeh?.extra_km_rate ?? adminPkg?.extra_km_rate ?? 0.8;
    const stops = p.rentalStops || [];
    const addStop = () => p.setRentalStops([...stops, { address: '', lat: null, lng: null }]);
    const setStop = (i, val) => p.setRentalStops(stops.map((s, idx) => (idx === i ? val : s)));
    const removeStop = (i) => p.setRentalStops(stops.filter((_, idx) => idx !== i));
    return (
      <div className={card} data-testid="panel-rental">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><Clock size={18} className="text-[#F59E0B]" /> Forfait{usingVeh ? ` · ${p.mode.label}` : ''}</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {usingVeh
            ? veh.map((pk) => (
              <button key={pk.id} onClick={() => p.setRentalPkg(pk.id)} data-testid={`panel-rental-${pk.id}`}
                className={`rounded-xl border-2 py-2.5 text-center transition-colors ${p.rentalPkg === pk.id ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-200'}`}>
                <p className="font-black text-[#0B1426]">{pk.label || `${pk.hours}h`}</p>
                <p className="text-[10px] text-gray-400">{pk.km} km · {money(pk.price)}</p>
              </button>
            ))
            : RENTAL_PACKAGES.map((pk) => (
              <button key={pk.slug} onClick={() => p.setRentalPkg(pk.slug)} data-testid={`panel-rental-${pk.slug}`}
                className={`rounded-xl border-2 py-2.5 text-center transition-colors ${p.rentalPkg === pk.slug ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-200'}`}>
                <p className="font-black text-[#0B1426]">{pk.label}</p><p className="text-[10px] text-gray-400">{pk.km} km</p>
              </button>
            ))}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 p-2" data-testid="rental-overage-info">
          <Info size={14} className="text-amber-600 shrink-0" />
          <p className="text-[11px] text-amber-800 leading-snug">Inclus : <b>{pkg?.hours}h / {pkg?.km} km</b>. Au-delà : <b>{money(hr)}/h</b> et <b>{money(km)}/km</b> (facturation au compteur).</p>
        </div>
        {p.mode.vehicle === 'moto' && (
          <button onClick={p.goSelfDrive} data-testid="moto-selfdrive-link"
            className="mt-2 w-full flex items-center justify-between rounded-xl border-2 border-dashed border-[#FF5000] bg-[#FFF3EC] px-3 py-2.5 text-left">
            <span><span className="block text-sm font-bold text-[#0B1426]">Plutôt sans chauffeur ?</span><span className="block text-[11px] text-gray-500">Louez la moto et conduisez vous-même</span></span>
            <span className="text-xs font-bold text-[#FF5000]">Self-drive →</span>
          </button>
        )}
        {p.mode.vehicle !== 'moto' && (
          <button onClick={p.goSelfDriveCar} data-testid="car-selfdrive-link"
            className="mt-2 w-full flex items-center justify-between rounded-xl border-2 border-dashed border-[#FF5000] bg-[#FFF3EC] px-3 py-2.5 text-left">
            <span><span className="block text-sm font-bold text-[#0B1426]">Plutôt sans chauffeur ?</span><span className="block text-[11px] text-gray-500">Louez la voiture et conduisez vous-même</span></span>
            <span className="text-xs font-bold text-[#FF5000]">Self-drive →</span>
          </button>
        )}
        {/* Multi-stop (optional, can also be added live during the ride) */}
        <div className="mt-3">
          <p className="text-xs font-bold text-[#0B1426] mb-1.5">Arrêts prévus (optionnel)</p>
          {stops.map((s, i) => (
            <div key={i} className="flex items-center gap-2 mb-2" data-testid={`rental-stop-row-${i}`}>
              <div className="flex-1">
                <GooglePlacesInput placeholder={`Arrêt ${i + 1}`} value={s?.address || ''} iconColor="#F59E0B" testId={`rental-stop-${i}`} onSelect={(loc) => setStop(i, loc)} />
              </div>
              <button onClick={() => removeStop(i)} className="text-red-500 shrink-0" data-testid={`rental-stop-remove-${i}`}><Minus size={18} /></button>
            </div>
          ))}
          <button onClick={addStop} data-testid="rental-add-stop" className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm font-semibold text-gray-600 flex items-center justify-center gap-1.5">
            <Plus size={15} /> Ajouter un arrêt
          </button>
        </div>
      </div>
    );
  }
  if (p.isBuddy) {
    return (
      <div className={card} data-testid="panel-buddy">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><Clock size={18} className="text-[#10B981]" /> Durée</label>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 4, 8].map((h) => (
            <button key={h} onClick={() => p.setBuddyHours(h)} data-testid={`panel-buddy-${h}`}
              className={`rounded-xl border-2 py-2.5 text-center font-black transition-colors ${p.buddyHours === h ? 'border-[#FF5000] bg-[#FFF3EC] text-[#FF5000]' : 'border-gray-200 text-[#0B1426]'}`}>{h}h</button>
          ))}
        </div>
      </div>
    );
  }
  if (mode.id === 'pets') {
    return (
      <div className={card} data-testid="panel-pets">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><PawPrint size={18} className="text-[#F97316]" /> Animaux</label>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Nombre</span>
          <div className="flex items-center gap-3">
            <button onClick={() => p.setPetsCount(Math.max(1, p.petsCount - 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-pets-minus"><Minus size={14} /></button>
            <span className="font-black text-lg w-6 text-center" data-testid="panel-pets-count">{p.petsCount}</span>
            <button onClick={() => p.setPetsCount(p.petsCount + 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-pets-plus"><Plus size={14} /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[{ k: 'small', l: 'Petit' }, { k: 'large', l: 'Grand' }].map((s) => (
            <button key={s.k} onClick={() => p.setPetsSize(s.k)} data-testid={`panel-pets-size-${s.k}`}
              className={`rounded-xl border-2 py-2 text-sm font-bold transition-colors ${p.petsSize === s.k ? 'border-[#FF5000] bg-[#FFF3EC] text-[#FF5000]' : 'border-gray-200 text-gray-600'}`}>{s.l}</button>
          ))}
        </div>
      </div>
    );
  }
  if (mode.id === 'assist') {
    return (
      <div className={card} data-testid="panel-assist">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><HandHeart size={18} className="text-[#F43F5E]" /> Type d&apos;assistance</label>
        <div className="grid grid-cols-2 gap-2">
          {assistOptions.map((a) => (
            <button key={a.k} onClick={() => p.setAssistNeeds(a.k)} data-testid={`panel-assist-${a.k}`}
              className={`rounded-xl border-2 py-2 text-sm font-bold transition-colors ${p.assistNeeds === a.k ? 'border-[#FF5000] bg-[#FFF3EC] text-[#FF5000]' : 'border-gray-200 text-gray-600'}`}>{a.l}</button>
          ))}
        </div>
      </div>
    );
  }
  if (mode.id === 'corporate') {
    return (
      <div className={card} data-testid="panel-corporate">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><Briefcase size={18} className="text-[#334155]" /> Compte entreprise</label>
        {p.corpAccounts.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune entreprise. Rejoignez-en une depuis votre profil.</p>
        ) : (
          <select value={p.corpId} onChange={(e) => p.setCorpId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-corporate-select">
            {p.corpAccounts.map((a) => <option key={a.join_code} value={a.join_code}>{a.name} (-{a.discount_pct}%)</option>)}
          </select>
        )}
      </div>
    );
  }
  if (mode.id === 'book_for_someone') {
    return (
      <div className={card} data-testid="panel-contact">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><UserPlus size={18} className="text-[#14B8A6]" /> Passager</label>
        <div className="grid grid-cols-2 gap-2">
          <input value={p.bookForName} onChange={(e) => p.setBookForName(e.target.value)} placeholder="Nom" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-contact-name" />
          <input value={p.bookForPhone} onChange={(e) => p.setBookForPhone(e.target.value)} placeholder="Téléphone" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-contact-phone" />
        </div>
      </div>
    );
  }
  if (mode.id === 'intercity') {
    const est = p.intercityEst || {};
    return (
      <div className={card} data-testid="panel-intercity">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1.5"><MapTrifold size={18} className="text-[#8B5CF6]" /> Trajet longue distance</label>
        {est.distance ? (
          <div className="flex items-center gap-2 flex-wrap mb-2" data-testid="intercity-info">
            <span className="text-[11px] font-bold text-[#8B5CF6] bg-[#8B5CF6]/10 rounded-full px-2 py-0.5">{est.distance} km</span>
            {est.pricePerKm ? <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{money(Number(est.pricePerKm))}/km</span> : null}
            {est.duration ? <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">≈ {Math.round(est.duration / 60)}h{String(est.duration % 60).padStart(2, '0')}</span> : null}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mb-2">Renseignez départ et destination pour estimer le tarif au kilomètre.</p>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <span className="min-w-0">
            <span className="text-sm font-bold text-[#0B1426] block leading-tight">Aller-retour</span>
            <span className="text-[11px] text-gray-400">Tarif majoré · le chauffeur vous ramène</span>
          </span>
          <button onClick={() => p.setRoundTrip(!p.roundTrip)} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${p.roundTrip ? 'bg-[#FF5000]' : 'bg-gray-300'}`} data-testid="intercity-roundtrip-toggle">
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.roundTrip ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="flex items-start gap-1.5 mt-2.5 bg-[#8B5CF6]/5 rounded-lg px-2.5 py-2" data-testid="intercity-deposit-note">
          <ShieldCheck size={15} className="text-[#8B5CF6] mt-0.5 shrink-0" weight="fill" />
          <span className="text-[11px] text-gray-500 leading-snug">Une <b className="text-gray-700">caution séquestre SB Pay</b> est prélevée à la réservation. Elle est <b className="text-gray-700">imputée au paiement final</b> et <b className="text-gray-700">remboursée</b> en cas d&apos;annulation avant la prise en charge.</span>
        </div>
      </div>
    );
  }
  if (mode.id === 'pool') {
    const seats = p.poolSeats || 1;
    const poolMax = Math.max(1, p.poolMax || 2);
    const capped = Math.min(seats, poolMax);
    return (
      <div className={card} data-testid="panel-pool">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1"><UsersThree size={18} className="text-[#3B82F6]" /> Taxi partagé (Pool)</label>
        <p className="text-[11px] text-gray-500 mb-2.5">Vous partagez le trajet avec d&apos;autres passagers allant dans la même direction. Le tarif est réduit mais le temps de trajet peut être un peu plus long.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Places à réserver</span>
          <div className="flex items-center gap-3">
            <button onClick={() => p.setPoolSeats(Math.max(1, capped - 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-40" disabled={capped <= 1} data-testid="panel-pool-minus"><Minus size={14} /></button>
            <span className="font-black text-lg w-6 text-center" data-testid="panel-pool-seats">{capped}</span>
            <button onClick={() => p.setPoolSeats(Math.min(poolMax, capped + 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-40" disabled={capped >= poolMax} data-testid="panel-pool-plus"><Plus size={14} /></button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">Maximum {poolMax} place{poolMax > 1 ? 's' : ''} par réservation Pool.</p>
      </div>
    );
  }
  if (p.isBidding) {
    return (
      <div className={card} data-testid="panel-bidding">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1.5"><Gavel size={18} className="text-[#EC4899]" /> Proposez votre tarif (€)</label>
        <input type="number" value={p.biddingFare} onChange={(e) => p.setBiddingFare(e.target.value)} placeholder="ex: 15" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-bidding-input" />
        <p className="text-[11px] text-gray-400 mt-1">Les chauffeurs proches verront votre offre et pourront l&apos;accepter ou contre-proposer.</p>
      </div>
    );
  }
  return null;
};

export default ModePanel;
