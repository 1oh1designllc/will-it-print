/**
 * present-harness.js — run with: node tests/present-harness.js
 * Runs the real engine (runChecks) into toView and asserts the view-model,
 * proving the engine → Result seam end to end (and that every produced
 * (checkId,status) has real display copy, not undefined).
 */
import { PrintMethod, ColorSpace } from '../src/core/canonical-model.js';
import { resolveRuleset } from '../src/core/ruleset.js';
import { runChecks } from '../src/core/checker.js';
import { bleedChecker } from '../src/core/checks/bleed.js';
import { resolutionChecker } from '../src/core/checks/resolution.js';
import { colorChecker } from '../src/core/checks/color.js';
import { dimensionsChecker } from '../src/core/checks/dimensions.js';
import { buildPdfModel } from '../src/parsers/pdf-model.js';
import { parseRaster } from '../src/parsers/raster.js';
import { toView } from '../src/ui/present.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker];
const IN = 72;
const intent = { trimSize: { width: 3.5 * IN, height: 2 * IN }, product: 'business-card', printMethod: PrintMethod.OFFSET, sides: 2, quantity: 100, requestedBleed: null };
const ruleset = resolveRuleset(intent);
const box = (x, y, w, h) => ({ x, y, width: w, height: h });
const TRIM = box(9, 9, 252, 144), BLEED_OK = box(0, 0, 270, 162), BLEED_SHORT = box(0, 0, 270, 157);

// minimal valid CMYK JPEG header (1050x600) for the raster/unverified case
function jpeg(w, h, comps) {
  const len = 8 + 3 * comps;
  const b = [0xff, 0xd8, 0xff, 0xc0, (len >> 8) & 255, len & 255, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, comps];
  for (let k = 0; k < comps; k++) b.push(k + 1, 0x11, 0);
  b.push(0xff, 0xd9); return Uint8Array.from(b);
}
const img96 = { id: 'photo', nativeWidthPx: 336, nativeHeightPx: 192, placedWidth: 252, placedHeight: 144, colorSpace: ColorSpace.CMYK };

const cases = [
  { label: 'fixable (short bleed + RGB)', vkey: 'fixable',
    doc: buildPdfModel([{ media: BLEED_SHORT, trim: TRIM, bleed: BLEED_SHORT, colorSpace: ColorSpace.RGB }], 'card.pdf', intent),
    check: (v) => v.rows.some((r) => r.fix) && v.primary.label === 'Fix everything I can' && /fix/.test(v.primary.count) },
  { label: 'needs (96 dpi image)', vkey: 'needs',
    doc: buildPdfModel([{ media: BLEED_OK, trim: TRIM, bleed: BLEED_OK, colorSpace: ColorSpace.CMYK, images: [img96] }], 'card.pdf', intent),
    check: (v) => v.primary.kind === 'ghost' && v.rows.some((r) => r.label === 'Resolution' && r.guidance && !r.fix) },
  { label: 'unverified (flat CMYK raster)', vkey: 'unverified',
    doc: parseRaster(jpeg(1050, 600, 4), 'card.jpg', intent),
    check: (v) => v.rows.some((r) => r.label === 'Bleed' && r.status === 'unverified' && r.guidance) },
];

let fail = 0;
for (const c of cases) {
  const result = runChecks(c.doc, ruleset, ALL);
  const v = toView(result, { filename: c.doc.meta.filename, intent });

  const copyOk = v.rows.every((r) => r.label && r.msg && r.why); // no undefined copy
  const ok = v.verdict === c.vkey && copyOk && c.check(v);
  if (!ok) fail++;

  console.log(`\n[${c.label}]  ${ok ? 'OK' : 'MISMATCH'}  verdict=${v.verdict}  "${v.headline}"`);
  v.rows.forEach((r) => console.log(`  · ${r.label}/${r.status}: ${r.msg}${r.fix ? '  [' + r.fix.label + ']' : ''}${r.guidance ? '  (guidance)' : ''}`));
  if (!ok) console.log(`  <-- expected verdict=${c.vkey}, copyOk=${copyOk}`);
}
console.log(`\n${fail === 0 ? 'ALL GREEN' : fail + ' MISMATCH(ES)'}  (${cases.length} cases)`);
process.exit(fail === 0 ? 0 : 1);
