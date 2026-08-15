/**
 * fix/render.js — the IMPURE half of the fix engine (⚠ SKELETON — browser).
 *
 * Executes a fix plan (fix/plan.js, already tested) into a print-ready PDF
 * with pdf-lib. Cannot run in the Node harness — needs pdf-lib + a real file.
 * The plan carries all the geometry, so this file only does I/O + drawing.
 *
 * Honesty note baked in: pdf-lib has NO color management, so "convert to CMYK"
 * here is approximate — we draw in DeviceCMYK but there's no ICC transform.
 * That's exactly what plan.notes warns the user about; surface those notes.
 */
// import { PDFDocument, cmyk, rgb, degrees } from 'pdf-lib';
import { resolveDraw } from './plan.js';

/**
 * @param {ReturnType<import('./plan.js').buildFixPlan>} plan
 * @param {{ kind:'raster'|'pdf', bytes:Uint8Array, imageType?:'png'|'jpg' }} source
 * @returns {Promise<Uint8Array>} the print-ready PDF bytes
 */
export async function renderPrintReady(plan, source) {
  const { PDFDocument, cmyk, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([plan.canvasPt.w, plan.canvasPt.h]);

  // 1. Place the artwork so it fills trim+bleed (plan.artPlacement), rotated.
  if (source.kind === 'raster') {
    const img = source.imageType === 'png'
      ? await pdf.embedPng(source.bytes)
      : await pdf.embedJpg(source.bytes);
    const d = resolveDraw(plan); // rotation-aware box (verify 90/270 visually once)
    page.drawImage(img, { x: d.x, y: d.y, width: d.width, height: d.height, rotate: degrees(d.rotate) });
  } else {
    // TODO(pdf source): copy the first page of the input PDF and scale it into
    // artPlacement. Needs pdf-lib embedPage / copyPages — finish with real PDFs.
  }

  // 2. Crop marks — registration black, hairline. Points already in canvas space.
  for (const m of plan.cropMarks) {
    page.drawLine({ start: { x: m.x1, y: m.y1 }, end: { x: m.x2, y: m.y2 }, thickness: 0.5, color: cmyk(0, 0, 0, 1) });
  }

  // 3. Boxes so a RIP knows the finished size.
  const t = plan.trimOrigin, T = plan.trimPt, B = plan.bleedPt;
  page.setTrimBox(t.x, t.y, T.w, T.h);
  page.setBleedBox(t.x - B, t.y - B, T.w + 2 * B, T.h + 2 * B);

  // 4. Color: plan.targetColor === 'cmyk' → we drew marks in DeviceCMYK, but the
  //    embedded raster keeps its own space. True conversion needs an ICC pipeline
  //    (out of scope client-side). plan.notes already tells the user this.

  return pdf.save();
}
