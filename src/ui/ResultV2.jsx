import { useState } from 'react';
import s from './ResultV2.module.css';
import { ONE_OH_ONE_CONTACT, DONATE_URL, EMAIL_ENDPOINT, PRINT_PARTNER_NAME, PRINT_PARTNER_URL } from '../config.js';

/* Opt-in results view (?ui=v2): a report panel that slides in from the right,
   WeTransfer-style. Same props as Result.jsx, so App can swap it in cleanly. */

const TONE = { ready: '#1E7A4D', fixable: '#B9791C', unverified: '#6B6C74', needs: '#C33C33' };
const ST = { pass: '#1E7A4D', warn: '#B9791C', unverified: '#6B6C74', fail: '#C33C33' };
const TAG = { pass: 'OK', warn: 'Fixable', unverified: 'Unchecked', fail: 'Blocker' };
const ICON = { pass: '✓', warn: '!', unverified: '?', fail: '✕' };
const VERDICT_PILL = { ready: 'Ready to print', fixable: 'Almost — fixes to go', unverified: 'Couldn’t fully check', needs: 'Needs a change' };

const FIT_META = [
  ['proportional', 'Scaled to fit', 'White space added, nothing cropped.'],
  ['stretch', 'Stretched', 'Fills exactly — distorts.'],
  ['zoom', 'Zoomed to fill', 'Edges get cropped.'],
];

// A fixable "fail" presents as amber, like Result.jsx.
const keyFor = (row) => (row.status === 'fail' && row.fix ? 'warn' : row.status);

function CheckRow({ row, onFix }) {
  const [open, setOpen] = useState(false);
  const k = keyFor(row);
  return (
    <div className={`${s.card} ${open ? s.open : ''}`} style={{ '--st': ST[k] }}>
      <button className={s.head} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={s.sdot}>{ICON[k]}</span>
        <span className={s.hlabel}>{row.label}</span>
        <span className={s.hmsg}>{row.msg}</span>
        <span className={s.htag}>{TAG[k]}</span>
      </button>
      <div className={s.body}>
        {row.why && <p className={s.why}>{row.why}</p>}
        {row.data && <div className={s.data}>{row.data}</div>}
        {row.fix && !row.chooseFit && (
          <div>
            <button className={s.fixBtn} onClick={onFix}>{row.fix.label}</button>
            {row.fix.caveat && <span className={s.caveat}>{row.fix.caveat}</span>}
          </div>
        )}
        {row.guidance && <p className={s.guide}><b>Your move</b>{row.guidance}</p>}
      </div>
    </div>
  );
}

function EmailCapture({ job, verdict }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  if (!EMAIL_ENDPOINT) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!email || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch(EMAIL_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, file: job.file, size: job.size, verdict, source: 'Will It Print?' }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch { setState('error'); }
  };
  if (state === 'done') return <p className={s.td}>Thanks — we’ll send your report to {email}.</p>;
  return (
    <form className={s.mail} onSubmit={submit}>
      <input className={s.mailIn} type="email" required placeholder="Email me this report"
        value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email me this report" />
      <button className={s.mailBtn} type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send it'}</button>
    </form>
  );
}

export default function ResultV2({ job, verdict, headline, sub, primary, rows, onFix, onReset,
  previews, fits, fitMode, onFitMode, rotation = 0, onRotate }) {
  const tone = TONE[verdict] || TONE.ready;
  const needsFit = !!fits && rows.some((r) => r.chooseFit);
  const hasPreview = !!previews && previews.length > 0;
  const canRotate = !!onRotate && (hasPreview || !!fits);
  const showPrint = PRINT_PARTNER_URL && (verdict === 'ready' || verdict === 'fixable');

  return (
    <main className={s.v2} style={{ '--tone': tone }}>
      {/* LEFT — verdict + primary action, on a frosted panel over the background */}
      <section className={s.left}>
        <div className={s.leftIn}>
          <p className={s.eyebrow}>Proof · <b>will it print?</b></p>
          <h1 className={s.headline}>{headline}</h1>
          <p className={s.subline}>{sub}</p>
          <button className={`${s.primary} ${primary.kind === 'ghost' ? s.ghost : ''}`} onClick={onFix}>{primary.label}</button>
          {primary.count && <span className={s.count}>{primary.count}</span>}
          {onReset && <button className={s.reset} onClick={onReset}>← Check another file</button>}
        </div>
      </section>

      {/* RIGHT — the report panel that slides in */}
      <section className={s.right}>
        <div className={s.panel} style={{ '--tone': tone }}>
          <div className={s.pHead}>
            <div style={{ minWidth: 0 }}>
              <h2 className={s.pTitle}>{job.file}</h2>
              <p className={s.pSub}>{[job.size, job.method].filter(Boolean).join(' · ')} · checked just now</p>
            </div>
            <span className={s.verdict}><b>{ICON[verdict === 'needs' ? 'fail' : verdict === 'ready' ? 'pass' : verdict === 'fixable' ? 'warn' : 'unverified']}</b> {VERDICT_PILL[verdict]}</span>
          </div>

          {/* Primary action lives only in the sticky left panel now — no duplicate here. */}
          {showPrint && (
            <div className={s.actions}>
              <a className={`${s.btn} ${s.print}`} href={PRINT_PARTNER_URL} target="_blank" rel="noopener noreferrer">Get it printed →</a>
            </div>
          )}

          <div className={s.previewWrap}>
            <p className={s.pvLabel}>Preview</p>
            {hasPreview ? previews.slice(0, 2).map((src, i) => (
              <div key={i} className={s.preview}>
                <img src={src} alt={`Page ${i + 1}`} />
                <div className={s.pvFoot}><span className={s.n}>Page {i + 1}{previews.length > 1 ? ` of ${previews.length}` : ''}</span><span className={s.s}>+ crop marks</span></div>
              </div>
            )) : <div className={s.noPrev}>Preview not available for this file.</div>}
            {canRotate && (
              <div className={s.rotBar}>
                <span>Rotate</span>
                <button className={s.rotBtn} onClick={() => onRotate(-90)} aria-label="Rotate left">↺</button>
                <button className={s.rotBtn} onClick={() => onRotate(90)} aria-label="Rotate right">↻</button>
                <span style={{ letterSpacing: 0 }}>{rotation}°</span>
              </div>
            )}
          </div>

          {needsFit && (
            <div className={s.fit}>
              <p className={s.fitLbl}>Choose how your file fits the ordered size</p>
              <div className={s.fitRow} role="radiogroup" aria-label="Fit option">
                {FIT_META.map(([k, title, note]) => (
                  <label key={k} className={`${s.fitOpt} ${fitMode === k ? s.sel : ''}`}>
                    <input type="radio" name="fitv2" style={{ position: 'absolute', opacity: 0 }}
                      checked={fitMode === k} onChange={() => onFitMode(k)} />
                    {fits[k] ? <img src={fits[k]} alt={title} /> : <div style={{ height: 72 }} />}
                    <span className={s.fitCap}>{title}<span>{note}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className={s.section}>
            <p className={s.sTitle}>The checks</p>
            {rows.map((r) => <CheckRow key={r.id} row={r} onFix={onFix} />)}
          </div>

          <div className={s.extras}>
            <div className={s.lead}>
              <span><b>{verdict === 'ready' ? 'Looks print-ready.' : 'Want a pro set of eyes?'}</b><br />
                <span>{verdict === 'ready' ? 'Need your next piece designed right the first time?' : '1Oh1 Design can fix the file and hand it back press-ready.'}</span></span>
              <a className={s.leadBtn} href={ONE_OH_ONE_CONTACT}>{verdict === 'ready' ? 'Work with 1Oh1' : 'Have 1Oh1 fix it'}</a>
            </div>
            <EmailCapture job={job} verdict={verdict} />
            {DONATE_URL && <a className={s.donate} href={DONATE_URL} target="_blank" rel="noopener noreferrer">☕ Support the tool</a>}
          </div>

          <p className={s.disc}><b>Before you print:</b> Will It Print? prepares your file to the best of its ability
            but can’t guarantee how it reproduces on a given press. Always confirm against a printer’s proof.</p>
        </div>
      </section>
    </main>
  );
}
