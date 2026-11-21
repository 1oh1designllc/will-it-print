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
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
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

// --- Vector colour & spot plates, read straight from the content stream ------
// pdf.js flattens DeviceCMYK and Separation (spot) VECTOR fills to RGB in its
// operator list, so genuine CMYK art read as "RGB" and spot (Pantone) plates
// were invisible. We read colour from the decoded page content ourselves, which
// sees the real device operators and the named Separation/DeviceN colour spaces.

const latin1 = (u8) => new TextDecoder('latin1').decode(u8);

// Decode a PDF name's #XX hex escapes: "PANTONE#201945#20U" -> "PANTONE 1945 U".
const decodeName = (s) => (s || '').replace(/^\//, '')
  .replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// Scan decoded content-stream text for chromatic device colour. A neutral set
// (black text as 0 0 0 rg, white, pure K) must NOT flag as RGB/CMYK — it prints
// fine as K — so only chromatic fills count, mirroring the image-colour rules.
function scanVectorColors(txt) {
  const out = new Set();
  const num = '(-?\\d*\\.?\\d+)';
  const sp = '\\s+';
  let m;
  const rg = new RegExp(num + sp + num + sp + num + sp + '(rg|RG)(?=[^A-Za-z]|$)', 'g');
  while ((m = rg.exec(txt))) { const r = +m[1], g = +m[2], b = +m[3]; out.add(r === g && g === b ? 'gray' : 'rgb'); }
  const k = new RegExp(num + sp + num + sp + num + sp + num + sp + '(k|K)(?=[^A-Za-z]|$)', 'g');
  while ((m = k.exec(txt))) { const c = +m[1], mg = +m[2], y = +m[3]; out.add(c || mg || y ? 'cmyk' : 'gray'); }
  // scn/SCN with 3 or 4 numeric operands = ICCBased/Device RGB or CMYK set via cs.
  const scn = new RegExp('(?:' + num + sp + '){3,4}(scn|SCN)(?=[^A-Za-z]|$)', 'g');
  while ((m = scn.exec(txt))) {
    const nums = m[0].trim().split(/\s+/).slice(0, -1).map(Number);
    if (nums.length === 4) { out.add(nums[0] || nums[1] || nums[2] ? 'cmyk' : 'gray'); }
    else if (nums.length === 3) { out.add(nums[0] === nums[1] && nums[1] === nums[2] ? 'gray' : 'rgb'); }
  }
  return out;
}

// One page's content text (own streams + Form XObject streams, recursively) and
// the set of spot (Separation / DeviceN) ink names declared in its resources.
function contentAndSpots(page, ctx) {
  const parts = [];
  const spots = new Set();
  const seen = new Set();
  const decode = (s) => { try { return latin1(decodePDFRawStream(s).decode()); } catch { return ''; } };

  // Separations named for a process ink (or the special All/None) are NOT extra
  // plates — they're just CMYK expressed channel-by-channel. Only true named
  // inks (Pantones, varnishes, metallics) count as spot plates.
  const PROCESS = new Set(['cyan', 'magenta', 'yellow', 'black', 'all', 'none']);
  const addSpot = (o) => {
    if (!(o instanceof PDFArray)) return;
    const head = o.get(0);
    const nm = head instanceof PDFName ? head.asString() : '';
    const keep = (raw) => { const n = decodeName(raw); if (n && !PROCESS.has(n.trim().toLowerCase())) spots.add(n); };
    if (nm === '/Separation') {
      const n = o.get(1);
      keep(n instanceof PDFName ? n.asString() : 'Spot');
    } else if (nm === '/DeviceN') {
      const names = ctx.lookup(o.get(1));
      if (names instanceof PDFArray) names.asArray().forEach((x) => {
        const v = ctx.lookup(x);
        if (v instanceof PDFName) keep(v.asString());
      });
    }
  };

  const walk = (resources) => {
    if (!resources) return;
    const csd = ctx.lookupMaybe(resources.get(PDFName.of('ColorSpace')), PDFDict);
    if (csd) for (const [, ref] of csd.entries()) addSpot(ctx.lookup(ref));
    const xo = ctx.lookupMaybe(resources.get(PDFName.of('XObject')), PDFDict);
    if (xo) for (const [, ref] of xo.entries()) {
      if (seen.has(ref)) continue; seen.add(ref);
      const x = ctx.lookup(ref);
      const dict = x?.dict || x;
      if (!(dict instanceof PDFDict)) continue;
      const sub = dict.get(PDFName.of('Subtype'));
      if (sub instanceof PDFName && sub.asString() === '/Form') {
        if (x instanceof PDFRawStream) parts.push(decode(x));
        walk(ctx.lookupMaybe(dict.get(PDFName.of('Resources')), PDFDict));
      }
    }
  };

  // Top-level page content (single stream or array of streams).
  let node = ctx.lookup(page.node.get(PDFName.of('Contents')));
  const streams = node instanceof PDFArray ? node.asArray().map((r) => ctx.lookup(r)) : [node];
  for (const s of streams) if (s instanceof PDFRawStream) parts.push(decode(s));

  walk(ctx.lookupMaybe(page.node.get(PDFName.of('Resources')), PDFDict));
  return { colors: scanVectorColors(parts.join('\n')), spots: [...spots] };
}

// --- Font embedding ---------------------------------------------------------
// A font is embedded when its descriptor carries the font program
// (FontFile / FontFile2 / FontFile3); Type3 fonts define their glyphs inline.
// The 14 standard base fonts have no descriptor — the RIP has them, so a
// non-embedded standard font is a minor heads-up, a non-embedded custom one a
// real substitution risk.
const STD14 = new Set([
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Symbol', 'ZapfDingbats',
]);

// Strip a subset prefix ("ABCDEF+") and the leading slash from a BaseFont name.
const baseName = (bf) => {
  const n = (bf || '').replace(/^\//, '');
  return (n.length > 7 && n[6] === '+') ? n.slice(7) : n;
};

function collectFonts(resources, ctx, out, seen) {
  if (!resources) return;
  const fontDict = ctx.lookupMaybe(resources.get(PDFName.of('Font')), PDFDict);
  if (fontDict) {
    for (const [, ref] of fontDict.entries()) {
      try {
        const f = ctx.lookup(ref);
        if (!(f instanceof PDFDict)) continue;
        const sub = f.get(PDFName.of('Subtype'));
        const subName = sub instanceof PDFName ? sub.asString() : '';
        const bf = f.get(PDFName.of('BaseFont'));
        const base = baseName(bf instanceof PDFName ? bf.asString() : '');
        let descriptor = null;
        if (subName === '/Type0') {
          const desc = ctx.lookupMaybe(f.get(PDFName.of('DescendantFonts')), PDFArray);
          const d0 = desc && desc.size() ? ctx.lookup(desc.get(0)) : null;
          descriptor = d0 instanceof PDFDict ? ctx.lookupMaybe(d0.get(PDFName.of('FontDescriptor')), PDFDict) : null;
        } else {
          descriptor = ctx.lookupMaybe(f.get(PDFName.of('FontDescriptor')), PDFDict);
        }
        const hasFile = !!descriptor && !!(
          descriptor.get(PDFName.of('FontFile')) ||
          descriptor.get(PDFName.of('FontFile2')) ||
          descriptor.get(PDFName.of('FontFile3'))
        );
        const embedded = hasFile || subName === '/Type3';
        out.push({ name: base || '(unnamed)', embedded, standard: STD14.has(base) });
      } catch { /* skip this font */ }
    }
  }
  // Recurse into Form XObjects (their own font resources).
  const xobjs = ctx.lookupMaybe(resources.get(PDFName.of('XObject')), PDFDict);
  if (xobjs) {
    for (const [, ref] of xobjs.entries()) {
      if (seen.has(ref)) continue; seen.add(ref);
      const xo = ctx.lookup(ref);
      const dict = xo?.dict || xo;
      if (!(dict instanceof PDFDict)) continue;
      const st = dict.get(PDFName.of('Subtype'));
      if ((st instanceof PDFName ? st.asString() : '') === '/Form') {
        collectFonts(ctx.lookupMaybe(dict.get(PDFName.of('Resources')), PDFDict), ctx, out, seen);
      }
    }
  }
}

// Unique fonts used by one page (dedup by name + embedded flag).
function pageFonts(page, ctx) {
  const raw = [];
  try { collectFonts(ctx.lookupMaybe(page.node.get(PDFName.of('Resources')), PDFDict), ctx, raw, new Set()); }
  catch { /* leave empty */ }
  const seen = new Set(), uniq = [];
  for (const f of raw) { const k = `${f.name}|${f.embedded}`; if (!seen.has(k)) { seen.add(k); uniq.push(f); } }
  return uniq;
}

/**
 * @param {ArrayBuffer|Uint8Array} data
 * @param {string} filename
 * @param {import('../canonical-model.js').PrintIntent} intent
 * @returns {Promise<import('../canonical-model.js').PrintDocument>}
 */
export async function parsePdf(data, filename, intent) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let pdf;
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    // Owner-password ("permissions") PDFs are common and still readable — retry
    // ignoring encryption. A real user-password PDF can't be read: flag it clearly.
    if (/encrypt/i.test(e?.message || '')) {
      try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true }); }
      catch { const err = new Error('This PDF is password-protected'); err.code = 'ENCRYPTED'; throw err; }
    } else { throw e; }
  }

  const ctx = pdf.context;
  const rawPages = pdf.getPages().map((p) => {
    const mb = p.getMediaBox();
    const cas = contentAndSpots(p, ctx);     // real vector colours + spot plates
    return {
      media: { x: mb.x, y: mb.y, width: mb.width, height: mb.height },
      trim: rawBox(p, 'TrimBox'),
      bleed: rawBox(p, 'BleedBox'),
      crop: rawBox(p, 'CropBox'),
      _imageColors: imageColorSet(p, ctx),   // from images (object graph)
      _vectorColors: cas.colors,             // from decoded content stream
      spots: cas.spots,                      // Separation / DeviceN ink names
      colorSpace: ColorSpace.UNKNOWN,
      imagesKnown: false,                    // set true below once DPI is read
      hasVector: true,
      fonts: pageFonts(p, ctx),              // embedded-font check
      fontsKnown: true,
    };
  });

  // Colour verdict = image colours ∪ real vector colours (read from the content
  // stream above). We deliberately do NOT use pdf.js's vector colours here: it
  // flattens CMYK/spot fills to RGB, which falsely flagged CMYK art as RGB. The
  // pdf.js pass still runs — for image DPI, and as a last-resort colour fallback
  // only when we read nothing ourselves (an unreadable/edge-case content stream).
  try {
    const perPage = await extractImagesPerPage(bytes); // module copies + normalizes
    rawPages.forEach((rp, i) => {
      const pg = perPage[i] || { images: [], colors: new Set() };
      rp.images = pg.images;
      rp.imagesKnown = true;
      const base = new Set([...rp._imageColors, ...rp._vectorColors]);
      if (base.size === 0) for (const c of pg.colors) base.add(c); // fallback only
      rp.colorSpace = reduceColor(base);
      delete rp._imageColors; delete rp._vectorColors;
    });
  } catch {
    rawPages.forEach((rp) => {
      rp.colorSpace = reduceColor(new Set([...rp._imageColors, ...rp._vectorColors]));
      delete rp._imageColors; delete rp._vectorColors;
    });
  }

  return buildPdfModel(rawPages, filename, intent);
}
