import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Microphone, X, Sparkle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const EXAMPLES = [
  'Réserve-moi un taxi de Gare du Nord à Tour Eiffel',
  'Commande des sushis pour ce soir',
  'Trouve-moi un coiffeur près de moi',
  'Téléconsultation médicale rapide',
  'Mon portefeuille',
];

// Map LLM intent → in-app route. Optional state.prefill is forwarded.
const INTENT_ROUTE = {
  book_taxi: '/ride',
  book_runner: '/runner',
  book_delivery: '/parcel',
  book_food: '/food',
  book_beauty: '/beauty',
  book_pet_care: '/pet-care',
  book_car_care: '/car-care',
  book_towing: '/towing',
  book_intercity: '/intercity',
  book_carpool: '/carpool',
  book_video_consult: '/video-consult',
  book_parking: '/parking',
  search_marketplace: '/marketplace',
  search_nearby: '/nearby',
  open_wallet: '/wallet',
  view_rides: '/history',
  call_sos: '/safety',
};

const VoiceAssistant = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);
  const finalRef = useRef('');

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
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
      console.warn('[VoiceAssistant] recognition error', e.error);
      setListening(false);
      if (e.error === 'not-allowed') toast.error('Micro non autorisé');
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => { try { rec.abort(); } catch (_e) { /* noop */ } };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      finalRef.current = '';
      setTranscript('');
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      console.warn('[VoiceAssistant] start failed', e);
    }
  }, []);

  const stop = useCallback(() => {
    try { recognitionRef.current && recognitionRef.current.stop(); } catch (_e) { /* noop */ }
    setListening(false);
  }, []);

  const submitTranscript = useCallback(async () => {
    const text = (transcript || '').trim();
    if (!text) { toast.error('Aucune phrase détectée'); return; }
    setParsing(true);
    try {
      const r = await axios.post(`${API_URL}/api/voice/parse-booking`, { transcript: text }, { withCredentials: true });
      const p = r.data.parsed;
      if (!p || p.intent === 'unknown' || (p.confidence || 0) < 0.3) {
        toast.error('Je n\'ai pas compris. Essayez : "Réserve un taxi de X à Y" ou "Commande à manger"');
        setParsing(false);
        return;
      }
      const target = INTENT_ROUTE[p.intent];
      if (!target) {
        toast.error('Service non supporté pour le moment');
        setParsing(false);
        return;
      }
      setOpen(false);
      navigate(target, { state: { prefill: p, source: 'voice' } });
    } catch (e) {
      console.warn('[VoiceAssistant] parse failed', e);
      toast.error('Erreur de traitement, réessayez');
    }
    setParsing(false);
  }, [transcript, navigate]);

  const onClose = () => {
    stop();
    setOpen(false);
    setTimeout(() => { setTranscript(''); finalRef.current = ''; }, 300);
  };

  return (
    <>
      {/* Floating mic FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-[900] w-11 h-11 rounded-full bg-gray-900 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        data-testid="voice-assistant-fab"
        aria-label="Assistant vocal"
      >
        <Microphone size={20} weight="fill" />
      </button>

      {/* Bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-end" onClick={onClose}>
          <div className="bg-white w-full rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="voice-assistant-sheet">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Sparkle size={20} weight="fill" className="text-amber-400" />
                  Comment puis-je vous aider ?
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Parlez en français — je comprends les adresses</p>
              </div>
              <button onClick={onClose} className="text-gray-400 -mt-1 -mr-1" data-testid="voice-close-btn">
                <X size={22} />
              </button>
            </div>

            {!supported ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                Votre navigateur ne supporte pas la dictée. Utilisez Chrome ou Samsung Internet pour activer cette fonctionnalité.
              </div>
            ) : (
              <>
                <div className="min-h-[80px] bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-3" data-testid="voice-transcript-box">
                  {transcript ? (
                    <p className="text-base text-gray-900">{transcript}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {listening ? 'Écoute en cours…' : 'Appuyez sur le micro et parlez'}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2 mb-4">
                  {listening ? (
                    <button onClick={stop}
                      className="w-16 h-16 rounded-full bg-red-500 text-white shadow-lg flex items-center justify-center animate-pulse" data-testid="voice-stop-btn">
                      <Microphone size={28} weight="fill" />
                    </button>
                  ) : (
                    <button onClick={start}
                      className="w-16 h-16 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center" data-testid="voice-start-btn">
                      <Microphone size={28} weight="fill" />
                    </button>
                  )}
                  <p className="text-[11px] text-gray-500">{listening ? 'Appuyez pour arrêter' : 'Appuyez pour parler'}</p>
                </div>

                {transcript && !listening && (
                  <button onClick={submitTranscript} disabled={parsing}
                    className="w-full bg-emerald-500 text-white rounded-full py-3 font-bold disabled:opacity-50 mb-4" data-testid="voice-submit-btn">
                    {parsing ? 'Analyse…' : 'Réserver maintenant'}
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
          </div>
        </div>
      )}
    </>
  );
};

export default VoiceAssistant;
