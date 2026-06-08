import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Bus, Train, Boat, Plus, PencilSimple, Trash, X, MapPin, Path, ArrowsClockwise, Database } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { transportAPI } from '../../services/api';

const MODES = [
  { v: 'bus', l: 'Bus' }, { v: 'tram', l: 'Tram' }, { v: 'brt', l: 'BRT' },
  { v: 'metro', l: 'Métro' }, { v: 'ferry', l: 'Navette' },
];
const MODE_ICON = { bus: Bus, tram: Train, brt: Bus, metro: Train, ferry: Boat };

const EMPTY_STOP = { name: '', zone: '', type: 'bus', lat: '', lng: '', is_active: true };
const EMPTY_LINE = {
  code: '', name: '', mode: 'bus', color: '', operator: '',
  headway_min: 15, first_time: '05:00', last_time: '23:00', stop_travel_min: 2,
  fare: '', stop_ids: [], is_active: true,
};

const AdminTransport = () => {
  const [tab, setTab] = useState('stops');
  const [stops, setStops] = useState([]);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editStop, setEditStop] = useState(null);  // {id, form}
  const [editLine, setEditLine] = useState(null);  // {id, form}
  const [gtfs, setGtfs] = useState(null);          // GTFS import status
  const [refreshing, setRefreshing] = useState(false);
  const [rtUrls, setRtUrls] = useState({ 'mq-centre': '', 'mq-maritime': '', 'mq-nord': '' });
  const [savingRt, setSavingRt] = useState(false);

  const loadGtfs = useCallback(async () => {
    try {
      const r = await transportAPI.gtfsStatus();
      setGtfs(r.data);
      const u = r.data.realtime_urls || {};
      setRtUrls({ 'mq-centre': u['mq-centre'] || '', 'mq-maritime': u['mq-maritime'] || '', 'mq-nord': u['mq-nord'] || '' });
    } catch (e) { /* ignore */ }
  }, []);

  const saveRt = useCallback(async () => {
    setSavingRt(true);
    try {
      const r = await transportAPI.setGtfsRealtime(rtUrls);
      toast.success(r.data.realtime_active ? 'Temps réel GTFS-RT activé' : 'Temps réel désactivé (horaire théorique)');
      loadGtfs();
    } catch (e) { toast.error('Échec de la configuration temps réel'); }
    finally { setSavingRt(false); }
  }, [rtUrls, loadGtfs]);

  const refreshGtfs = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const r = await transportAPI.gtfsRefresh(force);
      const changed = r.data.changed || [];
      toast.success(changed.length ? `GTFS mis à jour : ${changed.join(', ')}` : 'GTFS déjà à jour (aucune nouvelle version)');
      loadGtfs();
    } catch (e) { toast.error('Échec du rafraîchissement GTFS'); }
    finally { setRefreshing(false); }
  }, [loadGtfs]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([transportAPI.adminListStops(), transportAPI.adminListLines()]);
      setStops(s.data.stops || []);
      setLines(l.data.lines || []);
    } catch (e) { console.error(e); toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); loadGtfs(); }, [load, loadGtfs]);

  const stopName = (id) => stops.find((s) => s.id === id)?.name || id;

  // ── Stops CRUD ──
  const setSF = (k, v) => setEditStop((e) => ({ ...e, form: { ...e.form, [k]: v } }));
  const saveStop = async () => {
    const { id, form } = editStop;
    if (!form.name.trim()) { toast.error('Le nom est requis'); return; }
    try {
      if (id) await transportAPI.updateStop(id, form); else await transportAPI.createStop(form);
      toast.success(id ? 'Arrêt mis à jour' : 'Arrêt créé');
      setEditStop(null); load();
    } catch (e) { toast.error('Erreur lors de l’enregistrement'); }
  };
  const removeStop = async (s) => {
    if (!window.confirm(`Supprimer l'arrêt « ${s.name} » ?`)) return;
    try { await transportAPI.removeStop(s.id); toast.success('Arrêt supprimé'); load(); }
    catch (e) { toast.error('Erreur'); }
  };

  // ── Lines CRUD ──
  const setLF = (k, v) => setEditLine((e) => ({ ...e, form: { ...e.form, [k]: v } }));
  const toggleLineStop = (sid) => setEditLine((e) => {
    const cur = e.form.stop_ids || [];
    const next = cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid];
    return { ...e, form: { ...e.form, stop_ids: next } };
  });
  const saveLine = async () => {
    const { id, form } = editLine;
    if (!form.code.trim()) { toast.error('Le code est requis'); return; }
    try {
      if (id) await transportAPI.updateLine(id, form); else await transportAPI.createLine(form);
      toast.success(id ? 'Ligne mise à jour' : 'Ligne créée');
      setEditLine(null); load();
    } catch (e) { toast.error('Erreur lors de l’enregistrement'); }
  };
  const removeLine = async (l) => {
    if (!window.confirm(`Supprimer la ligne « ${l.code} » ?`)) return;
    try { await transportAPI.removeLine(l.id); toast.success('Ligne supprimée'); load(); }
    catch (e) { toast.error('Erreur'); }
  };

  return (
    <div className="p-6" data-testid="admin-transport-page">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Bus size={22} className="text-[#FF5000]" weight="fill" /> Transports publics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gérez les <span className="font-semibold">arrêts</span> et les <span className="font-semibold">lignes</span> (bus, tram, BRT…).
            Les horaires de passage sont <span className="font-semibold text-[#FF5000]">simulés</span> à partir de la fréquence de chaque ligne.
          </p>
        </div>
        {tab === 'stops'
          ? <Button className="bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={() => setEditStop({ id: null, form: { ...EMPTY_STOP } })} data-testid="add-stop-btn"><Plus size={16} className="mr-1" /> Ajouter un arrêt</Button>
          : <Button className="bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={() => setEditLine({ id: null, form: { ...EMPTY_LINE } })} data-testid="add-line-btn"><Plus size={16} className="mr-1" /> Ajouter une ligne</Button>}
      </div>

      {/* GTFS (real data) status panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4" data-testid="gtfs-panel">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-[#3730A3]" weight="duotone" />
            <div>
              <p className="text-sm font-bold text-gray-800">Données GTFS Martinique (transport.data.gouv.fr)</p>
              <p className="text-xs text-gray-500">
                Rafraîchissement auto hebdomadaire · Dernier import :{' '}
                <span className="font-semibold" data-testid="gtfs-last-import">
                  {gtfs?.last_import_at ? new Date(gtfs.last_import_at).toLocaleString('fr-FR') : '—'}
                </span>
              </p>
            </div>
          </div>
          <Button onClick={() => refreshGtfs(false)} disabled={refreshing} variant="outline" className="h-8 text-xs" data-testid="gtfs-refresh-btn">
            <ArrowsClockwise size={14} className={`mr-1 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Rafraîchissement…' : 'Rafraîchir maintenant'}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {['mq-centre', 'mq-maritime', 'mq-nord'].map((feed) => {
            const fm = gtfs?.feeds?.[feed];
            const cnt = gtfs?.live_stop_counts?.[feed];
            const labels = { 'mq-centre': 'Centre / CACEM', 'mq-maritime': 'Maritime', 'mq-nord': 'Nord / Cap Nord' };
            return (
              <div key={feed} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100" data-testid={`gtfs-feed-${feed}`}>
                <p className="text-[11px] font-bold text-gray-700">{labels[feed]}</p>
                <p className="text-[10px] text-gray-500">{cnt != null ? `${cnt} arrêts` : '—'}{fm?.stop_times ? ` · ${fm.stop_times} horaires` : ''}</p>
                <p className="text-[10px] text-gray-400">{fm?.imported_at ? new Date(fm.imported_at).toLocaleDateString('fr-FR') : 'jamais importé'}</p>
              </div>
            );
          })}
        </div>

        {/* GTFS-RT (temps réel) — configurable, dormant tant qu'aucune URL n'est fournie */}
        <div className="mt-3 border-t border-gray-100 pt-3" data-testid="gtfs-realtime-config">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700">Temps réel (GTFS-RT) — optionnel</p>
            <Badge className={gtfs?.realtime_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'} data-testid="gtfs-realtime-status">
              {gtfs?.realtime_active ? 'Actif' : 'Inactif (horaire théorique)'}
            </Badge>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Collez l'URL d'un flux GTFS-RT TripUpdates par réseau (laisser vide = théorique). Les retards/suppressions seront appliqués automatiquement.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
            {[['mq-centre', 'Centre / CACEM'], ['mq-maritime', 'Maritime'], ['mq-nord', 'Nord / Cap Nord']].map(([feed, label]) => (
              <div key={feed}>
                <label className="text-[10px] font-semibold text-gray-600 block mb-0.5">{label}</label>
                <Input value={rtUrls[feed]} onChange={(e) => setRtUrls((u) => ({ ...u, [feed]: e.target.value }))}
                  placeholder="https://…/gtfs-rt" className="h-8 text-xs" data-testid={`rt-url-${feed}`} />
              </div>
            ))}
          </div>
          <Button onClick={saveRt} disabled={savingRt} className="mt-2 h-8 text-xs bg-[#0B1426] hover:bg-[#1a2942] text-white" data-testid="rt-save-btn">
            {savingRt ? 'Enregistrement…' : 'Enregistrer le temps réel'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('stops')} data-testid="tab-stops"
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'stops' ? 'bg-[#0B1426] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
          <MapPin size={14} className="inline mr-1" /> Arrêts ({stops.length})
        </button>
        <button onClick={() => setTab('lines')} data-testid="tab-lines"
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'lines' ? 'bg-[#0B1426] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
          <Path size={14} className="inline mr-1" /> Lignes ({lines.length})
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
        ) : tab === 'stops' ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Arrêt</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Zone</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Coordonnées</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr></thead>
            <tbody>
              {stops.map((s) => {
                const SIcon = MODE_ICON[s.type] || Bus;
                return (
                  <tr key={s.id} className="border-b border-gray-100" data-testid={`stop-row-${s.id}`}>
                    <td className="py-3 px-4"><div className="flex items-center gap-2 font-medium text-gray-800"><SIcon size={16} className="text-[#3730A3]" /> {s.name}</div></td>
                    <td className="py-3 px-4 text-gray-600">{s.zone || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{s.lat != null && s.lng != null ? `${s.lat}, ${s.lng}` : '—'}</td>
                    <td className="py-3 px-4 text-center">{s.is_active !== false ? <Badge className="bg-emerald-100 text-emerald-700">Actif</Badge> : <Badge variant="outline" className="text-gray-400">Inactif</Badge>}</td>
                    <td className="py-3 px-4 text-center"><div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditStop({ id: s.id, form: { name: s.name, zone: s.zone || '', type: s.type || 'bus', lat: s.lat ?? '', lng: s.lng ?? '', is_active: s.is_active !== false } })} data-testid={`edit-stop-${s.id}`}><PencilSimple size={14} /></Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" onClick={() => removeStop(s)} data-testid={`delete-stop-${s.id}`}><Trash size={14} /></Button>
                    </div></td>
                  </tr>
                );
              })}
              {stops.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Aucun arrêt</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Ligne</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Mode</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Fréquence</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Arrêts</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-100" data-testid={`line-row-${l.id}`}>
                  <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="text-[11px] font-black text-white px-2 py-1 rounded-md" style={{ backgroundColor: l.color || '#2563EB' }}>{l.code}</span><span className="font-medium text-gray-800">{l.name}</span></div></td>
                  <td className="py-3 px-4 text-gray-600">{MODES.find((m) => m.v === l.mode)?.l || l.mode}</td>
                  <td className="py-3 px-4 text-gray-600 text-xs">toutes les {l.headway_min} min<div className="text-gray-400">{l.first_time}–{l.last_time}{l.fare != null ? ` · ${l.fare} €` : ''}</div></td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{(l.stop_ids || []).map(stopName).join(' → ') || '—'}</td>
                  <td className="py-3 px-4 text-center">{l.is_active !== false ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge variant="outline" className="text-gray-400">Inactive</Badge>}</td>
                  <td className="py-3 px-4 text-center"><div className="flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditLine({ id: l.id, form: { code: l.code, name: l.name, mode: l.mode || 'bus', color: l.color || '', operator: l.operator || '', headway_min: l.headway_min || 15, first_time: l.first_time || '05:00', last_time: l.last_time || '23:00', stop_travel_min: l.stop_travel_min || 2, fare: l.fare ?? '', stop_ids: l.stop_ids || [], is_active: l.is_active !== false } })} data-testid={`edit-line-${l.id}`}><PencilSimple size={14} /></Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" onClick={() => removeLine(l)} data-testid={`delete-line-${l.id}`}><Trash size={14} /></Button>
                  </div></td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Aucune ligne</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Stop modal */}
      {editStop && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditStop(null)} data-testid="stop-dialog">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-900">{editStop.id ? 'Modifier l’arrêt' : 'Nouvel arrêt'}</h3><button onClick={() => setEditStop(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-semibold text-gray-700 block mb-1">Nom *</label><Input value={editStop.form.name} onChange={(e) => setSF('name', e.target.value)} placeholder="Place de la Victoire" data-testid="stop-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Zone / Ville</label><Input value={editStop.form.zone} onChange={(e) => setSF('zone', e.target.value)} placeholder="Pointe-à-Pitre" data-testid="stop-zone" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Type</label>
                  <select value={editStop.form.type} onChange={(e) => setSF('type', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" data-testid="stop-type">
                    {MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Latitude</label><Input type="number" step="any" value={editStop.form.lat} onChange={(e) => setSF('lat', e.target.value)} data-testid="stop-lat" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Longitude</label><Input type="number" step="any" value={editStop.form.lng} onChange={(e) => setSF('lng', e.target.value)} data-testid="stop-lng" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={editStop.form.is_active} onChange={(e) => setSF('is_active', e.target.checked)} data-testid="stop-active" /> Actif</label>
            </div>
            <div className="flex gap-2 mt-5"><Button variant="outline" className="flex-1" onClick={() => setEditStop(null)}>Annuler</Button><Button className="flex-1 bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={saveStop} data-testid="stop-save">Enregistrer</Button></div>
          </div>
        </div>
      )}

      {/* Line modal */}
      {editLine && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditLine(null)} data-testid="line-dialog">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-900">{editLine.id ? 'Modifier la ligne' : 'Nouvelle ligne'}</h3><button onClick={() => setEditLine(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Code *</label><Input value={editLine.form.code} onChange={(e) => setLF('code', e.target.value)} placeholder="L1" data-testid="line-code" /></div>
                <div className="col-span-2"><label className="text-xs font-semibold text-gray-700 block mb-1">Nom</label><Input value={editLine.form.name} onChange={(e) => setLF('name', e.target.value)} placeholder="Karu'lis 1" data-testid="line-name" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Mode</label>
                  <select value={editLine.form.mode} onChange={(e) => setLF('mode', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" data-testid="line-mode">
                    {MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Couleur</label><Input type="color" value={editLine.form.color || '#2563EB'} onChange={(e) => setLF('color', e.target.value)} data-testid="line-color" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Opérateur</label><Input value={editLine.form.operator} onChange={(e) => setLF('operator', e.target.value)} data-testid="line-operator" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Fréquence (min)</label><Input type="number" value={editLine.form.headway_min} onChange={(e) => setLF('headway_min', e.target.value)} data-testid="line-headway" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Premier</label><Input type="time" value={editLine.form.first_time} onChange={(e) => setLF('first_time', e.target.value)} data-testid="line-first" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Dernier</label><Input type="time" value={editLine.form.last_time} onChange={(e) => setLF('last_time', e.target.value)} data-testid="line-last" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Tarif ticket (€)</label><Input type="number" step="0.01" value={editLine.form.fare} onChange={(e) => setLF('fare', e.target.value)} placeholder="ex. 1.50" data-testid="line-fare" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Temps inter-arrêt (min)</label><Input type="number" value={editLine.form.stop_travel_min} onChange={(e) => setLF('stop_travel_min', e.target.value)} data-testid="line-travel" /></div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Arrêts desservis (dans l’ordre)</label>
                <div className="border border-gray-200 rounded-lg p-2 max-h-44 overflow-y-auto space-y-1">
                  {stops.length === 0 && <p className="text-xs text-gray-400 p-2">Créez d’abord des arrêts.</p>}
                  {stops.map((s) => {
                    const checked = (editLine.form.stop_ids || []).includes(s.id);
                    const order = (editLine.form.stop_ids || []).indexOf(s.id) + 1;
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 px-1 py-0.5 cursor-pointer" data-testid={`line-stop-${s.id}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleLineStop(s.id)} />
                        {checked && <span className="text-[10px] font-bold text-white bg-[#3730A3] rounded-full w-4 h-4 flex items-center justify-center">{order}</span>}
                        <span className={checked ? 'font-medium' : ''}>{s.name} <span className="text-gray-400 text-xs">· {s.zone}</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={editLine.form.is_active} onChange={(e) => setLF('is_active', e.target.checked)} data-testid="line-active" /> Active</label>
            </div>
            <div className="flex gap-2 mt-5"><Button variant="outline" className="flex-1" onClick={() => setEditLine(null)}>Annuler</Button><Button className="flex-1 bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={saveLine} data-testid="line-save">Enregistrer</Button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTransport;
