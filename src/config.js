// --- Will It Print? launch settings -------------------------------------------
// Edit THIS FILE ONLY to turn on the money-model pieces. No other code changes
// needed. Anything left as an empty string '' simply doesn't render yet.

// Where the 1Oh1 lead CTA on the result page points — the "Fix my file" page,
// which carries the $49 fix offer, design tiers, and the pay/intake flow.
export const ONE_OH_ONE_CONTACT = '/fix.html';

// Donation button (Ko-fi / Buy Me a Coffee). Paste your link to switch it on,
// e.g. 'https://ko-fi.com/1oh1design'. Empty = hidden.
export const DONATE_URL = 'https://ko-fi.com/1oh1designllc';

// Email-capture endpoint for "email me the report" (Formspree free tier works:
// create a form, paste its endpoint like 'https://formspree.io/f/abcdwxyz').
// Empty = the email capture is hidden.
export const EMAIL_ENDPOINT = 'https://formspree.io/f/mvkzlyoy';

// "Get it printed" partner, shown on ready / almost verdicts (the moment the
// file is press-ready). Swap PRINT_PARTNER_URL for a referral / UTM link once
// you've set up a commission arrangement, so orders are tracked to you.
// Empty URL = the block is hidden.
export const PRINT_PARTNER_NAME = 'The Bronx Design Group';
export const PRINT_PARTNER_URL = 'https://www.bronxdesign.com';

// Referral tracking for the public site's "Get it printed" (no tracker on our
// side — the code rides the order; the printer counts it). See shops.js.
export const PRINT_PARTNER_REF = 'willitprint';   // ?ref= on the web order link
export const PRINT_PARTNER_CODE = 'WIP-BRONX';     // code shown + baked into orders
export const PRINT_PARTNER_OFFER = '';             // optional incentive, e.g. '10% off'
export const PRINT_PARTNER_BEACON = '';            // optional cookieless click counter; empty = OFF
