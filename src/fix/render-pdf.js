/**
 * fix/render-pdf.js — print-ready export for a PDF source (pdf-lib).
 *
 * Embeds each source page onto a canvas of trim + bleed + crop-mark slug, with
 * the source's TRIM aligned to the output trim (1:1 — the size check already
 * confirmed the trim matches the order, so nothing is rescaled). Crop marks and
 * TrimBox/BleedBox are written so a RIP knows the finished size.
 *
 * BLEED: if the source already carries bleed, the embedded page fills it. If it
 * does not, we FAKE it the way a designer would — sample the outermost strip at
 * each trim edge and stretch it outward to fill the bleed, with the real edge
 * pinned at the trim line so the seam is clean (edges mirror outward; corners
 * stretch in both directions). It's drawn behind the artwork, which still covers
 * the trim exactly, so nothing real is altered.
 *
 * Runs in the browser and in Node, so it's testable headless (unlike the DPI
 * pass, which needs pdf.js). Colour conversion of a PDF is out of scope here —
 * that stays a flagged note, not a silent transform.
 */
import {
  PDFDocument, cmyk,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath,
} from 'pdf-lib';
import { cropMarks, MARK_LEN } from './plan.js';

const DEFAULT_BLEED = 9; // pt (0.125in)

// How much REAL bleed the source carries: the smallest inset of the trim
// inside the bleed box (falling back to the media/page box). Artwork past the
// cut is real whether the trim was DECLARED or INFERRED — an 8.5×11 ordered on
// an 8.75×11.25 page genuinely bleeds, it's just missing crop marks. So we read
// geometry, not the inferred flag: when the page extends past the trim we KEEP
// that artwork and only add crop marks, and fake-stretch bleed only when the
// page actually stops at the trim (no overrun to keep).
function existingBleed(boxes) {
  const t = boxes.trim;
  const b = boxes.bleed ?? boxes.media;
  if (!t || !b) return 0;
  const inset = Math.min(t.x - b.x, t.y - b.y,
    (b.x + b.width) - (t.x + t.width), (b.y + b.height) - (t.y + t.height));
  return inset > 0 ? inset : 0;
}

// Draw the embedded page scaled/positioned, clipped to one margin rectangle.
function drawClipped(page, ep, cx, cy, cw, ch, X0, Y0, xS, yS) {
  page.pushOperators(
    pushGraphicsState(),
    moveTo(cx, cy), lineTo(cx + cw, cy), lineTo(cx + cw, cy + ch), lineTo(cx, cy + ch), closePath(),
    clip(), endPath(),
  );
  page.drawPage(ep, { x: X0, y: Y0, xScale: xS, yScale: yS });
  page.pushOperators(popGraphicsState());
}

// Fake bleed by stretching the outermost edge strip outward on all four sides
// plus corners. Edge pinned at the trim line (negative scale mirrors the strip
// outward), so the join is seamless for solid edges and continuous for the rest.
// Coords are the output canvas; (tl,tb)=trim origin in embedded space, (tw,th)=trim size.
function fakeBleed(page, ep, { m, B, tl, tb, tw, th, dx, dy }) {
  const STRIP = Math.max(1, Math.min(3, tw * 0.04, th * 0.04));
  const k = B / STRIP;
  // edges: mirror outward (edge at the trim line), 1:1 along the edge
  drawClipped(page, ep, m - B, m, B, th, m + k * tl, dy, -k, 1);                         // left
  drawClipped(page, ep, m + tw, m, B, th, (m + tw) + k * (tl + tw), dy, -k, 1);          // right
  drawClipped(page, ep, m, m - B, tw, B, dx, m + k * tb, 1, -k);                         // bottom
  drawClipped(page, ep, m, m + th, tw, B, dx, (m + th) + k * (tb + th), 1, -k);          // top
  // corners: mirror outward in both axes
  drawClipped(page, ep, m - B, m - B, B, B, m + k * tl, m + k * tb, -k, -k);             // BL
  drawClipped(page, ep, m + tw, m - B, B, B, (m + tw) + k * (tl + tw), m + k * tb, -k, -k); // BR
  drawClipped(page, ep, m - B, m + th, B, B, m + k * tl, (m + th) + k * (tb + th), -k, -k); // TL
  drawClipped(page, ep, m + tw, m + th, B, B, (m + tw) + k * (tl + tw), (m + th) + k * (tb + th), -k, -k); // TR
}

// Edge-stretch bleed for the WRONG-SHAPE fit case: the whole embedded page is
// placed at rect (ix,iy,dw,dh) on the canvas at scale (sx,sy) (media mw×mh).
// Mirror each edge that reaches the ordered trim outward into the bleed; a
// letterboxed proportional fit leaves the white bands white. Mirrors the raster
// path's fakeBleedRect.
function fakeBleedFit(page, ep, { m, B, Tw, Th, ix, iy, dw, dh, mw, mh, sx, sy }) {
  const eps = 0.5;
  const STRIP = Math.max(1, Math.min(3, dw * 0.04, dh * 0.04));
  const magx = B * sx / STRIP, magy = B * sy / STRIP; // mirror scale (outer STRIP → B)
  const W = mw * magx, H = mh * magy;                 // full mirrored draw extent
  const L = Math.abs(ix - m) < eps;
  const R = Math.abs((ix + dw) - (m + Tw)) < eps;
  const Bt = Math.abs(iy - m) < eps;
  const Tp = Math.abs((iy + dh) - (m + Th)) < eps;
  // edges (page lower-left pinned so the image edge is the mirror pivot)
  if (L)  drawClipped(page, ep, m - B,    iy,      B,  dh, ix,          iy,          -magx, sy);
  if (R)  drawClipped(page, ep, m + Tw,   iy,      B,  dh, (ix + dw) + W, iy,         -magx, sy);
  if (Bt) drawClipped(page, ep, ix,       m - B,   dw, B,  ix,          iy,           sx,  -magy);
  if (Tp) drawClipped(page, ep, ix,       m + Th,  dw, B,  ix,          (iy + dh) + H, sx, -magy);
  // corners
  if (L && Bt) drawClipped(page, ep, m - B,  m - B,  B, B, ix,          iy,          -magx, -magy);
  if (R && Bt) drawClipped(page, ep, m + Tw, m - B,  B, B, (ix + dw) + W, iy,         -magx, -magy);
  if (L && Tp) drawClipped(page, ep, m - B,  m + Th, B, B, ix,          (iy + dh) + H, -magx, -magy);
  if (R && Tp) drawClipped(page, ep, m + Tw, m + Th, B, B, (ix + dw) + W, (iy + dh) + H, -magx, -magy);
}

/**
 * @param {Uint8Array|ArrayBuffer} sourceBytes  the original PDF
 * @param {import('../core/canonical-model.js').PrintDocument} doc  parsed model (per-page boxes)
 * @param {{markLen?:number}} [opts]
 * @returns {Promise<{bytes:Uint8Array, notes:string[]}>}
 */
export async function renderPrintReadyPdf(sourceBytes, doc, { markLen = MARK_LEN, fit = 'fill' } = {}) {
  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  const embedded = await out.embedPdf(src, src.getPageIndices());
  const L = markLen;
  const required = doc.intent.requestedBleed ?? DEFAULT_BLEED;
  const notes = [];
  let addedBleedMargin = false;
  const useFit = fit !== 'fill'; // wrong-shape: fit source into the ordered size
  const OT = doc.intent.trimSize;

  const clipTo = (page, x, y, w, h) => page.pushOperators(
    pushGraphicsState(), moveTo(x, y), lineTo(x + w, y), lineTo(x + w, y + h), lineTo(x, y + h), closePath(), clip(), endPath());

  doc.pages.forEach((modelPage, i) => {
    const ep = embedded[i];
    const boxes = modelPage.boxes;
    const media = boxes.media;
    const trim = boxes.trim ?? media;             // source finished-size rect
    const have = existingBleed(boxes);
    const B = Math.max(required, have);
    if (have < required) addedBleedMargin = true;

    // Output trim = ordered size when fitting, else the source trim (1:1).
    const Tw = useFit ? OT.width : trim.width;
    const Th = useFit ? OT.height : trim.height;
    const m = B + L;
    const canvasW = Tw + 2 * m, canvasH = Th + 2 * m;
    const page = out.addPage([canvasW, canvasH]);

    if (!useFit) {
      const dx = m - (trim.x - media.x), dy = m - (trim.y - media.y);
      if (have < required) {
        const tl = trim.x - media.x, tb = trim.y - media.y;
        fakeBleed(page, ep, { m, B, tl, tb, tw: trim.width, th: trim.height, dx, dy });
      }
      page.drawPage(ep, { x: dx, y: dy });
    } else {
      const mw = media.width, mh = media.height;
      const bw = Tw + 2 * B, bh = Th + 2 * B;
      if (fit === 'proportional') {                 // contain in trim; edge-stretch bleed
        const s = Math.min(Tw / mw, Th / mh);
        const dw = mw * s, dh = mh * s;
        const ix = m + (Tw - dw) / 2, iy = m + (Th - dh) / 2;
        fakeBleedFit(page, ep, { m, B, Tw, Th, ix, iy, dw, dh, mw, mh, sx: s, sy: s });
        page.drawPage(ep, { x: ix, y: iy, xScale: s, yScale: s });
      } else if (fit === 'stretch') {               // distort to fill the trim; edge-stretch bleed
        const sx = Tw / mw, sy = Th / mh;
        fakeBleedFit(page, ep, { m, B, Tw, Th, ix: m, iy: m, dw: Tw, dh: Th, mw, mh, sx, sy });
        page.drawPage(ep, { x: m, y: m, xScale: sx, yScale: sy });
      } else {                                      // zoom: cover the bleed box with the visible part, crop
        const s = Math.max(bw / mw, bh / mh), dw = mw * s, dh = mh * s;
        clipTo(page, m - B, m - B, bw, bh);
        page.drawPage(ep, { x: (m - B) + (bw - dw) / 2, y: (m - B) + (bh - dh) / 2, xScale: s, yScale: s });
        page.pushOperators(popGraphicsState());
      }
    }

    for (const sg of cropMarks({ x: m, y: m }, { width: Tw, height: Th }, { w: canvasW, h: canvasH }, L)) {
      page.drawLine({ start: { x: sg.x1, y: sg.y1 }, end: { x: sg.x2, y: sg.y2 }, thickness: 0.5, color: cmyk(0, 0, 0, 1) });
    }
    page.setTrimBox(m, m, Tw, Th);
    page.setBleedBox(m - B, m - B, Tw + 2 * B, Th + 2 * B);
  });

  if (useFit) notes.push(`Scaled to the ordered size (${fit}). Crop marks and bleed added.`);
  else if (addedBleedMargin) notes.push('Bleed and crop marks added — the edge was stretched outward to fill the bleed, the way a designer fakes it. Check the result; for critical edges, extend your real artwork instead.');
  else notes.push('Crop marks added and trim/bleed boxes written. Your file already carried enough bleed, so your artwork is left untouched — it just needed the marks.');
  notes.push('Colours are unchanged from your file. If this press needs CMYK, convert in your design app before printing.');

  return { bytes: await out.save(), notes };
}
