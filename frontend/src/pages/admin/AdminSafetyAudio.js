/**
 * AdminSafetyAudio — review safety audio recordings captured by drivers during
 * rides/jobs. Authenticated blob playback (recordings are private).
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Play, Pause, MagnifyingGlass } from '@phosphor-icons/react';
import { safetyAudioAPI } from '../../services/api';
import api from '../../services/api';

const fmt = (s) => {
  const m = Math.floor((s || 0) / 60);
  const sec = Math.floor((s || 0) % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const AdminSafetyAudio = () => {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rideFilter, setRideFilter] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = rideFilter ? { ride_id: rideFilter } : {};
      setRecordings((await safetyAudioAPI.adminList(params)).data || []);
    } catch { toast.error('Échec du chargement'); }
    finally { setLoading(false); }
  }, [rideFilter]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (rec) => {
    if (playingId === rec.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    try {
      if (audioRef.current) audioRef.current.pause();
      const res = await api.get(`/safety/audio/${rec.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      audio.play();
      setPlayingId(rec.id);
    } catch { toast.error('Lecture impossible'); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="admin-safety-audio-page">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={24} weight="fill" className="text-emerald-600" />
        <h1 className="text-xl font-black text-[#0B1426]">Enregistrements sécurité</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">Audio capturé par les chauffeurs pendant les courses/missions pour la sécurité.</p>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={rideFilter} onChange={(e) => setRideFilter(e.target.value)} placeholder="Filtrer par N° de course (ride_id)"
            data-testid="safety-ride-filter"
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-400 py-10 text-center">Chargement…</p> : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50" data-testid="safety-recordings-list">
          {recordings.length === 0 && <p className="p-8 text-center text-sm text-gray-400" data-testid="safety-empty">Aucun enregistrement.</p>}
          {recordings.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3" data-testid={`safety-rec-${r.id}`}>
              <button onClick={() => toggle(r)} data-testid={`safety-play-${r.id}`}
                className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                {playingId === r.id ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{r.driver_name || 'Chauffeur'} · {fmt(r.duration_sec)}</p>
                <p className="text-xs text-gray-400 truncate">
                  {r.kind === 'job' ? 'Mission' : 'Course'} {r.ride_id ? `· ${r.ride_id}` : ''} · {new Date(r.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
              <span className="ml-auto text-[11px] text-gray-400 shrink-0">{Math.round((r.size || 0) / 1024)} Ko</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminSafetyAudio;
