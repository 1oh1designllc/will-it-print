/**
 * parsers/pdf.js  —  pdf.js ADAPTER  (⚠ SKELETON — verify in the browser)
 * ------------------------------------------------------------------
 * The impure half: pull raw values out of pdf.js and hand them to the
 * pure buildPdfModel (which is already tested). This file CANNOT run in
 * the Node harness — it needs pdf.js + a real PDF. Finish and verify it
 * against actual sample files in the app.
 *
 * Three integration snags are called out inline. They are the reason we
 * test this against real files instead of trusting it:
 *
 *   (A) Trim/BleedBox are NOT in pdf.js's public API. page.view gives
 *       the MediaBox∩CropBox only. The other boxes live in the page
 *       dictionary and must be read at a lower level — approach TBD
 *       against the installed pdf.js version.
 *   (B) Effective image DPI needs the CTM at paint time, which means
 *       walking the operator list and tracking the graphics-state stack
 *       (save/restore/transform) to get each image's placed size.
 *   (C) Page-level color space is genuinely hard in PDF (every object
 *       can differ). MVP: infer from placed-image color spaces; leave
 *       UNKNOWN when unsure so the color check returns "unverified"
 *       rather than guessing.
 * ------------------------------------------------------------------
 */
// import * as pdfjsLib from 'pdfjs-dist';   // set workerSrc in the app entry
import { buildPdfModel } from './pdf-model.js';
import { ColorSpace } from '../core/canonical-model.js';

/** [x1,y1,x2,y2] (pdf.js box array) -> {x,y,width,height} or null. */
function boxArr(a) {
  if (!a || a.length !== 4) return null;
  const x = Math.min(a[0], a[2]);
  const y = Math.min(a[1], a[3]);
  return { x, y, width: Math.abs(a[2] - a[0]), height: Math.abs(a[3] - a[1]) };
}

/**
 * @param {ArrayBuffer|Uint8Array} data  the PDF bytes
 * @param {string} filename
 * @param {import('../core/canonical-model.js').PrintIntent} intent
 * @returns {Promise<import('../core/canonical-model.js').PrintDocument>}
 */
export async function parsePdf(data, filename, intent) {
  const pdfjsLib = await import('pdfjs-dist');
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const rawPages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);

    // (A) MediaBox is available; Trim/Bleed/Crop need lower-level access.
    //     page.view is [x1,y1,x2,y2] of the visible (media∩crop) box.
    const media = boxArr(page.view);
    const trim = boxArr(readBox(page, 'TrimBox'));   // TODO: implement readBox
    const bleed = boxArr(readBox(page, 'BleedBox'));
    const crop = boxArr(readBox(page, 'CropBox'));

    // (B) images + effective DPI from the operator list.
    const images = await extractImages(page); // TODO: CTM tracking

    // (C) best-effort page color space.
    const colorSpace = pageColorSpace(images);

    rawPages.push({ media, trim, bleed, crop, images, colorSpace, hasVector: true });
  }

  // Everything below here is the already-tested pure path.
  return buildPdfModel(rawPages, filename, intent);
}

/* ---- stubs to implement against real files (see snags A–C) ---- */

/** (A) Read a named box from the page dictionary. Placeholder. */
function readBox(_page, _name) {
  // TODO: access the page dict for TrimBox/BleedBox/CropBox. Not public API.
  return null; // until then: null -> pure builder infers per D4
}

/** (B) Walk operator list, track CTM, emit placed images. Placeholder. */
async function extractImages(_page) {
  // TODO: getOperatorList(); on paintImageXObject use the current CTM to
  // derive placedWidth/Height (points); intrinsic px from page.objs.
  return [];
}

/** (C) Reduce image color spaces to a single page color space. */
function pageColorSpace(images) {
  if (!images.length) return ColorSpace.UNKNOWN;
  const set = new Set(images.map((im) => im.colorSpace).filter(Boolean));
  if (set.size === 1) return [...set][0];
  if (set.has(ColorSpace.RGB) && (set.has(ColorSpace.CMYK) || set.size > 1)) return ColorSpace.MIXED;
  return ColorSpace.UNKNOWN;
}
