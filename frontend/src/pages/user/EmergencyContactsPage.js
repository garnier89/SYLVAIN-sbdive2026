import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash, Warning, PaperPlaneTilt, Phone, Shield } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const EmergencyContactsPage = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', relation: '' });
  const [sosLoading, setSosLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/phase1/emergency-contacts`, { credentials: 'include' });
      if (r.ok) setContacts(await r.json());
    } catch { toast.error('Erreur'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!form.name.trim() || !form.phone.trim()) return toast.error('Nom et telephone requis');
    try {
      const r = await fetch(`${API}/api/phase1/emergency-contacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error();
      toast.success('Contact ajoute');
      setForm({ name: '', phone: '', relation: '' });
      setAdding(false);
      load();
    } catch { toast.error('Erreur (max 5 contacts)'); }
  };

  const removeContact = async (id) => {
    try {
      await fetch(`${API}/api/phase1/emergency-contacts/${id}`, { method: 'DELETE', credentials: 'include' });
      setContacts((c) => c.filter((x) => x.id !== id));
      toast.success('Supprime');
    } catch { toast.error('Erreur'); }
  };

  const triggerSos = async () => {
    setSosLoading(true);
    try {
      let coords = {};
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation?.getCurrentPosition(res, rej, { timeout: 5000 }) || rej());
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch { /* no geoloc */ }
      const r = await fetch(`${API}/api/phase1/sos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...coords, message: 'Urgence declenchee depuis l app' }),
      });
      const d = await r.json();
      toast.success(`SOS envoye — ${d.contacts_count} contact(s) notifie(s) + Admin alerte`);
    } catch { toast.error('Erreur SOS'); }
    finally { setSosLoading(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-8" data-testid="emergency-contacts-page">
      <div className="bg-gradient-to-br from-red-500 to-rose-600 px-5 pt-6 pb-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-bold">Securite & Urgence</h1>
        </div>
        <button onClick={triggerSos} disabled={sosLoading}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 shadow-xl disabled:opacity-60"
          data-testid="sos-button">
          <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 animate-pulse">
            <Warning size={24} weight="fill" className="text-white" />
          </div>
          <div className="text-left flex-1">
            <p className="font-black text-red-600 text-base">{sosLoading ? 'Envoi...' : 'DECLENCHER SOS'}</p>
            <p className="text-[11px] text-gray-600">Notifie admin + vos contacts d'urgence + police 112</p>
          </div>
          <PaperPlaneTilt size={22} className="text-red-500" weight="fill" />
        </button>
      </div>

      <div className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800 flex items-center gap-2"><Shield size={18} className="text-red-500" weight="fill" />Contacts d'urgence</h2>
          {contacts.length < 5 && !adding && (
            <button onClick={() => setAdding(true)} className="text-sm text-[#FF4500] font-bold flex items-center gap-1" data-testid="add-contact-btn">
              <Plus size={14} weight="bold" /> Ajouter
            </button>
          )}
        </div>

        {adding && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-3" data-testid="add-contact-form">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom"
              className="w-full mb-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" data-testid="contact-name" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telephone (+33...)"
              className="w-full mb-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" data-testid="contact-phone" />
            <input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="Relation (optionnel)"
              className="w-full mb-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" data-testid="contact-relation" />
            <div className="flex gap-2">
              <button onClick={() => { setAdding(false); setForm({ name: '', phone: '', relation: '' }); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm">Annuler</button>
              <button onClick={addContact} className="flex-1 py-2.5 rounded-xl bg-[#FF4500] text-white font-bold text-sm" data-testid="save-contact-btn">Ajouter</button>
            </div>
          </div>
        )}

        {loading ? <p className="text-center text-gray-400 text-sm py-6">Chargement...</p> :
         contacts.length === 0 && !adding ? (
          <div className="bg-white rounded-2xl p-8 text-center" data-testid="empty-state">
            <p className="text-sm text-gray-500 mb-3">Aucun contact d'urgence</p>
            <button onClick={() => setAdding(true)} className="px-5 py-2.5 rounded-xl bg-[#FF4500] text-white font-bold text-sm">
              Ajouter mon premier contact
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`contact-${c.id}`}>
                <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Phone size={18} className="text-red-500" weight="fill" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 truncate">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.phone} {c.relation && `· ${c.relation}`}</p>
                </div>
                <button onClick={() => removeContact(c.id)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid={`remove-${c.id}`}>
                  <Trash size={14} className="text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmergencyContactsPage;
