import React, { useEffect, useState } from 'react';
import { Download, X, ShareNetwork } from '@phosphor-icons/react';

/**
 * Install banner for PWA :
 *  - Android / Chrome / Edge : uses native `beforeinstallprompt` event
 *  - iOS Safari              : shows manual instructions (Share → Add to Home Screen)
 *  - Already installed       : hidden
 *
 * Dismissal is remembered in localStorage for 14 days.
 */

const DISMISS_KEY = 'pwa_install_dismissed_until';
const DISMISS_DAYS = 14;

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

const InstallPWA = () => {
  const [show, setShow] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    // Honour dismissal
    const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (until && Date.now() < until) return;

    if (isIOS()) {
      // Show iOS instructions banner after 3s
      const t = setTimeout(() => { setIosMode(true); setShow(true); }, 3000);
      return () => clearTimeout(t);
    }

    const handler = () => setShow(true);
    window.addEventListener('pwa-install-available', handler);
    // If event already fired before mount, check deferredPrompt
    if (window.deferredInstallPrompt) setShow(true);
    return () => window.removeEventListener('pwa-install-available', handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    setShow(false);
  };

  const install = async () => {
    const p = window.deferredInstallPrompt;
    if (!p) return;
    p.prompt();
    const choice = await p.userChoice;
    window.deferredInstallPrompt = null;
    if (choice?.outcome === 'accepted') setShow(false);
    else dismiss();
  };

  if (!show) return null;

  if (iosMode) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[9999] max-w-[480px] mx-auto rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden" data-testid="install-pwa-banner-ios">
        <div className="px-4 py-3 bg-gradient-to-r from-[#FF4500] to-[#FF6A33] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icons/icon-192.png" alt="SB Drive" className="w-8 h-8 rounded-lg" />
            <p className="font-bold text-sm">Installer SB Drive</p>
          </div>
          <button onClick={dismiss} className="text-white/80 hover:text-white" data-testid="dismiss-install-btn">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="px-4 py-3 text-xs text-gray-700 leading-relaxed">
          Pour installer l'app sur iPhone :
          <ol className="mt-1.5 space-y-1 pl-1">
            <li>1. Touchez <ShareNetwork size={14} className="inline -mt-0.5 mx-0.5 text-blue-500" weight="fill" /> en bas de Safari</li>
            <li>2. Choisissez <span className="font-bold">« Sur l'écran d'accueil »</span></li>
            <li>3. Confirmez <span className="font-bold">« Ajouter »</span></li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] max-w-[480px] mx-auto rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden" data-testid="install-pwa-banner">
      <div className="flex items-center gap-3 p-4">
        <img src="/icons/icon-192.png" alt="SB Drive" className="w-12 h-12 rounded-xl shadow" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">Installer SB Drive</p>
          <p className="text-xs text-gray-500 mt-0.5">Lancement plus rapide · notifications · accès hors-ligne</p>
        </div>
        <button
          onClick={install}
          className="px-3.5 py-2 rounded-full bg-[#FF4500] text-white text-xs font-bold hover:bg-orange-600 flex items-center gap-1.5"
          data-testid="install-pwa-btn"
        >
          <Download size={14} weight="bold" /> Installer
        </button>
        <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 -mr-1" data-testid="dismiss-install-btn">
          <X size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
};

export default InstallPWA;
