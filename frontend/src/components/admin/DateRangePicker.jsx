import React, { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarBlank } from '@phosphor-icons/react';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const PRESETS = [
  { label: "Aujourd'hui", days: 0 },
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
  { label: '90 jours', days: 90 },
];

const toIso = (d) => (d ? format(d, 'yyyy-MM-dd') : undefined);

/**
 * Calendar date-range picker. Calls onChange({ date_from, date_to }) (yyyy-MM-dd).
 * `accent` is a tailwind text color class for the active preset (e.g. 'sky', 'rose').
 */
export const DateRangePicker = ({ value, onChange, accent = 'indigo', testid = 'date-range' }) => {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({
    from: value?.date_from ? new Date(value.date_from) : undefined,
    to: value?.date_to ? new Date(value.date_to) : undefined,
  });

  const apply = (r) => {
    setRange(r || {});
    if (r?.from && r?.to) {
      onChange({ date_from: toIso(r.from), date_to: toIso(r.to) });
      setOpen(false);
    } else if (r?.from && !r?.to) {
      onChange({ date_from: toIso(r.from), date_to: toIso(r.from) });
    }
  };

  const preset = (days) => {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    setRange({ from, to });
    onChange({ date_from: toIso(from), date_to: toIso(to) });
    setOpen(false);
  };

  const label = range?.from
    ? `${format(range.from, 'd MMM', { locale: fr })}${range.to ? ` – ${format(range.to, 'd MMM yyyy', { locale: fr })}` : ''}`
    : 'Choisir une période';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button data-testid={`${testid}-trigger`}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50">
          <CalendarBlank size={16} className={`text-${accent}-500`} weight="fill" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" data-testid={`${testid}-content`}>
        <div className="flex flex-wrap gap-1.5 p-3 border-b border-gray-100">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => preset(p.days)} data-testid={`${testid}-preset-${p.days}`}
              className="px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-50 text-gray-600 hover:bg-gray-100">
              {p.label}
            </button>
          ))}
        </div>
        <Calendar mode="range" selected={range} onSelect={apply} numberOfMonths={2} locale={fr} defaultMonth={range?.from} />
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
