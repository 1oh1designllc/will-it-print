/**
 * fix-pdf-harness.js — run with: node tests/fix-pdf-harness.js
 * Builds a no-bleed PDF, renders it print-ready, then re-parses the OUTPUT and
 * asserts the export is genuinely print-ready by the checker's own standard:
 * bleed goes fail -> pass, size stays pass, boxes are correct.
 */
import { PDFDocument } from 'pdf-lib';
import { parsePdf } from '../src/parsers/pdf.js';
import { renderPrintReadyPdf } from '../src/fix/render-pdf.js';
import { resolveRuleset } from '../src/core/ruleset.js';
import { runChecks } from '../src/core/checker.js';
import { dimensionsChecker } from '../src/core/checks/dimensions.js';
import { bleedChecker } from '../src/core/checks/bleed.js';
import { resolutionChecker } from '../src/core/checks/resolution.js';
import { colorChecker } from '../src/core/checks/color.js';
import { toView } from '../src/ui/present.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker];
const IN = 72;
const intent = { trimSize: { width: 3.5 * IN, height: 2 * IN }, product: 'business-card', printMethod: 'offset', sides: 2, quantity: 100, requestedBleed: null };
const ruleset = resolveRuleset(intent);
const bleedStatus = (v) => v.rows.find((r) => r.label === 'Bleed').status;
const sizeStatus = (v) => v.rows.find((r) => r.label === 'Size').status;

// a 3.5x2in card with declared boxes but NO bleed (trim == bleed == media).
// Draw a filled rect so the page has Contents (pdf-lib can't embed an empty page).
async function noBleedCard() {
  const doc = await PDFDocument.create();
  const { rgb } = await import('pdf-lib');
  const p = doc.addPage([252, 144]);
  p.drawRectangle({ x: 0, y: 0, width: 252, height: 144, color: rgb(0.2, 0.4, 0.8) });
  p.setTrimBox(0, 0, 252, 144);
  p.setBleedBox(0, 0, 252, 144);
  return doc.save();
}

let fail = 0;
function check(label, cond) { if (!cond) { fail++; console.log(`  [${label}] FAIL`); } else console.log(`  [${label}] OK`); }

const src = await noBleedCard();
const before = toView(runChecks(await parsePdf(src, 'card.pdf', intent), ruleset, ALL), { filename: 'card.pdf', intent });
check('source bleed fails', bleedStatus(before) === 'fail');

const { bytes, notes } = await renderPrintReadyPdf(src, await parsePdf(src, 'card.pdf', intent));
const out = await PDFDocument.load(bytes);
const outParsed = await parsePdf(bytes, 'out.pdf', intent);
const after = toView(runChecks(outParsed, ruleset, ALL), { filename: 'out.pdf', intent });
const b0 = outParsed.pages[0].boxes;

check('output is a valid PDF page', out.getPageCount() === 1);
check('output canvas = 294x186', Math.round(b0.media.width) === 294 && Math.round(b0.media.height) === 186);
check('output TrimBox = 252x144', b0.trim && Math.round(b0.trim.width) === 252 && Math.round(b0.trim.height) === 144);
check('output BleedBox = 270x162', b0.bleed && Math.round(b0.bleed.width) === 270 && Math.round(b0.bleed.height) === 162);
check('bleed now passes', bleedStatus(after) === 'pass');
check('size still passes', sizeStatus(after) === 'pass');
check('carries an honesty note', notes.some((n) => /pull it out|reach it|Colours/.test(n)));

console.log(`\n${fail === 0 ? 'ALL GREEN' : fail + ' FAIL(S)'}  (fix-pdf)`);
process.exit(fail === 0 ? 0 : 1);
