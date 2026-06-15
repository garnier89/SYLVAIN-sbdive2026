import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Microphone, MicrophoneSlash, Waveform } from '@phosphor-icons/react';
import { toast } from 'sonner';

/**
 * Contrôle vocal mains-libres pour le chauffeur (façon Uber Driver).
 *
 * Une fois activé, écoute en continu et exécute des commandes simples sans
 * toucher l'écran — sécurité routière. Confirme chaque action à voix haute (TTS).
 *
 * Commandes (français) :
 *  - « Navigation » / « GPS » / « itinéraire »      → ouvre Google Maps
 *  - « Appeler » / « téléphone »                     → appelle le client
 *  - « Je suis arrivé » / « arrivé »                 → confirme l'arrivée (phase prise en charge)
 *  - « Démarrer » / « c'est parti » / « go »         → démarre la course (après arrivée)
 *  - « Annuler » / « stop » / « silence »            → désactive le mode vocal (n'annule PAS la course)
 */

const speak = (text) => {
  try {
    const s = window.speechSynthesis;
    if (!s || !text) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 1.05;
    s.speak(u);
  } catch { /* noop */ }
};

const matchCommand = (text) => {
  const s = (text || '').toLowerCase();
  if (/(annul|stop|arrête|arrete|silence|désactive|desactive|coupe)/.test(s)) return 'off';
  if (/(navig|gps|itin[ée]rair|maps|guide|route)/.test(s)) return 'nav';
  if (/(appel|t[ée]l[ée]phon|joindre)/.test(s)) return 'call';
  if (/(arriv|sur place|je suis l[àa])/.test(s)) return 'arrive';
  if (/(d[ée]marr|commenc|c'?est parti|cest parti|\bgo\b|on y va|partir)/.test(s)) return 'start';
  return null;
};

const DriverVoiceControl = ({ status, onNavigate, onCall, onArrive, onStart }) => {
  const [on, setOn] = useState(false);
  const [heard, setHeard] = useState('');
  const recRef = useRef(null);
  const onRef = useRef(false);
  const lastRef = useRef({ cmd: null, at: 0 });
  const handlersRef = useRef({});
  handlersRef.current = { status, onNavigate, onCall, onArrive, onStart };

  const exec = useCallback((cmd) => {
    // Anti-rebond : ignore la même commande répétée en moins de 4 s.
    const now = Date.now();
    if (lastRef.current.cmd === cmd && now - lastRef.current.at < 4000) return;
    lastRef.current = { cmd, at: now };

    const h = handlersRef.current;
    if (cmd === 'nav') { speak('Navigation lancée'); h.onNavigate?.(); }
    else if (cmd === 'call') { speak("J'appelle le client"); h.onCall?.(); }
    else if (cmd === 'arrive') {
      if (h.status === 'accepted') { speak('Arrivée confirmée'); h.onArrive?.(); }
      else speak("Vous n'êtes pas en phase de prise en charge.");
    } else if (cmd === 'start') {
      if (h.status === 'arriving') { speak('Démarrage de la course'); h.onStart?.(); }
      else speak('Impossible de démarrer maintenant.');
    } else if (cmd === 'off') {
      speak('Mode vocal désactivé.');
      onRef.current = false; setOn(false);
      try { recRef.current && recRef.current.stop(); } catch { /* noop */ }
    }
  }, []);

  const ensureRec = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalTxt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTxt += e.results[i][0].transcript;
      }
      if (finalTxt.trim()) {
        setHeard(finalTxt.trim());
        const cmd = matchCommand(finalTxt);
        if (cmd) exec(cmd);
      }
    };
    rec.onend = () => { if (onRef.current) { try { rec.start(); } catch { /* noop */ } } };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        toast.error('Micro non autorisé pour les commandes vocales.');
        onRef.current = false; setOn(false);
      }
    };
    return rec;
  }, [exec]);

  const enable = useCallback(() => {
    let rec = recRef.current;
    if (!rec) { rec = ensureRec(); recRef.current = rec; }
    if (!rec) { toast.error('Commandes vocales non supportées sur ce navigateur.'); return; }
    onRef.current = true; setOn(true); setHeard('');
    try { rec.start(); } catch { /* déjà démarré */ }
    speak('Mode vocal activé. Dites navigation, appeler, arrivé, ou démarrer.');
  }, [ensureRec]);

  const disable = useCallback(() => {
    onRef.current = false; setOn(false);
    try { recRef.current && recRef.current.stop(); } catch { /* noop */ }
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  }, []);

  // Arrêt propre au démontage (fin de course).
  useEffect(() => () => { onRef.current = false; try { recRef.current && recRef.current.abort(); } catch { /* noop */ } }, []);

  return (
    <div className="fixed left-3 bottom-32 z-[1600] flex flex-col items-start gap-2" data-testid="driver-voice-control">
      {on && heard && (
        <div className="max-w-[200px] bg-black/80 backdrop-blur text-white text-xs rounded-2xl px-3 py-1.5 shadow-lg flex items-center gap-1.5" data-testid="driver-voice-heard">
          <Waveform size={14} weight="fill" className="text-emerald-400 shrink-0" />
          <span className="truncate">{heard}</span>
        </div>
      )}
      <button
        onClick={on ? disable : enable}
        aria-label="Commandes vocales mains-libres"
        data-testid="driver-voice-toggle"
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors active:scale-95 ${
          on ? 'bg-emerald-500 text-white ring-4 ring-emerald-300/50 animate-pulse' : 'bg-white text-gray-800 border border-gray-200'
        }`}
      >
        {on ? <Microphone size={26} weight="fill" /> : <MicrophoneSlash size={26} />}
      </button>
    </div>
  );
};

export default DriverVoiceControl;
