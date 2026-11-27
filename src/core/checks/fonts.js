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
 *   all embedded / no text        PASS
 *   custom font not embedded      FAIL, unfixable -> NEEDS_ATTENTION (we can't
 *                                 embed a font we don't have; the press would
 *                                 substitute and the layout can break)
 *   only base-14 fonts missing    PASS with a note (every RIP carries those)
 *   not a text file (image)       PASS ("no fonts to check")
 * ------------------------------------------------------------------
 */
import { pass, fail } from '../checker.js';

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

      const customMissing = missing.filter((f) => !f.standard);
      const stdMissing = missing.filter((f) => f.standard);

      // A custom font the file doesn't carry is a hard stop: the press has no
      // copy, so it substitutes and the layout can reflow or print a different
      // typeface — and we can't embed a font we don't have, so it isn't fixable
      // here. This rolls the verdict to NEEDS_ATTENTION.
      if (customMissing.length) {
        const names = customMissing.map((f) => f.name);
        return fail(ID, `Page ${pageNo}: ${names.length} custom font${names.length === 1 ? '' : 's'} not embedded (${names.join(', ')}). The press doesn't have ${names.length === 1 ? 'it' : 'them'}, so it will substitute — text can reflow or print a different typeface. Embed all fonts (or outline the text) in your design app and re-export; this can't be fixed here.`, {
          page: page.index,
          fixable: false,
          detail: { missing: names, custom: names.length, standardMissing: stdMissing.map((f) => f.name), total: fonts.length },
        });
      }

      // Only base-14 (standard) fonts are unembedded — every RIP carries those,
      // so this is safe. Note it, but don't block.
      const names = stdMissing.map((f) => f.name);
      return pass(ID, `Page ${pageNo}: ${names.length} standard font${names.length === 1 ? '' : 's'} not embedded (${names.join(', ')}), but every press carries these, so ${names.length === 1 ? "it's" : "they're"} safe.`, {
        page: page.index,
        detail: { standardMissing: names, total: fonts.length },
      });
    });
  },
};
