import React from 'react';
import {
  UserCircle, FileText, X, VideoCamera, Phone, Siren, Microphone, ShareNetwork,
} from '@phosphor-icons/react';
import { useLocale } from '../../contexts/LocaleContext';

/** V3Cube driver ride sub-sheets, extracted from DriverRideFlow for readability. */

export const RideFlowMenu = ({ onClose, onPassengerDetails, onWaybill, onCancel }) => {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-[2600] bg-black/40 flex items-start justify-end p-3 pt-14" onClick={onClose} data-testid="ride-flow-menu">
      <div className="bg-white rounded-2xl w-60 overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onPassengerDetails} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3" data-testid="menu-passenger-details"><UserCircle size={20} /> {t('driver.passenger_details')}</button>
        <button onClick={onWaybill} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-waybill"><FileText size={20} /> {t('driver.waybill')}</button>
        <button onClick={onCancel} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-cancel-trip"><X size={20} /> {t('driver.cancel_trip')}</button>
      </div>
    </div>
  );
};

export const CallTypeSheet = ({ onClose, onVideo, onVoice }) => {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="call-type-sheet">
      <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">{t('driver.choose_call_type')}</p>
        <button onClick={onVideo} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3" data-testid="call-video-btn"><VideoCamera size={24} className="text-[#2F9BFF]" weight="fill" /> <span className="font-bold text-gray-800">{t('driver.video_call')}</span></button>
        <button onClick={onVoice} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50" data-testid="call-voice-btn"><Phone size={24} className="text-[#00B578]" weight="fill" /> <span className="font-bold text-gray-800">{t('driver.voice_call')}</span></button>
      </div>
    </div>
  );
};

export const NavChooserSheet = ({ onClose, onChoose }) => {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="nav-chooser-sheet">
      <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">{t('ride.choose_on_map')}</p>
        <button onClick={() => onChoose('inapp')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="nav-inapp-btn">Navigation Google <span className="text-[#00B578] text-xs">(recommandé)</span></button>
        <button onClick={() => onChoose('gmaps')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="nav-gmaps-btn">Google Maps</button>
        <button onClick={() => onChoose('waze')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 font-bold text-gray-800" data-testid="nav-waze-btn">Waze</button>
      </div>
    </div>
  );
};

export const SafetySheet = ({ onClose, onSosMessage, onAudio, onShare }) => {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="safety-sheet">
      <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">{t('driver.safety_tools')}</p>
        <a href="tel:112" className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-red-50 mb-3 font-bold text-red-700" data-testid="safety-call-112"><Phone size={22} weight="fill" /> {t('driver.call_112')}</a>
        <button onClick={onSosMessage} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="safety-sos-message"><Siren size={22} weight="fill" className="text-red-600" /> {t('driver.send_sos')}</button>
        <button onClick={onAudio} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="safety-audio"><Microphone size={22} weight="fill" /> {t('driver.audio_recording')}</button>
        <button onClick={onShare} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 font-bold text-gray-800" data-testid="safety-share"><ShareNetwork size={22} weight="fill" /> {t('driver.share_trip_status')}</button>
      </div>
    </div>
  );
};

export const OtpModal = ({ value, onChange, onClose, onVerify, error, busy, mode = 'otp' }) => {
  const { t } = useLocale();
  const phone = mode === 'phone';
  return (
    <div className="fixed inset-0 z-[2700] bg-black/60 flex items-center justify-center p-5" data-testid="ride-flow-otp-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{phone ? t('driver.otp_phone_title') : t('ride.otp_code')}</h3>
        <p className="text-xs text-gray-500 mb-4" data-testid="ride-flow-otp-subtitle">
          {phone ? t('driver.otp_phone_hint') : t('driver.otp_hint')}
        </p>
        <input type="text" inputMode="numeric" maxLength="4" value={value} autoFocus
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          placeholder={phone ? '••••' : '0000'} className="w-full text-center text-3xl tracking-[0.5em] py-3 bg-gray-50 rounded-xl border border-gray-200 font-bold mb-2" data-testid="ride-flow-otp-input" />
        {error && <p className="text-xs text-red-500 mb-2 text-center" data-testid="ride-flow-otp-error">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm text-gray-600">{t('ride.cancel')}</button>
          <button onClick={onVerify} disabled={value.length !== 4 || busy} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: '#00B578' }} data-testid="ride-flow-otp-verify-btn">{phone ? t('driver.verify_start') : t('driver.start')}</button>
        </div>
      </div>
    </div>
  );
};
