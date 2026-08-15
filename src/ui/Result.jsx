import { useState } from 'react';
import s from './Result.module.css';

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

function FindingCard({ row, onFix }) {
  const [open, setOpen] = useState(false);
  const stVar = { '--st': `var(${ST[row.status]})` };
  return (
    <div className={`${s.card} ${open ? s.open : ''}`} style={stVar}>
      <button className={s.head} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={s.reg}><RegMark /></span>
        <span className={s.msg}>{row.msg}</span>
        <span className={s.tag}>{TAG[row.status]}</span>
        <svg className={s.chev} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={s.body}>
        <div className={s.bodyIn}>
          <p className={s.why}>{row.why}</p>
          {row.data && <div className={s.data}>{row.data}</div>}
          {row.fix && (
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
 * @param {{ job:{file,size,method,qty}, verdict:'ready'|'fixable'|'unverified'|'needs',
 *   headline:string, sub:string, primary:{label,kind:'solid'|'ghost',count?:string},
 *   rows:Array<{id,label,status,msg,why,data?,fix?:{label,caveat},guidance?}> }} props
 */
export default function Result({ job, verdict, headline, sub, primary, rows, onFix }) {
  const tone = { '--tone': `var(${TONE[verdict]})` };
  return (
    <main className={s.result}>
      <div className={s.wrap}>
        <div className={s.ticket}>
          <span className={s.file}>{job.file}</span>
          <span className={s.chip}>{job.size}</span>
          <span className={s.chip}>{job.method}</span>
          <span className={s.chip}>{job.qty}</span>
        </div>

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
    </main>
  );
}
