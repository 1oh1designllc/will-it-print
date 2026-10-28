/**
 * fonts-harness.js — run with: node tests/fonts-harness.js
 * Tests the embedded-font check two ways: the checker logic on synthetic pages,
 * and the real pdf.js adapter on PDFs built with pdf-lib (Helvetica = a
 * standard-14 font that is NOT embedded).
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { runChecks } from '../src/core/checker.js';
import { fontChecker } from '../src/core/checks/fonts.js';
import { parsePdf } from '../src/parsers/pdf.js';

const IN = 72;
const intent = { trimSize: { width: 3.5 * IN, height: 2 * IN }, product: 'business-card', printMethod: 'offset', sides: 2, quantity: 100, requestedBleed: null };
const RS = {};

const docOf = (fonts, fontsKnown = true) => ({ pages: [{ index: 0, fonts, fontsKnown }] });
const first = (doc) => runChecks(doc, RS, [fontChecker]).findings[0];

let fail = 0;
const check = (label, cond, extra = '') => { const ok = !!cond; if (!ok) fail++; console.log(`[${label}]  ${ok ? 'OK' : 'MISMATCH'}  ${extra}`); };

// --- checker logic ---
let f = first(docOf([{ name: 'Gotham', embedded: true, standard: false }, { name: 'Helvetica', embedded: true, standard: true }]));
check('all embedded -> pass', f.status === 'pass', f.status);

f = first(docOf([{ name: 'Gotham-Bold', embedded: false, standard: false }]));
check('custom not embedded -> warn (custom=1)', f.status === 'warn' && f.detail.custom === 1, `${f.status} custom=${f.detail.custom}`);

f = first(docOf([{ name: 'Helvetica', embedded: false, standard: true }]));
check('standard not embedded -> warn (custom=0)', f.status === 'warn' && f.detail.custom === 0, `${f.status} custom=${f.detail.custom}`);

f = first(docOf([]));
check('no text fonts -> pass', f.status === 'pass' && f.detail.count === 0, f.status);

f = first(docOf([], false));
check('image file (fontsKnown=false) -> pass', f.status === 'pass' && f.detail.known === false, f.status);

// --- real adapter ---
async function pdf(build) { const d = await PDFDocument.create(); await build(d); return d.save(); }

const helvBytes = await pdf(async (d) => {
  const page = d.addPage([252, 144]);
  const font = await d.embedFont(StandardFonts.Helvetica); // standard-14, NOT embedded
  page.drawText('Hello', { x: 20, y: 60, size: 12, font });
});
const fd1 = first(await parsePdf(helvBytes, 'helv.pdf', intent));
check('adapter: Helvetica text -> warn, not embedded',
  fd1.status === 'warn' && (fd1.detail.missing || []).some((n) => /Helvetica/.test(n)),
  `${fd1.status} ${JSON.stringify(fd1.detail.missing || [])}`);

const blankBytes = await pdf(async (d) => { d.addPage([252, 144]); });
const fd2 = first(await parsePdf(blankBytes, 'blank.pdf', intent));
check('adapter: no text -> pass', fd2.status === 'pass', fd2.status);

console.log(`\n${fail === 0 ? 'ALL GREEN' : fail + ' MISMATCH(ES)'}  (fonts)`);
process.exit(fail === 0 ? 0 : 1);
