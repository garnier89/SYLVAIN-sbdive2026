import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { eventsAPI } from '../../services/api';
import { EVENT_CATEGORIES, fmtEventDate, fmtPrice, BLANK_PREMIUM_PASS } from '../user/events/eventsShared';
import PremiumPassFields from '../user/events/PremiumPassFields';

const EMPTY = {
  title: '', category: 'concert', description: '', image: '', venue_name: '', address: '',
  city: '', lat: '', lng: '', starts_at: '', ends_at: '', organizer_name: '',
  is_featured: false, status: 'active',
  tiers: [{ name: 'Standard', price: 0, quantity_total: 100 }],
  premium_pass: { ...BLANK_PREMIUM_PASS },
};

const toLocalInput = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 16); } catch { return ''; }
};

const AdminEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null | event object (with id for edit)
  const [stats, setStats] = useState(null);

  const load = () => {
    setLoading(true);
    eventsAPI.adminList().then((r) => setEvents(r.data.items || [])).catch(() => setEvents([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => setForm({ ...EMPTY, tiers: [{ ...EMPTY.tiers[0] }], premium_pass: { ...BLANK_PREMIUM_PASS } });
  const openEdit = (e) => setForm({
    ...e, lat: e.lat ?? '', lng: e.lng ?? '',
    starts_at: toLocalInput(e.starts_at), ends_at: toLocalInput(e.ends_at),
    tiers: (e.tiers || []).map((t) => ({ ...t })),
    premium_pass: { ...BLANK_PREMIUM_PASS, ...(e.premium_pass || {}) },
  });

  const save = async () => {
    if (!form.title || !form.starts_at) { toast.error('Titre et date de début requis'); return; }
    const payload = {
      ...form,
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      tiers: form.tiers.map((t) => ({ ...t, price: Number(t.price || 0), quantity_total: Number(t.quantity_total || 0) })),
      premium_pass: {
        ...form.premium_pass,
        price: Number(form.premium_pass.price || 0),
        quantity_total: Number(form.premium_pass.quantity_total || 0),
        perks: (Array.isArray(form.premium_pass.perks) ? form.premium_pass.perks : []).map((p) => String(p).trim()).filter(Boolean),
      },
    };
    try {
      if (form.id) await eventsAPI.adminUpdate(form.id, payload);
      else await eventsAPI.adminCreate(payload);
      toast.success('Événement enregistré');
      setForm(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (e) => {
    if (!window.confirm(`Supprimer « ${e.title} » ?`)) return;
    try { await eventsAPI.adminDelete(e.id); toast.success('Supprimé'); load(); } catch { toast.error('Erreur'); }
  };

  const viewStats = async (e) => {
    try { const r = await eventsAPI.adminAttendees(e.id); setStats({ event: e, ...r.data }); } catch { toast.error('Erreur stats'); }
  };

  const setTier = (i, k, v) => setForm((f) => ({ ...f, tiers: f.tiers.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));
  const addTier = () => setForm((f) => ({ ...f, tiers: [...f.tiers, { name: '', price: 0, quantity_total: 100 }] }));
  const delTier = (i) => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));

  return (
    <div className="p-6" data-testid="admin-events-page">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SB Événement</h1>
          <p className="text-sm text-gray-500">Gérer les événements, billets et statistiques</p>
        </div>
        <button onClick={openNew} className="bg-[#B91C1C] text-white font-bold px-4 py-2.5 rounded-lg" data-testid="new-event-btn">+ Nouvel événement</button>
      </div>

      {loading ? <p className="text-gray-400">Chargement...</p> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr><th className="p-3">Événement</th><th className="p-3">Catégorie</th><th className="p-3">Date</th><th className="p-3">Billets</th><th className="p-3">Statut</th><th className="p-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const sold = (e.tiers || []).reduce((s, t) => s + (t.quantity_sold || 0), 0);
                const total = (e.tiers || []).reduce((s, t) => s + (t.quantity_total || 0), 0);
                return (
                  <tr key={e.id} className="border-t" data-testid={`row-${e.id}`}>
                    <td className="p-3 font-semibold text-gray-900">{e.title}{e.is_featured && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">À la une</span>}</td>
                    <td className="p-3 text-gray-600">{EVENT_CATEGORIES.find((c) => c.slug === e.category)?.label || e.category}</td>
                    <td className="p-3 text-gray-600">{fmtEventDate(e.starts_at)}</td>
                    <td className="p-3 text-gray-600">{sold}/{total}</td>
                    <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${e.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{e.status}</span></td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button onClick={() => viewStats(e)} className="text-indigo-600 font-semibold mr-3" data-testid={`stats-${e.id}`}>Stats</button>
                      <button onClick={() => openEdit(e)} className="text-blue-600 font-semibold mr-3" data-testid={`edit-${e.id}`}>Éditer</button>
                      <button onClick={() => remove(e)} className="text-red-600 font-semibold" data-testid={`del-${e.id}`}>Suppr.</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Form modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="event-form">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <h2 className="text-lg font-bold mb-4">{form.id ? 'Éditer' : 'Nouvel'} événement</h2>
            <div className="space-y-3">
              <Field label="Titre"><input className="inp" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="f-title" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Catégorie">
                  <select className="inp" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="f-category">
                    {EVENT_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Statut">
                  <select className="inp" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="f-status">
                    <option value="active">active</option><option value="draft">draft</option>
                  </select>
                </Field>
              </div>
              <Field label="Description"><textarea className="inp" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Image (URL)"><input className="inp" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lieu"><input className="inp" value={form.venue_name} onChange={(e) => setForm({ ...form, venue_name: e.target.value })} /></Field>
                <Field label="Ville"><input className="inp" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              </div>
              <Field label="Adresse"><input className="inp" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude"><input className="inp" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></Field>
                <Field label="Longitude"><input className="inp" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Début"><input type="datetime-local" className="inp" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} data-testid="f-starts" /></Field>
                <Field label="Fin"><input type="datetime-local" className="inp" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
              </div>
              <Field label="Organisateur"><input className="inp" value={form.organizer_name} onChange={(e) => setForm({ ...form, organizer_name: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> Mettre à la une</label>

              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2"><p className="font-bold text-sm">Billets</p><button onClick={addTier} className="text-[#B91C1C] text-xs font-bold">+ Ajouter</button></div>
                {form.tiers.map((t, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input className="inp flex-1" placeholder="Nom" value={t.name} onChange={(e) => setTier(i, 'name', e.target.value)} data-testid={`tier-name-${i}`} />
                    <input className="inp w-20" type="number" placeholder="Prix" value={t.price} onChange={(e) => setTier(i, 'price', e.target.value)} data-testid={`tier-price-${i}`} />
                    <input className="inp w-20" type="number" placeholder="Qté" value={t.quantity_total} onChange={(e) => setTier(i, 'quantity_total', e.target.value)} data-testid={`tier-qty-${i}`} />
                    {form.tiers.length > 1 && <button onClick={() => delTier(i)} className="text-red-500 text-lg px-1">×</button>}
                  </div>
                ))}
              </div>
              <PremiumPassFields value={form.premium_pass} onChange={(pp) => setForm({ ...form, premium_pass: pp })} inputClass="inp" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={save} className="flex-1 bg-[#B91C1C] text-white font-bold py-2.5 rounded-lg" data-testid="save-event-btn">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats modal */}
      {stats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setStats(null)} data-testid="stats-modal">
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">{stats.event.title}</h2>
            <p className="text-xs text-gray-500 mb-4">Participants & ventes</p>
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <Stat label="Commandes" value={stats.stats.orders} />
              <Stat label="Places" value={stats.stats.seats} />
              <Stat label="Recette" value={fmtPrice(stats.stats.revenue)} />
            </div>
            <div className="max-h-60 overflow-y-auto divide-y">
              {stats.tickets.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">Aucun participant</p> :
                stats.tickets.map((t) => (
                  <div key={t.id} className="flex justify-between py-2 text-sm">
                    <span className="text-gray-700">{t.tier_name} × {t.quantity}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'valid' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                  </div>
                ))}
            </div>
            <button onClick={() => setStats(null)} className="w-full mt-4 bg-gray-100 font-bold py-2.5 rounded-lg">Fermer</button>
          </div>
        </div>
      )}

      <style>{`.inp{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font-size:14px;outline:none}.inp:focus{border-color:#B91C1C}`}</style>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div><label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>{children}</div>
);
const Stat = ({ label, value }) => (
  <div className="bg-gray-50 rounded-xl py-3"><p className="text-lg font-extrabold text-gray-900">{value}</p><p className="text-[10px] text-gray-400">{label}</p></div>
);

export default AdminEvents;
