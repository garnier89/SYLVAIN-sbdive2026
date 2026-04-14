import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, UsersFour, Briefcase, Plus, Phone, Trash, Copy, NavigationArrow } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const TrackingServicePage = () => {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [activeTab, setActiveTab] = useState('family');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', relationship: 'family' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const res = await fetch(`${API}/api/tracking/members`, { credentials: 'include' });
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.name) return;
    try {
      const res = await fetch(`${API}/api/tracking/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: form.name, phone: form.phone, relationship: activeTab })
      });
      if (res.ok) {
        const member = await res.json();
        setMembers(prev => [...prev, member]);
        setForm({ name: '', phone: '', relationship: 'family' });
        setShowAdd(false);
      }
    } catch (e) { console.error(e); }
  };

  const handleRemove = async (memberId) => {
    try {
      await fetch(`${API}/api/tracking/members/${memberId}`, { method: 'DELETE', credentials: 'include' });
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (e) { console.error(e); }
  };

  const filteredMembers = members.filter(m => m.relationship === activeTab);

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="tracking-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-yellow-500 to-amber-500 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white">Suivi en temps réel</h1>
        </div>
        <p className="text-sm text-white/80">Suivez vos proches et employés en temps réel</p>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 flex gap-2">
        <button onClick={() => setActiveTab('family')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${activeTab === 'family' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
          data-testid="tab-family">
          <UsersFour size={16} /> Famille
        </button>
        <button onClick={() => setActiveTab('employee')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${activeTab === 'employee' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
          data-testid="tab-employee">
          <Briefcase size={16} /> Employés
        </button>
      </div>

      <div className="px-4 pb-6">
        {/* Map placeholder */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4" data-testid="tracking-map">
          <div className="h-48 bg-gray-100 flex items-center justify-center relative">
            <div className="text-center">
              <NavigationArrow size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Carte de suivi en temps réel</p>
              <p className="text-[10px] text-gray-300 mt-1">Les positions apparaîtront ici</p>
            </div>
            {filteredMembers.filter(m => m.last_lat).map(m => (
              <div key={m.id} className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow">
                  {m.name?.charAt(0)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Members List */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">
            {activeTab === 'family' ? 'Membres de la famille' : 'Employés'} ({filteredMembers.length})
          </h3>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium"
            data-testid="add-member-btn">
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {/* Add Member Form */}
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 border border-yellow-200 mb-3" data-testid="add-member-form">
            <h4 className="text-sm font-bold text-gray-900 mb-3">
              Ajouter {activeTab === 'family' ? 'un membre' : 'un employé'}
            </h4>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="Nom complet"
                data-testid="member-name" />
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="Numéro de téléphone"
                data-testid="member-phone" />
              <div className="flex gap-2">
                <button onClick={handleAdd}
                  className="flex-1 bg-yellow-500 text-white py-2.5 rounded-xl text-sm font-semibold"
                  data-testid="confirm-add-member">
                  Ajouter
                </button>
                <button onClick={() => setShowAdd(false)}
                  className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-semibold">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Members */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-400">Chargement...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              {activeTab === 'family' ? (
                <UsersFour size={48} className="text-gray-300 mx-auto mb-3" />
              ) : (
                <Briefcase size={48} className="text-gray-300 mx-auto mb-3" />
              )}
              <p className="text-sm text-gray-400">Aucun membre ajouté</p>
              <p className="text-[10px] text-gray-300 mt-1">Ajoutez des personnes pour les suivre</p>
            </div>
          ) : filteredMembers.map(member => (
            <div key={member.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3"
              data-testid={`member-${member.id}`}>
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-yellow-700">{member.name?.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{member.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${member.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {member.status === 'active' ? 'En ligne' : 'En attente'}
                  </span>
                  {member.phone && <span className="text-[10px] text-gray-400">{member.phone}</span>}
                </div>
                {member.pairing_code && (
                  <p className="text-[9px] text-gray-300 mt-0.5">Code: {member.pairing_code}</p>
                )}
              </div>
              <button onClick={() => handleRemove(member.id)}
                className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0"
                data-testid={`remove-${member.id}`}>
                <Trash size={14} className="text-red-400" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrackingServicePage;
