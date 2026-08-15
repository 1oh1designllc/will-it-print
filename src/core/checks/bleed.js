/**
 * checks/bleed.js
 * ------------------------------------------------------------------
 * Does the artwork extend far enough past the trim on every side?
 *
 * This is the checker that proves out the whole contract, because it
 * has to reason about UNCERTAINTY, not just measure:
 *
 *   - If the parser could read real TrimBox/BleedBox, a shortfall is a
 *     hard FAIL — we know the geometry.
 *   - If the boxes were INFERRED (guessed from page size vs intent),
 *     the same shortfall softens to a WARN — we might be wrong about
 *     where the trim even is, so we don't cry wolf.
 *   - If we have no trim/bleed at all, we can't measure: WARN, and say so.
 *
 * And the honest bit: a bleed shortfall is only *mechanically* fixable.
 * The prep tool can pad the canvas to size, but it cannot invent artwork
 * that was never designed to bleed. So the fix carries a caveat.
 * ------------------------------------------------------------------
 */
import { bleedMargins } from '../canonical-model.js';
import { pass, warn, unverified, fail } from '../checker.js';

const ID = 'bleed';

// Would live in units.js; inlined here for readability.
const mm = (pt) => `${(pt / 72 * 25.4).toFixed(1)}mm`;

export const bleedChecker = {
  id: ID,
  label: 'Bleed',
  /**
   * @param {import('../canonical-model.js').PrintDocument} doc
   * @param {Object} ruleset
   */
  run(doc, ruleset) {
    const required = ruleset.bleed.required;
    const tol = ruleset.bleed.tolerance;

    return doc.pages.map((page) => {
      const margins = bleedMargins(page.boxes);

      // No trim/bleed to measure against — the check cannot run.
      if (!margins) {
        return unverified(ID, `Page ${page.index + 1}: couldn't find trim/bleed boxes, so bleed couldn't be verified. Set them in your design app, or tell us the trim size.`, {
          page: page.index,
        });
      }

      const worstSide = Math.min(margins.left, margins.right, margins.top, margins.bottom);

      // Enough bleed on every side.
      if (worstSide >= required - tol) {
        return pass(ID, `Page ${page.index + 1}: ${mm(worstSide)} bleed on all sides.`, {
          page: page.index,
          detail: { margins, required },
        });
      }

      // Short somewhere. Build the fix regardless of severity.
      const fixAction = {
        type: 'add-bleed',
        params: { amount: required, page: page.index },
        caveat: 'Extends the canvas to the required bleed. If your artwork stops at the trim, you still need to pull the design out to the new edge — a tool can add the space but not the picture.',
      };
      const short = `${mm(worstSide)} of ${mm(required)} needed`;

      // Inferred geometry -> soften to a warning; we might be wrong about the trim.
      if (page.boxes.inferred) {
        return warn(ID, `Page ${page.index + 1}: looks short on bleed (${short}), but the trim was inferred, not declared — double-check the intended cut size.`, {
          page: page.index,
          detail: { margins, required, inferred: true },
          fixable: true,
          fixAction,
        });
      }

      return fail(ID, `Page ${page.index + 1}: not enough bleed — ${short} on the tightest side.`, {
        page: page.index,
        detail: { margins, required },
        fixable: true,
        fixAction,
      });
    });
  },
};
