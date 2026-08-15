/**
 * parsers/raster.js
 * ------------------------------------------------------------------
 * Turn an uploaded raster (PNG or JPEG) into the canonical model.
 *
 * Two decisions specific to rasters:
 *
 * 1. RESOLUTION IS MEASURED AT THE ORDERED SIZE, not the file's DPI tag.
 *    A phone photo says "72 dpi" in its metadata, which is meaningless —
 *    what matters is how many pixels land across the printed inches. So
 *    we place the image to fill the ordered width and let the model
 *    compute effective DPI from that. The embedded DPI is ignored.
 *
 * 2. A FLAT RASTER HAS NO BLEED. We don't invent one — bleed stays null,
 *    so the bleed check returns "unverified" (honest) rather than a fake
 *    pass, and we attach a warning explaining why.
 *
 * Reads dimensions + color mode from the file header (PNG, JPEG, TIFF), so it
 * works the same in Node and the browser, and it can see a CMYK JPEG/TIFF that
 * a decoded <img> bitmap would hide behind RGBA.
 * ------------------------------------------------------------------
 */
import {
  createDocument, createPage, createPlacedImage, rect, warning,
  ColorSpace, SourceFormat,
} from '../core/canonical-model.js';

export class UnsupportedFormatError extends Error {}

const u32 = (b, o) => b[o] * 16777216 + b[o + 1] * 65536 + b[o + 2] * 256 + b[o + 3];
const u16 = (b, o) => b[o] * 256 + b[o + 1];

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

function sniff(b) {
  if (PNG_SIG.every((v, i) => b[i] === v)) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'tiff';
  return 'unknown';
}

function parsePNG(b) {
  // IHDR is the first chunk: [8 sig][4 len][4 'IHDR'][w4][h4][depth1][colorType1]...
  const width = u32(b, 16);
  const height = u32(b, 20);
  const colorType = b[25];
  const cs = { 0: ColorSpace.GRAY, 4: ColorSpace.GRAY, 2: ColorSpace.RGB, 6: ColorSpace.RGB, 3: ColorSpace.RGB }[colorType] ?? ColorSpace.UNKNOWN;
  return { width, height, colorSpace: cs };
}

function parseJPEG(b) {
  let i = 2; // past SOI
  while (i < b.length - 1) {
    if (b[i] !== 0xff) { i++; continue; }
    let marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }             // fill byte
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // no length
    const len = u16(b, i + 2);
    // SOF markers carry the frame header (skip DHT C4, JPG C8, DAC CC).
    const isSOF = marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const height = u16(b, i + 5);
      const width = u16(b, i + 7);
      const comps = b[i + 9];
      const cs = comps === 1 ? ColorSpace.GRAY
        : comps === 4 ? ColorSpace.CMYK
        : comps === 3 ? ColorSpace.RGB
        : ColorSpace.UNKNOWN;
      return { width, height, colorSpace: cs };
    }
    i += 2 + len;
  }
  throw new Error('JPEG: no start-of-frame marker found');
}

// TIFF: endian-aware IFD read for dimensions + color (photometric interpretation).
function parseTIFF(b) {
  const le = b[0] === 0x49;
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) => (le
    ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
    : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
  const ifd = u32(4);
  const n = u16(ifd);
  let width, height, photometric = 2;
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e); const type = u16(e + 2);
    const val = type === 3 ? u16(e + 8) : u32(e + 8); // SHORT inline vs LONG
    if (tag === 256) width = val;
    else if (tag === 257) height = val;
    else if (tag === 262) photometric = val;
  }
  const cs = photometric === 5 ? ColorSpace.CMYK
    : (photometric === 0 || photometric === 1) ? ColorSpace.GRAY
    : ColorSpace.RGB;
  return { width, height, colorSpace: cs };
}

/**
 * @param {Uint8Array} bytes  raw file bytes
 * @param {string} filename
 * @param {import('../core/canonical-model.js').PrintIntent} intent
 * @returns {import('../core/canonical-model.js').PrintDocument}
 */
export function parseRaster(bytes, filename, intent) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const kind = sniff(b);

  let info;
  if (kind === 'png') info = parsePNG(b);
  else if (kind === 'jpeg') info = parseJPEG(b);
  else if (kind === 'tiff') info = parseTIFF(b);
  else throw new UnsupportedFormatError('Not a recognized raster file (PNG or JPEG).');

  const doc = createDocument({ filename, sourceFormat: SourceFormat.RASTER });
  doc.intent = intent;

  // Place the image to fill the ordered WIDTH. Height follows the pixel
  // aspect ratio, so the dimensions check compares real proportions and
  // effective DPI is measured at the printed size.
  const tw = intent.trimSize.width;
  const scale = tw / info.width;          // points per pixel
  const placedW = tw;
  const placedH = info.height * scale;
  const box = rect(0, 0, placedW, placedH);

  const page = createPage({ index: 0, media: box, trim: box, bleed: null, inferred: false });
  page.colorSpace = info.colorSpace;
  page.images.push(createPlacedImage({
    id: filename,
    nativeWidthPx: info.width,
    nativeHeightPx: info.height,
    placedWidth: placedW,
    placedHeight: placedH,
    colorSpace: info.colorSpace,
    bbox: box,
  }));
  doc.pages = [page];

  doc.warnings.push(warning('raster_no_bleed',
    "Raster files don't carry bleed information, so bleed can't be verified from the file. If this export already includes bleed, let us know; otherwise add bleed in your design app.", 0));
  doc.warnings.push(warning('raster_size_assumed',
    `Print size assumes the image fills the ordered width (${(tw / 72).toFixed(2)} in); resolution is measured at that size.`, 0));

  return doc;
}
