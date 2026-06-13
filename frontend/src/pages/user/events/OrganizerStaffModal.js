import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Copy, Trash, UserCircle, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { organizerAPI } from '../../../services/api';

/** Manage controller invite codes + active staff for the organizer. */
const OrganizerStaffModal = ({ events = [], onClose }) => {
  const [data, setData] = useState({ invites: [], members: [] });
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState(''); // '' = all events
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    organizerAPI.listStaff().then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      await organizerAPI.createStaff({ label: label.trim(), event_id: scope || undefined });
      toast.success('Code contrôleur créé');
      setLabel(''); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
    finally { setCreating(false); }
  };

  const copy = (code) => { navigator.clipboard?.writeText(code); toast.success(`Code ${code} copié`); };

  const revokeInvite = async (inv) => {
    if (!window.confirm(`Révoquer le code « ${inv.code} » ? Les contrôleurs liés perdront l'accès.`)) return;
    try { await organizerAPI.revokeStaffInvite(inv.id); toast.success('Code révoqué'); load(); } catch { toast.error('Erreur'); }
  };
  const revokeMember = async (m) => {
    try { await organizerAPI.revokeStaffMember(m.id); toast.success('Accès révoqué'); load(); } catch { toast.error('Erreur'); }
  };

  const activeInvites = data.invites.filter((i) => i.active);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" data-testid="staff-modal">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldCheck size={18} weight="fill" className="text-[#B91C1C]" /> Contrôleurs d'accès</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="staff-close"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Invitez des portiers à scanner les billets en parallèle, sans partager votre compte.</p>

        {/* Create */}
        <div className="bg-gray-50 rounded-2xl p-3 mb-4">
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Nom du contrôleur / poste</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Portier entrée A"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#B91C1C] mb-2" data-testid="staff-label-input" />
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Portée</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#B91C1C] mb-3 bg-white" data-testid="staff-scope-select">
            <option value="">Tous mes événements</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button onClick={create} disabled={creating} className="w-full bg-[#B91C1C] text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-60" data-testid="staff-create-btn">
            <Plus size={15} weight="bold" /> {creating ? '...' : 'Générer un code'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-red-200 border-t-[#B91C1C] rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Invites */}
            <p className="text-xs font-bold text-gray-700 mb-2">Codes d'invitation</p>
            {activeInvites.length === 0 ? (
              <p className="text-xs text-gray-400 mb-4" data-testid="no-invites">Aucun code actif. Générez-en un ci-dessus.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {activeInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-2.5" data-testid={`invite-${inv.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-[#B91C1C] tracking-wider" data-testid={`invite-code-${inv.id}`}>{inv.code}</span>
                        <span className="text-[10px] text-gray-400">· {inv.members} contrôleur(s)</span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{inv.label} • {inv.event_title || 'Tous les événements'}</p>
                    </div>
                    <button onClick={() => copy(inv.code)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center" data-testid={`copy-${inv.id}`}><Copy size={14} /></button>
                    <button onClick={() => revokeInvite(inv)} className="w-8 h-8 rounded-lg border border-red-200 text-red-500 flex items-center justify-center" data-testid={`revoke-invite-${inv.id}`}><Trash size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Members */}
            <p className="text-xs font-bold text-gray-700 mb-2">Contrôleurs actifs</p>
            {data.members.length === 0 ? (
              <p className="text-xs text-gray-400" data-testid="no-members">Personne n'a encore rejoint.</p>
            ) : (
              <div className="space-y-2">
                {data.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-2.5" data-testid={`member-${m.id}`}>
                    <UserCircle size={26} weight="duotone" className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{m.user_name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{m.event_title || 'Tous les événements'}</p>
                    </div>
                    <button onClick={() => revokeMember(m)} className="text-xs font-bold text-red-500 px-2" data-testid={`revoke-member-${m.id}`}>Retirer</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrganizerStaffModal;
