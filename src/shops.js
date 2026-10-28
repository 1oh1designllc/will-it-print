// White-label "shops" — a partner printer gets their own branded instance of
// the same preflight app via ?shop=<id> (embed that URL in their site's iframe).
// The engine, checks and rulesets are shared; a shop only swaps branding, its
// product presets, and where "Get it printed" sends the customer.
//
// REFERRAL TRACKING (privacy-safe by design — nothing phones home from here):
//   ref   — tag appended to a web order link (?ref=…&utm_source=willitprint),
//           so a printer with an online order page can see which visits came
//           from the tool.
//   code  — a short code baked into the order (mailto subject/body) and shown
//           on the result page, so phone/email orders are attributable too.
//           This is the signal the PRINTER counts on their side.
//   codeOffer — optional customer incentive shown with the code (e.g. "10% off").
//   commission — notes for your own records / next pitch (not used in the UI).
//   clickBeacon — OPTIONAL cookieless endpoint to count "Get it printed" clicks
//           on YOUR side. Empty = OFF (no network call, privacy promise intact).
//           Turning it on needs a one-line privacy-policy note.
import bronxLogo from './assets/bronx-logo.png';
import { BRONX_PRESETS } from './ui/presets.js';

export const SHOPS = {
  bronx: {
    id: 'bronx',
    name: 'The Bronx Design Group',
    logo: bronxLogo,
    presets: BRONX_PRESETS,
    orderLabel: 'Get it printed',
    orderEmail: 'info@bronxdesign.com',   // soft-warn: email the file over to order
    website: 'https://www.bronxdesign.com',
    ref: 'willitprint',                   // web-link tag (used if ordering by URL)
    code: 'WIP-BRONX',                    // the code customers mention / that rides the email
    codeOffer: '',                        // Bronx = tester: tracking only, no discount
    commission: { type: 'none', note: 'Tester — tracking only, no commission' },
    clickBeacon: '',                      // OFF (no tracker) until an endpoint is set
  },
};

/**
 * Build the order link + how it carries the referral code, without any tracker
 * on our side. Email orders bake the code into the subject/body (so every order
 * the tool sends is countable on the printer's side); web orders append ?ref=
 * and UTM tags.
 * @returns {{ href:string, newTab:boolean }}
 */
export function orderLink({ url, email, ref, code } = {}) {
  const tag = code || ref || '';
  if (email) {
    const subject = `Print order${tag ? ` (code: ${tag})` : ''} — file checked with Will It Print?`;
    const body = `Hi — I checked my artwork with Will It Print? and I'd like to place an order.${tag ? `\n\nReferral code: ${tag}` : ''}\n`;
    return { href: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, newTab: false };
  }
  if (url) {
    try {
      const u = new URL(url);
      if (ref) u.searchParams.set('ref', ref);
      u.searchParams.set('utm_source', 'willitprint');
      u.searchParams.set('utm_medium', 'preflight');
      return { href: u.toString(), newTab: true };
    } catch { return { href: url, newTab: true }; }
  }
  return { href: '#', newTab: false };
}

/** Fire an anonymous, cookieless click count — only if a beacon endpoint is set. */
export function countOrderClick(beacon, shopId) {
  if (!beacon) return; // default: no network call, no tracker
  try {
    const payload = JSON.stringify({ shop: shopId || 'public', event: 'order_click', t: Date.now() });
    if (navigator.sendBeacon) navigator.sendBeacon(beacon, payload);
    else fetch(beacon, { method: 'POST', body: payload, keepalive: true, mode: 'no-cors' });
  } catch { /* never block the click */ }
}

// The active shop from ?shop=<id>, or null for the normal 1Oh1 / public app.
export function activeShop() {
  try {
    const id = new URLSearchParams(window.location.search).get('shop');
    return (id && SHOPS[id]) || null;
  } catch { return null; }
}
