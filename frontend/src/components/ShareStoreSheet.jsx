import React from 'react';
import { WhatsappLogo, ChatText, Copy, ShareNetwork } from '@phosphor-icons/react';
import { toast } from 'sonner';

// Storefront social-share bottom sheet (WhatsApp / SMS / Copy / native).
export const ShareStoreSheet = ({ open, onClose, url, name }) => {
  if (!open) return null;
  const text = `Découvrez ${name} sur SB Drive : ${url}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Lien copié !'); onClose(); }
    catch { toast.error('Copie impossible'); }
  };
  const native = async () => {
    if (navigator.share) { try { await navigator.share({ title: name, text, url }); onClose(); } catch { /* cancelled */ } }
    else copy();
  };
  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-end" onClick={onClose} data-testid="share-store-sheet">
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-5 space-y-1" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
        <h3 className="font-bold text-gray-900 text-center mb-2">Partager {name}</h3>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={onClose}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50" data-testid="share-whatsapp">
          <WhatsappLogo size={24} weight="fill" className="text-green-500" /> WhatsApp
        </a>
        <a href={`sms:?&body=${encodeURIComponent(text)}`} onClick={onClose}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50" data-testid="share-sms">
          <ChatText size={24} className="text-blue-500" /> SMS
        </a>
        <button onClick={copy} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left" data-testid="share-copy">
          <Copy size={24} className="text-gray-500" /> Copier le lien
        </button>
        {typeof navigator !== 'undefined' && navigator.share && (
          <button onClick={native} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left" data-testid="share-native">
            <ShareNetwork size={24} className="text-gray-700" /> Plus d'options…
          </button>
        )}
      </div>
    </div>
  );
};

export default ShareStoreSheet;
