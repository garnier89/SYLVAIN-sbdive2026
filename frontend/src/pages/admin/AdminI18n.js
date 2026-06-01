/**
 * Admin i18n labels page — CRUD translation keys.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Translate, Plus, Pencil, Warning } from '@phosphor-icons/react';
import api from '../../services/api';

export default function AdminI18n() {
  const [langs, setLangs] = useState([]);
  const [current, setCurrent] = useState('fr');
  const [labels, setLabels] = useState({});
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ key: '', value: '' });
  const [search, setSearch] = useState('');

  const loadLangs = async () => {
    try { const r = await api.get('/i18n/languages'); setLangs(r.data.items || []); }
    catch (e) { /* */ }
  };

  const loadLabels = async (lang) => {
    setLoading(true);
    try {
      const r = await api.get(`/i18n/${lang}`);
      setLabels(r.data.labels || {});
      // Load missing keys for non-FR languages
      if (lang !== 'fr') {
        const m = await api.get('/i18n/admin/missing', { params: { target_lang: lang, base_lang: 'fr' } });
        setMissing(m.data.missing || []);
      } else { setMissing([]); }
    } catch (e) { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadLangs(); }, []);
  useEffect(() => { loadLabels(current); }, [current]);

  const openCreate = () => { setEditing({}); setForm({ key: '', value: '' }); };
  const openEdit = (k, v) => { setEditing({ key: k }); setForm({ key: k, value: v }); };
  const fillMissing = (k) => { setEditing({}); setForm({ key: k, value: '' }); };

  const save = async () => {
    if (!form.key || !form.value) { toast.error('Clé et valeur requises'); return; }
    try {
      await api.post('/i18n/admin/labels', { lang: current, key: form.key, value: form.value });
      toast.success('Sauvegardé');
      setEditing(null);
      loadLabels(current);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (key) => {
    if (!window.confirm(`Supprimer "${key}" en ${current.toUpperCase()} ?`)) return;
    try {
      await api.delete(`/i18n/admin/labels/${current}/${encodeURIComponent(key)}`);
      toast.success('Supprimé');
      loadLabels(current);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const entries = Object.entries(labels).filter(([k, v]) => !search || k.toLowerCase().includes(search.toLowerCase()) || v.toLowerCase().includes(search.toLowerCase())).sort();

  return (
    <div className="p-6" data-testid="admin-i18n-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Translate size={28} weight="duotone" className="text-blue-600" /> Traductions (i18n)</h1>
          <p className="text-sm text-gray-500 mt-1">Modifier les libellés sans redéploiement</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2"><Plus size={18} weight="bold" /> Nouveau label</button>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">Langue :</span>
        {langs.map(l => (
          <button key={l.code} onClick={() => setCurrent(l.code)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${current === l.code ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`} data-testid={`lang-${l.code}`}>
            {l.flag} {l.name}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher clé ou valeur…" className="ml-auto border rounded px-3 py-1.5 text-sm w-64" />
      </div>

      {missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2"><Warning size={18} className="text-amber-600" /><strong className="text-amber-800">{missing.length} labels manquants en {current.toUpperCase()}</strong></div>
          <div className="flex flex-wrap gap-2">
            {missing.slice(0, 20).map(k => (
              <button key={k} onClick={() => fillMissing(k)} className="text-xs bg-white border border-amber-300 px-2 py-1 rounded hover:bg-amber-100" data-testid={`missing-${k}`}>{k}</button>
            ))}
            {missing.length > 20 && <span className="text-xs text-amber-700 self-center">+{missing.length - 20} autres…</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3 text-left">Clé</th><th className="text-left">Valeur ({current.toUpperCase()})</th><th className="text-right pr-4">Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="3" className="text-center text-gray-400 py-12">Chargement…</td></tr>}
            {!loading && entries.length === 0 && <tr><td colSpan="3" className="text-center text-gray-400 py-12">Aucun label.</td></tr>}
            {entries.map(([k, v]) => (
              <tr key={k} className="border-t hover:bg-blue-50/30">
                <td className="px-4 py-2 font-mono text-xs">{k}</td>
                <td>{v}</td>
                <td className="text-right pr-4 space-x-1">
                  <button onClick={() => openEdit(k, v)} className="p-1.5 rounded hover:bg-amber-50 text-amber-600"><Pencil size={14} /></button>
                  <button onClick={() => remove(k)} className="text-xs text-red-600 hover:underline">Suppr</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold mb-4">{editing?.key ? 'Modifier label' : 'Nouveau label'} ({current.toUpperCase()})</h2>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">Clé</label><input value={form.key} disabled={!!editing?.key} onChange={e => setForm({...form, key: e.target.value})} className="w-full border rounded px-3 py-2 mt-1 font-mono disabled:bg-gray-100" placeholder="ride.book" /></div>
              <div><label className="text-sm font-medium">Valeur</label><textarea value={form.value} onChange={e => setForm({...form, value: e.target.value})} rows={3} className="w-full border rounded px-3 py-2 mt-1" placeholder="Réserver une course" /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={save} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
