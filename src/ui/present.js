/**
 * present.js — the seam between engine output and the Result screen.
 * Pure (no React): maps { verdict, findings } → { job, verdict, headline,
 * sub, primary, rows }. Display copy lives here (presentation layer); the
 * numbers come from each finding's structured `detail`.
 */
import { METHOD_LABEL } from './presets.js';

const LABEL = { dimensions: 'Size', bleed: 'Bleed', resolution: 'Resolution', color: 'Color' };
const FIX_LABEL = { 'add-bleed': 'Add bleed', 'convert-color': 'Convert to CMYK', resize: 'Resize to fit', rotate: 'Rotate to fit' };
const VKEY = { ready: 'ready', fixable: 'fixable', unverified: 'unverified', 'needs-attention': 'needs' };

const mm = (pt) => (pt / 72 * 25.4).toFixed(1);
const up = (s) => (s || '').toUpperCase();

// Per-check presenters: engine finding → { msg, why, data, guidance }.
const P = {
  dimensions(f) {
    const d = f.detail || {};
    const size = d.actual && d.target
      ? `${mm(d.actual.w)}×${mm(d.actual.h)} mm  vs ordered ${mm(d.target.w)}×${mm(d.target.h)} mm` : '';
    if (f.status === 'pass') return { msg: 'The finished size matches what you ordered.', why: 'Trim and ordered size line up.', data: size };
    const t = f.fixAction?.type;
    if (t === 'rotate') return { msg: 'This file is rotated for the size you ordered.', why: 'Right size, just turned 90° — we can rotate it.', data: size };
    if (t === 'resize') return { msg: 'The right proportions, but not the final size.', why: 'Same shape, different scale — we can scale it to fit.', data: size };
    return {
      msg: 'This file is the wrong shape for the size you ordered.',
      why: 'It can’t be resized to fit without cropping or stretching the design.',
      data: size,
      guidance: `Rebuild at ${d.target ? `${mm(d.target.w)}×${mm(d.target.h)} mm` : 'the ordered size'}, or pick a size that matches the file.`,
    };
  },
  bleed(f) {
    const d = f.detail || {};
    const worst = d.margins ? Math.min(d.margins.left, d.margins.right, d.margins.top, d.margins.bottom) : null;
    const line = worst != null ? `${mm(worst)} mm on the tightest side  (${mm(d.required)} mm required)` : '';
    if (f.status === 'pass') return { msg: 'The design runs past the cut on every side.', why: 'Enough overrun to survive trimming.', data: line };
    if (f.status === 'unverified') return { msg: 'We couldn’t check bleed on this file.', why: 'It doesn’t declare trim/bleed the way a print PDF does.', data: 'No bleed data in the file', guidance: 'Add bleed in your design app, or tell us the trim size.' };
    if (f.status === 'warn') return { msg: 'Looks short on bleed — but the trim was inferred.', why: 'We guessed the trim, so treat this as a heads-up.', data: line };
    return { msg: 'The design needs to run a little past the cut edge.', why: 'Without bleed, a thin white sliver can show at the trim.', data: line };
  },
  resolution(f) {
    const d = f.detail || {};
    if (f.status === 'pass') {
      const has = d.lowest != null;
      return { msg: has ? 'Sharp enough to print crisp.' : 'No raster images to check.', why: has ? 'Clears the minimum at print size.' : 'Vector and text stay sharp at any size.', data: has ? `${d.lowest} dpi at print size  (${d.target} dpi ideal)` : null };
    }
    if (f.status === 'warn') return { msg: 'Usable, but under the ideal resolution.', why: 'Fine for less detailed work; sharper needs a higher-res source.', data: `${d.dpi} dpi at print size  (${d.target} dpi ideal)` };
    return { msg: 'This image will look pixelated at print size.', why: 'There’s no honest way to add detail that isn’t in the file.', data: `${d.dpi} dpi at print size  (${d.floor} dpi minimum)`, guidance: 'Use a higher-resolution source, or place it smaller.' };
  },
  color(f) {
    const d = f.detail || {};
    const cs = up(d.colorSpace); const proc = up(d.process || 'cmyk');
    if (f.status === 'pass') return { msg: 'Print-ready colors.', why: 'Already in the press color space.', data: `${cs} — correct for this method` };
    if (f.status === 'unverified') return { msg: 'We couldn’t read the color mode.', why: 'Some files don’t declare it clearly.', data: 'Color mode unknown', guidance: 'Re-export as PDF/X, or tell us the intended color mode.' };
    if (f.status === 'warn') return { msg: 'Uses a spot color this method prints as process.', why: 'Often an unexpected extra plate — unless you meant a Pantone.', data: `Spot → ${proc}` };
    return { msg: 'Some screen colors will shift when printed.', why: `This method needs ${proc}; ${cs} gets converted and bright colors move.`, data: `${cs} → needs ${proc}` };
  },
};

function toRow(f) {
  const p = (P[f.checkId] || (() => ({ msg: f.message, why: '', data: null })))(f);
  return {
    id: `${f.checkId}-${f.scope?.page ?? 0}-${f.detail?.imageId ?? ''}`,
    label: LABEL[f.checkId] || f.checkId,
    status: f.status,
    msg: p.msg, why: p.why, data: p.data || null,
    fix: f.fixAction ? { label: FIX_LABEL[f.fixAction.type] || 'Fix', caveat: f.fixAction.caveat || '' } : null,
    guidance: p.guidance || null,
  };
}

const BANNER = {
  ready: () => ({ headline: 'Yes — this’ll print.', sub: 'Everything checks out. Your file is good to go.', primary: { label: 'Download print-ready file', kind: 'solid' } }),
  fixable: (n) => ({ headline: `Almost — ${n.fix} ${n.fix === 1 ? 'fix' : 'fixes'} to go.`, sub: `We can fix ${n.fix === 1 ? 'it' : 'them'} for you in one tap.`, primary: { label: 'Fix everything I can', kind: 'solid', count: `${n.fix} ${n.fix === 1 ? 'fix' : 'fixes'}` } }),
  unverified: (n) => ({ headline: 'Maybe. Something we couldn’t check.', sub: `Nothing failed, but ${n.unv} ${n.unv === 1 ? 'check' : 'checks'} couldn’t run.`, primary: { label: 'Review what we couldn’t check', kind: 'ghost' } }),
  needs: (n) => ({ headline: 'Not yet. This needs a change.', sub: `${n.block} thing${n.block === 1 ? '' : 's'} need a change to your file first.`, primary: { label: 'See what needs changing', kind: 'ghost' } }),
};

/**
 * @param {{verdict:string, findings:Array}} result  raw runChecks output
 * @param {{filename?:string, intent?:object, job?:object}} meta
 */
export function toView({ verdict, findings }, meta = {}) {
  const vkey = VKEY[verdict] || verdict;
  const n = {
    fix: findings.filter((f) => f.fixable).length,
    block: findings.filter((f) => f.status === 'fail' && !f.fixable).length,
    unv: findings.filter((f) => f.status === 'unverified').length,
  };
  const b = BANNER[vkey](n);
  const it = meta.intent;
  const job = it
    ? { file: meta.filename || 'artwork', size: `${(it.trimSize.width / 72).toFixed(2)} × ${(it.trimSize.height / 72).toFixed(2)} in`, method: METHOD_LABEL[it.printMethod] || it.printMethod, qty: `× ${it.quantity}` }
    : (meta.job || { file: 'artwork', size: '', method: '', qty: '' });
  return { job, verdict: vkey, headline: b.headline, sub: b.sub, primary: b.primary, rows: findings.map(toRow) };
}
