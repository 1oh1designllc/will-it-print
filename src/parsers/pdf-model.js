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

  const tol = 1; // points (~0.35mm) — absorbs rounding

  // A declared TrimBox (or CropBox) equal to the MediaBox is NOT a real cut
  // line — it's the whole page. Illustrator/InDesign/Canva routinely export the
  // finished art WITH bleed baked in but leave every box set to the page size,
  // so there's no usable trim to trust. Only treat a declared box as the trim
  // when it's actually inset from the page.
  const isInset = (r) => !!r && (r.width < media.width - tol || r.height < media.height - tol);
  const trimInset = isInset(declaredTrim);
  const cropIsInset = isInset(cropTrim);

  // Baked-bleed inference: a bogus full-page TrimBox hides a real trim only when
  // the ORDERED size is genuinely smaller than the page by a plausible,
  // symmetric bleed margin (real overrun to treat as bleed). A ~zero margin
  // means the page IS the ordered size — a flat, no-bleed file, NOT baked bleed —
  // so we leave the declared boxes alone and let the bleed check flag it.
  const ordered = intent?.trimSize;
  let inferredTrim = null;
  if (!trimInset && !cropIsInset && ordered) {
    const mW = (media.width - ordered.width) / 2;  // margin per side
    const mH = (media.height - ordered.height) / 2;
    const MIN_BLEED = 1;          // pt — need real overrun, else it's a flat page
    const MAX_BLEED = 0.375 * 72; // 27pt — generous; real bleeds are 0.125–0.25"
    const SYM = 3;                // pt — baked bleed is symmetric all around
    const plausible =
      ordered.width <= media.width + tol && ordered.height <= media.height + tol &&
      mW >= MIN_BLEED && mH >= MIN_BLEED &&
      mW <= MAX_BLEED && mH <= MAX_BLEED &&
      Math.abs(mW - mH) <= SYM;
    if (plausible) inferredTrim = centerIntent(media, intent);
  }
  const usedInferredTrim = !!inferredTrim;

  const trim = trimInset ? declaredTrim
             : cropIsInset ? cropTrim
             : usedInferredTrim ? inferredTrim
             : (declaredTrim ?? cropTrim ?? media);

  // Bleed is real only when a declared BleedBox actually extends past the trim;
  // otherwise the media edge is the outer bound (the art bleeds to the page).
  const bleedValid = !!declaredBleed && (
    declaredBleed.width > trim.width + tol || declaredBleed.height > trim.height + tol
  );
  const bleed = bleedValid ? declaredBleed : media;

  // Softening flag for the bleed check. We "inferred" when we filled the trim
  // ourselves (baked-bleed guess or CropBox-as-trim). With a trusted inset
  // TrimBox we inferred only if the bleed wasn't declared. For a flat page where
  // nothing was inset, fall back to the original rule: boxes explicitly declared
  // (even == page) are an authored "no bleed" → a hard result, not a soft guess.
  let inferred;
  if (trimInset) inferred = !bleedValid;
  else if (usedInferredTrim || cropIsInset) inferred = true;
  else inferred = !(raw.trim && raw.bleed);

  const usedCropAsTrim = !trimInset && cropIsInset;

  return { media, trim, bleed, inferred, usedCropAsTrim };
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
    const page = createPage({ index: i, media, trim, bleed, inferred, imagesKnown: raw.imagesKnown ?? true });
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
