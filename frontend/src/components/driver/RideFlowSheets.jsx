import React from 'react';
import {
  UserCircle, FileText, X, VideoCamera, Phone, Siren, Microphone, ShareNetwork,
} from '@phosphor-icons/react';

/** V3Cube driver ride sub-sheets, extracted from DriverRideFlow for readability. */

export const RideFlowMenu = ({ onClose, onPassengerDetails, onWaybill, onCancel }) => (
  <div className="fixed inset-0 z-[2600] bg-black/40 flex items-start justify-end p-3 pt-14" onClick={onClose} data-testid="ride-flow-menu">
    <div className="bg-white rounded-2xl w-60 overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
      <button onClick={onPassengerDetails} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3" data-testid="menu-passenger-details"><UserCircle size={20} /> Voir les détails du passager</button>
      <button onClick={onWaybill} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-waybill"><FileText size={20} /> Lettre de voiture</button>
      <button onClick={onCancel} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-cancel-trip"><X size={20} /> Annuler le voyage</button>
    </div>
  </div>
);

export const CallTypeSheet = ({ onClose, onVideo, onVoice }) => (
  <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="call-type-sheet">
    <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
      <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">Choisissez le type d&apos;appel</p>
      <button onClick={onVideo} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3" data-testid="call-video-btn"><VideoCamera size={24} className="text-[#2F9BFF]" weight="fill" /> <span className="font-bold text-gray-800">Appel vidéo</span></button>
      <button onClick={onVoice} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50" data-testid="call-voice-btn"><Phone size={24} className="text-[#00B578]" weight="fill" /> <span className="font-bold text-gray-800">Appel vocal</span></button>
    </div>
  </div>
);

export const NavChooserSheet = ({ onClose, onChoose }) => (
  <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="nav-chooser-sheet">
    <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
      <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">Choisissez une option</p>
      <button onClick={() => onChoose('inapp')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="nav-inapp-btn">Navigation Google avancée dans l&apos;application <span className="text-[#00B578] text-xs">(recommandé)</span></button>
      <button onClick={() => onChoose('gmaps')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="nav-gmaps-btn">Navigation sur Google Map</button>
      <button onClick={() => onChoose('waze')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 font-bold text-gray-800" data-testid="nav-waze-btn">Navigation Waze</button>
    </div>
  </div>
);

export const SafetySheet = ({ onClose, onSosMessage, onAudio, onShare }) => (
  <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="safety-sheet">
    <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
      <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">Outils de sécurité</p>
      <a href="tel:112" className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-red-50 mb-3 font-bold text-red-700" data-testid="safety-call-112"><Phone size={22} weight="fill" /> Appel 112</a>
      <button onClick={onSosMessage} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="safety-sos-message"><Siren size={22} weight="fill" className="text-red-600" /> Envoyer un message SOS</button>
      <button onClick={onAudio} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="safety-audio"><Microphone size={22} weight="fill" /> Enregistrement audio</button>
      <button onClick={onShare} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 font-bold text-gray-800" data-testid="safety-share"><ShareNetwork size={22} weight="fill" /> Partager le statut du voyage</button>
    </div>
  </div>
);

export const OtpModal = ({ value, onChange, onClose, onVerify, error, busy, mode = 'otp' }) => {
  const phone = mode === 'phone';
  return (
    <div className="fixed inset-0 z-[2700] bg-black/60 flex items-center justify-center p-5" data-testid="ride-flow-otp-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{phone ? 'Vérification par téléphone' : 'Code OTP'}</h3>
        <p className="text-xs text-gray-500 mb-4" data-testid="ride-flow-otp-subtitle">
          {phone
            ? 'Le passager ne peut pas donner le code (téléphone éteint ?). Saisissez les 4 derniers chiffres de son numéro de téléphone enregistré.'
            : 'Demandez au passager son code OTP à 4 chiffres pour démarrer la course.'}
        </p>
        <input type="text" inputMode="numeric" maxLength="4" value={value} autoFocus
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          placeholder={phone ? '••••' : '0000'} className="w-full text-center text-3xl tracking-[0.5em] py-3 bg-gray-50 rounded-xl border border-gray-200 font-bold mb-2" data-testid="ride-flow-otp-input" />
        {error && <p className="text-xs text-red-500 mb-2 text-center" data-testid="ride-flow-otp-error">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm text-gray-600">Annuler</button>
          <button onClick={onVerify} disabled={value.length !== 4 || busy} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: '#00B578' }} data-testid="ride-flow-otp-verify-btn">{phone ? 'Vérifier & démarrer' : 'Démarrer'}</button>
        </div>
      </div>
    </div>
  );
};
