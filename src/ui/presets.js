// Presets in inches; intent is always built in points (1in = 72pt).
export const U = { in: 72, mm: 72 / 25.4 };

export const PRESETS = [
  { key: 'business-card', label: 'Business card', w: 3.5, h: 2, method: 'offset', bleed: 0.125 },
  { key: 'postcard', label: 'Postcard', w: 6, h: 4, method: 'digital', bleed: 0.125 },
  { key: 'flyer', label: 'Flyer', w: 8.5, h: 11, method: 'digital', bleed: 0.125 },
  { key: 'poster', label: 'Poster', w: 18, h: 24, method: 'large-format', bleed: 0.25 },
  { key: 'sticker', label: 'Sticker', w: 3, h: 3, method: 'digital', bleed: 0.125 },
];

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
