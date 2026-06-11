/**
 * SbSafetyPage — Student safety + Safe Ride Night.
 * Settings (auto-share, prioritise top-rated drivers), trusted contacts,
 * Safe Ride Night activation on the active ride, and recommended best-rated drivers.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CaretLeft, ShieldCheck, MoonStars, UserPlus, Trash, Star, ShareNetwork, Phone,
} from '@phosphor-icons/react';
import { studentAPI, rideAPI } from '../../services/api';

const BRAND = '#5B21B6';

const SbSafetyPage = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', relation: '' });

  const loadAll = () => {
    studentAPI.safetySettings().then((r) => setSettings(r.data)).catch(() => {});
    studentAPI.listContacts().then((r) => setContacts(r.data || [])).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);

  const toggle = async (key) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    try { await studentAPI.safetyUpdate({ [key]: next[key] }); } catch { toast.error('Échec'); }
  };

  const addContact = async () => {
    if (!form.name.trim() || !form.phone.trim()) return toast.error('Nom et téléphone requis');
    try { await studentAPI.addContact(form); toast.success('Contact ajouté'); setForm({ name: '', phone: '', relation: '' }); setShowAdd(false); loadAll(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };
  const removeContact = async (id) => { try { await studentAPI.removeContact(id); loadAll(); } catch { toast.error('Échec'); } };

  const startSafeRide = async () => {
    try {
      const a = await rideAPI.getActive();
      const ride = a.data?.ride || a.data;
      if (!ride || !ride.id) return toast.info('Aucune course active. Réservez une course puis activez Safe Ride Night.');
      const r = await studentAPI.safeRideStart(ride.id);
      if (r.data.needs_contact) toast.warning('Ajoutez un contact de confiance pour partager votre trajet.');
      // Share the live tracking link with the trusted contact.
      const url = r.data.share_url;
      if (navigator.share) { try { await navigator.share({ title: 'Mon trajet SB Drive', text: 'Suivez mon trajet en direct', url }); } catch { /* cancelled */ } }
      else { try { await navigator.clipboard.writeText(url); toast.success('Lien de suivi copié — envoyez-le à votre contact'); } catch { toast.success('Safe Ride Night activé'); } }
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de l\'activation'); }
  };

  const loadDrivers = () => {
    if (!navigator.geolocation) return toast.error('Géolocalisation indisponible');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try { const r = await studentAPI.recommendedDrivers(pos.coords.latitude, pos.coords.longitude); setDrivers(r.data.drivers || []); if (!r.data.drivers?.length) toast.info('Aucun chauffeur recommandé à proximité pour le moment.'); }
        catch { toast.error('Échec'); }
      },
      () => toast.error('Position indisponible'),
    );
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F5F3FF] pb-16" data-testid="sb-safety-page">
      <div className="text-white px-4 pt-6 pb-6 rounded-b-3xl" style={{ background: `linear-gradient(135deg, ${BRAND}, #7C3AED)` }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-3" data-testid="safety-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2"><ShieldCheck size={24} weight="fill" /><h1 className="text-xl font-black">Sécurité étudiante</h1></div>
        <p className="text-white/80 text-sm mt-1">Voyagez l'esprit tranquille, de jour comme de nuit.</p>
      </div>

      <div className="px-4 -mt-3 space-y-3">
        {/* Safe Ride Night */}
        <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="safe-ride-night-card">
          <div className="flex items-center gap-2 mb-1"><MoonStars size={20} weight="fill" className="text-indigo-500" /><p className="font-bold text-gray-900">Safe Ride Night</p></div>
          <p className="text-xs text-gray-500 mb-3">Pour vos trajets de nuit : chauffeurs les mieux notés priorisés, suivi en temps réel et partage automatique avec votre contact de confiance.</p>
          <button onClick={startSafeRide} className="w-full py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2" style={{ background: BRAND }} data-testid="safe-ride-start-btn">
            <ShareNetwork size={18} /> Activer sur ma course
          </button>
        </div>

        {/* Settings */}
        {settings && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3" data-testid="safety-settings">
            <Toggle label="Partage de trajet automatique" desc="Partager le suivi avec mes contacts de confiance" on={settings.auto_share} onClick={() => toggle('auto_share')} testid="toggle-auto-share" />
            <Toggle label="Prioriser les chauffeurs les mieux notés" desc="Vérification chauffeur renforcée" on={settings.prefer_top_drivers} onClick={() => toggle('prefer_top_drivers')} testid="toggle-top-drivers" />
          </div>
        )}

        {/* Trusted contacts */}
        <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="safety-contacts">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-gray-900">Contacts de confiance</p>
            <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-bold flex items-center gap-1" style={{ color: BRAND }} data-testid="contact-add-toggle"><UserPlus size={14} /> Ajouter</button>
          </div>
          {showAdd && (
            <div className="space-y-2 mb-3" data-testid="contact-form">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="contact-name" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Téléphone" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="contact-phone" />
              <button onClick={addContact} className="w-full py-2 rounded-lg font-bold text-white text-sm" style={{ background: BRAND }} data-testid="contact-save">Enregistrer</button>
            </div>
          )}
          {contacts.length === 0 ? <p className="text-xs text-gray-400">Aucun contact. Ajoutez une personne de confiance.</p> : contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1.5 border-t border-gray-50" data-testid={`contact-${c.id}`}>
              <span className="text-sm text-gray-700 flex items-center gap-1.5"><Phone size={13} className="text-gray-400" />{c.name} · {c.phone}</span>
              <button onClick={() => removeContact(c.id)} className="text-gray-300" data-testid={`contact-del-${c.id}`}><Trash size={16} /></button>
            </div>
          ))}
        </div>

        {/* Recommended drivers */}
        <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="recommended-drivers">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-gray-900">Chauffeurs recommandés</p>
            <button onClick={loadDrivers} className="text-xs font-bold" style={{ color: BRAND }} data-testid="load-drivers-btn">Près de moi</button>
          </div>
          {drivers.length === 0 ? <p className="text-xs text-gray-400">Touchez « Près de moi » pour voir les chauffeurs les mieux notés.</p> : drivers.map((d) => (
            <div key={d.driver_id} className="flex items-center justify-between py-1.5 border-t border-gray-50 text-sm">
              <span className="flex items-center gap-1.5"><Star size={14} weight="fill" className="text-amber-400" /> {d.rating} · {d.vehicle_type}</span>
              <span className="text-xs text-gray-400">{d.distance_km} km</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Toggle = ({ label, desc, on, onClick, testid }) => (
  <div className="flex items-center justify-between">
    <div className="pr-3"><p className="text-sm font-semibold text-gray-800">{label}</p><p className="text-[11px] text-gray-400">{desc}</p></div>
    <button onClick={onClick} data-testid={testid} className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${on ? '' : 'bg-gray-200'}`} style={on ? { background: BRAND } : {}}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  </div>
);

export default SbSafetyPage;
