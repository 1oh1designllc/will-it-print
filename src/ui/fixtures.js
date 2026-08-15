// Demo data for local preview. Each scenario is the view-model shape Result
// consumes. When the engine is wired, a thin toView(verdict, findings) adapter
// produces these from real runChecks output (see UI spec §9).

const JOB = { file: 'frontcard.pdf', size: '3.5 × 2 in', method: 'Offset', qty: '× 100' };

const R = {
  sizeOk:  { id: 'dimensions', label: 'Size', status: 'pass', msg: 'The finished size matches what you ordered.', why: 'Trim and ordered size line up.', data: 'Trim 88.9 × 50.8 mm  =  ordered 88.9 × 50.8 mm' },
  bleedOk: { id: 'bleed', label: 'Bleed', status: 'pass', msg: 'The design runs past the cut on every side.', why: 'Enough overrun to survive trimming.', data: '3.2 mm on all sides  (3.2 mm required)' },
  resOk:   { id: 'resolution', label: 'Resolution', status: 'pass', msg: 'Sharp enough to print crisp.', why: 'Clears the minimum at print size.', data: '300 dpi at print size  (200 dpi minimum)' },
  colorOk: { id: 'color', label: 'Color', status: 'pass', msg: 'Print-ready colors.', why: 'Already in the press color space.', data: 'CMYK — correct for offset' },
};

export const SCENARIOS = {
  ready: {
    job: JOB, verdict: 'ready',
    headline: "Yes — this'll print.",
    sub: 'Everything checks out for offset. Your print-ready file is good to go.',
    primary: { label: 'Download print-ready file', kind: 'solid' },
    rows: [R.sizeOk, R.bleedOk, R.resOk, R.colorOk],
  },
  fixable: {
    job: JOB, verdict: 'fixable',
    headline: 'Almost. A couple of fixes.',
    sub: 'Two things stand between you and print-ready — both we can fix for you.',
    primary: { label: 'Fix everything I can', kind: 'solid', count: '2 fixes' },
    rows: [
      R.sizeOk,
      { id: 'bleed', label: 'Bleed', status: 'fail', msg: 'The design needs to run a little past the cut edge.', why: 'Without bleed, a thin white sliver can show at the trim if the cut drifts.', data: '1.4 mm on the tightest side  (3.2 mm required)', fix: { label: 'Add bleed', caveat: 'Adds the space — pull your artwork out to fill it.' } },
      R.resOk,
      { id: 'color', label: 'Color', status: 'fail', msg: 'Some screen colors will shift when printed.', why: 'This press prints in CMYK. Left as RGB it gets converted for you, and bright blues and greens move most.', data: 'RGB  →  needs CMYK', fix: { label: 'Convert to CMYK', caveat: 'A preview — confirm critical colors on your printer’s proof.' } },
    ],
  },
  unverified: {
    job: JOB, verdict: 'unverified',
    headline: 'Maybe. One thing we couldn’t check.',
    sub: 'Nothing failed — but a flat image doesn’t tell us about bleed, so we can’t fully clear it.',
    primary: { label: 'Review what we couldn’t check', kind: 'ghost' },
    rows: [
      { ...R.sizeOk, msg: 'Right shape for this size.', why: 'Pixel proportions match the ordered proportions.', data: 'Aspect 1.75  =  ordered 1.75' },
      { id: 'bleed', label: 'Bleed', status: 'unverified', msg: 'We couldn’t check bleed on this file.', why: 'Flat images don’t carry bleed information the way a print PDF does.', data: 'No bleed data in a raster file', guidance: 'Add bleed in your design app, or tell us if it’s already included.' },
      R.resOk, R.colorOk,
    ],
  },
  needs: {
    job: JOB, verdict: 'needs',
    headline: 'Not yet. This needs a change.',
    sub: 'A couple of things can’t be fixed automatically — they need a change to your file first.',
    primary: { label: 'See what needs changing', kind: 'ghost' },
    rows: [
      { id: 'dimensions', label: 'Size', status: 'fail', msg: 'This file is the wrong shape for the size you ordered.', why: 'It can’t be resized to fit without cropping or stretching the design — a call only you can make.', data: '1.00 ratio  vs  1.75 target', guidance: 'Rebuild at 88.9 × 50.8 mm, or pick a size that matches the file.' },
      R.bleedOk,
      { id: 'resolution', label: 'Resolution', status: 'fail', msg: 'This image will look pixelated at print size.', why: 'There’s no honest way to add detail that isn’t in the file — upscaling just invents pixels.', data: '96 dpi at print size  (200 dpi minimum)', guidance: 'Use a higher-resolution source, or place it smaller.' },
      R.colorOk,
    ],
  },
};
