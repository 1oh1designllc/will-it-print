/**
 * ruleset.js
 * ------------------------------------------------------------------
 * Turns a PrintIntent into the thresholds checkers compare against.
 *
 * These are DEFAULTS, held as data. A printer can later ship their own
 * profile object with the same shape and load it instead — that's the
 * white-label hook. Checkers never hardcode a number; they read it here.
 * ------------------------------------------------------------------
 */
import { PrintMethod } from './canonical-model.js';

const IN = 72; // points per inch

/** Per-method defaults. Bleed, resolution, and color are all wired. */
const PROFILES = {
  [PrintMethod.OFFSET]: {
    bleed: { required: 0.125 * IN, tolerance: 0.5 },
    resolution: { minDpi: 200, targetDpi: 300 }, // 300 ideal, 200 hard floor
    // spot deliberately NOT allowed -> always warn: a stray spot swatch is
    // usually an unintended extra plate for this audience (message lets them keep it).
    color: { allowed: ['cmyk', 'gray'], process: 'cmyk' },
  },
  [PrintMethod.DIGITAL]: {
    bleed: { required: 0.125 * IN, tolerance: 0.5 },
    resolution: { minDpi: 150, targetDpi: 250 },
    color: { allowed: ['cmyk', 'rgb', 'gray'], process: 'cmyk' },
  },
  [PrintMethod.LARGE_FORMAT]: {
    bleed: { required: 0.25 * IN, tolerance: 1 },
    resolution: { minDpi: 72, targetDpi: 120 }, // viewed at distance
    color: { allowed: ['cmyk', 'rgb'], process: 'cmyk' },
  },
};

/**
 * @param {import('./canonical-model.js').PrintIntent} intent
 * @returns {{bleed:{required:number,tolerance:number}, resolution:Object, color:Object}}
 */
export function resolveRuleset(intent) {
  const base = PROFILES[intent.printMethod] ?? PROFILES[PrintMethod.DIGITAL];
  // Thresholds that don't vary by print method, merged into every profile.
  const shared = { dimensions: { tolerance: 1 } }; // points (~0.35mm), absorbs rounding
  const merged = { ...shared, ...base };
  // A user-requested bleed overrides the profile default.
  if (intent.requestedBleed != null) {
    return { ...merged, bleed: { ...merged.bleed, required: intent.requestedBleed } };
  }
  return merged;
}
