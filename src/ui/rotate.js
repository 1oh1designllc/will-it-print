/**
 * ui/rotate.js — "Rotate" support (rotates the ARTWORK).
 *
 * Bakes a 90° artwork rotation into NEW source bytes so the whole pipeline
 * (checks, previews, print-ready export) re-runs on the rotated art — the
 * preview visibly turns and the exported file is genuinely re-oriented.
 *
 * PDF: re-draw each page onto a page of swapped size (for 90/270), anchored so
 * the rotated content lands exactly in the box (pdf-lib rotates CCW about the
 * draw anchor — see the per-angle offsets).
 * Raster: draw through a rotated canvas and re-encode as PNG (browser only).
 */

export async function rotateSource(source, deg) {
  const r = ((deg % 360) + 360) % 360;
  if (r === 0) return source;
  return source.kind === 'pdf'
    ? { ...source, bytes: await rotatePdf(source.bytes, r) }
    : { ...source, bytes: await rotateRaster(source, r), imageType: 'png' };
}

async function rotatePdf(bytes, r) {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const eps = await out.embedPdf(src, src.getPageIndices());
  src.getPages().forEach((sp, i) => {
    const { width: w, height: h } = sp.getSize();
    const land = r === 90 || r === 270;
    const page = out.addPage([land ? h : w, land ? w : h]);
    const anchor = r === 90 ? { x: h, y: 0 }
      : r === 180 ? { x: w, y: h }
      : /* 270 */ { x: 0, y: w };
    page.drawPage(eps[i], { x: anchor.x, y: anchor.y, rotate: degrees(r) });
  });
  return out.save();
}

async function rotateRaster(source, r) {
  const mime = source.imageType === 'png' ? 'image/png' : 'image/jpeg';
  const img = await blobToImage(new Blob([source.bytes], { type: mime }));
  const land = r === 90 || r === 270;
  const c = document.createElement('canvas');
  c.width = land ? img.height : img.width;
  c.height = land ? img.width : img.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
