import { useState } from 'react';
import s from './Result.module.css';
import { ONE_OH_ONE_CONTACT, DONATE_URL, EMAIL_ENDPOINT } from '../config.js';

const TONE = { ready: '--yes', fixable: '--almost', unverified: '--maybe', needs: '--no' };
const ST = { pass: '--yes', warn: '--almost', unverified: '--maybe', fail: '--no' };
const TAG = { pass: 'OK', warn: 'Fixable', unverified: "Couldn't check", fail: 'Blocker' };

const RegMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="9" cy="9" r="1.6" fill="currentColor" />
    <path d="M9 0v3M9 15v3M0 9h3M15 9h3" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const FIT_META = [
  ['proportional', 'Scaled to fit', 'Whole image, proportional — white space added, nothing cropped.'],
  ['stretch', 'Stretched', 'Fills the size exactly — not proportional, the image distorts.'],
  ['zoom', 'Zoomed to fill', 'Fills the size, proportional — the edges get cropped.'],
];

// Prominent panel for the wrong-shape case: pick how the file fits the ordered
// size. The selection drives the export.
function FitPanel({ fits, fitMode, onFitMode }) {
  return (
    <section className={s.fitPanel}>
      <p className={s.fitPanelLabel}>Choose how your file fits the ordered size</p>
      <div className={s.fitRow} role="radiogroup" aria-label="Fit option">
        {FIT_META.map(([key, title, note]) => {
          const sel = fitMode === key;
          return (
            <label key={key} className={`${s.fit} ${sel ? s.fitSel : ''}`}>
              <input type="radio" name="fit" className={s.fitRadio}
                checked={sel} onChange={() => onFitMode(key)} />
              {fits[key] ? <img className={s.fitImg} src={fits[key]} alt={title} /> : <div className={s.fitImg} />}
              <span className={s.fitCap}>
                <span className={s.fitPick}><span className={s.fitDot} aria-hidden="true" /><b>{title}</b></span>
                <span>{note}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className={s.fitHint}>Your pick is applied when you download the print-ready file.</p>
    </section>
  );
}

// --- 1Oh1 lead CTA: context-aware by verdict. The result page is the highest-
// intent moment (someone has a print problem right now), so the offer meets it
// there. Copy + destination are easy to swap; links to 1Oh1 for now.
const CTA_COPY = {
  needs:      { lead: 'Not print-ready yet?', line: 'Send it over — 1Oh1 Design can fix the file and get it press-ready for you.', btn: 'Get it fixed by 1Oh1' },
  fixable:    { lead: 'Almost there.', line: 'Want a pro to apply the fixes and hand back a clean, press-ready file?', btn: 'Have 1Oh1 fix it' },
  unverified: { lead: 'Want a second set of eyes?', line: 'A designer can check what the tool couldn’t and make sure it prints right.', btn: 'Ask 1Oh1 to check it' },
  ready:      { lead: 'Looks print-ready.', line: 'Need your next card, flyer, or poster designed right the first time?', btn: 'Work with 1Oh1 Design' },
};
function OneOhOneCta({ verdict }) {
  const c = CTA_COPY[verdict] || CTA_COPY.ready;
  return (
    <aside className={s.cta1oh1}>
      <div className={s.ctaText}>
        <b className={s.ctaLead}>{c.lead}</b>
        <span className={s.ctaLine}>{c.line}</span>
      </div>
      <a className={s.ctaBtn} href={ONE_OH_ONE_CONTACT}>{c.btn}</a>
    </aside>
  );
}

// "Email me this report" — lead capture. Hidden until EMAIL_ENDPOINT is set in
// config.js. Posts the email + a little context to the form service.
function EmailCapture({ job, verdict }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  if (!EMAIL_ENDPOINT) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!email || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch(EMAIL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, file: job.file, size: job.size, verdict, source: 'Will It Print?' }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch { setState('error'); }
  };
  if (state === 'done') {
    return <p className={s.mailDone}>Thanks — we’ll send your print-readiness report to {email}.</p>;
  }
  return (
    <form className={s.mail} onSubmit={submit}>
      <label className={s.mailLbl} htmlFor="wipEmail">Email me this report</label>
      <div className={s.mailRow}>
        <input id="wipEmail" className={s.mailIn} type="email" required placeholder="you@email.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className={s.mailBtn} type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send it'}
        </button>
      </div>
      {state === 'error' && <span className={s.mailErr}>Couldn’t send just now — try again in a moment.</span>}
    </form>
  );
}

// Support / donation button. Hidden until DONATE_URL is set in config.js.
function DonateButton() {
  if (!DONATE_URL) return null;
  return (
    <a className={s.donate} href={DONATE_URL} target="_blank" rel="noopener noreferrer">
      ☕ Found this useful? Support the tool
    </a>
  );
}

const RotIcon = ({ dir }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"
    style={dir === 'ccw' ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M13 8a5 5 0 1 1-1.8-3.85" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12.8 1.6V4.4H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Rotate the artwork 90°. Re-checks + re-exports; the preview visibly turns.
function RotateBar({ rotation, onRotate }) {
  return (
    <div className={s.rotBar}>
      <div className={s.rotGroup}>
        <span className={s.rotLbl}>Rotate</span>
        <button className={s.rotBtn} onClick={() => onRotate(-90)} aria-label="Rotate left"><RotIcon dir="ccw" /></button>
        <button className={s.rotBtn} onClick={() => onRotate(90)} aria-label="Rotate right"><RotIcon dir="cw" /></button>
        <span className={s.rotAng}>{rotation}°</span>
      </div>
    </div>
  );
}

// Preview pane: show up to 2 pages stacked vertically; 3+ pages get a pager.
// The pane fills the media column so its box aligns with the checks beside it.
function PreviewPane({ previews }) {
  const [i, setI] = useState(0);
  const n = previews.length;
  if (n <= 2) {
    return (
      <div className={s.previewPane}>
        {previews.map((src, k) => <img key={k} className={s.preview} src={src} alt={`Page ${k + 1}`} />)}
      </div>
    );
  }
  const idx = Math.min(i, n - 1);
  return (
    <div className={s.previewPane}>
      <img className={s.preview} src={previews[idx]} alt={`Page ${idx + 1}`} />
      <div className={s.pager}>
        <button className={s.pagerBtn} onClick={() => setI((idx - 1 + n) % n)} aria-label="Previous page">‹ Prev</button>
        <span className={s.pagerNum}>Page {idx + 1} of {n}</span>
        <button className={s.pagerBtn} onClick={() => setI((idx + 1) % n)} aria-label="Next page">Next ›</button>
      </div>
    </div>
  );
}

function FindingCard({ row, onFix }) {
  const [open, setOpen] = useState(false);
  // A fail we can auto-fix reads as amber "Fixable", not a red "Blocker".
  const fixableFail = row.status === 'fail' && !!row.fix;
  const key = fixableFail ? 'warn' : row.status;
  const stVar = { '--st': `var(${ST[key]})` };
  return (
    <div className={`${s.card} ${open ? s.open : ''}`} style={stVar}>
      <button className={s.head} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={s.reg}><RegMark /></span>
        <span className={s.msg}>{row.msg}{row.note && <span className={s.side}>{row.note}</span>}</span>
        <span className={s.tag}>{TAG[key]}</span>
        <svg className={s.chev} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={s.body}>
        <div className={s.bodyIn}>
          <p className={s.why}>{row.why}</p>
          {row.data && <div className={s.data}>{row.data}</div>}
          {/* chooseFit rows are controlled by the fit panel, not an inline button */}
          {row.fix && !row.chooseFit && (
            <div className={s.act}>
              <button className={`${s.btn} ${s.solid} ${s.small}`} onClick={onFix}>{row.fix.label}</button>
              <span className={s.caveat}>{row.fix.caveat}</span>
            </div>
          )}
          {row.guidance && (
            <p className={s.manual}><span className={s.mtag}>Your move</span>{row.guidance}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Pure view over one preflight result.
 * @param {{ job, verdict, headline, sub, primary, rows, onFix,
 *   preview?:string, fits?:object, fitMode?:string, onFitMode?:function }} props
 */
export default function Result({ job, verdict, headline, sub, primary, rows, onFix, previews, fits, fitMode, onFitMode,
  rotation = 0, onRotate }) {
  const tone = { '--tone': `var(${TONE[verdict]})` };
  const needsFit = !!fits && rows.some((r) => r.chooseFit);
  const hasPreview = !!previews && previews.length > 0;
  const canRotate = !!onRotate && (hasPreview || fits);
  const rotateBar = canRotate && (
    <RotateBar rotation={rotation} onRotate={onRotate} />
  );
  const hasMedia = canRotate || (hasPreview && !needsFit) || needsFit;
  const media = (
    <div className={s.media}>
      {rotateBar}
      {!needsFit && hasPreview && <PreviewPane previews={previews} />}
      {needsFit && <FitPanel fits={fits} fitMode={fitMode} onFitMode={onFitMode} />}
    </div>
  );
  return (
    <main className={s.result}>
      <div className={s.wrap}>
        <div className={s.ticket}>
          <span className={s.file}>{job.file}</span>
          <span className={s.chip}>{job.size}</span>
          <span className={s.chip}>{job.method}</span>
          <span className={s.chip}>{job.qty}</span>
        </div>

        <div className={hasMedia ? `${s.grid} ${needsFit ? s.gridFit : ''}` : undefined}>
          {hasMedia && media}
          <div className={s.main}>
            <div className={s.frame}>
              <span className={`${s.cmark} ${s.tl}`} /><span className={`${s.cmark} ${s.tr}`} />
              <span className={`${s.cmark} ${s.bl}`} /><span className={`${s.cmark} ${s.br}`} />
              <div className={s.stamp} style={tone}>
                <p className={s.eyebrow}>Proof · <b>will it print?</b></p>
                <h1 className={s.verdict}>{headline}</h1>
                <hr className={s.trimline} />
                <p className={s.subline}>{sub}</p>
                <div className={s.actions}>
                  <button className={`${s.btn} ${primary.kind === 'solid' ? s.solid : s.ghost}`} onClick={onFix}>{primary.label}</button>
                  {primary.count && <span className={s.count}>{primary.count}</span>}
                </div>
              </div>
            </div>

            <p className={s.sec}>The checks</p>
            <div className={s.cards}>
              {rows.map((row) => <FindingCard key={row.id} row={row} onFix={onFix} />)}
            </div>
          </div>
        </div>

        <OneOhOneCta verdict={verdict} />

        {(EMAIL_ENDPOINT || DONATE_URL) && (
          <div className={s.extras}>
            <EmailCapture job={job} verdict={verdict} />
            <DonateButton />
          </div>
        )}

        <p className={s.disclaimer}>
          <b>Before you print:</b> Will It Print? checks and prepares your file to the best of its
          ability but cannot guarantee how it reproduces on a given press. Always confirm color and
          quality against a printer’s proof before production. By downloading, you accept that
          1Oh1 Design LLC (dba ONE ZERO ONE) is not responsible for final print results — including
          color shifts, resolution, trimming, or any costs arising from a misprint.
        </p>
      </div>
    </main>
  );
}
