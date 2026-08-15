/**
 * checks/dimensions.js
 * ------------------------------------------------------------------
 * Is the file the size the user actually asked for?
 *
 * Compares each page's finished size (trim box if declared, else the
 * media box as a best guess) against intent.trimSize, and distinguishes
 * four cases — because the right response is different for each:
 *
 *   exact match            PASS
 *   rotated (W/H swapped)  FAIL, fixable  -> rotate 90 (lossless)
 *   right ratio, wrong size FAIL, fixable -> resize to fit
 *   wrong aspect ratio     FAIL, NOT fixable (can't fit without cropping
 *                          or distorting — a design decision, not a button)
 *
 * Telling a beginner "rotate it" or "we'll scale it" is far more useful
 * than "size mismatch" — and refusing to silently distort their artwork
 * is the honest move for the aspect-mismatch case.
 * ------------------------------------------------------------------
 */
import { pass, fail } from '../checker.js';

const ID = 'dimensions';
const RATIO_EPS = 0.02;

// Would live in units.js; inlined for readability.
const mm = (pt) => (pt / 72 * 25.4).toFixed(1);
const size = (w, h) => `${mm(w)}\u00d7${mm(h)}mm`;

export const dimensionsChecker = {
  id: ID,
  label: 'Size',
  /**
   * @param {import('../canonical-model.js').PrintDocument} doc
   * @param {Object} ruleset
   */
  run(doc, ruleset) {
    const target = doc.intent.trimSize;
    const tol = ruleset.dimensions.tolerance;
    const tw = target.width;
    const th = target.height;
    const near = (a, b) => Math.abs(a - b) <= tol;

    return doc.pages.map((page) => {
      const box = page.boxes.trim ?? page.boxes.media;
      const fromTrim = page.boxes.trim != null;
      const aw = box.width;
      const ah = box.height;
      const pageNo = page.index + 1;
      const detail = { actual: { w: aw, h: ah }, target: { w: tw, h: th }, fromTrim };

      // Exact match.
      if (near(aw, tw) && near(ah, th)) {
        const note = fromTrim ? '' : ' (read from page size — no trim box declared)';
        return pass(ID, `Page ${pageNo}: ${size(aw, ah)} — matches the size you asked for.${note}`, {
          page: page.index, detail,
        });
      }

      // Rotated: dimensions swapped. Lossless fix.
      if (near(aw, th) && near(ah, tw)) {
        return fail(ID, `Page ${pageNo}: the file is ${size(aw, ah)} but you asked for ${size(tw, th)} — it's rotated 90\u00b0. We can rotate it to match.`, {
          page: page.index, detail, fixable: true,
          fixAction: { type: 'rotate', params: { degrees: 90, page: page.index }, caveat: null },
        });
      }

      // Same proportions, wrong scale: clean resize.
      const ratioActual = aw / ah;
      const ratioTarget = tw / th;
      if (Math.abs(ratioActual - ratioTarget) <= RATIO_EPS) {
        return fail(ID, `Page ${pageNo}: the file is ${size(aw, ah)} — the right proportions, but not the final size of ${size(tw, th)}. We can scale it to fit.`, {
          page: page.index, detail, fixable: true,
          fixAction: {
            type: 'resize',
            params: { to: { width: tw, height: th }, page: page.index },
            caveat: 'Scaling raster artwork up lowers its effective resolution — recheck sharpness after. Scaling down is safe; vector art scales cleanly either way.',
          },
        });
      }

      // Different aspect ratio: can't fit without cropping or distorting.
      return fail(ID, `Page ${pageNo}: the file is ${size(aw, ah)} but you asked for ${size(tw, th)} — different proportions, so it can't be resized to fit without cropping or stretching the design. Rebuild it at ${size(tw, th)}, or pick a product size that matches the file.`, {
        page: page.index, detail, // fixable stays false -> needs-attention
      });
    });
  },
};
