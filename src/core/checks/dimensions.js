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

      const ratioActual = aw / ah;
      const ratioTarget = tw / th;

      // Rotated: aspect matches the target turned 90° (any scale). Lossless fix.
      if (Math.abs(ratioActual - th / tw) <= RATIO_EPS) {
        return fail(ID, `Page ${pageNo}: the file is turned the wrong way for ${size(tw, th)} — rotating it 90\u00b0 makes it fit. We can rotate it for you.`, {
          page: page.index, detail, fixable: true,
          fixAction: { type: 'rotate', params: { degrees: 90, page: page.index }, caveat: null },
        });
      }

      // Same proportions, wrong scale: clean resize.
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

      // Different aspect ratio: there's no single "correct" fit, so we make it
      // fixable by letting the user CHOOSE how it should sit in the ordered size
      // (scaled to fit / stretched / zoomed). The choice drives the export.
      return fail(ID, `Page ${pageNo}: the file is ${size(aw, ah)} but you asked for ${size(tw, th)} — a different shape. Choose how it should fit the ordered size and we'll scale it to match.`, {
        page: page.index, detail, fixable: true,
        fixAction: {
          type: 'resize-fit',
          params: { to: { width: tw, height: th } },
          caveat: 'Each fit changes the design differently — scaled adds white space, stretched distorts, zoomed crops the edges.',
        },
      });
    });
  },
};
