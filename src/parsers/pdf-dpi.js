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

/**
 * @param {Uint8Array} bytes  the PDF bytes (a copy — pdf.js may detach it)
 * @returns {Promise<Array<{images:Array, colors:Set<string>}>>}
 *   per page: CONTENT placed-image descriptors (oversized excluded) and the set
 *   of vector colour families actually used ('rgb'|'cmyk'|'gray'), neutrals aside.
 */
export async function extractImagesPerPage(bytes) {
  const pdfjs = await loadPdfjs();
  const { OPS } = pdfjs;
  // pdf.js requires a plain Uint8Array (it rejects a Node Buffer). Uint8Array.from
  // gives a fresh copy that satisfies both Node (tests/CI) and the browser.
  const data = Uint8Array.from(bytes);
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const perPage = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const [x0, y0, x1, y1] = page.view;      // MediaBox
    const pw = x1 - x0, ph = y1 - y0;
    const ol = await page.getOperatorList();

    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const content = [];
    const colors = new Set();
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(a, ctm);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const iw = a[1], ih = a[2];                 // intrinsic px, from the op args
        const plw = Math.hypot(ctm[0], ctm[1]);     // placed width in points
        const plh = Math.hypot(ctm[2], ctm[3]);     // placed height in points
        if (!(plw > 0 && plh > 0 && iw > 0 && ih > 0)) continue;
        if (plw > OVERSIZE * pw || plh > OVERSIZE * ph) continue; // background/artifact
        content.push({
          id: `p${p}-img${content.length}`,
          nativeWidthPx: iw, nativeHeightPx: ih,
          placedWidth: plw, placedHeight: plh,
        });
      }
      // Vector fill/stroke colours — only chromatic ones count (black text set as
      // RGB(0,0,0) is neutral and prints fine as K, so it must not flag as RGB).
      else if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) {
        if (!rgbNeutral(a[0], a[1], a[2])) colors.add('rgb'); else colors.add('gray');
      } else if (fn === OPS.setFillCMYKColor || fn === OPS.setStrokeCMYKColor) {
        if (a[0] || a[1] || a[2]) colors.add('cmyk'); else colors.add('gray'); // C=M=Y=0 -> pure K
      } else if (fn === OPS.setFillGray || fn === OPS.setStrokeGray) {
        colors.add('gray');
      }
    }
    perPage.push({ images: content, colors });
  }
  return perPage;
}
