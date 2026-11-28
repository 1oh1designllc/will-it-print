// ─────────────────────────────────────────────────────────────────────────
// Free-tier usage meter (approach A: soft, client-side, no backend).
//
// Everything lives in localStorage, so it's per-browser and bypassable by
// clearing storage or going incognito. That's intentional for v1: it's a
// gentle nudge toward Pro, not a vault. Files never leave the browser — only
// a count of "a check happened" is stored locally — so the privacy promise
// is untouched. When there are real users, a backend (built with the API in
// January) can take over metering properly.
//
// IMPORTANT: enforcement is OFF until PRO_SUB_LINK is set. While it's blank,
// checks are counted but NEVER blocked and no limit UI shows — so there's
// never a dead-end "Go Pro" button before a real checkout exists. Paste the
// Stripe subscription link below and redeploy to switch monetization on.
// ─────────────────────────────────────────────────────────────────────────

const KEY = 'wipMeter';
const PRO_KEY = 'wipPro';

/** Free checks allowed per calendar month. Tune freely. */
export const FREE_LIMIT = 3;

/**
 * Stripe subscription (Payment Link) for "Will It Print? Pro — $9/mo".
 * Blank = monetization dormant (count only, never block). Paste the
 * buy.stripe.com/... recurring link here to turn the wall on.
 */
export const PRO_SUB_LINK = 'https://buy.stripe.com/4gM00kf0IcTfgRk1jk2Nq02';

/**
 * Soft unlock token. Set the Stripe subscription's after-payment redirect to
 * https://willitprint.io/?pro=wip-pro-2026 and the app flips the Pro flag on
 * arrival. (Soft by design — a shared link unlocks; acceptable for v1.)
 */
export const PRO_UNLOCK = 'wip-pro-2026';

const month = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM'

function read() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (o && o.month === month() && typeof o.count === 'number') return o;
  } catch { /* ignore */ }
  return { month: month(), count: 0 };
}
function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } }

export function isPro() { try { return localStorage.getItem(PRO_KEY) === '1'; } catch { return false; } }
export function setPro(v) {
  try { if (v) localStorage.setItem(PRO_KEY, '1'); else localStorage.removeItem(PRO_KEY); } catch { /* ignore */ }
}

export function usedThisMonth() { return read().count; }
export function checksLeft() { return Math.max(0, FREE_LIMIT - read().count); }

/** Metering is live only once there's a checkout to send people to. */
export const metered = () => PRO_SUB_LINK !== '';

/** Is this check blocked right now? Pro and dormant metering never block. */
export function blocked() { return metered() && !isPro() && checksLeft() <= 0; }

/** Count one completed check (Pro users aren't metered). */
export function recordCheck() {
  if (isPro()) return;
  const o = read();
  o.count += 1;
  write(o);
}

/**
 * Read ?pro=<token> once at startup; if it matches, flip the Pro flag and
 * strip the param from the URL. Returns true if it unlocked Pro just now.
 */
export function consumeUnlock() {
  try {
    const u = new URLSearchParams(location.search);
    if (u.get('pro') === PRO_UNLOCK) {
      setPro(true);
      u.delete('pro');
      const q = u.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}
