/**
 * harness.js  —  run with:  node harness.js
 * ------------------------------------------------------------------
 * No PDF parsing yet. We hand-build PrintDocuments in the exact shape a
 * parser will emit, then watch each checker + the runner behave. Every
 * fixture asserts an expected head status AND verdict, so the contract
 * can't drift silently. Each fixture names which checker(s) to run.
 * ------------------------------------------------------------------
 */
import {
  createDocument, createPage, createPlacedImage, rect,
  SourceFormat, PrintMethod, ColorSpace,
} from '../src/core/canonical-model.js';
import { resolveRuleset } from '../src/core/ruleset.js';
import { runChecks, Verdict, CheckStatus } from '../src/core/checker.js';
import { bleedChecker } from '../src/core/checks/bleed.js';
import { resolutionChecker } from '../src/core/checks/resolution.js';
import { colorChecker } from '../src/core/checks/color.js';
import { dimensionsChecker } from '../src/core/checks/dimensions.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker];

/* --- geometry: a 3.5in x 2in business card, offset, 0.125in bleed --- */
const IN = 72;
const TRIM_W = 3.5 * IN; // 252
const TRIM_H = 2 * IN;   // 144
const B = 0.125 * IN;

const intent = {
  trimSize: { width: TRIM_W, height: TRIM_H },
  product: 'business-card',
  printMethod: PrintMethod.OFFSET,
  sides: 2,
  quantity: 100,
  requestedBleed: null,
};
const ruleset = resolveRuleset(intent);

const trimAt = (bleed) => rect(bleed, bleed, TRIM_W, TRIM_H);
const fullBleed = (side) => rect(0, 0, TRIM_W + 2 * side, TRIM_H + 2 * side);

function doc(name, page) {
  const d = createDocument({ filename: name, sourceFormat: SourceFormat.PDF });
  d.intent = intent;
  d.pages = [page];
  return d;
}

/* page builders */
const goodBleedPage = () =>
  createPage({ index: 0, media: fullBleed(B), trim: trimAt(B), bleed: fullBleed(B) });

const shortBleedPage = (inferred = false) => {
  const box = rect(0, 0, TRIM_W + 2 * B, TRIM_H + B + 4);
  return createPage({ index: 0, media: box, trim: trimAt(B), bleed: box, inferred });
};

const noBoxPage = () =>
  createPage({ index: 0, media: fullBleed(B), trim: null, bleed: null });

/* a page of an explicit finished size (trim optional -> tests media fallback) */
const sizedPage = (w, h, { trim = true } = {}) =>
  createPage({ index: 0, media: rect(0, 0, w, h), trim: trim ? rect(0, 0, w, h) : null, bleed: null });

const cardImg = (dpi) => createPlacedImage({
  id: `art@${dpi}dpi`,
  nativeWidthPx: Math.round(dpi * TRIM_W / 72),
  nativeHeightPx: Math.round(dpi * TRIM_H / 72),
  placedWidth: TRIM_W,
  placedHeight: TRIM_H,
});
const withImg = (page, dpi) => { page.images.push(cardImg(dpi)); return page; };
const withColor = (page, cs) => { page.colorSpace = cs; return page; };

const cleanPage = () => withColor(withImg(goodBleedPage(), 300), ColorSpace.CMYK);
const messyPage = () => withColor(withImg(shortBleedPage(false), 96), ColorSpace.RGB);

/* --- fixtures --- */
const fixtures = [
  // bleed
  { label: 'bleed: declared, enough', checkers: [bleedChecker],
    doc: doc('b-pass.pdf', goodBleedPage()),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.READY },
  { label: 'bleed: declared, short', checkers: [bleedChecker],
    doc: doc('b-short.pdf', shortBleedPage(false)),
    expectStatus: CheckStatus.FAIL, expectVerdict: Verdict.FIXABLE },
  { label: 'bleed: inferred, short', checkers: [bleedChecker],
    doc: doc('b-inf.pdf', shortBleedPage(true)),
    expectStatus: CheckStatus.WARN, expectVerdict: Verdict.READY },
  { label: 'bleed: no boxes', checkers: [bleedChecker],
    doc: doc('b-none.pdf', noBoxPage()),
    expectStatus: CheckStatus.UNVERIFIED, expectVerdict: Verdict.UNVERIFIED },

  // resolution
  { label: 'res: 300dpi image', checkers: [resolutionChecker],
    doc: doc('r-pass.pdf', withImg(goodBleedPage(), 300)),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.READY },
  { label: 'res: 220dpi image', checkers: [resolutionChecker],
    doc: doc('r-warn.pdf', withImg(goodBleedPage(), 220)),
    expectStatus: CheckStatus.WARN, expectVerdict: Verdict.READY },
  { label: 'res: 96dpi image', checkers: [resolutionChecker],
    doc: doc('r-fail.pdf', withImg(goodBleedPage(), 96)),
    expectStatus: CheckStatus.FAIL, expectVerdict: Verdict.NEEDS_ATTENTION },
  { label: 'res: no images', checkers: [resolutionChecker],
    doc: doc('r-none.pdf', goodBleedPage()),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.READY },

  // color
  { label: 'color: CMYK', checkers: [colorChecker],
    doc: doc('c-cmyk.pdf', withColor(goodBleedPage(), ColorSpace.CMYK)),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.READY },
  { label: 'color: RGB', checkers: [colorChecker],
    doc: doc('c-rgb.pdf', withColor(goodBleedPage(), ColorSpace.RGB)),
    expectStatus: CheckStatus.FAIL, expectVerdict: Verdict.FIXABLE },
  { label: 'color: spot', checkers: [colorChecker],
    doc: doc('c-spot.pdf', withColor(goodBleedPage(), ColorSpace.SPOT)),
    expectStatus: CheckStatus.WARN, expectVerdict: Verdict.READY },
  { label: 'color: unknown', checkers: [colorChecker],
    doc: doc('c-unk.pdf', withColor(goodBleedPage(), ColorSpace.UNKNOWN)),
    expectStatus: CheckStatus.UNVERIFIED, expectVerdict: Verdict.UNVERIFIED },

  // dimensions
  { label: 'dim: exact', checkers: [dimensionsChecker],
    doc: doc('d-ok.pdf', sizedPage(TRIM_W, TRIM_H)),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.READY },
  { label: 'dim: rotated', checkers: [dimensionsChecker],
    doc: doc('d-rot.pdf', sizedPage(TRIM_H, TRIM_W)),
    expectStatus: CheckStatus.FAIL, expectVerdict: Verdict.FIXABLE },
  { label: 'dim: right ratio, wrong size (2x)', checkers: [dimensionsChecker],
    doc: doc('d-scale.pdf', sizedPage(TRIM_W * 2, TRIM_H * 2)),
    expectStatus: CheckStatus.FAIL, expectVerdict: Verdict.FIXABLE },
  { label: 'dim: wrong aspect', checkers: [dimensionsChecker],
    doc: doc('d-aspect.pdf', sizedPage(TRIM_W, 200)),
    expectStatus: CheckStatus.FAIL, expectVerdict: Verdict.NEEDS_ATTENTION },
  { label: 'dim: no trim box, media matches', checkers: [dimensionsChecker],
    doc: doc('d-media.pdf', sizedPage(TRIM_W, TRIM_H, { trim: false })),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.READY },

  // whole suite over all four checkers
  { label: 'ALL: clean file', checkers: ALL,
    doc: doc('clean.pdf', cleanPage()),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.READY },
  { label: 'ALL: messy file (short bleed + 96dpi + RGB)', checkers: ALL,
    doc: doc('messy.pdf', messyPage()),
    expectStatus: CheckStatus.PASS, expectVerdict: Verdict.NEEDS_ATTENTION },
];

/* --- run + report + assert --- */
const icon = { pass: '✓', warn: '!', unverified: '?', fail: '✗' };
let failures = 0;

for (const fx of fixtures) {
  const { verdict, findings } = runChecks(fx.doc, ruleset, fx.checkers);
  const head = findings[0];
  const ok = head.status === fx.expectStatus && verdict === fx.expectVerdict;
  if (!ok) failures++;

  console.log(`\n[${fx.label}]  ${ok ? 'OK' : 'MISMATCH'}  ->  verdict: ${verdict}`);
  for (const f of findings) {
    console.log(`  ${icon[f.status]} ${f.status.toUpperCase()}  ${f.message}`);
    if (f.fixAction) console.log(`     fix: ${f.fixAction.type}${f.fixAction.caveat ? ' — ' + f.fixAction.caveat : ''}`);
  }
  if (!ok) console.log(`  <-- expected status=${fx.expectStatus}, verdict=${fx.expectVerdict}`);
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' MISMATCH(ES)'}  (${fixtures.length} fixtures)`);
process.exit(failures === 0 ? 0 : 1);
