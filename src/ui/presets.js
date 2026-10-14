// Presets in inches; intent is always built in points (1in = 72pt).
export const U = { in: 72, mm: 72 / 25.4 };

export const PRESETS = [
  { key: 'business-card', label: 'Business card', w: 3.5, h: 2, method: 'offset', bleed: 0.125 },
  { key: 'postcard-4x6', label: 'Postcard', w: 4, h: 6, method: 'digital', bleed: 0.125 },
  { key: 'postcard-5x7', label: 'Postcard', w: 5, h: 7, method: 'digital', bleed: 0.125 },
  { key: 'flyer-letter', label: 'Flyer', w: 8.5, h: 11, method: 'digital', bleed: 0.125 },
  { key: 'flyer-half', label: 'Flyer', w: 5.5, h: 8.5, method: 'digital', bleed: 0.125 },
  { key: 'poster-11x17', label: 'Poster', w: 11, h: 17, method: 'large-format', bleed: 0.25 },
  { key: 'poster-17x22', label: 'Poster', w: 17, h: 22, method: 'large-format', bleed: 0.25 },
  { key: 'poster-18x24', label: 'Poster', w: 18, h: 24, method: 'large-format', bleed: 0.25 },
  { key: 'poster-24x36', label: 'Poster', w: 24, h: 36, method: 'large-format', bleed: 0.25 },
  { key: 'sticker', label: 'Sticker', w: 3, h: 3, method: 'digital', bleed: 0.125 },
];

// Presets grouped under their product, preserving first-seen order, so the
// intake can show a product header with its sizes listed beneath.
export const PRESET_GROUPS = (() => {
  const order = [], map = new Map();
  for (const p of PRESETS) {
    if (!map.has(p.label)) { map.set(p.label, []); order.push(p.label); }
    map.get(p.label).push(p);
  }
  return order.map((label) => ({ label, items: map.get(label) }));
})();

export const METHOD_LABEL = { offset: 'Offset', digital: 'Digital', 'large-format': 'Large format' };

function intent(w, h, method, bleedPts, product, sides = 2, qty = 100) {
  return {
    trimSize: { width: w, height: h },
    product, printMethod: method, sides, quantity: qty,
    requestedBleed: bleedPts || null,
  };
}

export const presetIntent = (p) =>
  intent(p.w * U.in, p.h * U.in, p.method, p.bleed * U.in, p.key);

export const customIntent = (c) => {
  const f = U[c.unit];
  return intent(+c.w * f, +c.h * f, c.method, (+c.bleed || 0) * f, 'custom', +c.sides, +c.qty);
};
