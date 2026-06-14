import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UsersFour, Broadcast, CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { familyAPI } from '../../../services/api';

const FamilyJoinPage = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(null);
  const [sharing, setSharing] = useState(false);
  const watchId = useRef(null);

  useEffect(() => () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current); }, []);

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (!c) { toast.error('Saisissez le code'); return; }
    setJoining(true);
    try {
      const r = await familyAPI.join(c);
      setJoined(r.data);
      toast.success('Partage activé');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Code invalide'); }
    finally { setJoining(false); }
  };

  const toggleShare = () => {
    if (sharing) {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null; setSharing(false); toast('Partage arrêté'); return;
    }
    if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => { familyAPI.sharePing({ lat: p.coords.latitude, lng: p.coords.longitude, speed: (p.coords.speed || 0) * 3.6 }).catch(() => {}); },
      () => { toast.error('Position refusée'); setSharing(false); },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    setSharing(true); toast.success('Vous partagez votre position');
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="family-join-page">
      <div className="px-4 pt-4 pb-8 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#be185d,#db2777,#f43f5e)' }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/famille')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1"><h1 className="text-lg font-extrabold">Rejoindre un cercle</h1><p className="text-[11px] text-white/70">Partagez votre position avec vos proches</p></div>
        </div>
        <div className="bg-white/10 rounded-2xl p-4 flex items-center gap-3">
          <UsersFour size={28} weight="fill" />
          <p className="text-xs text-white/85">Saisissez le code d'invitation reçu d'un membre de votre famille pour relier votre compte.</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {!joined ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <label className="text-xs font-bold text-gray-500">Code d'invitation</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FAM-XXXXX"
              className="w-full mt-2 border border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest outline-none focus:border-pink-500"
              data-testid="join-code-input"
            />
            <button onClick={join} disabled={joining} className="w-full mt-4 bg-pink-600 text-white font-bold py-3 rounded-xl disabled:opacity-60" data-testid="join-submit-btn">
              {joining ? '...' : 'Rejoindre'}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="join-success">
            <CheckCircle size={48} weight="fill" className="text-emerald-500 mx-auto mb-3" />
            <p className="font-bold text-gray-900">Vous avez rejoint{joined.circle_name ? ` « ${joined.circle_name} »` : ''}</p>
            <p className="text-xs text-gray-500 mt-1">Activez le partage pour que vos proches vous localisent en temps réel.</p>
            <button onClick={toggleShare} className={`w-full mt-5 flex items-center justify-center gap-2 py-3 rounded-xl font-bold ${sharing ? 'bg-emerald-600 text-white' : 'bg-pink-600 text-white'}`} data-testid="join-share-toggle">
              <Broadcast size={18} weight="fill" /> {sharing ? 'Partage actif' : 'Partager ma position'}
            </button>
            <button onClick={() => navigate('/famille')} className="w-full mt-3 text-sm font-bold text-gray-500" data-testid="join-back-btn">Retour à Famille</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyJoinPage;
