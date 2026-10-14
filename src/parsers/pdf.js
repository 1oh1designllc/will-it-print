/**
 * parsers/pdf.js — PDF adapter (pdf-lib).
 *
 * Phase A (this): read the page boxes for real and run the box-based checks.
 *   - MediaBox always; TrimBox/BleedBox/CropBox read raw so we can tell
 *     "declared" from "absent" (absent -> pure builder infers, per D4).
 *   - This makes SIZE and BLEED real — the two most common rejection reasons.
 *     Validated against real Canva/design exports (trim 252x144, bleed 270x162).
 *
 * Colour is read here from image colour spaces (pdf-lib object graph).
 * Effective DPI is read by a best-effort pdf.js pass (pdf-dpi.js) — if that
 * fails, imagesKnown stays false and resolution reads "not checked yet", so a
 * PDF never gets a false green on an unchecked property.
 *
 * pdf-lib runs in the browser AND in Node, so this path is testable headless.
 */
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream } from 'pdf-lib';
import { buildPdfModel } from './pdf-model.js';
import { extractImagesPerPage } from './pdf-dpi.js';
import { ColorSpace } from '../core/canonical-model.js';

// A raw [x1,y1,x2,y2] box array -> {x,y,width,height}, or null if absent.
function rawBox(page, name) {
  const a = page.node.get(PDFName.of(name));
  if (!a || typeof a.get !== 'function' || a.size?.() < 4) return null;
  const n = (i) => a.get(i).asNumber();
  return { x: n(0), y: n(1), width: n(2) - n(0), height: n(3) - n(1) };
}

// Map a PDF colour-space object to our enum. Handles names, ICCBased (/N),
// Indexed (base), and common array forms.
function csFromObject(obj, ctx) {
  if (!obj) return null;
  const o = obj instanceof PDFName ? obj : obj;
  if (o instanceof PDFName) {
    const n = o.asString();
    if (n === '/DeviceRGB' || n === '/CalRGB' || n === '/RGB') return ColorSpace.RGB;
    if (n === '/DeviceCMYK' || n === '/CMYK') return ColorSpace.CMYK;
    if (n === '/DeviceGray' || n === '/CalGray' || n === '/G') return ColorSpace.GRAY;
    return null;
  }
  const arr = o instanceof PDFArray ? o : null;
  if (!arr) return null;
  const head = arr.get(0);
  const name = head instanceof PDFName ? head.asString() : '';
  if (name === '/ICCBased') {
    const stream = ctx.lookup(arr.get(1));
    const N = stream?.dict?.get(PDFName.of('N'))?.asNumber?.();
    return N === 4 ? ColorSpace.CMYK : N === 1 ? ColorSpace.GRAY : ColorSpace.RGB;
  }
  if (name === '/Indexed' || name === '/I') return csFromObject(ctx.lookup(arr.get(1)), ctx);
  if (name === '/DeviceN' || name === '/Separation') return ColorSpace.CMYK; // spot -> process
  if (name === '/CalRGB') return ColorSpace.RGB;
  if (name === '/CalGray') return ColorSpace.GRAY;
  return null;
}

// Walk a resources dict for image colour spaces, recursing into Form XObjects.
function collectColors(resources, ctx, out, seen) {
  const xobjs = resources && ctx.lookupMaybe(resources.get(PDFName.of('XObject')), PDFDict);
  if (!xobjs) return;
  for (const [, ref] of xobjs.entries()) {
    if (seen.has(ref)) continue; seen.add(ref);
    const xo = ctx.lookup(ref);
    const dict = xo?.dict || xo;
    if (!(dict instanceof PDFDict)) continue;
    const sub = dict.get(PDFName.of('Subtype'));
    const subName = sub instanceof PDFName ? sub.asString() : '';
    if (subName === '/Image') {
      const cs = csFromObject(ctx.lookup(dict.get(PDFName.of('ColorSpace'))), ctx);
      if (cs) out.add(cs);
    } else if (subName === '/Form') {
      collectColors(ctx.lookupMaybe(dict.get(PDFName.of('Resources')), PDFDict), ctx, out, seen);
    }
  }
}

// The set of colour families used by a page's IMAGES (pdf-lib object graph).
function imageColorSet(page, ctx) {
  const out = new Set();
  try { collectColors(ctx.lookupMaybe(page.node.get(PDFName.of('Resources')), PDFDict), ctx, out, new Set()); }
  catch { /* leave empty */ }
  return out;
}

// Reduce a set of colour families (image + vector) to one verdict colour.
function reduceColor(set) {
  const has = (c) => set.has(c);
  if (has(ColorSpace.RGB) && has(ColorSpace.CMYK)) return ColorSpace.MIXED;
  if (has(ColorSpace.RGB)) return ColorSpace.RGB;
  if (has(ColorSpace.CMYK)) return ColorSpace.CMYK;
  if (has(ColorSpace.GRAY)) return ColorSpace.GRAY;
  return ColorSpace.UNKNOWN;
}

/**
 * @param {ArrayBuffer|Uint8Array} data
 * @param {string} filename
 * @param {import('../canonical-model.js').PrintIntent} intent
 * @returns {Promise<import('../canonical-model.js').PrintDocument>}
 */
export async function parsePdf(data, filename, intent) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });

  const ctx = pdf.context;
  const rawPages = pdf.getPages().map((p) => {
    const mb = p.getMediaBox();
    return {
      media: { x: mb.x, y: mb.y, width: mb.width, height: mb.height },
      trim: rawBox(p, 'TrimBox'),
      bleed: rawBox(p, 'BleedBox'),
      crop: rawBox(p, 'CropBox'),
      _imageColors: imageColorSet(p, ctx),  // from images; vectors added below
      colorSpace: ColorSpace.UNKNOWN,
      imagesKnown: false,                    // set true below once DPI is read
      hasVector: true,
    };
  });

  // Best-effort pdf.js pass: content images (for DPI) + vector colours. Colour
  // is image colours ∪ vector colours, so a vector-only card is judged too. On
  // any failure, resolution stays "not checked" and colour falls back to images.
  try {
    const perPage = await extractImagesPerPage(bytes); // module copies + normalizes
    rawPages.forEach((rp, i) => {
      const pg = perPage[i] || { images: [], colors: new Set() };
      rp.images = pg.images;
      rp.imagesKnown = true;
      rp.colorSpace = reduceColor(new Set([...rp._imageColors, ...pg.colors]));
      delete rp._imageColors;
    });
  } catch {
    rawPages.forEach((rp) => { rp.colorSpace = reduceColor(rp._imageColors); delete rp._imageColors; });
  }

  return buildPdfModel(rawPages, filename, intent);
}
