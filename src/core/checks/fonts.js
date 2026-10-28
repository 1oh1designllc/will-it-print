/**
 * checks/fonts.js
 * ------------------------------------------------------------------
 * Are the file's fonts embedded?
 *
 * A top print rejection: the PDF names a font but doesn't carry it, so the
 * press substitutes whatever it has — text reflows, spacing breaks, or a
 * different typeface prints. We can't embed a font in the browser, so this is
 * an advisory WARNING with guidance: re-export with fonts embedded (or outline
 * the text) in the design app.
 *
 *   all embedded / no text   PASS
 *   something not embedded    WARN (guidance; custom fonts flagged harder)
 *   not a text file (image)   PASS ("no fonts to check")
 * ------------------------------------------------------------------
 */
import { pass, warn } from '../checker.js';

const ID = 'fonts';

export const fontChecker = {
  id: ID,
  label: 'Fonts',
  /**
   * @param {import('../canonical-model.js').PrintDocument} doc
   * @param {Object} ruleset
   */
  run(doc, ruleset) {
    return doc.pages.map((page) => {
      const fonts = page.fonts || [];
      const pageNo = page.index + 1;

      // Image files (or anything with no font info) have no live text.
      if (!page.fontsKnown) {
        return pass(ID, `Page ${pageNo}: no fonts to check — image file.`, { page: page.index, detail: { known: false } });
      }
      if (fonts.length === 0) {
        return pass(ID, `Page ${pageNo}: no text fonts — nothing to embed.`, { page: page.index, detail: { count: 0 } });
      }

      const missing = fonts.filter((f) => !f.embedded);
      if (missing.length === 0) {
        return pass(ID, `Page ${pageNo}: all ${fonts.length} font${fonts.length === 1 ? '' : 's'} embedded.`, {
          page: page.index, detail: { count: fonts.length },
        });
      }

      const names = missing.map((f) => f.name);
      const custom = missing.filter((f) => !f.standard).length;
      return warn(ID, `Page ${pageNo}: ${missing.length} font${missing.length === 1 ? '' : 's'} not embedded (${names.join(', ')}). The press will substitute ${missing.length === 1 ? 'it' : 'them'}, so text can shift or look different — embed all fonts (or outline the text) in your design app.`, {
        page: page.index,
        detail: { missing: names, custom, total: fonts.length },
      });
    });
  },
};
