/**
 * Shared driver alert sound + vibration.
 *
 * Mobile browsers block the Web Audio API until the user interacts with the
 * page. We lazily create a single AudioContext and resume it on the first user
 * gesture so that incoming-job chimes actually play afterwards.
 */
let ctx = null;
let unlocked = false;
let sirenTimer = null;

function getCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  return ctx;
}

/** Resume the AudioContext on the first user gesture (call once at app/driver start). */
export function unlockAudio() {
  if (unlocked) return;
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

// Auto-unlock on the first interaction anywhere in the app.
if (typeof window !== 'undefined') {
  const handler = () => { unlockAudio(); };
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((e) =>
    window.addEventListener(e, handler, { once: true, passive: true }),
  );
}

/** Play a short two-tone chime + vibrate. */
export function playAlert() {
  const c = getCtx();
  if (c) {
    if (c.state === 'suspended') c.resume().catch(() => {});
    try {
      const now = c.currentTime;
      [880, 1175].forEach((freq, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = 'sine';
        o.frequency.value = freq;
        const t = now + i * 0.18;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.start(t); o.stop(t + 0.34);
      });
    } catch { /* ignore */ }
  }
  if (navigator.vibrate) navigator.vibrate([200, 90, 200]);
}

/** Repeat the chime every ~1.5s until stopped (used while a request is on screen). */
export function startSiren() {
  if (sirenTimer) return;
  playAlert();
  sirenTimer = setInterval(playAlert, 1500);
}

export function stopSiren() {
  if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
}
