import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Microphone, X, Sparkle, Car, MapPin, ForkKnife, ArrowRight, CheckCircle, Storefront } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';
import { rideAPI } from '../services/api';
import { resolveLocation } from '../lib/userLocation';
import { useLocale } from '../contexts/LocaleContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Assistant vocal multilingue — la langue suit la langue de l'application.
const SPEECH_LOCALE = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES', pt: 'pt-PT', de: 'de-DE' };

const TR = {
  fr: {
    title: 'Assistant vocal', subtitle: 'Parlez — je commande pour vous',
    listening: 'Écoute en cours…', transcribing: 'Transcription…', tapToSpeak: 'Appuyez sur le micro et parlez',
    tapToStop: 'Appuyez pour arrêter', tapToStart: 'Appuyez pour parler', whisper: 'Transcription IA (Whisper)',
    validate: 'Valider ma demande', analyzing: 'Analyse en cours…', examples: 'Exemples', request: 'Votre demande',
    redo: '↺ Reformuler', noPhrase: 'Aucune phrase détectée', micDenied: 'Micro non autorisé',
    transcribeFail: 'Transcription impossible, réessayez', nothingHeard: "Je n'ai rien entendu, réessayez",
    notUnderstood: 'Je n\'ai pas compris. Essayez « Réserve un taxi de X à Y » ou « Commande des sushis ».',
    procError: 'Erreur de traitement, réessayez',
    taxiTitle: 'Course VTC à confirmer', taxiConfirm: 'Confirmer la course (paiement espèces)',
    foodFound: 'Plat trouvé', restoFound: 'Restaurant trouvé', orderAt: 'Commander', seeRestos: 'Voir les restaurants',
    open: 'Ouvrir', price: 'Prix estimé', distance: 'Distance', duration: 'Durée',
    exampleList: ['Réserve-moi un taxi de Fort-de-France à Schoelcher', 'Commande-moi des sushis', 'Trouve-moi un coiffeur près de moi', 'Téléconsultation médicale rapide', 'Mon portefeuille'],
  },
  en: {
    title: 'Voice assistant', subtitle: 'Just speak — I order for you',
    listening: 'Listening…', transcribing: 'Transcribing…', tapToSpeak: 'Tap the mic and speak',
    tapToStop: 'Tap to stop', tapToStart: 'Tap to speak', whisper: 'AI transcription (Whisper)',
    validate: 'Submit my request', analyzing: 'Analyzing…', examples: 'Examples', request: 'Your request',
    redo: '↺ Rephrase', noPhrase: 'No phrase detected', micDenied: 'Microphone not allowed',
    transcribeFail: 'Transcription failed, try again', nothingHeard: "I didn't hear anything, try again",
    notUnderstood: 'I didn\'t understand. Try "Book a taxi from X to Y" or "Order some sushi".',
    procError: 'Processing error, try again',
    taxiTitle: 'Ride to confirm', taxiConfirm: 'Confirm ride (cash payment)',
    foodFound: 'Dish found', restoFound: 'Restaurant found', orderAt: 'Order', seeRestos: 'See restaurants',
    open: 'Open', price: 'Est. price', distance: 'Distance', duration: 'Duration',
    exampleList: ['Book me a taxi from downtown to the airport', 'Order me some sushi', 'Find a hairdresser near me', 'Quick medical video consult', 'My wallet'],
  },
  it: {
    title: 'Assistente vocale', subtitle: 'Parla — ordino per te',
    listening: 'In ascolto…', transcribing: 'Trascrizione…', tapToSpeak: 'Tocca il microfono e parla',
    tapToStop: 'Tocca per fermare', tapToStart: 'Tocca per parlare', whisper: 'Trascrizione IA (Whisper)',
    validate: 'Invia la richiesta', analyzing: 'Analisi in corso…', examples: 'Esempi', request: 'La tua richiesta',
    redo: '↺ Riformula', noPhrase: 'Nessuna frase rilevata', micDenied: 'Microfono non autorizzato',
    transcribeFail: 'Trascrizione non riuscita, riprova', nothingHeard: 'Non ho sentito nulla, riprova',
    notUnderstood: 'Non ho capito. Prova "Prenota un taxi da X a Y" o "Ordina del sushi".',
    procError: 'Errore di elaborazione, riprova',
    taxiTitle: 'Corsa da confermare', taxiConfirm: 'Conferma corsa (pagamento contanti)',
    foodFound: 'Piatto trovato', restoFound: 'Ristorante trovato', orderAt: 'Ordina', seeRestos: 'Vedi ristoranti',
    open: 'Apri', price: 'Prezzo stim.', distance: 'Distanza', duration: 'Durata',
    exampleList: ['Prenotami un taxi dal centro all\'aeroporto', 'Ordinami del sushi', 'Trova un parrucchiere vicino a me', 'Teleconsulto medico rapido', 'Il mio portafoglio'],
  },
  es: {
    title: 'Asistente de voz', subtitle: 'Habla — yo pido por ti',
    listening: 'Escuchando…', transcribing: 'Transcribiendo…', tapToSpeak: 'Toca el micrófono y habla',
    tapToStop: 'Toca para detener', tapToStart: 'Toca para hablar', whisper: 'Transcripción IA (Whisper)',
    validate: 'Enviar mi solicitud', analyzing: 'Analizando…', examples: 'Ejemplos', request: 'Tu solicitud',
    redo: '↺ Reformular', noPhrase: 'No se detectó ninguna frase', micDenied: 'Micrófono no autorizado',
    transcribeFail: 'Transcripción fallida, inténtalo de nuevo', nothingHeard: 'No escuché nada, inténtalo de nuevo',
    notUnderstood: 'No entendí. Prueba "Reserva un taxi de X a Y" u "Ordena sushi".',
    procError: 'Error de procesamiento, inténtalo de nuevo',
    taxiTitle: 'Viaje por confirmar', taxiConfirm: 'Confirmar viaje (pago en efectivo)',
    foodFound: 'Plato encontrado', restoFound: 'Restaurante encontrado', orderAt: 'Pedir', seeRestos: 'Ver restaurantes',
    open: 'Abrir', price: 'Precio est.', distance: 'Distancia', duration: 'Duración',
    exampleList: ['Resérvame un taxi del centro al aeropuerto', 'Pídeme sushi', 'Encuéntrame una peluquería cerca', 'Teleconsulta médica rápida', 'Mi billetera'],
  },
  pt: {
    title: 'Assistente de voz', subtitle: 'Fale — eu peço por você',
    listening: 'A ouvir…', transcribing: 'A transcrever…', tapToSpeak: 'Toque no microfone e fale',
    tapToStop: 'Toque para parar', tapToStart: 'Toque para falar', whisper: 'Transcrição IA (Whisper)',
    validate: 'Enviar o meu pedido', analyzing: 'A analisar…', examples: 'Exemplos', request: 'O seu pedido',
    redo: '↺ Reformular', noPhrase: 'Nenhuma frase detetada', micDenied: 'Microfone não autorizado',
    transcribeFail: 'Transcrição falhou, tente de novo', nothingHeard: 'Não ouvi nada, tente de novo',
    notUnderstood: 'Não percebi. Tente "Reserva um táxi de X para Y" ou "Pede sushi".',
    procError: 'Erro de processamento, tente de novo',
    taxiTitle: 'Viagem a confirmar', taxiConfirm: 'Confirmar viagem (pagamento em dinheiro)',
    foodFound: 'Prato encontrado', restoFound: 'Restaurante encontrado', orderAt: 'Pedir', seeRestos: 'Ver restaurantes',
    open: 'Abrir', price: 'Preço est.', distance: 'Distância', duration: 'Duração',
    exampleList: ['Reserva um táxi do centro ao aeroporto', 'Pede-me sushi', 'Encontra um cabeleireiro perto', 'Teleconsulta médica rápida', 'A minha carteira'],
  },
  de: {
    title: 'Sprachassistent', subtitle: 'Sprich — ich bestelle für dich',
    listening: 'Höre zu…', transcribing: 'Transkribiere…', tapToSpeak: 'Mikrofon tippen und sprechen',
    tapToStop: 'Zum Stoppen tippen', tapToStart: 'Zum Sprechen tippen', whisper: 'KI-Transkription (Whisper)',
    validate: 'Anfrage senden', analyzing: 'Analysiere…', examples: 'Beispiele', request: 'Deine Anfrage',
    redo: '↺ Neu formulieren', noPhrase: 'Kein Satz erkannt', micDenied: 'Mikrofon nicht erlaubt',
    transcribeFail: 'Transkription fehlgeschlagen, erneut versuchen', nothingHeard: 'Ich habe nichts gehört, erneut versuchen',
    notUnderstood: 'Ich habe es nicht verstanden. Versuche "Buche ein Taxi von X nach Y" oder "Bestelle Sushi".',
    procError: 'Verarbeitungsfehler, erneut versuchen',
    taxiTitle: 'Fahrt bestätigen', taxiConfirm: 'Fahrt bestätigen (Barzahlung)',
    foodFound: 'Gericht gefunden', restoFound: 'Restaurant gefunden', orderAt: 'Bestellen', seeRestos: 'Restaurants ansehen',
    open: 'Öffnen', price: 'Gesch. Preis', distance: 'Distanz', duration: 'Dauer',
    exampleList: ['Buche mir ein Taxi vom Zentrum zum Flughafen', 'Bestell mir Sushi', 'Finde einen Friseur in der Nähe', 'Schnelle medizinische Videoberatung', 'Meine Geldbörse'],
  },
};

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
  const { language } = useLocale();
  const lang = SPEECH_LOCALE[language?.code] ? language.code : 'fr';
  const tr = TR[lang] || TR.fr;
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

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
    rec.lang = SPEECH_LOCALE[langRef.current] || 'fr-FR';
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
      if (e.error === 'not-allowed') toast.error(TR[langRef.current]?.micDenied || 'Micro non autorisé');
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
      // Applique la langue de l'app à la dictée à chaque écoute.
      recognitionRef.current.lang = SPEECH_LOCALE[langRef.current] || 'fr-FR';
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
      form.append('language', langRef.current);
      const r = await axios.post(`${API_URL}/api/voice/transcribe`, form, { withCredentials: true });
      const text = (r.data?.transcript || '').trim();
      if (text) { setTranscript(text); finalRef.current = text; }
      else toast.error(TR[langRef.current]?.nothingHeard || 'Je n\'ai rien entendu, réessayez');
    } catch {
      toast.error(TR[langRef.current]?.transcribeFail || 'Transcription impossible, réessayez');
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
      toast.error(TR[langRef.current]?.micDenied || 'Micro non autorisé');
    }
  }, [uploadAudio]);

  const stopRecording = useCallback(() => {
    try { mediaRecorderRef.current && mediaRecorderRef.current.stop(); } catch { /* noop */ }
  }, []);

  const submitTranscript = useCallback(async () => {
    const text = (transcript || '').trim();
    if (!text) { toast.error(tr.noPhrase); return; }
    setPhase('preparing');
    try {
      const loc = resolveLocation();
      const r = await axios.post(`${API_URL}/api/voice/prepare`,
        { transcript: text, current_lat: loc?.lat, current_lng: loc?.lng, language: langRef.current },
        { withCredentials: true });
      const act = r.data.action;
      if (!act || act.type === 'unknown') {
        toast.error(tr.notUnderstood);
        setPhase('input');
        return;
      }
      setAction(act);
      setPhase('action');
    } catch {
      toast.error(tr.procError);
      setPhase('input');
    }
  }, [transcript, tr]);

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
              <Car size={18} weight="fill" /><span className="font-bold text-sm">{tr.taxiTitle}</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="flex items-start gap-2"><MapPin size={16} weight="fill" className="text-emerald-500 mt-0.5" /><span className="text-sm text-gray-800 flex-1" data-testid="voice-taxi-pickup">{action.pickup.address}</span></div>
              <div className="flex items-start gap-2"><MapPin size={16} weight="fill" className="text-[#FF4500] mt-0.5" /><span className="text-sm text-gray-800 flex-1" data-testid="voice-taxi-dropoff">{action.dropoff.address}</span></div>
              {e && (
                <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                  <div><p className="text-[10px] text-gray-400 uppercase">{tr.price}</p><p className="font-black text-lg text-gray-900" data-testid="voice-taxi-fare">{e.fare != null ? `${e.fare.toFixed(2)} €` : '—'}</p></div>
                  {e.distance_km != null && <div><p className="text-[10px] text-gray-400 uppercase">{tr.distance}</p><p className="font-bold text-gray-700">{e.distance_km} km</p></div>}
                  {e.duration_mins != null && <div><p className="text-[10px] text-gray-400 uppercase">{tr.duration}</p><p className="font-bold text-gray-700">~{e.duration_mins} min</p></div>}
                </div>
              )}
            </div>
          </div>
          <button onClick={confirmTaxi} className="w-full bg-[#FF4500] text-white rounded-full py-3.5 font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" data-testid="voice-confirm-taxi-btn">
            <CheckCircle size={20} weight="fill" /> {tr.taxiConfirm}
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
                <ForkKnife size={18} weight="fill" /><span className="font-bold text-sm">{p ? tr.foodFound : tr.restoFound}</span>
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
            <ForkKnife size={20} weight="fill" /> {hasResult ? `${tr.orderAt} ${p ? '' : `${m.store_name}`}`.trim() : tr.seeRestos}
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
          {tr.open} {NAV_LABELS[action.route] || ''} <ArrowRight size={18} weight="bold" />
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
                  {tr.title}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{tr.subtitle}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 -mt-1 -mr-1" data-testid="voice-close-btn">
                <X size={22} />
              </button>
            </div>

            {phase === 'action' && action ? (
              <div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-4">
                  <p className="text-[11px] text-gray-400 uppercase font-bold mb-0.5">{tr.request}</p>
                  <p className="text-sm text-gray-800">{transcript}</p>
                </div>
                {renderAction()}
                <button onClick={() => { setAction(null); setPhase('input'); }} className="w-full text-center text-sm text-gray-500 mt-3 py-2" data-testid="voice-redo-btn">
                  {tr.redo}
                </button>
              </div>
            ) : (
              <>
                <div className="min-h-[80px] bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-3" data-testid="voice-transcript-box">
                  {transcript ? (
                    <p className="text-base text-gray-900">{transcript}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {listening || recording ? tr.listening : (transcribing ? tr.transcribing : tr.tapToSpeak)}
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
                    {(listening || recording) ? tr.tapToStop
                      : (transcribing ? tr.transcribing : tr.tapToStart)}
                  </p>
                  {!supported && <p className="text-[10px] text-gray-400">{tr.whisper}</p>}
                </div>

                {transcript && !listening && !recording && !transcribing && (
                  <button onClick={submitTranscript} disabled={phase === 'preparing'}
                    className="w-full bg-emerald-500 text-white rounded-full py-3 font-bold disabled:opacity-50 mb-4 flex items-center justify-center gap-2" data-testid="voice-submit-btn">
                    {phase === 'preparing' ? tr.analyzing : tr.validate}
                  </button>
                )}

                <div>
                  <p className="text-[11px] uppercase tracking-wide font-bold text-gray-500 mb-2">{tr.examples}</p>
                  <div className="space-y-1.5">
                    {tr.exampleList.map((ex) => (
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
