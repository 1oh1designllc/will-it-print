/**
 * ui/preview.js — browser-only helpers that turn the uploaded file into preview
 * images: a thumbnail of the file, and (for a wrong-shape result) three fit
 * options so the user can SEE how the artwork would sit in the ordered size —
 * scaled to fit, cropped to width, or cropped to height.
 *
 * All best-effort: any failure returns null, and the caller simply shows no
 * preview rather than breaking the result.
 */

// Load the source file into an HTMLImageElement. Raster (png/jpg) loads directly;
// PDF renders page 1 via pdf.js; TIFF/unknown return null (browsers can't <img> them).
export async function loadSourceImage(source) {
  try {
    if (source.kind === 'pdf') return await pdfFirstPageImage(source.bytes);
    if (source.imageType === 'png' || source.imageType === 'jpg') {
      const mime = source.imageType === 'png' ? 'image/png' : 'image/jpeg';
      return await blobToImage(new Blob([source.bytes], { type: mime }));
    }
    return null; // tiff / unknown
  } catch { return null; }
}

// Load every page as an image (PDF → one per page up to `max`; raster → one).
// Returns [] on failure so the caller just shows no preview.
export async function loadSourceImages(source, max = 6) {
  try {
    if (source.kind === 'pdf') return await pdfPageImages(source.bytes, max);
    const img = await loadSourceImage(source);
    return img ? [img] : [];
  } catch { return []; }
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

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch { /* main-thread fallback */ }
  return pdfjs;
}

async function renderPdfPage(page) {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return await blobToImage(await canvasToBlob(canvas));
}

async function pdfFirstPageImage(bytes) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false }).promise;
  return await renderPdfPage(await pdf.getPage(1));
}

async function pdfPageImages(bytes, max) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false }).promise;
  const n = Math.min(pdf.numPages, max);
  const imgs = [];
  for (let i = 1; i <= n; i++) imgs.push(await renderPdfPage(await pdf.getPage(i)));
  return imgs;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

// A plain thumbnail of the file, longest side = maxPx.
export function makeThumb(img, maxPx = 320) {
  try {
    const s = Math.min(maxPx / img.width, maxPx / img.height, 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * s));
    c.height = Math.max(1, Math.round(img.height * s));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch { return null; }
}

/**
 * Three fit options for the ordered size (trimW:trimH), each drawn on a white
 * "document" canvas of that aspect:
 *   proportional — scaled to fit inside, white space added (nothing cropped)
 *   stretch      — distorted to fill exactly (not proportional)
 *   zoom         — scaled up proportionally to fill, edges cropped
 * @returns {{proportional,stretch,zoom}} dataURLs, or nulls on failure.
 */
export function makeFitOptions(img, trimW, trimH, maxPx = 240) {
  const aspect = trimW / trimH;
  let cw = maxPx, ch = Math.round(maxPx / aspect);
  if (aspect < 1) { ch = maxPx; cw = Math.round(maxPx * aspect); }
  const iw = img.width, ih = img.height;
  const draw = (mode) => {
    try {
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); // the document (white)
      if (mode === 'stretch') {
        ctx.drawImage(img, 0, 0, cw, ch);                    // distort to fill
      } else {
        const s = mode === 'proportional'
          ? Math.min(cw / iw, ch / ih)                       // contain (white space)
          : Math.max(cw / iw, ch / ih);                      // cover (crop) = zoom
        const dw = iw * s, dh = ih * s;
        ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh); // centered; canvas clips overflow
      }
      return c.toDataURL('image/png');
    } catch { return null; }
  };
  return { proportional: draw('proportional'), stretch: draw('stretch'), zoom: draw('zoom') };
}
