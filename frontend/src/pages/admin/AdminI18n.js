/**
 * Admin i18n — Moteur de traduction (30+ langues + traduction automatique LLM).
 *
 * - Grille des langues : drapeau, couverture, activer/désactiver, RTL.
 * - 1 clic « Traduire automatiquement » → traduit toutes les clés (Claude).
 * - Édition fine clé par clé pour la langue sélectionnée.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Translate, Sparkle, Check, MagnifyingGlass, ArrowsClockwise, TextAa } from '@phosphor-icons/react';
import api from '../../services/api';

const Coverage = ({ value, total }) => {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const color = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-gray-300';
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">{value}/{total} clés · {pct}%</p>
    </div>
  );
};

export default function AdminI18n() {
  const [langs, setLangs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // code en cours de traduction
  const [selected, setSelected] = useState(null); // code sélectionné pour l'édition
  const [labels, setLabels] = useState({});
  const [base, setBase] = useState({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // {key, value}

  const loadOverview = () => {
    api.get('/i18n/admin/overview')
      .then((r) => { setLangs(r.data.items || []); setTotal(r.data.total || 0); })
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  };

  const loadBundle = (code) => {
    api.get(`/i18n/admin/bundle/${code}`)
      .then((r) => { setLabels(r.data.labels || {}); setBase(r.data.base || {}); })
      .catch(() => toast.error('Erreur bundle'));
  };

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { if (selected) loadBundle(selected); }, [selected]);

  const toggleActive = async (code, isActive) => {
    try {
      await api.post(`/i18n/admin/languages/${code}/activate`, { is_active: isActive });
      setLangs((ls) => ls.map((l) => (l.code === code ? { ...l, is_active: isActive } : l)));
    } catch { toast.error('Échec de la mise à jour'); }
  };

  const autoTranslate = async (code, overwrite = false) => {
    setBusy(code);
    try {
      const r = await api.post('/i18n/admin/auto-translate', { target_lang: code, overwrite });
      toast.success(`Traduction terminée — ${r.data.coverage}/${r.data.total} clés`);
      await loadOverview();
      if (selected === code) await loadBundle(code);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Échec de la traduction');
    } finally { setBusy(null); }
  };

  const saveKey = async () => {
    if (!editing || !selected) return;
    try {
      await api.post('/i18n/admin/bundle-key', { lang: selected, key: editing.key, value: editing.value });
      setLabels((l) => ({ ...l, [editing.key]: editing.value }));
      setLangs((ls) => ls.map((l) => (l.code === selected
        ? { ...l, coverage: Object.keys(base).filter((k) => (k === editing.key ? editing.value : labels[k])).length }
        : l)));
      setEditing(null);
      toast.success('Enregistré');
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const isBase = (c) => c === 'fr' || c === 'en';
  const entries = Object.keys(base)
    .filter((k) => !search || k.toLowerCase().includes(search.toLowerCase()) || (labels[k] || '').toLowerCase().includes(search.toLowerCase()))
    .sort();
  const selLang = langs.find((l) => l.code === selected);

  return (
    <div className="p-6" data-testid="admin-i18n-page">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Translate size={28} weight="duotone" className="text-violet-600" /> Traductions (i18n)
        </h1>
        <button onClick={() => { setLoading(true); loadOverview(); }} className="p-2.5 rounded-lg bg-violet-100 text-violet-600" data-testid="i18n-refresh"><ArrowsClockwise size={18} /></button>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {langs.length} langues · {total} clés par langue. Activez une langue puis cliquez sur
        <b> « Traduire automatiquement »</b> pour générer toutes les traductions (apps mobiles). FR/EN sont les langues de base.
      </p>

      {/* Grille des langues */}
      {loading ? (
        <p className="text-gray-400 py-8" data-testid="i18n-loading">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-8">
          {langs.map((l) => (
            <div key={l.code}
              data-testid={`i18n-lang-${l.code}`}
              onClick={() => !isBase(l.code) && setSelected(l.code)}
              className={`bg-white rounded-2xl border p-4 transition-all ${selected === l.code ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200'} ${isBase(l.code) ? '' : 'cursor-pointer hover:border-violet-300'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl">{l.flag}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{l.name}</p>
                    <p className="text-[11px] text-gray-400 uppercase">{l.code}{l.is_rtl ? ' · RTL' : ''}{l.is_default ? ' · défaut' : ''}</p>
                  </div>
                </div>
                {!isBase(l.code) && (
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(l.code, !l.is_active); }}
                    data-testid={`i18n-toggle-${l.code}`}
                    className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${l.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    style={{ height: 22, width: 40 }}>
                    <span className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${l.is_active ? 'translate-x-[20px]' : 'translate-x-0.5'}`} />
                  </button>
                )}
              </div>

              <Coverage value={isBase(l.code) ? total : l.coverage} total={total} />

              {isBase(l.code) ? (
                <p className="mt-3 text-[11px] font-semibold text-gray-400 inline-flex items-center gap-1"><TextAa size={13} /> Langue de base</p>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); autoTranslate(l.code, l.coverage >= total); }}
                  disabled={busy === l.code}
                  data-testid={`i18n-translate-${l.code}`}
                  className="mt-3 w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Sparkle size={15} weight="fill" />
                  {busy === l.code ? 'Traduction…' : (l.coverage > 0 ? (l.coverage >= total ? 'Re-traduire tout' : 'Compléter') : 'Traduire automatiquement')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Éditeur clé par clé */}
      {selected && !isBase(selected) && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden" data-testid="i18n-editor">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-gray-800">{selLang?.flag} {selLang?.name} — édition</span>
            <div className="relative ml-auto">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une clé…"
                data-testid="i18n-search" className="border border-gray-300 rounded-lg pl-9 pr-3 py-1.5 text-sm w-64" />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr><th className="px-4 py-2.5 text-left">Clé</th><th className="text-left">Base (FR)</th><th className="text-left">Traduction</th><th className="w-20"></th></tr>
            </thead>
            <tbody>
              {entries.map((k) => {
                const val = labels[k] || '';
                const missing = !val;
                return (
                  <tr key={k} className={`border-t border-gray-50 ${missing ? 'bg-amber-50/40' : ''}`} data-testid={`i18n-row-${k}`}>
                    <td className="px-4 py-2 font-mono text-[11px] text-gray-500 align-top">{k}</td>
                    <td className="py-2 text-gray-400 align-top max-w-[220px]">{base[k]}</td>
                    <td className="py-2 align-top">
                      {editing?.key === k ? (
                        <textarea value={editing.value} autoFocus onChange={(e) => setEditing({ key: k, value: e.target.value })}
                          rows={2} data-testid={`i18n-input-${k}`} className="w-full border border-violet-300 rounded px-2 py-1 text-sm" />
                      ) : (
                        <span className={missing ? 'text-amber-600 italic' : 'text-gray-800'}>{val || '(manquant)'}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right align-top">
                      {editing?.key === k ? (
                        <button onClick={saveKey} data-testid={`i18n-save-${k}`} className="text-emerald-600 inline-flex items-center gap-1 text-xs font-semibold"><Check size={14} /> OK</button>
                      ) : (
                        <button onClick={() => setEditing({ key: k, value: val })} className="text-violet-600 text-xs font-semibold">Modifier</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
