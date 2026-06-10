import React, { useState } from 'react';
import {
  UserCircle, FileText, X, VideoCamera, Phone, Siren, Microphone, ShareNetwork, HandCoins,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useLocale } from '../../contexts/LocaleContext';

/** V3Cube driver ride sub-sheets, extracted from DriverRideFlow for readability. */

export const RideFlowMenu = ({ onClose, onPassengerDetails, onWaybill, onCancel, onRefundClient }) => {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-[2600] bg-black/40 flex items-start justify-end p-3 pt-14" onClick={onClose} data-testid="ride-flow-menu">
      <div className="bg-white rounded-2xl w-60 overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onPassengerDetails} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3" data-testid="menu-passenger-details"><UserCircle size={20} /> {t('driver.passenger_details')}</button>
        <button onClick={onWaybill} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-waybill"><FileText size={20} /> {t('driver.waybill')}</button>
        <button onClick={onRefundClient} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-refund-client"><HandCoins size={20} className="text-emerald-600" /> Rembourser le client</button>
        <button onClick={onCancel} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-cancel-trip"><X size={20} /> {t('driver.cancel_trip')}</button>
      </div>
    </div>
  );
};

export const RefundClientModal = ({ rideId, passengerName, onClose, onDone }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const num = parseFloat(amount) || 0;
  const submit = async () => {
    if (num <= 0) return;
    setLoading(true);
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rides/${rideId}/refund-client`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(typeof d.detail === 'string' ? d.detail : 'Remboursement impossible'); setLoading(false); return; }
      toast.success(`${num.toFixed(2)} € remboursés au client`);
      onDone?.();
    } catch { toast.error('Erreur réseau'); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-[2700] bg-black/60 flex items-end sm:items-center justify-center p-4" data-testid="refund-client-modal">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2"><HandCoins size={20} className="text-emerald-600" weight="duotone" /> Rembourser le client</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="refund-client-close"><X size={14} /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Rembourse {passengerName ? <b>{passengerName}</b> : 'le client'} depuis votre portefeuille (utile s'il a payé en
          espèces et que vous n'avez pas la monnaie). Le montant est crédité immédiatement. Votre réserve non-retirable est préservée.
        </p>
        <label className="text-xs font-semibold text-gray-700 mb-1 block">Montant (€)</label>
        <input type="number" min="0.5" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00" autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-4" data-testid="refund-client-amount-input" />
        <button onClick={submit} disabled={loading || num <= 0}
          className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-60" data-testid="refund-client-confirm-btn">
          {loading ? 'Remboursement…' : `Rembourser ${num.toFixed(2)} €`}
        </button>
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
        <button onClick={onVoice} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50" data-testid="call-voice-btn"><Phone size={24} className="text-[#FF5000]" weight="fill" /> <span className="font-bold text-gray-800">{t('driver.voice_call')}</span></button>
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
        <button onClick={() => onChoose('inapp')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="nav-inapp-btn">Navigation Google <span className="text-[#FF5000] text-xs">(recommandé)</span></button>
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
          <button onClick={onVerify} disabled={value.length !== 4 || busy} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: '#FF5000' }} data-testid="ride-flow-otp-verify-btn">{phone ? t('driver.verify_start') : t('driver.start')}</button>
        </div>
      </div>
    </div>
  );
};
