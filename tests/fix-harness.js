/**
 * fix-harness.js — run with: node tests/fix-harness.js
 * Verifies the pure fix plan: canvas = trim + 2(bleed+markLen), art fills
 * trim+bleed, 8 crop marks of length markLen, rotation/color/notes carried.
 */
import { buildFixPlan, resolveDraw } from '../src/fix/plan.js';

const IN = 72;
const doc = (bleed = null) => ({ intent: { trimSize: { width: 3.5 * IN, height: 2 * IN }, requestedBleed: bleed } });
const addBleed = { type: 'add-bleed', params: { amount: 9 } };
const rotate = { type: 'rotate', params: { degrees: 90 } };
const toCmyk = { type: 'convert-color', params: { to: 'cmyk' } };

// trim 252x144, B=9, L=12 -> m=21, canvas 294x186
const cases = [
  { label: 'add-bleed', doc: doc(), actions: [addBleed],
    check: (p) => p.canvasPt.w === 294 && p.canvasPt.h === 186
      && p.trimOrigin.x === 21 && p.trimOrigin.y === 21
      && p.artPlacement.w === 270 && p.artPlacement.h === 162
      && p.cropMarks.length === 8 && p.bleedPt === 9
      && p.notes.some((n) => /Bleed added/.test(n)) },
  { label: 'add-bleed + rotate + cmyk', doc: doc(), actions: [addBleed, rotate, toCmyk],
    check: (p) => p.rotate === 90 && p.targetColor === 'cmyk' && p.notes.length === 2 },
  { label: 'no actions (bleed from intent)', doc: doc(9), actions: [],
    check: (p) => p.bleedPt === 9 && p.rotate === 0 && p.targetColor === null && p.notes.length === 0 },
  { label: 'crop mark length', doc: doc(), actions: [addBleed],
    check: (p) => (p.cropMarks[0].y2 - p.cropMarks[0].y1) === 12 && (p.cropMarks[1].x2 - p.cropMarks[1].x1) === 12 },
  { label: 'draw @0° fills placement', doc: doc(), actions: [addBleed],
    check: (p) => { const d = resolveDraw(p); return d.x === 12 && d.y === 12 && d.width === 270 && d.height === 162 && d.rotate === 0; } },
  { label: 'draw @90° swaps dims + offsets', doc: doc(), actions: [addBleed, rotate],
    check: (p) => { const d = resolveDraw(p); return d.width === 162 && d.height === 270 && d.x === 282 && d.y === 12 && d.rotate === 90; } },
];

let fail = 0;
for (const c of cases) {
  const p = buildFixPlan(c.doc, c.actions);
  const ok = c.check(p);
  if (!ok) fail++;
  console.log(`[${c.label}]  ${ok ? 'OK' : 'MISMATCH'}  canvas ${p.canvasPt.w}×${p.canvasPt.h}  marks ${p.cropMarks.length}  rot ${p.rotate}  color ${p.targetColor}`);
  if (!ok) console.log('  plan:', JSON.stringify(p.canvasPt), p.trimOrigin, p.artPlacement);
}
console.log(`\n${fail === 0 ? 'ALL GREEN' : fail + ' MISMATCH(ES)'}  (${cases.length} cases)`);
process.exit(fail === 0 ? 0 : 1);
