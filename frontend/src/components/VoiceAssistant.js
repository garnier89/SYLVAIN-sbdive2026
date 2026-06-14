import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Microphone, X, Sparkle, Car, MapPin, ForkKnife, ArrowRight, CheckCircle, Storefront } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';
import { rideAPI } from '../services/api';
import { resolveLocation } from '../lib/userLocation';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const EXAMPLES = [
  'Réserve-moi un taxi de Fort-de-France à Schoelcher',
  'Commande-moi des sushis',
  'Trouve-moi un coiffeur près de moi',
  'Téléconsultation médicale rapide',
  'Mon portefeuille',
];

// Intent → libellé FR pour le bouton de navigation simple.
const NAV_LABELS = {
  '/runner': 'Coursier Express', '/parcel': 'Livraison Colis', '/beauty': 'Beauté',
  '/pet-care': 'Services Animaux', '/car-care': 'Entretien Auto', '/towing': 'Dépannage',
  '/carpool': 'Covoiturage', '/video-consult': 'Téléconsultation', '/parking': 'Parking',
  '/marketplace': 'Marketplace', '/nearby': 'Autour de moi', '/wallet': 'Mon portefeuille',
  '/history': 'Mes courses', '/safety': 'Sécurité / SOS', '/ride': 'Réserver un taxi',
  '/food': 'Commander à manger',
};

const VoiceAssistant = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [phase, setPhase] = useState('input'); // input | preparing | action | executing
  const [action, setAction] = useState(null);
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recognitionRef = useRef(null);
  const finalRef = useRef('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return undefined; }
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      let interim = '';
      let finalText = finalRef.current;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      finalRef.current = finalText;
      setTranscript((finalText + ' ' + interim).trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') toast.error('Micro non autorisé');
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => { try { rec.abort(); } catch { /* noop */ } };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      finalRef.current = '';
      setTranscript('');
      setAction(null);
      setPhase('input');
      recognitionRef.current.start();
      setListening(true);
    } catch { /* already started */ }
  }, []);

  const stop = useCallback(() => {
    try { recognitionRef.current && recognitionRef.current.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  // ── Repli MediaRecorder → Whisper (navigateurs sans Web Speech API : iOS/Safari) ──
  const uploadAudio = useCallback(async (blob, ext) => {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append('file', blob, `voice.${ext}`);
      const r = await axios.post(`${API_URL}/api/voice/transcribe`, form, { withCredentials: true });
      const text = (r.data?.transcript || '').trim();
      if (text) { setTranscript(text); finalRef.current = text; }
      else toast.error('Je n\'ai rien entendu, réessayez');
    } catch {
      toast.error('Transcription impossible, réessayez');
    }
    setTranscribing(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size > 0) uploadAudio(blob, ext);
        setRecording(false);
      };
      mediaRecorderRef.current = mr;
      setTranscript('');
      finalRef.current = '';
      setAction(null);
      setPhase('input');
      mr.start();
      setRecording(true);
    } catch {
      toast.error('Micro non autorisé');
    }
  }, [uploadAudio]);

  const stopRecording = useCallback(() => {
    try { mediaRecorderRef.current && mediaRecorderRef.current.stop(); } catch { /* noop */ }
  }, []);

  const submitTranscript = useCallback(async () => {
    const text = (transcript || '').trim();
    if (!text) { toast.error('Aucune phrase détectée'); return; }
    setPhase('preparing');
    try {
      const loc = resolveLocation();
      const r = await axios.post(`${API_URL}/api/voice/prepare`,
        { transcript: text, current_lat: loc?.lat, current_lng: loc?.lng },
        { withCredentials: true });
      const act = r.data.action;
      if (!act || act.type === 'unknown') {
        toast.error('Je n\'ai pas compris. Essayez « Réserve un taxi de X à Y » ou « Commande des sushis ».');
        setPhase('input');
        return;
      }
      setAction(act);
      setPhase('action');
    } catch {
      toast.error('Erreur de traitement, réessayez');
      setPhase('input');
    }
  }, [transcript]);

  const onClose = () => {
    stop();
    setOpen(false);
    setTimeout(() => { setTranscript(''); finalRef.current = ''; setAction(null); setPhase('input'); }, 300);
  };

  // ── Exécution ──
  const confirmTaxi = useCallback(async () => {
    if (!action?.pickup || !action?.dropoff) return;
    setPhase('executing');
    try {
      const { data } = await rideAPI.create({
        pickup_lat: action.pickup.lat, pickup_lng: action.pickup.lng, pickup_address: action.pickup.address,
        dropoff_lat: action.dropoff.lat, dropoff_lng: action.dropoff.lng, dropoff_address: action.dropoff.address,
        vehicle_type: action.vehicle_type || 'sb', payment_method: 'cash', ride_type: 'instant',
      });
      toast.success('Course commandée — recherche d\'un chauffeur');
      onClose();
      navigate(`/ride/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Impossible de commander la course');
      setPhase('action');
    }
  }, [action, navigate]);

  const confirmFood = useCallback(() => {
    const mid = action?.product?.merchant_id || action?.merchant?.id;
    onClose();
    if (mid) navigate(`/food/${mid}`, { state: { source: 'voice', highlight: action?.product?.id } });
    else navigate('/food', { state: { source: 'voice', query: action?.query } });
  }, [action, navigate]);

  const doNavigate = useCallback(() => {
    const route = action?.route || '/';
    onClose();
    navigate(route, { state: { prefill: action?.prefill, source: 'voice' } });
  }, [action, navigate]);

  const renderAction = () => {
    if (action.type === 'book_taxi') {
      const e = action.estimate;
      return (
        <div data-testid="voice-action-taxi">
          <div className="rounded-2xl border border-gray-200 overflow-hidden mb-3">
            <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center gap-2">
              <Car size={18} weight="fill" /><span className="font-bold text-sm">Course VTC à confirmer</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="flex items-start gap-2"><MapPin size={16} weight="fill" className="text-emerald-500 mt-0.5" /><span className="text-sm text-gray-800 flex-1" data-testid="voice-taxi-pickup">{action.pickup.address}</span></div>
              <div className="flex items-start gap-2"><MapPin size={16} weight="fill" className="text-[#FF4500] mt-0.5" /><span className="text-sm text-gray-800 flex-1" data-testid="voice-taxi-dropoff">{action.dropoff.address}</span></div>
              {e && (
                <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                  <div><p className="text-[10px] text-gray-400 uppercase">Prix estimé</p><p className="font-black text-lg text-gray-900" data-testid="voice-taxi-fare">{e.fare != null ? `${e.fare.toFixed(2)} €` : '—'}</p></div>
                  {e.distance_km != null && <div><p className="text-[10px] text-gray-400 uppercase">Distance</p><p className="font-bold text-gray-700">{e.distance_km} km</p></div>}
                  {e.duration_mins != null && <div><p className="text-[10px] text-gray-400 uppercase">Durée</p><p className="font-bold text-gray-700">~{e.duration_mins} min</p></div>}
                </div>
              )}
            </div>
          </div>
          <button onClick={confirmTaxi} className="w-full bg-[#FF4500] text-white rounded-full py-3.5 font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" data-testid="voice-confirm-taxi-btn">
            <CheckCircle size={20} weight="fill" /> Confirmer la course (paiement espèces)
          </button>
        </div>
      );
    }
    if (action.type === 'book_food') {
      const m = action.merchant || {};
      const p = action.product;
      const hasResult = p || action.merchant;
      return (
        <div data-testid="voice-action-food">
          {hasResult ? (
            <div className="rounded-2xl border border-gray-200 overflow-hidden mb-3">
              <div className="bg-rose-500 text-white px-4 py-2.5 flex items-center gap-2">
                <ForkKnife size={18} weight="fill" /><span className="font-bold text-sm">{p ? 'Plat trouvé' : 'Restaurant trouvé'}</span>
              </div>
              <div className="p-4">
                {p ? (
                  <>
                    <p className="font-bold text-gray-900" data-testid="voice-food-product">{p.name}</p>
                    <p className="text-sm text-gray-500">{p.merchant_name} {p.price != null ? `· ${p.price.toFixed(2)} €` : ''}</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-gray-900 flex items-center gap-1.5" data-testid="voice-food-merchant"><Storefront size={16} weight="fill" className="text-rose-500" /> {m.store_name}</p>
                    <p className="text-sm text-gray-500">{m.cuisine || m.store_type} {m.rating ? `· ⭐ ${m.rating}` : ''} {m.eta_min ? `· ${m.eta_min} min` : ''}</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-3">Aucun résultat exact pour « {action.query} ». Je vous emmène au food court.</p>
          )}
          <button onClick={confirmFood} className="w-full bg-rose-500 text-white rounded-full py-3.5 font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" data-testid="voice-confirm-food-btn">
            <ForkKnife size={20} weight="fill" /> {hasResult ? `Commander ${p ? '' : `chez ${m.store_name}`}`.trim() : 'Voir les restaurants'}
          </button>
        </div>
      );
    }
    // navigate (autres services) — y compris taxi sans adresses complètes.
    return (
      <div data-testid="voice-action-navigate">
        {action.reason === 'addresses_incomplete' && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
            J'ai besoin d'une adresse de départ et d'arrivée précises. Ouverture de l'écran taxi pour compléter.
          </p>
        )}
        <button onClick={doNavigate} className="w-full bg-gray-900 text-white rounded-full py-3.5 font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" data-testid="voice-navigate-btn">
          Ouvrir {NAV_LABELS[action.route] || 'le service'} <ArrowRight size={18} weight="bold" />
        </button>
      </div>
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-[900] w-11 h-11 rounded-full bg-gray-900 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        data-testid="voice-assistant-fab"
        aria-label="Assistant vocal"
      >
        <Microphone size={20} weight="fill" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-end" onClick={onClose}>
          <div className="bg-white w-full rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="voice-assistant-sheet">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Sparkle size={20} weight="fill" className="text-amber-400" />
                  Assistant vocal
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Parlez en français — je commande pour vous</p>
              </div>
              <button onClick={onClose} className="text-gray-400 -mt-1 -mr-1" data-testid="voice-close-btn">
                <X size={22} />
              </button>
            </div>

            {phase === 'action' && action ? (
              <div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-4">
                  <p className="text-[11px] text-gray-400 uppercase font-bold mb-0.5">Votre demande</p>
                  <p className="text-sm text-gray-800">{transcript}</p>
                </div>
                {renderAction()}
                <button onClick={() => { setAction(null); setPhase('input'); }} className="w-full text-center text-sm text-gray-500 mt-3 py-2" data-testid="voice-redo-btn">
                  ↺ Reformuler
                </button>
              </div>
            ) : (
              <>
                <div className="min-h-[80px] bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-3" data-testid="voice-transcript-box">
                  {transcript ? (
                    <p className="text-base text-gray-900">{transcript}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {listening || recording ? 'Écoute en cours…' : (transcribing ? 'Transcription…' : 'Appuyez sur le micro et parlez')}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2 mb-4">
                  {supported ? (
                    listening ? (
                      <button onClick={stop} className="w-16 h-16 rounded-full bg-red-500 text-white shadow-lg flex items-center justify-center animate-pulse" data-testid="voice-stop-btn">
                        <Microphone size={28} weight="fill" />
                      </button>
                    ) : (
                      <button onClick={start} className="w-16 h-16 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center" data-testid="voice-start-btn">
                        <Microphone size={28} weight="fill" />
                      </button>
                    )
                  ) : (
                    recording ? (
                      <button onClick={stopRecording} className="w-16 h-16 rounded-full bg-red-500 text-white shadow-lg flex items-center justify-center animate-pulse" data-testid="voice-rec-stop-btn">
                        <Microphone size={28} weight="fill" />
                      </button>
                    ) : (
                      <button onClick={startRecording} disabled={transcribing} className="w-16 h-16 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center disabled:opacity-50" data-testid="voice-rec-start-btn">
                        <Microphone size={28} weight="fill" />
                      </button>
                    )
                  )}
                  <p className="text-[11px] text-gray-500">
                    {(listening || recording) ? 'Appuyez pour arrêter'
                      : (transcribing ? 'Transcription en cours…' : 'Appuyez pour parler')}
                  </p>
                  {!supported && <p className="text-[10px] text-gray-400">Transcription IA (Whisper)</p>}
                </div>

                {transcript && !listening && !recording && !transcribing && (
                  <button onClick={submitTranscript} disabled={phase === 'preparing'}
                    className="w-full bg-emerald-500 text-white rounded-full py-3 font-bold disabled:opacity-50 mb-4 flex items-center justify-center gap-2" data-testid="voice-submit-btn">
                    {phase === 'preparing' ? 'Analyse en cours…' : 'Valider ma demande'}
                  </button>
                )}

                <div>
                  <p className="text-[11px] uppercase tracking-wide font-bold text-gray-500 mb-2">Exemples</p>
                  <div className="space-y-1.5">
                    {EXAMPLES.map((ex) => (
                      <button key={ex}
                        onClick={() => { setTranscript(ex); finalRef.current = ex; }}
                        className="w-full text-left text-sm text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2"
                        data-testid={`voice-example-${ex.slice(0, 10)}`}
                      >
                        « {ex} »
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {phase === 'executing' && (
              <div className="fixed inset-0 z-[1100] bg-white/80 flex items-center justify-center" data-testid="voice-executing">
                <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#FF4500] rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default VoiceAssistant;
