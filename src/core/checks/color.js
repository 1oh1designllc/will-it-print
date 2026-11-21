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
 * unfamiliar with printing. So instead of a bare flag we explain the
 * effect in plain words and point them to the real fix (convert in
 * their design app, where a proper ICC profile applies).
 *
 * Statuses:
 *   allowed mode          PASS
 *   unexpected spot        WARN   (extra plate / won't reproduce exactly)
 *   RGB / mixed / other    WARN   (advisory: press will convert, colors shift)
 *   unreadable mode        UNVERIFIED
 *
 * RGB is a WARNING, not a blocker: the press will convert it and it will
 * still print, so we advise rather than fail. We don't offer an in-browser
 * "convert" button because without an ICC profile it only approximates the
 * result — the honest fix is to convert in the design app.
 * ------------------------------------------------------------------
 */
import { ColorSpace } from '../canonical-model.js';
import { pass, warn, unverified } from '../checker.js';

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

    // A page can raise two independent colour findings: its process colour
    // (CMYK/RGB/…) and, separately, any spot (Pantone) plates it carries — a
    // CMYK job with one stray spot swatch is the classic unexpected-extra-plate.
    const out = [];
    doc.pages.forEach((page) => {
      const cs = page.colorSpace;
      const pageNo = page.index + 1;
      const detail = { colorSpace: cs, allowed, process };

      // --- Process colour (one finding per page) ---
      if (cs === ColorSpace.UNKNOWN) {
        out.push(unverified(ID, `Page ${pageNo}: couldn't read the color mode, so it couldn't be checked. Re-export as PDF/X, or tell us the intended color mode.`, {
          page: page.index, detail,
        }));
      } else if (allowed.includes(cs)) {
        out.push(pass(ID, `Page ${pageNo}: ${NAME[cs]} — correct for this print method.`, {
          page: page.index, detail,
        }));
      } else {
        // RGB / mixed: advisory WARNING, not a blocker. The press converts it
        // and colors can shift; the honest fix is to convert in the design app.
        out.push(warn(ID, `Page ${pageNo}: the file is ${NAME[cs]}, but this method prints in ${PROC}. The press converts it and some colors can shift — bright blues and greens most of all. Convert to ${PROC} in your design app first so you control the result.`, {
          page: page.index, detail,
        }));
      }

      // --- Spot plates (separate finding, independent of the process colour) ---
      const spots = page.spots || [];
      if (spots.length) {
        const names = spots.join(', ');
        const one = spots.length === 1;
        out.push(warn(ID, `Page ${pageNo}: uses ${one ? 'a spot color' : `${spots.length} spot colors`} (${names}) — each prints as its own plate, an extra cost unless you meant a Pantone. If it's intentional, tell your printer; otherwise convert ${one ? 'it' : 'them'} to ${PROC} in your design app.`, {
          page: page.index,
          detail: { colorSpace: 'spot', process, spots, imageId: 'spot' },
        }));
      }
    });
    return out;
  },
};
