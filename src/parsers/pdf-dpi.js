/**
 * parsers/pdf-dpi.js — effective-DPI extraction via pdf.js (best-effort).
 *
 * pdf-lib reads boxes and colour cleanly but not image placement; pdf.js
 * exposes the content stream, so we use it to get each placed image's
 * effective DPI. It also flattens the nested Form XObjects that Canva-style
 * exports wrap content in, so images inside those are found automatically.
 *
 * POLICY (decided against real exports): an image placed much larger than the
 * page — OVERSIZE× a page dimension — is a full-bleed background or an
 * off-canvas editor artifact (e.g. a 1050px image stretched to 2700pt = 28dpi
 * that sits under the real 300dpi card face). Judging the file by that layer
 * is a false alarm, so oversized placements are EXCLUDED from the verdict and
 * resolution is judged by the content images placed at ~page size.
 *
 * Non-fatal by design: any failure here (worker init, parse) is caught by the
 * caller, which then leaves imagesKnown=false so resolution reads
 * "not checked yet" rather than the app breaking.
 */
const OVERSIZE = 1.5;

let _pdfjs = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  // Legacy build runs both in modern browsers and in Node (CI/tests).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    // Vite resolves ?url to the bundled worker. If a bundler can't (e.g. Node),
    // pdf.js falls back to running on the main thread — fine for small files.
    const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch { /* main-thread fallback */ }
  _pdfjs = pdfjs;
  return pdfjs;
}

// multiply two affine matrices [a,b,c,d,e,f]
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

// A colour is "neutral" (prints as black/grey, no colour concern) when its
// channels are ~equal: RGB(0,0,0) black text, near-grey, etc. pdf.js reports
// RGB as 0–255 (occasionally 0–1), so normalise before comparing.
const NEUTRAL_EPS = 0.05;
const rgbNeutral = (r, g, b) => {
  const s = (r > 1 || g > 1 || b > 1) ? 255 : 1;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / s <= NEUTRAL_EPS;
};

// Is a fill the paper colour (white)? A white fill painted to the page edge is
// not "ink at the edge", so it doesn't create a bleed requirement.
const whiteRGB = (r, g, b) => { const s = (r > 1 || g > 1 || b > 1) ? 255 : 1; return r / s > 0.95 && g / s > 0.95 && b / s > 0.95; };

// affine helpers for the ink-bounds pass
const applyPt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * @param {Uint8Array} bytes  the PDF bytes (a copy — pdf.js may detach it)
 * @returns {Promise<Array<{images:Array, colors:Set<string>, inkBox:?Object}>>}
 *   per page: CONTENT placed-image descriptors (oversized excluded), the set of
 *   vector colour families used ('rgb'|'cmyk'|'gray'), and inkBox — the bounding
 *   box (media-origin-relative) of all NON-WHITE painted content, or null. inkBox
 *   answers "does the artwork reach the trim edge?" so a design that sits inside
 *   the trim with a white margin isn't forced to carry bleed it doesn't need.
 */
export async function extractImagesPerPage(bytes) {
  const pdfjs = await loadPdfjs();
  const { OPS } = pdfjs;
  const PAINT = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.stroke, OPS.closeFillStroke, OPS.closeEOFillStroke, OPS.closeStroke]);
  // pdf.js requires a plain Uint8Array (it rejects a Node Buffer). Uint8Array.from
  // gives a fresh copy that satisfies both Node (tests/CI) and the browser.
  const data = Uint8Array.from(bytes);
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const perPage = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const [vx0, vy0, vx1, vy1] = page.view;  // MediaBox in PDF points
    const pw = vx1 - vx0, ph = vy1 - vy0;
    const ol = await page.getOperatorList();

    let ctm = [1, 0, 0, 1, 0, 0];
    let fillWhite = true;           // current fill colour; default white = paper
    let pending = null;             // last constructed path, awaiting paint/clip
    const stack = [];
    const content = [];
    const colors = new Set();

    // inkBox accumulator, in media-origin-relative points.
    let ink = null;
    const grow = (x0, y0, x1, y1) => {
      if (![x0, y0, x1, y1].every(Number.isFinite)) return;
      if (!ink) ink = { x0, y0, x1, y1 };
      else { ink.x0 = Math.min(ink.x0, x0); ink.y0 = Math.min(ink.y0, y0); ink.x1 = Math.max(ink.x1, x1); ink.y1 = Math.max(ink.y1, y1); }
    };
    const addBox = (bb, m) => {
      const pts = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].map(([x, y]) => applyPt(m, x, y));
      const xs = pts.map((q) => q[0] - vx0), ys = pts.map((q) => q[1] - vy0);
      grow(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    };

    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) stack.push({ ctm: ctm.slice(), fillWhite });
      else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; fillWhite = s.fillWhite; } else ctm = [1, 0, 0, 1, 0, 0]; }
      else if (fn === OPS.transform) ctm = mul(a, ctm);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const iw = a[1], ih = a[2];                 // intrinsic px, from the op args
        const plw = Math.hypot(ctm[0], ctm[1]);     // placed width in points
        const plh = Math.hypot(ctm[2], ctm[3]);     // placed height in points
        if (!(plw > 0 && plh > 0 && iw > 0 && ih > 0)) continue;
        addBox([0, 0, 1, 1], ctm);                  // images count as ink (incl. backgrounds)
        if (plw > OVERSIZE * pw || plh > OVERSIZE * ph) continue; // excluded from DPI only
        content.push({
          id: `p${p}-img${content.length}`,
          nativeWidthPx: iw, nativeHeightPx: ih,
          placedWidth: plw, placedHeight: plh,
        });
      }
      else if (fn === OPS.constructPath) pending = { bb: a[2], ctm: ctm.slice() };
      else if (fn === OPS.shadingFill) { if (pending) addBox(pending.bb, pending.ctm); pending = null; }
      else if (PAINT.has(fn)) { if (pending && !fillWhite) addBox(pending.bb, pending.ctm); pending = null; }
      else if (fn === OPS.clip || fn === OPS.eoClip || fn === OPS.endPath) pending = null;
      // Vector fill/stroke colours — only chromatic ones count (black text set as
      // RGB(0,0,0) is neutral and prints fine as K, so it must not flag as RGB).
      else if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) {
        if (!rgbNeutral(a[0], a[1], a[2])) colors.add('rgb'); else colors.add('gray');
        if (fn === OPS.setFillRGBColor) fillWhite = whiteRGB(a[0], a[1], a[2]);
      } else if (fn === OPS.setFillCMYKColor || fn === OPS.setStrokeCMYKColor) {
        if (a[0] || a[1] || a[2]) colors.add('cmyk'); else colors.add('gray'); // C=M=Y=0 -> pure K
        if (fn === OPS.setFillCMYKColor) fillWhite = !(a[0] || a[1] || a[2] || a[3]);
      } else if (fn === OPS.setFillGray || fn === OPS.setStrokeGray) {
        colors.add('gray');
        if (fn === OPS.setFillGray) fillWhite = a[0] > 0.95;
      }
    }
    perPage.push({ images: content, colors, inkBox: ink });
  }
  return perPage;
}
