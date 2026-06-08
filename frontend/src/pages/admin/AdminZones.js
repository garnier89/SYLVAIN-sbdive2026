import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MapPin, Plus, PencilSimple, Trash, X, Lightning, ArrowUp, ArrowDown, Clock } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { zonesAPI, homeCategoriesAPI } from '../../services/api';
import DynamicIcon from '../../components/DynamicIcon';

const DAYS = [
  { v: 1, l: 'Lun' }, { v: 2, l: 'Mar' }, { v: 3, l: 'Mer' }, { v: 4, l: 'Jeu' },
  { v: 5, l: 'Ven' }, { v: 6, l: 'Sam' }, { v: 0, l: 'Dim' },
];

const EMPTY_ZONE = {
  name: '', country: '', region: '', city: '',
  lat: '', lng: '', radius_km: '', aliases: '', is_active: true, display_order: 0,
};

const EMPTY_SCHEDULE = { enabled: false, days: [], start_time: '', end_time: '', start_date: '', end_date: '' };

// Taxi services aren't in the home_categories CMS (managed elsewhere) — add the
// most common ones to the picker so they can be programmed as zone shortcuts.
const TAXI_PICKS = [
  { id: 'pick-taxi', name: 'Taxi VTC', path: '/course?mode=standard', iconName: 'Taxi', bg: 'bg-slate-100', iconColor: 'text-gray-600' },
  { id: 'pick-airport', name: 'Aéroport', path: '/course?mode=airport', iconName: 'AirplaneTilt', bg: 'bg-slate-100', iconColor: 'text-gray-600' },
  { id: 'pick-moto', name: 'Moto Taxi', path: '/course?mode=moto', iconName: 'Motorcycle', bg: 'bg-slate-100', iconColor: 'text-gray-600' },
  { id: 'pick-parcel', name: 'Livraison Colis', path: '/parcel', iconName: 'Package', bg: 'bg-slate-100', iconColor: 'text-gray-600' },
  { id: 'pick-food', name: 'Livraison Repas', path: '/food', iconName: 'ForkKnife', bg: 'bg-slate-100', iconColor: 'text-gray-600' },
];

const AdminZones = () => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // {id, form}
  const [programming, setProgramming] = useState(null); // {zone, entries}
  const [catalog, setCatalog] = useState([]);     // pickable services
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await zonesAPI.adminList();
      setZones(r.data.zones || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build the service catalog (CMS categories + common taxi modes) for the picker.
  useEffect(() => {
    homeCategoriesAPI.public().then((r) => {
      const items = (r.data.items || [])
        .filter((i) => i.visible_home && i.target_route && i.label_fr)
        .map((i) => ({
          id: i.id, name: i.label_fr, path: i.target_route,
          iconName: i.icon_name || 'GridFour', imageUrl: i.image_url || '',
          bg: i.bg_class || 'bg-slate-100', iconColor: i.icon_color_class || 'text-gray-600',
        }));
      const seen = new Set();
      const merged = [...TAXI_PICKS, ...items].filter((s) => {
        if (seen.has(s.path)) return false; seen.add(s.path); return true;
      });
      setCatalog(merged);
    }).catch(() => setCatalog(TAXI_PICKS));
  }, []);

  // ── zone CRUD ──
  const openCreate = () => setEditing({ id: null, form: { ...EMPTY_ZONE } });
  const openEdit = (z) => setEditing({
    id: z.id,
    form: {
      name: z.name || '', country: z.country || '', region: z.region || '', city: z.city || '',
      lat: z.lat ?? '', lng: z.lng ?? '', radius_km: z.radius_km ?? '',
      aliases: (z.aliases || []).join(', '), is_active: z.is_active !== false,
      display_order: z.display_order || 0,
    },
  });
  const setF = (k, v) => setEditing((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  const saveZone = async () => {
    const { id, form } = editing;
    if (!form.name.trim()) { toast.error('Le nom de la zone est requis'); return; }
    try {
      if (id) await zonesAPI.update(id, form);
      else await zonesAPI.create(form);
      toast.success(id ? 'Zone mise à jour' : 'Zone créée');
      setEditing(null); load();
    } catch (e) { console.error(e); toast.error('Erreur lors de l’enregistrement'); }
  };

  const removeZone = async (z) => {
    if (!window.confirm(`Supprimer la zone « ${z.name} » et ses raccourcis ?`)) return;
    try { await zonesAPI.remove(z.id); toast.success('Zone supprimée'); load(); }
    catch (e) { console.error(e); toast.error('Erreur'); }
  };

  // ── programmed shortcuts ──
  const openProgram = async (z) => {
    try {
      const r = await zonesAPI.getShortcuts(z.id);
      setProgramming({ zone: z, entries: r.data.entries || [] });
    } catch (e) { console.error(e); toast.error('Erreur de chargement'); }
  };

  const addService = (svc) => {
    setProgramming((p) => ({ ...p, entries: [...p.entries, { service: { ...svc }, schedule: { ...EMPTY_SCHEDULE } }] }));
    setPickerOpen(false);
  };
  const removeEntry = (idx) => setProgramming((p) => ({ ...p, entries: p.entries.filter((_, i) => i !== idx) }));
  const moveEntry = (idx, dir) => setProgramming((p) => {
    const arr = [...p.entries]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return p;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    return { ...p, entries: arr };
  });
  const setSched = (idx, k, v) => setProgramming((p) => {
    const arr = [...p.entries];
    arr[idx] = { ...arr[idx], schedule: { ...arr[idx].schedule, [k]: v } };
    return { ...p, entries: arr };
  });
  const toggleDay = (idx, day) => setProgramming((p) => {
    const arr = [...p.entries];
    const days = arr[idx].schedule.days || [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    arr[idx] = { ...arr[idx], schedule: { ...arr[idx].schedule, days: next } };
    return { ...p, entries: arr };
  });

  const saveProgram = async () => {
    try {
      await zonesAPI.setShortcuts(programming.zone.id, programming.entries);
      toast.success('Raccourcis programmés');
      setProgramming(null); load();
    } catch (e) { console.error(e); toast.error('Erreur lors de l’enregistrement'); }
  };

  return (
    <div className="p-6" data-testid="admin-zones-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <MapPin size={22} className="text-[#FF5000]" weight="fill" /> Zones & raccourcis
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Définissez des zones (coordonnées + rayon, hiérarchie pays/région/ville ou alias texte) et
            <span className="font-semibold text-[#FF5000]"> programmez les raccourcis</span> affichés à l’accueil (avec planification horaire). <span className="font-semibold">{zones.length} zone(s)</span>
          </p>
        </div>
        <Button className="bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={openCreate} data-testid="add-zone-btn">
          <Plus size={16} className="mr-1" /> Ajouter une zone
        </Button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Zone</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Localisation</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Raccourcis</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-b border-gray-100" data-testid={`zone-row-${z.id}`}>
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-800">{z.name}</div>
                    <div className="text-xs text-gray-400">{[z.city, z.region, z.country].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-xs">
                    {z.lat != null && z.lng != null ? `${z.lat}, ${z.lng}` : '—'}
                    {z.radius_km ? <span className="text-gray-400"> · {z.radius_km} km</span> : null}
                    {(z.aliases || []).length ? <div className="text-gray-400">alias: {z.aliases.join(', ')}</div> : null}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openProgram(z)} data-testid={`program-${z.id}`}>
                      <Lightning size={13} className="mr-1 text-[#FF5000]" /> {z.shortcut_count || 0}
                    </Button>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {z.is_active !== false
                      ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                      : <Badge variant="outline" className="text-gray-400">Inactive</Badge>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(z)} data-testid={`edit-zone-${z.id}`}><PencilSimple size={14} /></Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" onClick={() => removeZone(z)} data-testid={`delete-zone-${z.id}`}><Trash size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {zones.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Aucune zone</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Zone edit modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)} data-testid="zone-dialog">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{editing.id ? 'Modifier la zone' : 'Nouvelle zone'}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Nom *</label>
                <Input value={editing.form.name} onChange={(e) => setF('name', e.target.value)} placeholder="Pointe-à-Pitre" data-testid="zone-name" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Pays</label><Input value={editing.form.country} onChange={(e) => setF('country', e.target.value)} data-testid="zone-country" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Région</label><Input value={editing.form.region} onChange={(e) => setF('region', e.target.value)} data-testid="zone-region" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Ville</label><Input value={editing.form.city} onChange={(e) => setF('city', e.target.value)} data-testid="zone-city" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Latitude</label><Input type="number" step="any" value={editing.form.lat} onChange={(e) => setF('lat', e.target.value)} data-testid="zone-lat" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Longitude</label><Input type="number" step="any" value={editing.form.lng} onChange={(e) => setF('lng', e.target.value)} data-testid="zone-lng" /></div>
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Rayon (km)</label><Input type="number" step="any" value={editing.form.radius_km} onChange={(e) => setF('radius_km', e.target.value)} data-testid="zone-radius" /></div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Alias (séparés par des virgules)</label>
                <Input value={editing.form.aliases} onChange={(e) => setF('aliases', e.target.value)} placeholder="abymes, guadeloupe" data-testid="zone-aliases" />
                <p className="text-[11px] text-gray-400 mt-1">Texte recherché dans l’adresse de l’utilisateur si aucune correspondance géographique.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div><label className="text-xs font-semibold text-gray-700 block mb-1">Ordre d’affichage</label><Input type="number" value={editing.form.display_order} onChange={(e) => setF('display_order', e.target.value)} data-testid="zone-order" /></div>
                <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                  <input type="checkbox" checked={editing.form.is_active} onChange={(e) => setF('is_active', e.target.checked)} data-testid="zone-active" /> Active
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)} data-testid="zone-cancel">Annuler</Button>
              <Button className="flex-1 bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={saveZone} data-testid="zone-save">Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Programmed shortcuts modal ── */}
      {programming && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setProgramming(null)} data-testid="program-dialog">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Lightning size={18} className="text-[#FF5000]" /> Raccourcis — {programming.zone.name}</h3>
              <button onClick={() => setProgramming(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Ces raccourcis s’affichent en tête de l’accueil dans cette zone. Une planification optionnelle les rend visibles seulement à certains jours/heures.</p>

            <div className="space-y-3">
              {programming.entries.map((e, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3" data-testid={`entry-${idx}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${e.service.bg || 'bg-slate-100'} flex items-center justify-center`}>
                      <DynamicIcon name={e.service.iconName} imageUrl={e.service.imageUrl} size={20} className={e.service.iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm truncate">{e.service.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{e.service.path}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveEntry(idx, -1)} className="p-1 text-gray-400 hover:text-gray-700" data-testid={`up-${idx}`}><ArrowUp size={15} /></button>
                      <button onClick={() => moveEntry(idx, 1)} className="p-1 text-gray-400 hover:text-gray-700" data-testid={`down-${idx}`}><ArrowDown size={15} /></button>
                      <button onClick={() => removeEntry(idx)} className="p-1 text-red-500 hover:text-red-700" data-testid={`remove-${idx}`}><Trash size={15} /></button>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <input type="checkbox" checked={!!e.schedule.enabled} onChange={(ev) => setSched(idx, 'enabled', ev.target.checked)} data-testid={`sched-enabled-${idx}`} />
                      <Clock size={13} /> Planifier l’affichage
                    </label>
                    {e.schedule.enabled && (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {DAYS.map((d) => (
                            <button key={d.v} onClick={() => toggleDay(idx, d.v)} data-testid={`day-${idx}-${d.v}`}
                              className={`px-2 py-1 rounded text-[11px] font-medium border ${(e.schedule.days || []).includes(d.v) ? 'bg-[#FF5000] text-white border-[#FF5000]' : 'bg-white text-gray-600 border-gray-200'}`}>
                              {d.l}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="text-[11px] text-gray-500 block">Heure début</label><Input type="time" value={e.schedule.start_time || ''} onChange={(ev) => setSched(idx, 'start_time', ev.target.value)} data-testid={`start-time-${idx}`} /></div>
                          <div><label className="text-[11px] text-gray-500 block">Heure fin</label><Input type="time" value={e.schedule.end_time || ''} onChange={(ev) => setSched(idx, 'end_time', ev.target.value)} data-testid={`end-time-${idx}`} /></div>
                          <div><label className="text-[11px] text-gray-500 block">Date début</label><Input type="date" value={e.schedule.start_date || ''} onChange={(ev) => setSched(idx, 'start_date', ev.target.value)} /></div>
                          <div><label className="text-[11px] text-gray-500 block">Date fin</label><Input type="date" value={e.schedule.end_date || ''} onChange={(ev) => setSched(idx, 'end_date', ev.target.value)} /></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {programming.entries.length === 0 && <div className="text-center text-gray-400 text-sm py-6">Aucun raccourci. Ajoutez-en ci-dessous.</div>}
            </div>

            <Button variant="outline" className="w-full mt-3" onClick={() => setPickerOpen(true)} data-testid="add-service-btn">
              <Plus size={15} className="mr-1" /> Ajouter un service
            </Button>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setProgramming(null)} data-testid="program-cancel">Annuler</Button>
              <Button className="flex-1 bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={saveProgram} data-testid="program-save">Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service picker ── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setPickerOpen(false)} data-testid="service-picker">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Choisir un service</h3>
              <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {catalog.map((s) => (
                <button key={s.id} onClick={() => addService(s)} data-testid={`pick-${s.id}`}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-100 hover:border-[#FF5000] hover:bg-orange-50 transition-colors">
                  <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                    <DynamicIcon name={s.iconName} imageUrl={s.imageUrl} size={20} className={s.iconColor} />
                  </div>
                  <span className="text-[10px] font-medium text-gray-700 text-center leading-tight line-clamp-2">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminZones;
