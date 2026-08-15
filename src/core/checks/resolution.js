/**
 * checks/resolution.js
 * ------------------------------------------------------------------
 * Is every placed image sharp enough for the chosen print method?
 *
 * Effective DPI was already resolved at parse time (see createPlacedImage),
 * so this checker only compares numbers — no geometry.
 *
 *   dpi >= targetDpi          PASS   (ideal)
 *   floor <= dpi < targetDpi  WARN   (usable, not ideal)
 *   dpi <  floor              FAIL   (will look pixelated)
 *
 * The important part: a resolution FAIL is UNFIXABLE. You cannot honestly
 * add detail that was never captured — "AI upscaling" invents pixels and
 * has no place in a print proof. So the fail carries NO fixAction, which
 * is precisely what pushes the verdict to `needs-attention`. The human
 * fix (use a bigger source, or place it smaller) lives in the message,
 * not in a button we can't honestly offer.
 * ------------------------------------------------------------------
 */
import { minDpi } from '../canonical-model.js';
import { pass, warn, fail } from '../checker.js';

const ID = 'resolution';

export const resolutionChecker = {
  id: ID,
  label: 'Resolution',
  /**
   * @param {import('../canonical-model.js').PrintDocument} doc
   * @param {Object} ruleset
   */
  run(doc, ruleset) {
    const floor = ruleset.resolution.minDpi;
    const target = ruleset.resolution.targetDpi;
    const findings = [];

    for (const page of doc.pages) {
      const pageNo = page.index + 1;

      // Nothing raster to check — vector and text stay sharp at any size.
      if (page.images.length === 0) {
        findings.push(pass(ID, `Page ${pageNo}: no raster images to check — vector and text print sharp at any size.`, {
          page: page.index,
        }));
        continue;
      }

      const scored = page.images.map((img) => ({ img, dpi: Math.round(minDpi(img)) }));
      const problems = scored.filter((s) => s.dpi < target);

      // Every image meets the ideal.
      if (problems.length === 0) {
        const lowest = Math.min(...scored.map((s) => s.dpi));
        findings.push(pass(ID, `Page ${pageNo}: all images ${lowest} dpi or better.`, {
          page: page.index,
          detail: { lowest, target },
        }));
        continue;
      }

      // One finding per problem image, so each is individually actionable
      // and individually highlightable (bbox) in the report.
      for (const { img, dpi } of problems) {
        const detail = { imageId: img.id, dpi, floor, target, bbox: img.bbox };

        if (dpi < floor) {
          // Unfixable on purpose — no fixAction, fixable stays false.
          findings.push(fail(ID, `Page ${pageNo}: "${img.id}" is ${dpi} dpi — under the ${floor} dpi minimum for this print method, so it will print pixelated. There's no honest way to add detail that isn't in the file: use a higher-resolution version, or place the image smaller.`, {
            page: page.index,
            detail,
          }));
        } else {
          findings.push(warn(ID, `Page ${pageNo}: "${img.id}" is ${dpi} dpi — usable but under the ${target} dpi ideal. Fine for less detailed work; for crisp results use a higher-res source or reduce its placed size.`, {
            page: page.index,
            detail,
          }));
        }
      }
    }

    return findings;
  },
};
