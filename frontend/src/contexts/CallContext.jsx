import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Phone, PhoneX, PhoneCall, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { callsAPI } from '../services/api';

const API = process.env.REACT_APP_BACKEND_URL;
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const RING_TIMEOUT_MS = 30000;

const CallContext = createContext(null);
export const useCall = () => useContext(CallContext) || { startCall: () => {} };

/**
 * Appels masqués in-app (WebRTC) + repli relais Twilio (numéros masqués, façon Bolt).
 * Utilise un canal WebSocket DÉDIÉ (`call_{userId}`) pour ne pas entrer en conflit
 * avec les sockets de page existants.
 */
export const CallProvider = ({ children }) => {
  const { user } = useAuth();
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingIce = useRef([]);
  const pendingOffer = useRef(null);
  const ringTimer = useRef(null);
  const ctxRef = useRef({}); // { rideId, peerChannel, callId, peerName, relayAvailable }

  const [state, setState] = useState('idle'); // idle|calling|incoming|connecting|in-call|ended
  const [peerName, setPeerName] = useState('');
  const [canRelay, setCanRelay] = useState(false);
  const [muted, setMuted] = useState(false);

  const wsSend = useCallback((data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }, []);

  const cleanup = useCallback(() => {
    clearTimeout(ringTimer.current);
    try { pcRef.current?.close(); } catch { /* noop */ }
    pcRef.current = null;
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    localStreamRef.current = null;
    pendingIce.current = [];
    pendingOffer.current = null;
    setMuted(false);
  }, []);

  const endCall = useCallback((notifyPeer = true) => {
    if (notifyPeer && ctxRef.current.peerChannel) {
      wsSend({ type: 'call_hangup', to: ctxRef.current.peerChannel, call_id: ctxRef.current.callId });
    }
    cleanup();
    setState('idle');
    ctxRef.current = {};
  }, [cleanup, wsSend]);

  const buildPc = useCallback((peerChannel, callId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = (e) => {
      if (e.candidate) wsSend({ type: 'call_ice', to: peerChannel, call_id: callId, candidate: e.candidate });
    };
    pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      if (['connected'].includes(pc.connectionState)) {
        clearTimeout(ringTimer.current);
        setState('in-call');
        if (ctxRef.current.rideId) callsAPI.markConnected?.(ctxRef.current.rideId).catch(() => {});
      }
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && state === 'in-call') {
        endCall(false);
      }
    };
    pcRef.current = pc;
    return pc;
  }, [wsSend, state, endCall]);

  const getMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  };

  const offerRelay = useCallback(async () => {
    const { rideId } = ctxRef.current;
    if (!rideId) return;
    try {
      const { data } = await callsAPI.relay(rideId);
      toast.success(`Mise en relation — votre téléphone va sonner (n° masqué ${data.masked_number || ''}).`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Relais téléphonique indisponible.');
    }
    endCall(false);
  }, [endCall]);

  const handleNoAnswer = useCallback(async () => {
    const { rideId } = ctxRef.current;
    if (!rideId) return;
    try {
      const { data } = await callsAPI.markFailed(rideId);
      if (data.use_relay && ctxRef.current.relayAvailable) {
        setState('ended');
        setCanRelay(true);
        toast('Pas de réponse. Vous pouvez être mis en relation par téléphone (n° masqué).');
        return;
      }
    } catch { /* noop */ }
    toast('Pas de réponse.');
    endCall(false);
  }, [endCall]);

  /* ── Lancer un appel sortant ── */
  const startCall = useCallback(async (rideId) => {
    if (state !== 'idle') return;
    try {
      const { data } = await callsAPI.initiate(rideId);
      ctxRef.current = { rideId, peerChannel: data.peer_channel, callId: data.call_id, peerName: data.counterpart_name, relayAvailable: data.relay_available };
      setPeerName(data.counterpart_name || 'Contact');
      setCanRelay(false);
      if (data.mode === 'relay') {
        setState('ended'); setCanRelay(Boolean(data.relay_available));
        if (data.relay_available) { toast('Appel par téléphone (numéro masqué).'); }
        else { toast.error('Correspondant injoignable.'); }
        return;
      }
      if (!data.counterpart_online && !data.relay_available) {
        toast.error('Correspondant hors ligne. Réessayez plus tard.');
        setState('idle'); return;
      }
      setState('calling');
      const pc = buildPc(data.peer_channel, data.call_id);
      const stream = await getMic();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsSend({ type: 'call_offer', to: data.peer_channel, call_id: data.call_id, sdp: offer });
      ringTimer.current = setTimeout(handleNoAnswer, RING_TIMEOUT_MS);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Impossible de démarrer l'appel.");
      cleanup(); setState('idle');
    }
  }, [state, buildPc, wsSend, handleNoAnswer, cleanup]);

  /* ── Accepter un appel entrant ── */
  const acceptIncoming = useCallback(async () => {
    const { peerChannel, callId } = ctxRef.current;
    try {
      setState('connecting');
      const pc = buildPc(peerChannel, callId);
      const stream = await getMic();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      wsSend({ type: 'call_accept', to: peerChannel, call_id: callId });
      if (pendingOffer.current) {
        await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
        for (const c of pendingIce.current) { try { await pc.addIceCandidate(c); } catch { /* noop */ } }
        pendingIce.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsSend({ type: 'call_answer', to: peerChannel, call_id: callId, sdp: answer });
      }
    } catch (e) {
      toast.error("Échec de la connexion audio.");
      endCall(true);
    }
  }, [buildPc, wsSend, endCall]);

  const declineIncoming = useCallback(() => {
    wsSend({ type: 'call_decline', to: ctxRef.current.peerChannel, call_id: ctxRef.current.callId });
    cleanup(); setState('idle'); ctxRef.current = {};
  }, [wsSend, cleanup]);

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    const next = !muted;
    tracks.forEach((t) => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  /* ── WebSocket signaling (canal dédié) ── */
  useEffect(() => {
    if (!user?.id) return undefined;
    let closed = false;
    const url = `${API.replace('https://', 'wss://').replace('http://', 'ws://')}/api/ws/call_${user.id}`;
    let ws;
    const connect = () => {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = async (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        const pc = pcRef.current;
        if (msg.type === 'call_incoming') {
          if (state !== 'idle') { wsSend({ type: 'call_decline', to: msg.from, call_id: msg.call_id }); return; }
          ctxRef.current = { rideId: msg.ride_id, peerChannel: msg.from, callId: msg.call_id, peerName: msg.from_name };
          setPeerName(msg.from_name || 'Contact');
          setState('incoming');
        } else if (msg.type === 'call_offer') {
          if (pc && pc.signalingState !== 'closed') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            for (const c of pendingIce.current) { try { await pc.addIceCandidate(c); } catch { /* noop */ } }
            pendingIce.current = [];
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsSend({ type: 'call_answer', to: msg.from, call_id: msg.call_id, sdp: answer });
          } else {
            pendingOffer.current = msg.sdp;
          }
        } else if (msg.type === 'call_answer') {
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        } else if (msg.type === 'call_ice') {
          const cand = new RTCIceCandidate(msg.candidate);
          if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(cand); } catch { /* noop */ } }
          else pendingIce.current.push(cand);
        } else if (msg.type === 'call_decline') {
          clearTimeout(ringTimer.current);
          if (ctxRef.current.relayAvailable) { setState('ended'); setCanRelay(true); toast('Appel refusé.'); }
          else { toast('Appel refusé.'); endCall(false); }
        } else if (msg.type === 'call_hangup') {
          endCall(false);
        }
      };
      ws.onclose = () => { if (!closed) setTimeout(connect, 3000); };
      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    };
    connect();
    return () => { closed = true; try { ws?.close(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const showOverlay = state !== 'idle';

  return (
    <CallContext.Provider value={{ startCall, callState: state }}>
      {children}
      <audio ref={remoteAudioRef} autoPlay data-testid="call-remote-audio" />
      {showOverlay && (
        <div className="fixed inset-0 z-[4000] bg-[#10101a]/95 flex flex-col items-center justify-center text-white" data-testid="call-overlay">
          <div className="w-24 h-24 rounded-full bg-[#FF5000]/20 flex items-center justify-center mb-5">
            <PhoneCall size={44} weight="fill" className="text-[#FF5000]" />
          </div>
          <p className="text-xl font-extrabold" data-testid="call-peer-name">{peerName || 'Contact'}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-300">
            <ShieldCheck size={14} weight="fill" /> Appel masqué — numéro protégé
          </div>
          <p className="text-sm text-gray-400 mt-3" data-testid="call-state-label">
            {state === 'calling' && 'Appel en cours…'}
            {state === 'incoming' && 'Appel entrant…'}
            {state === 'connecting' && 'Connexion…'}
            {state === 'in-call' && 'En communication'}
            {state === 'ended' && 'Appel terminé'}
          </p>

          <div className="flex items-center gap-5 mt-10">
            {state === 'incoming' ? (
              <>
                <button onClick={declineIncoming} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center" data-testid="call-decline-btn"><PhoneX size={26} weight="fill" /></button>
                <button onClick={acceptIncoming} className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center" data-testid="call-accept-btn"><Phone size={26} weight="fill" /></button>
              </>
            ) : state === 'ended' ? (
              <div className="flex flex-col items-center gap-3">
                {canRelay && (
                  <button onClick={offerRelay} className="px-6 py-3 rounded-full bg-[#FF5000] font-bold flex items-center gap-2" data-testid="call-relay-btn">
                    <Phone size={18} weight="fill" /> Mise en relation par téléphone (masqué)
                  </button>
                )}
                <button onClick={() => endCall(false)} className="text-gray-400 text-sm" data-testid="call-close-btn">Fermer</button>
              </div>
            ) : (
              <>
                {(state === 'in-call') && (
                  <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? 'bg-white text-[#10101a]' : 'bg-white/10'}`} data-testid="call-mute-btn">
                    {muted ? 'Muet' : 'Micro'}
                  </button>
                )}
                <button onClick={() => endCall(true)} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center" data-testid="call-hangup-btn"><PhoneX size={26} weight="fill" /></button>
              </>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
};

export default CallProvider;
