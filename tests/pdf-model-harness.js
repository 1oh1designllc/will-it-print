/**
 * pdf-model-harness.js  —  run with:  node pdf-model-harness.js
 * ------------------------------------------------------------------
 * Tests the PURE PDF builder (box resolution + D4 inference). Raw pages
 * are plain objects in the exact shape the pdf.js adapter will emit, so
 * the decision logic is proven without a PDF engine. Asserts the model
 * (boxes, inferred flag) AND the resulting verdict.
 * ------------------------------------------------------------------
 */
import { PrintMethod, ColorSpace } from '../src/core/canonical-model.js';
import { resolveRuleset } from '../src/core/ruleset.js';
import { runChecks, Verdict, CheckStatus } from '../src/core/checker.js';
import { bleedChecker } from '../src/core/checks/bleed.js';
import { resolutionChecker } from '../src/core/checks/resolution.js';
import { colorChecker } from '../src/core/checks/color.js';
import { dimensionsChecker } from '../src/core/checks/dimensions.js';
import { buildPdfModel } from '../src/parsers/pdf-model.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker];

const IN = 72;
const intent = {
  trimSize: { width: 3.5 * IN, height: 2 * IN }, // 252 x 144
  product: 'business-card', printMethod: PrintMethod.OFFSET,
  sides: 2, quantity: 100, requestedBleed: null,
};
const ruleset = resolveRuleset(intent);

const box = (x, y, w, h) => ({ x, y, width: w, height: h });
const TRIM = box(9, 9, 252, 144);           // finished, offset into a bled page
const BLEED_OK = box(0, 0, 270, 162);        // 9pt bleed all sides
const BLEED_SHORT = box(0, 0, 270, 157);     // only 4pt on top
const cmyk = ColorSpace.CMYK;

const img96 = { id: 'photo', nativeWidthPx: 336, nativeHeightPx: 192, placedWidth: 252, placedHeight: 144, colorSpace: cmyk };

/* raw pages: exactly what the adapter will hand to buildPdfModel */
const fixtures = [
  { label: 'declared trim+bleed, enough',
    raw: { media: BLEED_OK, trim: TRIM, bleed: BLEED_OK, colorSpace: cmyk },
    model: { inferred: false, trimW: 252 }, expectVerdict: Verdict.READY },

  { label: 'BleedBox missing (media==trim, no bleed)',
    raw: { media: TRIM, trim: TRIM, bleed: null, colorSpace: cmyk },
    model: { inferred: true, trimW: 252 }, expectVerdict: Verdict.READY }, // softened to warn

  { label: 'TrimBox missing (infer from ordered size)',
    raw: { media: BLEED_OK, trim: null, bleed: null, colorSpace: cmyk },
    model: { inferred: true, trimW: 252 }, expectVerdict: Verdict.READY },

  { label: 'declared trim+bleed, short bleed',
    raw: { media: BLEED_SHORT, trim: TRIM, bleed: BLEED_SHORT, colorSpace: cmyk },
    model: { inferred: false, trimW: 252 }, expectVerdict: Verdict.FIXABLE },

  { label: 'declared boxes + 96dpi image',
    raw: { media: BLEED_OK, trim: TRIM, bleed: BLEED_OK, colorSpace: cmyk, images: [img96] },
    model: { inferred: false, trimW: 252 }, expectVerdict: Verdict.NEEDS_ATTENTION },

  { label: 'CropBox used as trim',
    raw: { media: BLEED_OK, trim: null, crop: TRIM, bleed: BLEED_OK, colorSpace: cmyk },
    model: { inferred: true, trimW: 252 }, expectVerdict: Verdict.READY },
];

const icon = { pass: '✓', warn: '!', unverified: '?', fail: '✗' };
let failures = 0;

for (const fx of fixtures) {
  const doc = buildPdfModel([fx.raw], 'test.pdf', intent);
  const page = doc.pages[0];

  const modelOk =
    page.boxes.inferred === fx.model.inferred &&
    Math.round(page.boxes.trim.width) === fx.model.trimW;

  const { verdict, findings } = runChecks(doc, ruleset, ALL);
  const ok = modelOk && verdict === fx.expectVerdict;
  if (!ok) failures++;

  console.log(`\n[${fx.label}]  ${ok ? 'OK' : 'MISMATCH'}  ->  inferred=${page.boxes.inferred}  verdict: ${verdict}`);
  for (const f of findings) console.log(`  ${icon[f.status]} ${f.checkId}: ${f.message}`);
  if (!ok) console.log(`  <-- expected inferred=${fx.model.inferred}, trimW=${fx.model.trimW}, verdict=${fx.expectVerdict}`);
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' MISMATCH(ES)'}  (${fixtures.length} fixtures)`);
process.exit(failures === 0 ? 0 : 1);
