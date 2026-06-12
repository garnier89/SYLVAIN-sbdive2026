import React, { useState } from 'react';
import { Phone, Siren, ShareNetwork, X, WhatsappLogo, ChatText, Copy } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { tripShareAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { SafetyRecorder } from '../SafetyRecorder';

/**
 * Outils de sécurité — IDENTICAL sheet used by both the client and driver ride
 * screens: Appel 112, message SOS, enregistrement audio, et le partage de
 * trajet LIVE sécurisé (lien public à jeton montrant chauffeur/véhicule/
 * itinéraire + numéros en clair jusqu'à la fin de la course).
 */
export const SafetyToolsSheet = ({ ride, onClose }) => {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const isDriver = user?.role === 'driver';

  const genShare = async () => {
    if (!ride?.id) { toast.error('Course indisponible'); return; }
    setLoading(true);
    try {
      const r = await tripShareAPI.create(ride.id);
      const url = `${window.location.origin}/t/${r.data.token}`;
      setShareUrl(url);
      if (navigator.share) {
        navigator.share({
          title: 'Suivi de mon trajet SB Drive',
          text: 'Suivez mon trajet en direct (sécurité) :',
          url,
        }).catch(() => {});
      }
    } catch (e) {
      toast.error("Impossible de générer le lien de suivi");
    } finally { setLoading(false); }
  };

  const msg = encodeURIComponent(`Suivez mon trajet SB Drive en direct (sécurité) : ${shareUrl}`);
  const copy = () => { navigator.clipboard?.writeText(shareUrl); toast.success('Lien copié'); };

  return (
    <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="safety-sheet">
      <div className="w-full bg-white rounded-t-3xl p-5 max-w-[480px] mx-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-lg font-extrabold text-gray-900">Outils de sécurité</p>
          <button onClick={onClose} className="text-gray-400" data-testid="safety-close"><X size={22} /></button>
        </div>

        {!shareUrl ? (
          <>
            <a href="tel:112" className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-red-50 mb-3 font-bold text-red-700" data-testid="safety-call-112">
              <Phone size={22} weight="fill" /> Appel 112
            </a>
            <button onClick={() => toast.success('Message SOS envoyé à vos contacts et au support.')} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="safety-sos-message">
              <Siren size={22} weight="fill" className="text-red-600" /> Envoyer un message SOS
            </button>
            {isDriver ? (
              <div className="mb-3"><SafetyRecorder rideId={ride?.id} kind="ride" /></div>
            ) : null}
            <button onClick={genShare} disabled={loading} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-violet-50 font-bold text-violet-700 disabled:opacity-60" data-testid="safety-share">
              <ShareNetwork size={22} weight="fill" /> {loading ? 'Génération du lien…' : 'Partager mon trajet (sécurité)'}
            </button>
          </>
        ) : (
          <div data-testid="safety-share-options">
            <p className="text-sm text-gray-600 mb-3">
              Envoyez ce lien à un proche. Il verra votre trajet <b>en direct</b> — chauffeur, véhicule, itinéraire et numéros — jusqu'à la fin de la course.
            </p>
            <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 break-all mb-3" data-testid="safety-share-url">{shareUrl}</div>
            <div className="grid grid-cols-2 gap-3">
              <a href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-xl py-3 font-bold text-sm" data-testid="share-whatsapp">
                <WhatsappLogo size={20} weight="fill" /> WhatsApp
              </a>
              <a href={`sms:?&body=${msg}`} className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 font-bold text-sm" data-testid="share-sms">
                <ChatText size={20} weight="fill" /> SMS
              </a>
              <button onClick={copy} className="flex items-center justify-center gap-2 bg-gray-100 text-gray-800 rounded-xl py-3 font-bold text-sm" data-testid="share-copy">
                <Copy size={20} /> Copier
              </button>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button onClick={() => navigator.share({ url: shareUrl, title: 'Suivi de mon trajet' }).catch(() => {})} className="flex items-center justify-center gap-2 bg-gray-100 text-gray-800 rounded-xl py-3 font-bold text-sm" data-testid="share-native">
                  <ShareNetwork size={20} /> Partager
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SafetyToolsSheet;
