/**
 * fix/plan.js — the PURE half of the fix engine.
 *
 * Given the fixable actions from a result, compute the concrete print-ready
 * layout in points: the output canvas, where the artwork sits, rotation,
 * crop-mark geometry, target color, and the honesty caveats. No pixels, no
 * pdf-lib — so it's fully testable. The renderer (fix/render.js) executes it.
 *
 * Layout, bottom-left origin:
 *   canvas = trim + (bleed + markLen) on every side
 *   art fills trim+bleed (centered); crop marks sit in the slug beyond bleed.
 * Non-proportional stretch and resolution are never planned here — no honest
 * automatic fix exists (pro build handles explicit stretch).
 */
export const MARK_LEN = 12;        // pt (~4.2mm)
const DEFAULT_BLEED = 9;           // pt (0.125in)

export function planFromActions(fixActions = []) {
  const p = { addBleed: null, rotate: 0, resize: false, color: null };
  for (const a of fixActions) {
    if (a.type === 'add-bleed') p.addBleed = a.params.amount;
    else if (a.type === 'rotate') p.rotate = a.params.degrees;
    else if (a.type === 'resize') p.resize = true;
    else if (a.type === 'convert-color') p.color = a.params.to;
  }
  return p;
}

// 8 segments: two per trim corner, aligned to the trim edges, out in the slug.
function cropMarks(o, T, C, L) {
  const x0 = o.x, y0 = o.y, x1 = o.x + T.width, y1 = o.y + T.height;
  const s = (ax, ay, bx, by) => ({ x1: ax, y1: ay, x2: bx, y2: by });
  return [
    s(x0, 0, x0, L), s(0, y0, L, y0),                 // bottom-left
    s(x1, 0, x1, L), s(C.w - L, y0, C.w, y0),         // bottom-right
    s(x0, C.h - L, x0, C.h), s(0, y1, L, y1),         // top-left
    s(x1, C.h - L, x1, C.h), s(C.w - L, y1, C.w, y1), // top-right
  ];
}

/**
 * Resolve the exact drawImage box for pdf-lib, which rotates about the
 * lower-left anchor (x,y). For 90/270 the art dims swap and the anchor
 * shifts so the rotated image still fills artPlacement. Pure geometry.
 */
export function resolveDraw(plan) {
  const b = plan.artPlacement;
  const r = ((plan.rotate % 360) + 360) % 360;
  if (r === 90) return { x: b.x + b.w, y: b.y, width: b.h, height: b.w, rotate: 90 };
  if (r === 270) return { x: b.x, y: b.y + b.h, width: b.h, height: b.w, rotate: 270 };
  if (r === 180) return { x: b.x + b.w, y: b.y + b.h, width: b.w, height: b.h, rotate: 180 };
  return { x: b.x, y: b.y, width: b.w, height: b.h, rotate: 0 };
}

export function buildFixPlan(doc, fixActions = [], { markLen = MARK_LEN } = {}) {
  const f = planFromActions(fixActions);
  const T = doc.intent.trimSize;
  const B = f.addBleed ?? doc.intent.requestedBleed ?? DEFAULT_BLEED;
  const L = markLen;
  const m = B + L; // trim edge → canvas edge
  const canvas = { w: T.width + 2 * m, h: T.height + 2 * m };
  const trimOrigin = { x: m, y: m };
  const artPlacement = { x: m - B, y: m - B, w: T.width + 2 * B, h: T.height + 2 * B };

  const notes = [];
  if (f.color) notes.push(`Color converted to ${f.color.toUpperCase()} — approximate (no ICC profile); confirm critical colors on a proof.`);
  if (f.addBleed != null) notes.push('Bleed added by scaling the artwork to fill it — check nothing important sits in the trimmed edge.');

  return {
    page: 0,
    trimPt: { w: T.width, h: T.height },
    bleedPt: B, markLenPt: L,
    canvasPt: canvas, trimOrigin, artPlacement,
    rotate: f.rotate, targetColor: f.color || null,
    cropMarks: cropMarks(trimOrigin, T, canvas, L),
    notes,
  };
}
