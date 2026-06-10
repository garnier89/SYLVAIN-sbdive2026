/**
 * Web Push (PWA) subscription helper.
 *
 * The service worker (`/sw.js`) already handles `push` + `notificationclick`.
 * Here we: request permission, subscribe via PushManager using the backend's
 * VAPID public key, and persist the subscription server-side so the backend can
 * deliver background notifications (rides, messages, arrivals…).
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribe the current browser and persist the subscription on the backend. */
export async function subscribeToPush() {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: perm };
  }

  const reg = await navigator.serviceWorker.ready;
  const { data } = await axios.get(`${API}/api/push/vapid-public-key`);
  if (!data?.publicKey) return { ok: false, reason: 'no-vapid-key' };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
  }

  await axios.post(
    `${API}/api/push/subscribe`,
    { subscription: sub.toJSON() },
    { withCredentials: true },
  );
  return { ok: true };
}

/**
 * Opportunistic subscribe after login:
 *  - if permission already granted, subscribe silently;
 *  - otherwise wait for the first user gesture and prompt then (mobile-friendly).
 */
export function autoSubscribePush() {
  if (!isPushSupported()) return;
  if (Notification.permission === 'granted') {
    subscribeToPush().catch(() => {});
    return;
  }
  if (Notification.permission === 'denied') return;
  const handler = () => {
    subscribeToPush().catch(() => {});
  };
  ['pointerdown', 'click', 'touchstart'].forEach((e) =>
    window.addEventListener(e, handler, { once: true, passive: true }),
  );
}

/** Remove this browser's subscription (e.g. on logout). */
export async function unsubscribePush() {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await axios.post(
        `${API}/api/push/unsubscribe`,
        { endpoint: sub.endpoint },
        { withCredentials: true },
      ).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
