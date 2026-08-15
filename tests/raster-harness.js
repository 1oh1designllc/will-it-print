/**
 * raster-harness.js  —  run with:  node raster-harness.js
 * ------------------------------------------------------------------
 * First end-to-end path: real file HEADERS (structurally valid PNG/JPEG,
 * built byte by byte) -> parseRaster -> canonical model -> full checker
 * suite -> verdict. Asserts both the parsed model and the findings.
 *
 * (Only headers are synthesized — the parser reads dimensions + color
 * mode from exactly these bytes, so a real file from disk is the same
 * code path.)
 * ------------------------------------------------------------------
 */
import { PrintMethod, ColorSpace } from '../src/core/canonical-model.js';
import { resolveRuleset } from '../src/core/ruleset.js';
import { runChecks, Verdict, CheckStatus } from '../src/core/checker.js';
import { bleedChecker } from '../src/core/checks/bleed.js';
import { resolutionChecker } from '../src/core/checks/resolution.js';
import { colorChecker } from '../src/core/checks/color.js';
import { dimensionsChecker } from '../src/core/checks/dimensions.js';
import { parseRaster } from '../src/parsers/raster.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker];

const IN = 72;
const intent = {
  trimSize: { width: 3.5 * IN, height: 2 * IN }, // 3.5x2 business card, aspect 1.75
  product: 'business-card',
  printMethod: PrintMethod.OFFSET,
  sides: 2, quantity: 100, requestedBleed: null,
};
const ruleset = resolveRuleset(intent);

/* --- synthetic-but-valid file headers --- */
function png(w, h, colorType) {          // 2=RGB 6=RGBA 0=gray
  const b = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  b.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);
  b.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  b.push(8, colorType, 0, 0, 0, 0, 0, 0, 0); // depth,colorType,comp,filter,interlace,+fake CRC
  return Uint8Array.from(b);
}
function jpeg(w, h, comps) {              // 1=gray 3=RGB 4=CMYK
  const len = 8 + 3 * comps;
  const b = [0xff, 0xd8, 0xff, 0xc0, (len >> 8) & 255, len & 255, 8,
    (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, comps];
  for (let k = 0; k < comps; k++) b.push(k + 1, 0x11, 0);
  b.push(0xff, 0xd9);
  return Uint8Array.from(b);
}
// little-endian TIFF header (photometric: 2=RGB, 5=CMYK, 1=gray)
function tiff(w, h, photometric) {
  const le16 = (v) => [v & 255, (v >> 8) & 255];
  const le32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const entry = (tag, val) => [...le16(tag), ...le16(3), ...le32(1), ...le16(val), 0, 0];
  return Uint8Array.from([0x49, 0x49, 0x2a, 0x00, ...le32(8), ...le16(3),
    ...entry(256, w), ...entry(257, h), ...entry(262, photometric), ...le32(0)]);
}

/* --- fixtures: [bytes, filename] + expectations --- */
const fixtures = [
  { label: 'PNG RGB 1050x600 (300dpi @ size)', file: [png(1050, 600, 2), 'flyer.png'],
    model: { dpi: 300, cs: ColorSpace.RGB },
    expectVerdict: Verdict.FIXABLE },            // RGB -> convert (bleed unverified, but a fixable fail outranks)
  { label: 'JPEG CMYK 1050x600 (clean but no bleed)', file: [jpeg(1050, 600, 4), 'card.jpg'],
    model: { dpi: 300, cs: ColorSpace.CMYK },
    expectVerdict: Verdict.UNVERIFIED },         // nothing fails, but bleed can't be checked
  { label: 'JPEG RGB 336x192 (96dpi @ size)', file: [jpeg(336, 192, 3), 'lowres.jpg'],
    model: { dpi: 96, cs: ColorSpace.RGB },
    expectVerdict: Verdict.NEEDS_ATTENTION },    // resolution fail is unfixable
  { label: 'PNG RGB 1000x1000 (wrong aspect)', file: [png(1000, 1000, 6), 'square.png'],
    model: { dpi: null, cs: ColorSpace.RGB },
    expectVerdict: Verdict.NEEDS_ATTENTION },    // aspect mismatch is unfixable
  { label: 'PNG gray 1050x600 (grayscale ok)', file: [png(1050, 600, 0), 'bw.png'],
    model: { dpi: 300, cs: ColorSpace.GRAY },
    expectVerdict: Verdict.UNVERIFIED },         // gray allowed; only bleed unverified
  { label: 'TIFF CMYK 1050x600', file: [tiff(1050, 600, 5), 'scan.tiff'],
    model: { dpi: 300, cs: ColorSpace.CMYK },
    expectVerdict: Verdict.UNVERIFIED },
  { label: 'TIFF RGB 336x192 (low-res)', file: [tiff(336, 192, 2), 'small.tif'],
    model: { dpi: 96, cs: ColorSpace.RGB },
    expectVerdict: Verdict.NEEDS_ATTENTION },
];

const icon = { pass: '✓', warn: '!', unverified: '?', fail: '✗' };
let failures = 0;

for (const fx of fixtures) {
  const doc = parseRaster(fx.file[0], fx.file[1], intent);
  const img = doc.pages[0].images[0];
  const gotDpi = Math.round(Math.min(img.effectiveDpiX, img.effectiveDpiY));

  const modelOk =
    doc.pages.length === 1 &&
    doc.pages[0].colorSpace === fx.model.cs &&
    (fx.model.dpi == null || gotDpi === fx.model.dpi);

  const { verdict, findings } = runChecks(doc, ruleset, ALL);
  const ok = modelOk && verdict === fx.expectVerdict;
  if (!ok) failures++;

  console.log(`\n[${fx.label}]  ${ok ? 'OK' : 'MISMATCH'}  ->  ${gotDpi}dpi ${doc.pages[0].colorSpace}  |  verdict: ${verdict}`);
  for (const f of findings) console.log(`  ${icon[f.status]} ${f.checkId}: ${f.message}`);
  if (!ok) console.log(`  <-- expected model=${JSON.stringify(fx.model)}, verdict=${fx.expectVerdict}`);
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' MISMATCH(ES)'}  (${fixtures.length} fixtures)`);
process.exit(failures === 0 ? 0 : 1);
