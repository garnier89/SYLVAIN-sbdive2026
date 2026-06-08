import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TrendUp, MagnifyingGlass, ArrowUp, ArrowDown, X, Plus, PushPin } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { serviceTrendsAPI, homeCategoriesAPI } from '../../services/api';
import DynamicIcon from '../../components/DynamicIcon';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

// Map a home-category CMS tile to a pinned-trend item (shared shape with backend).
const toPinned = (c) => ({
  sid: c.id, name: clean(c.label_fr || c.label_en), path: c.target_route,
  icon_name: c.icon_name, image_url: c.image_url,
  bg_class: c.bg_class, icon_color_class: c.icon_color_class,
});

const AdminTrendingPinned = () => {
  const [pinned, setPinned] = useState([]);
  const [available, setAvailable] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([serviceTrendsAPI.adminGetPinned(), homeCategoriesAPI.adminList()]);
      setPinned(p.data.items || []);
      const cats = (c.data.items || c.data || [])
        .filter((x) => x.target_route && (x.label_fr || x.label_en) && !String(x.id).includes('more'))
        .map(toPinned);
      // dedup candidates by path
      const seen = new Set();
      setAvailable(cats.filter((x) => (seen.has(x.path) ? false : seen.add(x.path))));
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pinnedPaths = useMemo(() => new Set(pinned.map((p) => p.path)), [pinned]);
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available
      .filter((c) => !pinnedPaths.has(c.path))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.path.toLowerCase().includes(q));
  }, [available, pinnedPaths, search]);

  const addPin = (c) => { if (pinned.length >= 12) { toast.error('Maximum 12 services épinglés'); return; } setPinned((p) => [...p, c]); };
  const removePin = (path) => setPinned((p) => p.filter((x) => x.path !== path));
  const move = (i, dir) => setPinned((p) => {
    const j = i + dir; if (j < 0 || j >= p.length) return p;
    const next = [...p]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const save = async () => {
    setSaving(true);
    try { const r = await serviceTrendsAPI.adminSetPinned(pinned); setPinned(r.data.items || []); toast.success('Tendances épinglées enregistrées'); }
    catch (e) { toast.error('Échec de l’enregistrement'); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-6" data-testid="trending-pinned-page">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <TrendUp size={22} className="text-[#FF5000]" weight="fill" /> Tendances épinglées
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Choisissez les services à afficher <span className="font-semibold">en tête</span> de « Tendances près de vous ».
            Les épinglés apparaissent en premier, suivis des tendances <span className="font-semibold">automatiques</span> (basées sur l’usage réel).
          </p>
        </div>
        <Button className="bg-[#FF5000] hover:bg-[#e64800] text-white" onClick={save} disabled={saving} data-testid="save-pinned-btn">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {loading ? (
        <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pinned (ordered) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="pinned-list">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5 mb-3"><PushPin size={16} weight="fill" className="text-[#FF5000]" /> Épinglés ({pinned.length}/12)</p>
            {pinned.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center" data-testid="pinned-empty">Aucun service épinglé. Ajoutez-en depuis la liste à droite.</p>
            ) : (
              <div className="space-y-2">
                {pinned.map((p, i) => (
                  <div key={p.path} className="flex items-center gap-2 border border-gray-100 rounded-lg p-2" data-testid={`pinned-item-${p.sid}`}>
                    <span className="text-[11px] font-black text-white bg-[#FF5000] rounded w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className={`w-9 h-9 rounded-lg ${p.bg_class || 'bg-slate-100'} flex items-center justify-center shrink-0`}>
                      <DynamicIcon name={p.icon_name} imageUrl={p.image_url} size={18} className={p.icon_color_class} />
                    </span>
                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p><p className="text-[10px] text-gray-400 truncate">{p.path}</p></div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => move(i, -1)} disabled={i === 0} data-testid={`pin-up-${p.sid}`}><ArrowUp size={13} /></Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => move(i, 1)} disabled={i === pinned.length - 1} data-testid={`pin-down-${p.sid}`}><ArrowDown size={13} /></Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-600 border-red-200" onClick={() => removePin(p.path)} data-testid={`pin-remove-${p.sid}`}><X size={13} /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available services to add */}
          <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="candidate-list">
            <div className="relative mb-3">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un service…" className="pl-9 h-9 text-sm" data-testid="candidate-search" />
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
              {candidates.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">Aucun service disponible.</p>}
              {candidates.map((c) => (
                <button key={c.path} onClick={() => addPin(c)} data-testid={`candidate-${c.sid}`}
                  className="w-full flex items-center gap-2 border border-gray-100 hover:border-[#FF5000] rounded-lg p-2 text-left transition-colors">
                  <span className={`w-9 h-9 rounded-lg ${c.bg_class || 'bg-slate-100'} flex items-center justify-center shrink-0`}>
                    <DynamicIcon name={c.icon_name} imageUrl={c.image_url} size={18} className={c.icon_color_class} />
                  </span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p><p className="text-[10px] text-gray-400 truncate">{c.path}</p></div>
                  <Plus size={16} className="text-[#FF5000] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTrendingPinned;
