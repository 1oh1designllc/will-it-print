/**
 * fix/render.js — raster → print-ready PDF (pdf-lib).
 *
 * The image is placed at the TRIM exactly (1:1, no zoom), and the bleed is
 * FAKED the way a designer would: each outermost edge strip is mirrored outward
 * to fill the bleed, with the real edge pinned at the trim line so the seam is
 * clean. The image is drawn on top of the bleed, covering the trim, so the
 * design itself is untouched — only the bleed margins are synthesized.
 *
 * (Rotated-to-fit images fall back to filling trim+bleed, since edge-stretch on
 * a rotated raster is a separate case; flagged in the note.)
 *
 * Colour: pdf-lib has no colour management, so RGB→CMYK isn't done here — the
 * embedded raster keeps its space; plan.notes carries the caveat.
 */
import { resolveDraw } from './plan.js';

// Draw the image scaled/mirrored, clipped to one margin rectangle.
function drawClipped(ops, page, img, cx, cy, cw, ch, x, y, w, h) {
  const { pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } = ops;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(cx, cy), lineTo(cx + cw, cy), lineTo(cx + cw, cy + ch), lineTo(cx, cy + ch), closePath(),
    clip(), endPath(),
  );
  page.drawImage(img, { x, y, width: w, height: h }); // negative w/h mirrors the strip outward
  page.pushOperators(popGraphicsState());
}

// Mirror the placed image's outermost edge strips into the bleed. Works off the
// PLACED image rect (ix,iy,dw,dh) in canvas coords, not an assumed trim-fill, so
// a letterboxed proportional fit only mirrors the edges that actually reach the
// trim — the white letterbox bands stay white into the bleed (as they should).
function fakeBleedRect(ops, page, img, { m, B, T, ix, iy, dw, dh }) {
  const eps = 0.5;
  const STRIP = Math.max(1, Math.min(3, dw * 0.04, dh * 0.04));
  const wx = B * dw / STRIP; // full mirrored draw width  (outer STRIP → B band)
  const wy = B * dh / STRIP; // ... height
  const L = Math.abs(ix - m) < eps;                       // reaches trim left
  const R = Math.abs((ix + dw) - (m + T.w)) < eps;        // ... right
  const Bt = Math.abs(iy - m) < eps;                      // ... bottom
  const Tp = Math.abs((iy + dh) - (m + T.h)) < eps;       // ... top
  // edges (mirror outward, pinned at the image edge; spans only the image extent)
  if (L)  drawClipped(ops, page, img, m - B,     iy,      B,  dh, ix,            iy,            -wx, dh);
  if (R)  drawClipped(ops, page, img, m + T.w,   iy,      B,  dh, (ix + dw) + wx, iy,           -wx, dh);
  if (Bt) drawClipped(ops, page, img, ix,        m - B,   dw, B,  ix,            iy,             dw, -wy);
  if (Tp) drawClipped(ops, page, img, ix,        m + T.h, dw, B,  ix,            (iy + dh) + wy, dw, -wy);
  // corners (only where both adjacent edges reach the trim)
  if (L && Bt) drawClipped(ops, page, img, m - B,   m - B,   B, B, ix,            iy,             -wx, -wy);
  if (R && Bt) drawClipped(ops, page, img, m + T.w, m - B,   B, B, (ix + dw) + wx, iy,            -wx, -wy);
  if (L && Tp) drawClipped(ops, page, img, m - B,   m + T.h, B, B, ix,            (iy + dh) + wy, -wx, -wy);
  if (R && Tp) drawClipped(ops, page, img, m + T.w, m + T.h, B, B, (ix + dw) + wx, (iy + dh) + wy, -wx, -wy);
}

// Proportional fit of an image (aspect a) into a box — contain (fits inside)
// or cover (fills, overflows). Returns the drawn width/height in points.
function containRect(a, boxW, boxH) {
  return a > boxW / boxH ? { dw: boxW, dh: boxW / a } : { dw: boxH * a, dh: boxH };
}
function coverRect(a, boxW, boxH) {
  return a > boxW / boxH ? { dw: boxH * a, dh: boxH } : { dw: boxW, dh: boxW / a };
}

/**
 * @param {ReturnType<import('./plan.js').buildFixPlan>} plan
 * @param {{ kind:'raster', bytes:Uint8Array, imageType?:'png'|'jpg'|'tiff' }} source
 * @param {{ fit?: 'fill'|'proportional'|'stretch'|'zoom' }} [opts]
 *   fit is 'fill' for a correctly-shaped file; for a WRONG-SHAPE file it is the
 *   user's chosen fit — proportional (white border), stretch (distort), zoom (crop).
 * @returns {Promise<Uint8Array>} the print-ready PDF bytes
 */
export async function renderPrintReady(plan, source, { fit = 'fill' } = {}) {
  const ops = await import('pdf-lib');
  const { PDFDocument, cmyk, degrees } = ops;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([plan.canvasPt.w, plan.canvasPt.h]);
  const T = plan.trimPt, o = plan.trimOrigin, B = plan.bleedPt;
  const m = o.x; // trim origin (x === y)

  const img = source.imageType === 'png'
    ? await pdf.embedPng(source.bytes)
    : await pdf.embedJpg(source.bytes);
  const a = img.width / img.height;
  const rot = ((plan.rotate % 360) + 360) % 360;

  if (rot !== 0) {
    // Rotated to fit: fill trim+bleed (slight zoom) rather than edge-stretch.
    const d = resolveDraw(plan);
    page.drawImage(img, { x: d.x, y: d.y, width: d.width, height: d.height, rotate: degrees(d.rotate) });
  } else if (fit === 'proportional') {
    // Contain inside the trim, centered; mirror the edges that meet the trim
    // outward for bleed (the white letterbox bands keep white bleed).
    const { dw, dh } = containRect(a, T.w, T.h);
    const ix = m + (T.w - dw) / 2, iy = m + (T.h - dh) / 2;
    fakeBleedRect(ops, page, img, { m, B, T, ix, iy, dw, dh });
    page.drawImage(img, { x: ix, y: iy, width: dw, height: dh });
  } else if (fit === 'stretch') {
    // Distort to fill the trim; mirror its edges outward for bleed.
    fakeBleedRect(ops, page, img, { m, B, T, ix: m, iy: m, dw: T.w, dh: T.h });
    page.drawImage(img, { x: m, y: m, width: T.w, height: T.h });
  } else if (fit === 'zoom') {
    // Cover the whole bleed box with real content (crops the overflow) — the
    // image genuinely fills the bleed with the visible part, so no faking.
    const bw = T.w + 2 * B, bh = T.h + 2 * B;
    const { dw, dh } = coverRect(a, bw, bh);
    drawClipped(ops, page, img, m - B, m - B, bw, bh,
      (m - B) + (bw - dw) / 2, (m - B) + (bh - dh) / 2, dw, dh);
  } else {
    // 'fill' — correctly-shaped file: image at trim, edge-stretch bleed.
    fakeBleedRect(ops, page, img, { m, B, T, ix: m, iy: m, dw: T.w, dh: T.h });
    page.drawImage(img, { x: m, y: m, width: T.w, height: T.h });
  }

  // Crop marks — registration black, hairline.
  for (const s of plan.cropMarks) {
    page.drawLine({ start: { x: s.x1, y: s.y1 }, end: { x: s.x2, y: s.y2 }, thickness: 0.5, color: cmyk(0, 0, 0, 1) });
  }

  page.setTrimBox(o.x, o.y, T.w, T.h);
  page.setBleedBox(o.x - B, o.y - B, T.w + 2 * B, T.h + 2 * B);
  return pdf.save();
}
