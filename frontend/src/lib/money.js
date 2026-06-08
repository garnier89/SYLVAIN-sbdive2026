/**
 * Money — display-layer currency conversion + formatting.
 *
 * All prices in the app are computed/stored in EUR (base currency). This helper
 * converts an EUR amount into the user's active display currency and formats it
 * with the right symbol placement, decimals and thousands separators.
 *
 * CFA (XOF / XAF) uses the LEGAL fixed peg to the euro (1 EUR = 655.957 CFA) —
 * exact and stable, no FX feed required. Other currencies use indicative static
 * rates (update via a live FX feed later if needed). EUR is the identity.
 */

// Units per 1 EUR. XOF/XAF are the fixed legal peg (exact). Others are indicative.
export const EUR_RATES = {
  EUR: 1,
  XOF: 655.957, // Franc CFA BCEAO — fixed peg
  XAF: 655.957, // Franc CFA BEAC — fixed peg
  USD: 1.08, GBP: 0.85, CAD: 1.47, CHF: 0.95,
  MAD: 10.8, TND: 3.4, DZD: 145, GNF: 9300, HTG: 143, MGA: 4900, CDF: 2900,
  NGN: 1700, KES: 140, ZAR: 20, AED: 3.97, SAR: 4.05, INR: 90, BRL: 5.9,
  MXN: 19.5, JPY: 163, CNY: 7.8, RUB: 100, TRY: 37, THB: 38, PHP: 62,
  IDR: 17500, MYR: 5.0,
};

// Currencies shown WITHOUT decimals (smallest unit ~= 1).
const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'JPY', 'GNF', 'MGA', 'CDF', 'IDR']);
// Currencies whose symbol goes BEFORE the amount (e.g. $12.00, £9.50).
const PREFIX = new Set(['USD', 'GBP', 'CAD', 'MXN', 'BRL', 'INR', 'CNY', 'JPY', 'PHP', 'RUB', 'ZAR', 'NGN']);

/** Convert an EUR amount into `code`. Falls back to identity for unknown codes. */
export const convertFromEur = (amount, code) => {
  const n = Number(amount);
  if (!isFinite(n)) return 0;
  return n * (EUR_RATES[code] || 1);
};

/**
 * Format an EUR amount in the given currency ({code, symbol}).
 * @param {number} amount  amount in EUR (base)
 * @param {{code:string,symbol:string}} currency
 */
export const formatMoney = (amount, currency) => {
  const code = currency?.code || 'EUR';
  const symbol = currency?.symbol || '\u20AC';
  const zero = ZERO_DECIMAL.has(code);
  const val = convertFromEur(amount, code);
  const str = (zero ? Math.round(val) : val).toLocaleString('fr-FR', {
    minimumFractionDigits: zero ? 0 : 2,
    maximumFractionDigits: zero ? 0 : 2,
  });
  return PREFIX.has(code) ? `${symbol}${str}` : `${str} ${symbol}`;
};
