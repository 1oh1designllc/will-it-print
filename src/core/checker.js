/**
 * checker.js
 * ------------------------------------------------------------------
 * The contract every check implements, and the aggregator that runs
 * a list of them over one PrintDocument.
 *
 * A CHECKER is: { id, label, run(doc, ruleset) => Finding[] }
 *   - pure: same inputs -> same findings, no side effects, no I/O
 *   - returns an ARRAY so one checker can speak per-page or per-image
 *   - never throws for "the file is bad"; a bad file is a Finding
 *
 * The report layer consumes findings; the fix layer consumes the
 * `fixAction` on the fixable ones. Nothing here knows about the UI.
 * ------------------------------------------------------------------
 */

/** @readonly */
export const CheckStatus = Object.freeze({
  PASS: 'pass',
  WARN: 'warn',             // check ran, found something minor; advisory
  UNVERIFIED: 'unverified', // check could NOT run — outcome unknown
  FAIL: 'fail',             // check ran, found a blocking problem
});

/** @readonly Top-level verdict for the whole document. */
export const Verdict = Object.freeze({
  READY: 'ready',                 // no fails, everything could be checked
  UNVERIFIED: 'unverified',       // no fails, but a check couldn't run
  FIXABLE: 'fixable',             // every fail has a fixAction
  NEEDS_ATTENTION: 'needs-attention', // at least one fail we can't fix
});

/**
 * @typedef {Object} FixAction
 * An instruction the remediation engine (your prep tool) can execute.
 * @property {string} type    e.g. 'add-bleed', 'resize', 'convert-color'.
 * @property {Object} params  Everything the fixer needs, in points.
 * @property {?string} caveat  Set when the mechanical fix may not be
 *                             visually correct (e.g. bleed needs artwork).
 */

/**
 * @typedef {Object} Finding
 * @property {string}  checkId
 * @property {string}  status    One of CheckStatus.
 * @property {{page:?number}} scope  page index, or null = document-level.
 * @property {string}  message   Plain, method-aware sentence for the user.
 * @property {Object}  [detail]  Structured data for the UI / annotations.
 * @property {boolean} fixable
 * @property {?FixAction} fixAction
 */

/* ---- Finding factories: keep every checker terse and consistent ---- */

function make(status, checkId, message, opts = {}) {
  return {
    checkId,
    status,
    scope: { page: opts.page ?? null },
    message,
    detail: opts.detail ?? null,
    fixable: opts.fixable ?? false,
    fixAction: opts.fixAction ?? null,
  };
}

export const pass = (checkId, message, opts) => make(CheckStatus.PASS, checkId, message, opts);
export const warn = (checkId, message, opts) => make(CheckStatus.WARN, checkId, message, opts);
export const unverified = (checkId, message, opts) => make(CheckStatus.UNVERIFIED, checkId, message, opts);
export const fail = (checkId, message, opts) => make(CheckStatus.FAIL, checkId, message, opts);

/* ------------------------------ runner ------------------------------ */

/**
 * Run every checker over the document and roll findings into a verdict.
 * @param {import('./canonical-model.js').PrintDocument} doc
 * @param {Object} ruleset
 * @param {Array<{id:string,label:string,run:Function}>} checkers
 * @returns {{ verdict:string, findings:Finding[] }}
 */
export function runChecks(doc, ruleset, checkers) {
  const findings = checkers.flatMap((c) => c.run(doc, ruleset));
  return { verdict: rollUp(findings), findings };
}

/**
 * Precedence, worst to best:
 *   NEEDS_ATTENTION  a fail we can't fix
 *   FIXABLE          fails, but every one carries a fixAction
 *   UNVERIFIED       no fails, but at least one check couldn't run
 *   READY            no fails, everything was checked
 * Warns are advisory and never move the headline on their own.
 */
export function rollUp(findings) {
  const fails = findings.filter((f) => f.status === CheckStatus.FAIL);
  if (fails.some((f) => !f.fixable)) return Verdict.NEEDS_ATTENTION;
  if (fails.length > 0) return Verdict.FIXABLE;
  if (findings.some((f) => f.status === CheckStatus.UNVERIFIED)) return Verdict.UNVERIFIED;
  return Verdict.READY;
}
