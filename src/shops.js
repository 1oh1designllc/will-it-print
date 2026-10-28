// White-label "shops" — a partner printer gets their own branded instance of
// the same preflight app via ?shop=<id> (embed that URL in their site's iframe).
// The engine, checks and rulesets are shared; a shop only swaps branding, its
// product presets, and where "Get it printed" sends the customer.
import bronxLogo from './assets/bronx-logo.png';
import { BRONX_PRESETS } from './ui/presets.js';

export const SHOPS = {
  bronx: {
    id: 'bronx',
    name: 'The Bronx Design Group',
    logo: bronxLogo,
    presets: BRONX_PRESETS,
    orderLabel: 'Get it printed',
    // Soft-warn flow: send the customer (and their file) to Bronx to order.
    orderUrl: 'mailto:info@bronxdesign.com?subject=Print%20order%20%E2%80%94%20file%20checked%20with%20Will%20It%20Print',
    website: 'https://www.bronxdesign.com',
  },
};

// The active shop from ?shop=<id>, or null for the normal 1Oh1 / public app.
export function activeShop() {
  try {
    const id = new URLSearchParams(window.location.search).get('shop');
    return (id && SHOPS[id]) || null;
  } catch { return null; }
}
