/**
 * checks/color.js
 * ------------------------------------------------------------------
 * Is the file in a color mode this print method can actually print?
 *
 * The classic rejection: RGB artwork sent to a CMYK press. The RIP
 * converts it anyway, and colors shift — bright blues and greens most
 * of all — so the printed piece doesn't match what the designer saw.
 *
 * D3 / beginner audience: "your file is RGB" means nothing to someone
 * unfamiliar with printing. So instead of a bare flag we offer the
 * actual fix — convert to the process color — carrying an honest caveat
 * that in-browser conversion has no ICC profile and is a preview, not a
 * contract proof.
 *
 * Uses all four statuses:
 *   allowed mode          PASS
 *   unexpected spot        WARN   (extra plate / won't reproduce exactly)
 *   RGB / mixed / other    FAIL   (fixable: convert to process)
 *   unreadable mode        UNVERIFIED
 * ------------------------------------------------------------------
 */
import { ColorSpace } from '../canonical-model.js';
import { pass, warn, unverified, fail } from '../checker.js';

const ID = 'color';

const NAME = {
  rgb: 'RGB', cmyk: 'CMYK', gray: 'grayscale',
  spot: 'a spot color', mixed: 'mixed RGB/CMYK', unknown: 'unknown',
};

export const colorChecker = {
  id: ID,
  label: 'Color mode',
  /**
   * @param {import('../canonical-model.js').PrintDocument} doc
   * @param {Object} ruleset
   */
  run(doc, ruleset) {
    const allowed = ruleset.color.allowed;
    const process = ruleset.color.process; // where non-print modes get converted
    const PROC = process.toUpperCase();

    return doc.pages.map((page) => {
      const cs = page.colorSpace;
      const pageNo = page.index + 1;
      const detail = { colorSpace: cs, allowed, process };

      // Couldn't read it — check can't run.
      if (cs === ColorSpace.UNKNOWN) {
        return unverified(ID, `Page ${pageNo}: couldn't read the color mode, so it couldn't be checked. Re-export as PDF/X, or tell us the intended color mode.`, {
          page: page.index, detail,
        });
      }

      // Already a mode this method prints.
      if (allowed.includes(cs)) {
        return pass(ID, `Page ${pageNo}: ${NAME[cs]} — correct for this print method.`, {
          page: page.index, detail,
        });
      }

      // Spot color the method prints as process: usually unintended cost.
      if (cs === ColorSpace.SPOT) {
        return warn(ID, `Page ${pageNo}: uses ${NAME[cs]}, which this method prints as process — that often means an unexpected extra plate, or a Pantone that won't reproduce exactly. If it was intentional, keep it and tell your printer; otherwise we can convert it to ${PROC}.`, {
          page: page.index, detail, fixable: true,
          fixAction: {
            type: 'convert-color',
            params: { from: 'spot', to: process, page: page.index },
            caveat: 'Spot-to-process is approximate — a Pantone rarely matches its process build. Keep the spot if the exact color matters.',
          },
        });
      }

      // RGB / mixed / anything else not printable here: convert to process.
      return fail(ID, `Page ${pageNo}: the file is ${NAME[cs]}, but this method needs ${PROC}. If you send it as-is the printer converts it for you and colors can shift — bright blues and greens especially. We can convert it to ${PROC} first so you see the shift before it prints.`, {
        page: page.index, detail, fixable: true,
        fixAction: {
          type: 'convert-color',
          params: { from: cs, to: process, page: page.index },
          caveat: `In-browser ${NAME[cs]}\u2192${PROC} conversion has no ICC profile, so treat it as a preview and confirm critical colors against your printer's proof.`,
        },
      });
    });
  },
};
