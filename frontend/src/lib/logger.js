/**
 * Lightweight logger that is silent in production builds.
 *
 * Two things ship from this module:
 *   1) `logger`         — use this in new code instead of `console.*`.
 *                         In production, log/debug/info are no-ops; warn/error
 *                         are kept so real problems stay visible in diagnostics.
 *   2) `silenceConsole()` — neutralizes the app's existing noisy
 *                         `console.log/debug/info` calls in ONE place
 *                         (no need to edit hundreds of call sites). Warnings and
 *                         errors are intentionally preserved.
 *
 * Note: the preview/dev environment runs with NODE_ENV=development, so nothing
 * is silenced there — only the deployed production build is affected.
 */
const isProd = process.env.NODE_ENV === 'production';
const noop = () => {};

export const logger = {
  log: isProd ? noop : (...args) => console.log(...args),
  debug: isProd ? noop : (...args) => console.debug(...args),
  info: isProd ? noop : (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

/**
 * Silence noisy console output in production while keeping warnings & errors.
 * Call once at app entry, before rendering.
 */
export function silenceConsole() {
  if (!isProd) return;
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  // console.warn / console.error are intentionally preserved for diagnostics.
}

export default logger;
