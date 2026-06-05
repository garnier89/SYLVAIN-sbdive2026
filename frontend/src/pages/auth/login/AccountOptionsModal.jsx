import React from 'react';
import { X, CaretRight } from '@phosphor-icons/react';
import { toast } from 'sonner';

const Row = ({ onClick, testId, icon, label }) => (
  <button onClick={onClick} className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid={testId}>
    {icon}
    <span className="text-base font-medium text-gray-900 flex-1 text-left">{label}</span>
    <CaretRight size={18} className="text-gray-400" />
  </button>
);

/** "Choose an account" bottom-sheet. Social auth (onGoogle) handled by the parent. */
export const AccountOptionsModal = ({ onClose, onEmail, onGoogle }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center" data-testid="account-modal">
    <div className="absolute inset-0 bg-black/60" onClick={onClose} />
    <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl pb-8 animate-slide-up">
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h3 className="text-lg font-bold text-gray-900">Choisir un compte</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="close-modal-btn">
          <X size={16} className="text-gray-600" />
        </button>
      </div>

      <div className="px-2">
        <Row onClick={onEmail} testId="login-email-btn" label="Email & mot de passe"
          icon={<div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg></div>} />

        <Row onClick={() => toast.info('Apple Sign-In bientot disponible')} testId="login-apple-btn" label="Apple"
          icon={<div className="w-10 h-10 rounded-full bg-black flex items-center justify-center"><svg width="18" height="22" viewBox="0 0 18 22" fill="white"><path d="M14.94 11.58c-.03-2.87 2.34-4.25 2.45-4.32-1.33-1.95-3.41-2.22-4.15-2.25-1.76-.18-3.45 1.04-4.34 1.04-.9 0-2.28-1.01-3.75-.99-1.93.03-3.72 1.13-4.71 2.86-2.01 3.5-.51 8.68 1.45 11.52.96 1.39 2.1 2.95 3.61 2.89 1.45-.06 1.99-.94 3.74-.94 1.74 0 2.24.94 3.76.91 1.56-.03 2.54-1.41 3.49-2.81 1.1-1.61 1.55-3.17 1.58-3.25-.03-.01-3.03-1.16-3.06-4.62l-.07-.04z" /><path d="M12.14 3.54C12.95 2.55 13.5 1.2 13.35 0c-1.18.05-2.62.79-3.46 1.78-.76.88-1.42 2.28-1.24 3.62 1.31.1 2.65-.67 3.49-1.86z" /></svg></div>} />

        <Row onClick={onGoogle} testId="login-google-btn" label="Google"
          icon={<div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg></div>} />

        <Row onClick={() => toast.info('Facebook Login bientot disponible')} testId="login-facebook-btn" label="Facebook"
          icon={<div className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center"><svg width="12" height="22" viewBox="0 0 12 22" fill="white"><path d="M11.34 0H8.5C6.06 0 3.88 1.34 3.88 4.36v2.14H1v3.64h2.88V22h4.12V10.14h3.06l.36-3.64H8V4.68c0-1.18.36-1.88 1.64-1.88H11.34V0z" /></svg></div>} />

        <Row onClick={() => toast.info("Connectez-vous d'abord par mobile pour activer Face ID / Touch ID")} testId="login-biometric-btn" label="Face ID / Touch ID"
          icon={<div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2" /><circle cx="12" cy="12" r="3" /><path d="M12 5v2M12 17v2M5 12h2M17 12h2" /></svg></div>} />
      </div>
    </div>
  </div>
);

export default AccountOptionsModal;
