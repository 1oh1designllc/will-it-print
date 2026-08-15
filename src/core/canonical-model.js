/**
 * canonical-model.js
 * ------------------------------------------------------------------
 * The internal representation of an uploaded print file.
 *
 * Every PARSER (pdf, raster, later ai/eps) produces one of these.
 * Every CHECKER (bleed, resolution, color, dimensions...) reads one.
 * Neither side knows the other exists — this model is the contract.
 *
 * Conventions (do not break these downstream):
 *   - All lengths are in POINTS (1pt = 1/72 in). Convert at the edges
 *     (in units.js), never in the middle.
 *   - Rect origin is BOTTOM-LEFT, matching PDF user space, so pdf-lib
 *     boxes drop in without flipping. Raster parsers must translate.
 *   - Anything the parser could not determine is `null` + a warning,
 *     never a guessed number silently. Guessing is the checker's job,
 *     and it must know it's guessing (see `boxes.inferred`).
 * ------------------------------------------------------------------
 */

const PT_PER_INCH = 72;

/** @readonly */
export const ColorSpace = Object.freeze({
  RGB: 'rgb',
  CMYK: 'cmyk',
  GRAY: 'gray',
  SPOT: 'spot',
  MIXED: 'mixed',
  UNKNOWN: 'unknown',
});

/** @readonly */
export const PrintMethod = Object.freeze({
  DIGITAL: 'digital',
  OFFSET: 'offset',
  LARGE_FORMAT: 'large-format',
});

/** @readonly */
export const SourceFormat = Object.freeze({
  PDF: 'pdf',
  RASTER: 'raster', // png / jpg / tiff
});

/**
 * @typedef {Object} Rect
 * @property {number} x       Left edge, points, bottom-left origin.
 * @property {number} y       Bottom edge, points.
 * @property {number} width   Points.
 * @property {number} height  Points.
 */

/**
 * @typedef {Object} PrintIntent
 * What the user SAID they want. Checks are meaningless without it —
 * the same file passes for a banner and fails for offset litho.
 * @property {{width:number,height:number}} trimSize  Final cut size, points.
 * @property {string} product        e.g. 'business-card', 'flyer', 'poster'.
 * @property {string} printMethod    One of PrintMethod.
 * @property {1|2}    sides
 * @property {number} quantity
 * @property {?number} requestedBleed  Points. null = use ruleset default.
 */

/**
 * @typedef {Object} PageBoxes
 * @property {Rect}      media     Always present (the physical page).
 * @property {?Rect}     trim      null when the PDF didn't declare TrimBox.
 * @property {?Rect}     bleed     null when the PDF didn't declare BleedBox.
 * @property {boolean}   inferred  true if trim/bleed were guessed, not read.
 *                                 Checkers MUST soften fail->warn when true.
 */

/**
 * @typedef {Object} PlacedImage
 * A raster image placed on a page, with its resolution already resolved
 * at parse time so checkers stay dumb.
 * @property {string} id
 * @property {number} nativeWidthPx
 * @property {number} nativeHeightPx
 * @property {number} placedWidth   Points, as laid out on the page.
 * @property {number} placedHeight  Points.
 * @property {number} effectiveDpiX
 * @property {number} effectiveDpiY
 * @property {string} colorSpace    One of ColorSpace.
 * @property {Rect}   bbox          Where it sits, for annotated previews.
 */

/**
 * @typedef {Object} FontRef
 * @property {string}  name
 * @property {boolean} embedded
 * @property {boolean} subset
 */

/**
 * @typedef {Object} TextRun
 * Minimal for now; enough to test "is text inside the safe margin".
 * @property {Rect} bbox
 */

/**
 * @typedef {Object} ParseWarning
 * @property {string} code     Machine key, e.g. 'trimbox_missing'.
 * @property {string} message  Human sentence.
 * @property {?number} page    Page index, or null for document-level.
 */

/**
 * @typedef {Object} Page
 * @property {number}        index
 * @property {PageBoxes}     boxes
 * @property {string}        colorSpace   One of ColorSpace.
 * @property {PlacedImage[]} images
 * @property {boolean}       hasVector
 * @property {TextRun[]}     textRuns
 */

/**
 * @typedef {Object} PrintDocument
 * @property {Object}        meta
 * @property {string}        meta.filename
 * @property {string}        meta.sourceFormat  One of SourceFormat.
 * @property {string}        meta.importedAt    ISO string.
 * @property {?PrintIntent}  intent             null until the user fills the form.
 * @property {Page[]}        pages
 * @property {FontRef[]}     fonts              Document-level font table.
 * @property {ParseWarning[]} warnings
 */

/* ---------------------------------------------------------------- *
 * Factories — the ONE place defaults live. Extend the shape here,
 * and every parser inherits the new field for free.
 * ---------------------------------------------------------------- */

/** @returns {Rect} */
export function rect(x, y, width, height) {
  return { x, y, width, height };
}

/** @returns {PrintDocument} */
export function createDocument({ filename, sourceFormat }) {
  return {
    meta: {
      filename,
      sourceFormat,
      importedAt: new Date().toISOString(),
    },
    intent: null,
    pages: [],
    fonts: [],
    warnings: [],
  };
}

/** @returns {Page} */
export function createPage({ index, media, trim = null, bleed = null, inferred = false }) {
  return {
    index,
    boxes: { media, trim, bleed, inferred },
    colorSpace: ColorSpace.UNKNOWN,
    images: [],
    hasVector: false,
    textRuns: [],
  };
}

/**
 * Build a PlacedImage and compute its effective DPI in one shot, so the
 * resolution checker never does math — it just compares numbers.
 * @returns {PlacedImage}
 */
export function createPlacedImage({
  id,
  nativeWidthPx,
  nativeHeightPx,
  placedWidth,
  placedHeight,
  colorSpace = ColorSpace.UNKNOWN,
  bbox,
}) {
  return {
    id,
    nativeWidthPx,
    nativeHeightPx,
    placedWidth,
    placedHeight,
    effectiveDpiX: dpi(nativeWidthPx, placedWidth),
    effectiveDpiY: dpi(nativeHeightPx, placedHeight),
    colorSpace,
    bbox: bbox ?? rect(0, 0, placedWidth, placedHeight),
  };
}

export function warning(code, message, page = null) {
  return { code, message, page };
}

/* ---------------------------------------------------------------- *
 * Derived helpers — pure, so checkers and previews share one truth.
 * ---------------------------------------------------------------- */

/** Effective DPI of `px` native pixels displayed across `points`. */
export function dpi(px, points) {
  if (points <= 0) return 0;
  return px / (points / PT_PER_INCH);
}

/** Worst-case (lowest) DPI of an image — the number a checker cares about. */
export function minDpi(img) {
  return Math.min(img.effectiveDpiX, img.effectiveDpiY);
}

/** How much bleed exists on each side, in points. Negative = art falls short. */
export function bleedMargins(boxes) {
  if (!boxes.trim || !boxes.bleed) return null;
  const t = boxes.trim;
  const b = boxes.bleed;
  return {
    left: t.x - b.x,
    bottom: t.y - b.y,
    right: b.x + b.width - (t.x + t.width),
    top: b.y + b.height - (t.y + t.height),
  };
}

export const _internal = { PT_PER_INCH };
