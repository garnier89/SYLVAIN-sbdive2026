/**
 * SafetyRecorder — driver-side audio recording for safety during a ride/job.
 * Records via MediaRecorder, uploads to object storage, and lists clips for the
 * current ride with authenticated playback. Driver-controlled (start/stop).
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Microphone, Stop, ShieldCheck, Spinner } from '@phosphor-icons/react';
import { safetyAudioAPI } from '../services/api';
import api from '../services/api';

const fmt = (s) => {
  const m = Math.floor((s || 0) / 60);
  const sec = Math.floor((s || 0) % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export const SafetyRecorder = ({ rideId, kind = 'ride' }) => {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [clips, setClips] = useState([]);
  const [playingId, setPlayingId] = useState(null);

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startTsRef = useRef(0);
  const audioRef = useRef(null);

  const loadClips = useCallback(async () => {
    if (!rideId) return;
    try { setClips((await safetyAudioAPI.listForRide(rideId)).data || []); } catch { /* noop */ }
  }, [rideId]);

  useEffect(() => { loadClips(); }, [loadClips]);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const dur = Math.round((Date.now() - startTsRef.current) / 1000);
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        setUploading(true);
        try {
          await safetyAudioAPI.upload(blob, { ride_id: rideId, kind, duration_sec: dur });
          toast.success('Enregistrement sécurité sauvegardé');
          loadClips();
        } catch (e) {
          toast.error(e?.response?.data?.detail || 'Échec de la sauvegarde');
        } finally { setUploading(false); }
      };
      mr.start();
      mediaRef.current = mr;
      startTsRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } catch (e) {
      toast.error('Micro indisponible — autorisez l\'accès au microphone');
    }
  };

  const stop = () => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const play = async (clip) => {
    try {
      setPlayingId(clip.id);
      const res = await api.get(`/safety/audio/${clip.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch { toast.error('Lecture impossible'); setPlayingId(null); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid="safety-recorder">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={18} weight="fill" className="text-emerald-600" />
        <h3 className="font-bold text-sm text-[#0B1426]">Enregistrement sécurité</h3>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
        En cas de besoin, enregistrez l'audio de votre course pour votre sécurité. Les clips sont chiffrés et accessibles par l'assistance.
      </p>

      {!recording ? (
        <button onClick={start} disabled={uploading} data-testid="safety-record-btn"
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl py-3 font-bold disabled:opacity-50 active:scale-[0.98] transition-transform">
          {uploading ? <Spinner size={18} className="animate-spin" /> : <Microphone size={18} weight="fill" />}
          {uploading ? 'Sauvegarde…' : 'Démarrer l\'enregistrement'}
        </button>
      ) : (
        <button onClick={stop} data-testid="safety-stop-btn"
          className="w-full flex items-center justify-center gap-2 bg-red-600 text-white rounded-xl py-3 font-bold active:scale-[0.98] transition-transform">
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          <Stop size={18} weight="fill" /> Arrêter · {fmt(elapsed)}
        </button>
      )}

      {clips.length > 0 && (
        <div className="mt-3 space-y-1.5" data-testid="safety-clips">
          {clips.map((c) => (
            <button key={c.id} onClick={() => play(c)} data-testid={`safety-clip-${c.id}`}
              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">
              {playingId === c.id ? <Spinner size={15} className="animate-spin text-emerald-600" /> : <Microphone size={15} className="text-gray-500" />}
              <span className="text-gray-700">Clip · {fmt(c.duration_sec)}</span>
              <span className="ml-auto text-[11px] text-gray-400">{new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SafetyRecorder;
