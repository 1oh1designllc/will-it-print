/**
 * parsers/pdf-model.js
 * ------------------------------------------------------------------
 * The PURE half of PDF parsing: turn already-extracted raw page data
 * into the canonical model. No pdf.js here — this is where the domain
 * decisions live, so it must be testable without a PDF engine.
 *
 * D4 (settled): prefer DECLARED boxes; when a PDF omits them, INFER and
 * flag it. A PDF's coordinate space is already points, bottom-left
 * origin, so boxes drop straight in.
 *
 *   TrimBox + BleedBox declared -> real check      (inferred = false)
 *   BleedBox missing            -> bleed = MediaBox (inferred = true)
 *   TrimBox missing             -> trim = CropBox, else the ordered size
 *                                  centered in the media (inferred = true)
 *
 * `inferred = true` makes the bleed checker soften a shortfall from FAIL
 * to WARN, so we never hand a beginner a hard "fail" based on a box we
 * guessed. A warning is also attached so they know to set real boxes.
 * ------------------------------------------------------------------
 */
import {
  createDocument, createPage, createPlacedImage, rect, warning,
  ColorSpace, SourceFormat,
} from '../core/canonical-model.js';

const toRect = (r) => (r ? rect(r.x, r.y, r.width, r.height) : null);

/** Center the ordered trim size inside the media box (fallback trim). */
function centerIntent(media, intent) {
  const tw = intent.trimSize.width;
  const th = intent.trimSize.height;
  return rect(
    media.x + (media.width - tw) / 2,
    media.y + (media.height - th) / 2,
    tw, th,
  );
}

/**
 * Resolve the four boxes from one raw page, applying D4.
 * @returns {{media, trim, bleed, inferred, usedCropAsTrim}}
 */
export function resolveBoxes(raw, intent) {
  const media = toRect(raw.media);
  const declaredTrim = toRect(raw.trim);
  const cropTrim = toRect(raw.crop);
  const declaredBleed = toRect(raw.bleed);

  const trim = declaredTrim ?? cropTrim ?? centerIntent(media, intent);
  const bleed = declaredBleed ?? media; // media is the file's outer edge
  const inferred = !(raw.trim && raw.bleed); // we filled at least one box

  return { media, trim, bleed, inferred, usedCropAsTrim: !raw.trim && !!raw.crop };
}

/**
 * @param {Array} rawPages  plain page data from the pdf.js adapter
 * @param {string} filename
 * @param {import('../core/canonical-model.js').PrintIntent} intent
 * @returns {import('../core/canonical-model.js').PrintDocument}
 */
export function buildPdfModel(rawPages, filename, intent) {
  const doc = createDocument({ filename, sourceFormat: SourceFormat.PDF });
  doc.intent = intent;

  doc.pages = rawPages.map((raw, i) => {
    const { media, trim, bleed, inferred, usedCropAsTrim } = resolveBoxes(raw, intent);
    const page = createPage({ index: i, media, trim, bleed, inferred });
    page.colorSpace = raw.colorSpace ?? ColorSpace.UNKNOWN;
    page.hasVector = !!raw.hasVector;
    page.images = (raw.images ?? []).map((im) => createPlacedImage({
      id: im.id,
      nativeWidthPx: im.nativeWidthPx,
      nativeHeightPx: im.nativeHeightPx,
      placedWidth: im.placedWidth,
      placedHeight: im.placedHeight,
      colorSpace: im.colorSpace ?? ColorSpace.UNKNOWN,
      bbox: toRect(im.bbox),
    }));

    if (inferred) {
      doc.warnings.push(warning('pdf_boxes_inferred', `Page ${i + 1}: this PDF didn't declare all its trim/bleed boxes, so some were inferred from the page size and your specs. Treat the bleed result as a heads-up — set proper trim and bleed in your design app for a definitive check.`, i));
    }
    if (usedCropAsTrim) {
      doc.warnings.push(warning('pdf_crop_as_trim', `Page ${i + 1}: no TrimBox found, so the crop area was used as the finished size.`, i));
    }
    return page;
  });

  return doc;
}
