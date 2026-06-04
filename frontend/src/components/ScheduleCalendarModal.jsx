/**
 * ScheduleCalendarModal — Calendrier de planification style V3Cube.
 * Bottom-sheet avec grille mensuelle (navigation mois), sélection de l'heure
 * (heures/minutes), respect du délai minimum d'avance et de l'horizon max.
 * onConfirm renvoie une chaîne "YYYY-MM-DDTHH:mm" (compatible datetime-local / ISO).
 */
import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft, CaretRight, X, CalendarBlank, Clock, Check } from '@phosphor-icons/react';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const pad = (n) => String(n).padStart(2, '0');
const toLocalISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const ScheduleCalendarModal = ({ open, onClose, onConfirm, minAdvanceMinutes = 60, maxAdvanceDays = 30, initialValue }) => {
  const minDate = useMemo(() => new Date(Date.now() + minAdvanceMinutes * 60000), [minAdvanceMinutes, open]);
  const maxDate = useMemo(() => new Date(Date.now() + maxAdvanceDays * 86400000), [maxAdvanceDays, open]);

  const init = useMemo(() => {
    const d = initialValue ? new Date(initialValue) : new Date(minDate);
    return isNaN(d.getTime()) || d < minDate ? new Date(minDate) : d;
  }, [initialValue, minDate]);

  const [viewMonth, setViewMonth] = useState(new Date(init.getFullYear(), init.getMonth(), 1));
  const [selDate, setSelDate] = useState(new Date(init));
  const [hour, setHour] = useState(init.getHours());
  const [minute, setMinute] = useState(Math.ceil(init.getMinutes() / 5) * 5 % 60);

  useEffect(() => {
    if (open) {
      setViewMonth(new Date(init.getFullYear(), init.getMonth(), 1));
      setSelDate(new Date(init));
      setHour(init.getHours());
      setMinute(Math.ceil(init.getMinutes() / 5) * 5 % 60);
    }
  }, [open, init]);

  const grid = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [viewMonth]);

  if (!open) return null;

  const dayDisabled = (d) => {
    if (!d) return true;
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
    return endOfDay < minDate || d > maxDate;
  };

  const canPrev = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canNext = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1) <= maxDate;

  // For the selected day, compute the earliest allowed time
  const selectedIsMinDay = sameDay(selDate, minDate);
  const isTimeValid = () => {
    const candidate = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), hour, minute);
    return candidate >= minDate && candidate <= maxDate;
  };

  const confirm = () => {
    const result = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), hour, minute);
    onConfirm(toLocalISO(result));
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} data-testid="schedule-calendar-modal">
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-[#0B1426] flex items-center gap-2">
              <CalendarBlank size={20} className="text-[#FFC107]" weight="duotone" /> Programmer la course
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" data-testid="schedule-close-btn"><X size={20} /></button>
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between mb-3">
            <button disabled={!canPrev} onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="p-2 rounded-full disabled:opacity-30 hover:bg-gray-100" data-testid="schedule-prev-month"><CaretLeft size={18} /></button>
            <p className="font-bold text-[#0B1426]" data-testid="schedule-month-label">{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</p>
            <button disabled={!canNext} onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="p-2 rounded-full disabled:opacity-30 hover:bg-gray-100" data-testid="schedule-next-month"><CaretRight size={18} /></button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map((d) => <div key={d} className="text-center text-[10px] font-bold uppercase text-slate-400 py-1">{d}</div>)}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {grid.map((d, i) => {
              if (!d) return <div key={`e-${i}`} />;
              const disabled = dayDisabled(d);
              const selected = sameDay(d, selDate);
              return (
                <button key={toLocalISO(d)} disabled={disabled}
                  onClick={() => setSelDate(new Date(d))}
                  data-testid={`schedule-day-${d.getDate()}`}
                  className={`aspect-square rounded-lg text-sm font-semibold transition-colors flex items-center justify-center
                    ${selected ? 'bg-[#0B1426] text-white' : disabled ? 'text-slate-300 cursor-not-allowed' : 'text-[#0B1426] hover:bg-gray-100'}`}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time selector */}
          <div className="flex items-center gap-3 mb-5">
            <Clock size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-600">Heure</span>
            <div className="flex items-center gap-1 ml-auto">
              <select value={hour} onChange={(e) => setHour(parseInt(e.target.value, 10))}
                data-testid="schedule-hour-select"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold">
                {Array.from({ length: 24 }, (_, h) => {
                  const dt = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), h, 59);
                  const dis = selectedIsMinDay && dt < minDate;
                  return <option key={h} value={h} disabled={dis}>{pad(h)}</option>;
                })}
              </select>
              <span className="font-black">:</span>
              <select value={minute} onChange={(e) => setMinute(parseInt(e.target.value, 10))}
                data-testid="schedule-minute-select"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold">
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
                  const dt = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), hour, m);
                  const dis = selectedIsMinDay && dt < minDate;
                  return <option key={m} value={m} disabled={dis}>{pad(m)}</option>;
                })}
              </select>
            </div>
          </div>

          <button onClick={confirm} disabled={!isTimeValid()}
            data-testid="schedule-confirm-btn"
            className="w-full py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: '#FFC107', color: '#0B1426' }}>
            <Check size={20} weight="bold" /> Confirmer
          </button>
          {!isTimeValid() && <p className="text-center text-[11px] text-rose-500 mt-2" data-testid="schedule-time-warning">Choisissez une heure ultérieure au délai minimum.</p>}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ScheduleCalendarModal;
