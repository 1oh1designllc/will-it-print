/**
 * pdf-harness.js — run with: node tests/pdf-harness.js
 * Builds PDFs with pdf-lib (boxes set or absent), parses them back through the
 * real adapter, and asserts the box-based checks. Self-contained — no private
 * sample files committed. Validated separately against real Canva exports.
 */
import { PDFDocument } from 'pdf-lib';
import { parsePdf } from '../src/parsers/pdf.js';
import { resolveRuleset } from '../src/core/ruleset.js';
import { runChecks, Verdict } from '../src/core/checker.js';
import { dimensionsChecker } from '../src/core/checks/dimensions.js';
import { bleedChecker } from '../src/core/checks/bleed.js';
import { resolutionChecker } from '../src/core/checks/resolution.js';
import { colorChecker } from '../src/core/checks/color.js';
import { toView } from '../src/ui/present.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker];
const IN = 72;
const intent = { trimSize: { width: 3.5 * IN, height: 2 * IN }, product: 'business-card', printMethod: 'offset', sides: 2, quantity: 100, requestedBleed: null };
const ruleset = resolveRuleset(intent);

async function makePdf(mediaW, mediaH, boxes, { rgbImage = false, fill = null } = {}) {
  const doc = await PDFDocument.create();
  const { rgb } = await import('pdf-lib');
  const page = doc.addPage([mediaW, mediaH]);
  if (boxes.trim) page.setTrimBox(...boxes.trim);
  if (boxes.bleed) page.setBleedBox(...boxes.bleed);
  if (fill) page.drawRectangle({ x: 0, y: 0, width: mediaW, height: mediaH, color: rgb(...fill) });
  if (rgbImage) {
    // a 1x1 RGB PNG, drawn on the page -> DeviceRGB image XObject
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const img = await doc.embedPng(png);
    page.drawImage(img, { x: 0, y: 0, width: mediaW, height: mediaH });
  }
  return doc.save();
}

const cases = [
  // Vector-only (no images): size/bleed pass, resolution reads vector-sharp,
  // colour can't be sampled -> UNVERIFIED overall.
  { label: 'declared trim+bleed, vector only', verdict: Verdict.UNVERIFIED,
    make: () => makePdf(294, 186, { trim: [21, 21, 252, 144], bleed: [12, 12, 270, 162] }),
    check: (v) => v.rows.some((r) => r.label === 'Bleed' && r.status === 'pass')
      && v.rows.some((r) => r.label === 'Size' && r.status === 'pass')
      && v.rows.some((r) => r.label === 'Resolution' && r.status === 'pass')
      && v.rows.some((r) => r.label === 'Color' && r.status === 'unverified') },
  { label: 'declared boxes, no bleed', verdict: Verdict.FIXABLE,
    make: () => makePdf(252, 144, { trim: [0, 0, 252, 144], bleed: [0, 0, 252, 144] }),
    check: (v) => v.rows.some((r) => r.label === 'Bleed' && r.status === 'fail' && r.fix) },
  { label: 'no boxes (inferred)', verdict: Verdict.UNVERIFIED,
    make: () => makePdf(252, 144, {}),
    check: (v) => v.rows.some((r) => r.label === 'Bleed' && r.status === 'warn') },
  // A 1x1 image stretched to full page is genuinely low-res: the pdf.js DPI
  // pass must catch it (unfixable) -> needs attention. RGB is now an advisory
  // warning (not a blocker). (toView maps 'needs-attention' to the UI key 'needs'.)
  { label: 'low-res RGB image', verdict: 'needs',
    make: () => makePdf(294, 186, { trim: [21, 21, 252, 144], bleed: [12, 12, 270, 162] }, { rgbImage: true }),
    check: (v) => v.rows.some((r) => r.label === 'Color' && r.status === 'warn')
      && v.rows.some((r) => r.label === 'Resolution' && r.status === 'fail') },
  // Chromatic RGB VECTOR (no image): colour is flagged as an advisory WARNING,
  // so with good size/bleed/res the file still reads READY.
  { label: 'chromatic RGB vector', verdict: Verdict.READY,
    make: () => makePdf(294, 186, { trim: [21, 21, 252, 144], bleed: [12, 12, 270, 162] }, { fill: [0.1, 0.3, 0.7] }),
    check: (v) => v.rows.some((r) => r.label === 'Color' && r.status === 'warn')
      && v.rows.some((r) => r.label === 'Resolution' && r.status === 'pass') },
  // Black-only vector (RGB 0,0,0) is neutral -> must NOT flag colour, and with
  // proper bleed the whole card is print-ready -> READY.
  { label: 'black-only vector = ready', verdict: 'ready',
    make: () => makePdf(294, 186, { trim: [21, 21, 252, 144], bleed: [12, 12, 270, 162] }, { fill: [0, 0, 0] }),
    check: (v) => v.rows.some((r) => r.label === 'Color' && r.status === 'pass') },
];

let fail = 0;
for (const c of cases) {
  const bytes = await c.make();
  const doc = await parsePdf(bytes, 'test.pdf', intent);
  const v = toView(runChecks(doc, ruleset, ALL), { filename: 'test.pdf', intent });
  const ok = v.verdict === c.verdict && c.check(v);
  if (!ok) fail++;
  console.log(`[${c.label}]  ${ok ? 'OK' : 'MISMATCH'}  -> ${v.verdict}`);
  if (!ok) v.rows.forEach((r) => console.log(`   ${r.label} ${r.status}`));
}
console.log(`\n${fail === 0 ? 'ALL GREEN' : fail + ' MISMATCH(ES)'}  (${cases.length} cases)`);
process.exit(fail === 0 ? 0 : 1);
