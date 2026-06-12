/**
 * Auto-recovery for dynamic-import ("chunk") load failures.
 *
 * Lazy-loaded chunks (admin routes, phosphor per-icon chunks, etc.) can
 * intermittently fail to load — after a redeploy (stale chunk hashes), during
 * a dev recompile, or on a flaky/cold preview proxy. The browser then throws
 * an uncaught "ChunkLoadError / Loading chunk X failed".
 *
 * This recovers gracefully by reloading the page ONCE. A sessionStorage guard
 * prevents an infinite reload loop if the chunk is genuinely broken.
 */
const GUARD_KEY = '__chunk_reload_at';
const RELOAD_WINDOW_MS = 12000; // don't reload again within this window

const isChunkError = (msg = '') =>
  /Loading chunk [\w-]+ failed/i.test(msg) ||
  /ChunkLoadError/i.test(msg) ||
  /Loading CSS chunk/i.test(msg) ||
  /failed to fetch dynamically imported module/i.test(msg);

const recover = () => {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return; // already reloaded recently
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — reload once anyway */
  }
  window.location.reload();
};

export const installChunkRecovery = () => {
  window.addEventListener('error', (e) => {
    if (e && isChunkError(e.message)) recover();
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e && e.reason;
    const msg = (reason && (reason.message || String(reason))) || '';
    if (reason && (reason.name === 'ChunkLoadError' || isChunkError(msg))) recover();
  });
};
