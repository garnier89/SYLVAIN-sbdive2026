/**
 * Firebase Phone Auth (OTP SMS) — initialisation paresseuse côté client.
 *
 * La config est lue depuis les variables d'environnement REACT_APP_FIREBASE_*.
 * Tant qu'elles ne sont pas renseignées, `firebaseConfigured()` renvoie false et
 * l'UI masque le flux OTP (aucune erreur, aucun crash).
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

export function firebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

let _auth = null;

export function getFirebaseAuth() {
  if (!firebaseConfigured()) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (!_auth) _auth = getAuth(app);
  return _auth;
}

/** Crée (une fois) un RecaptchaVerifier invisible attaché à un conteneur DOM. */
export function buildRecaptcha(containerId) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('firebase_not_configured');
  if (window._sbRecaptcha) return window._sbRecaptcha;
  window._sbRecaptcha = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  return window._sbRecaptcha;
}

export function clearRecaptcha() {
  try { window._sbRecaptcha?.clear?.(); } catch { /* noop */ }
  window._sbRecaptcha = null;
}

/** Envoie un OTP SMS. Renvoie un confirmationResult (à conserver pour la vérif). */
export async function sendOtp(phoneE164, containerId) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('firebase_not_configured');
  const verifier = buildRecaptcha(containerId);
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

/** Vérifie le code et renvoie l'ID token Firebase signé. */
export async function confirmOtp(confirmationResult, code) {
  const cred = await confirmationResult.confirm(code);
  return cred.user.getIdToken();
}
