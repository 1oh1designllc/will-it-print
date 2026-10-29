import { useState } from 'react';
import Intake from './ui/Intake.jsx';
import Result from './ui/Result.jsx';
import ResultV2 from './ui/ResultV2.jsx';
import BackdropV2 from './ui/BackdropV2.jsx';
import Press from './ui/Press.jsx';
import { activeShop } from './shops.js';

// V2 (slide-in results + Paper/Ink background) is the default now.
// ?ui=legacy restores the original video/results page for comparison or rollback.
let USE_V2 = true;
try { USE_V2 = new URLSearchParams(window.location.search).get('ui') !== 'legacy'; } catch { /* ignore */ }
// White-label instance (?shop=<id>) always uses the V2 UI.
const SHOP = activeShop();
if (SHOP) USE_V2 = true;
const ResultView = USE_V2 ? ResultV2 : Result;
import { toView } from './ui/present.js';
import { parseRaster } from './parsers/raster.js';
import { resolveRuleset } from './core/ruleset.js';
import { runChecks } from './core/checker.js';
import { dimensionsChecker } from './core/checks/dimensions.js';
import { bleedChecker } from './core/checks/bleed.js';
import { resolutionChecker } from './core/checks/resolution.js';
import { colorChecker } from './core/checks/color.js';
import { fontChecker } from './core/checks/fonts.js';
import { buildFixPlan } from './fix/plan.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker, fontChecker];
const ext = (name) => name.split('.').pop().toLowerCase();
const imageType = (name) => { const e = ext(name); return e === 'png' ? 'png' : (e === 'tif' || e === 'tiff') ? 'tiff' : 'jpg'; };

const FONT = '"Archivo",system-ui,sans-serif';
const PAGE = { position: 'relative', zIndex: 1, minHeight: '100vh', background: 'transparent', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', fontFamily: FONT };

const Panel = ({ title, body }) => (
  <div style={PAGE}><div style={{ maxWidth: 420 }}>
    <h2 style={{ fontFamily: FONT, fontWeight: 800, margin: '0 0 8px' }}>{title}</h2>
    <p style={{ color: '#3A3A36' }}>{body}</p>
  </div></div>
);

// Low-resolution warning before letting the user export anyway.
function LowResModal({ onCancel, onAccept }) {
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="lrTitle" onClick={onCancel}>
      <div className="modalBox" onClick={(e) => e.stopPropagation()}>
        <h2 id="lrTitle" className="modalTitle">Low resolution — print at your own risk</h2>
        <p className="modalBody">
          This file’s images fall below the recommended resolution for the size you ordered, so it
          will likely look soft or pixelated in print. This app <b>cannot add detail that isn’t
          already in the file</b> — exporting will not improve the resolution. If you continue,
          1Oh1 Design LLC is not responsible for poor print quality caused by low resolution.
        </p>
        <div className="modalActions">
          <button className="modalBtn modalGhost" onClick={onCancel}>Cancel</button>
          <button className="modalBtn modalSolid" onClick={onAccept}>Download anyway</button>
        </div>
      </div>
    </div>
  );
}

// Turn a parser/loader error into something a non-developer can act on.
function friendlyError(e, name) {
  const msg = (e && e.message) || '';
  const isPdf = /\.pdf$/i.test(name || '');
  if (e?.code === 'ENCRYPTED' || /password|encrypt/i.test(msg)) {
    return 'This PDF is password-protected, so its contents can’t be read. Remove the password (or re-export without encryption) and try again.';
  }
  if (/invalid|corrupt|parse|No PDF header|FlateDecode|stream|expected|unexpected|malformed|not a png|not a jpeg|unsupported/i.test(msg)) {
    return `This file looks damaged or isn’t a valid ${isPdf ? 'PDF' : 'image'}. Re-export it and try again.`;
  }
  return 'Couldn’t read that file. Re-export it as a PDF, PNG, JPG, or TIFF and try again.';
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const FOOT_LINKS = [
  ['/privacy.html', 'Privacy'],
  ['/terms.html', 'Terms'],
  ['mailto:info@1oh1designllc.com?subject=Will%20It%20Print%3F%20feedback', 'Feedback'],
];

// Footer. In V2 it's a sticky bottom bar that stays with the user and carries
// the Paper/Ink background toggle; otherwise the original centered footer.
function Footer({ v2, bgMode, setBg, shop }) {
  const dark = v2 && bgMode === 'ink';
  const txt = dark ? '#C9CAD2' : '#4A4A50';
  const link = { fontFamily: FONT, fontSize: 12.5, color: txt, fontWeight: 600, textDecoration: 'none' };
  const dots = { margin: '0 9px', opacity: .5 };
  const links = shop ? (
    <span>
      <a href={shop.website} target="_blank" rel="noopener noreferrer" style={link}>{shop.name}</a>
      <span style={dots}>·</span>
      <span style={{ color: txt, fontSize: 12.5 }}>Preflight by <a href="https://willitprint.io" target="_blank" rel="noopener noreferrer" style={{ ...link, display: 'inline' }}>Will It Print?</a></span>
    </span>
  ) : (
    <span>
      {FOOT_LINKS.map(([href, label], i) => (
        <span key={href}>{i > 0 && <span style={dots}>·</span>}<a href={href} style={link}>{label}</a></span>
      ))}
      <span style={dots}>·</span>
      <span style={{ color: txt, fontSize: 12.5 }}>© {new Date().getFullYear()} 1Oh1 Design LLC</span>
    </span>
  );
  if (!v2) {
    return (
      <footer style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '20px 16px 30px',
        fontFamily: FONT, fontSize: 12.5, color: txt, textShadow: '0 1px 6px rgba(255,255,255,.95)' }}>{links}</footer>
    );
  }
  const pill = (on) => ({ cursor: 'pointer', border: 0, fontFamily: FONT, fontWeight: 800, fontSize: 12,
    padding: '6px 13px', borderRadius: 999,
    background: on ? (dark ? '#fff' : '#15161A') : 'transparent',
    color: on ? (dark ? '#15161A' : '#fff') : txt });
  return (
    <footer style={{ position: 'sticky', bottom: 0, zIndex: 6, width: '100%',
      background: dark ? 'rgba(14,15,19,.82)' : 'rgba(242,243,245,.9)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      borderTop: dark ? '1px solid rgba(255,255,255,.08)' : '1px solid rgba(0,0,0,.07)',
      padding: '9px max(16px,env(safe-area-inset-right,0px)) calc(9px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        {links}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: txt, opacity: .85 }}>Background</span>
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999,
            background: dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)' }}>
            <button onClick={() => setBg('paper')} style={pill(bgMode === 'paper')} aria-pressed={bgMode === 'paper'}>Paper</button>
            <button onClick={() => setBg('ink')} style={pill(bgMode === 'ink')} aria-pressed={bgMode === 'ink'}>Ink</button>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [stage, setStage] = useState('intake');
  const [job, setJob] = useState(null);   // { view, doc, result, source, intent }
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [fitMode, setFitMode] = useState('proportional'); // wrong-shape fit choice
  const [orig, setOrig] = useState(null);   // unrotated source + base intent
  const [rotation, setRotation] = useState(0); // artwork turns (0/90/180/270)
  const [showLowRes, setShowLowRes] = useState(false); // low-res download warning
  const [bgMode, setBgMode] = useState(() => { try { return localStorage.getItem('wipBg') === 'ink' ? 'ink' : 'paper'; } catch { return 'paper'; } });
  const setBg = (m) => { setBgMode(m); try { localStorage.setItem('wipBg', m); } catch { /* ignore */ } };

  const reset = () => {
    setStage('intake'); setJob(null); setError(''); setStatus('');
    setFitMode('proportional'); setOrig(null); setRotation(0);
  };

  // Build doc + checks + previews for a (possibly rotated) source and intent.
  async function analyzeSource(source, intent) {
    let doc;
    if (source.kind === 'pdf') {
      const { parsePdf } = await import('./parsers/pdf.js');
      doc = await parsePdf(source.bytes, source.name, intent);
    } else {
      doc = parseRaster(source.bytes, source.name, intent);
    }
    const result = runChecks(doc, resolveRuleset(intent), ALL);
    const view = toView(result, { filename: source.name, intent });
    setJob({ view, doc, result, source, intent });
    setStage('result');
    // Best-effort previews (additive — never blocks the result if they fail).
    try {
      const { loadSourceImages, makeThumb, makeFitOptions } = await import('./ui/preview.js');
      const imgs = await loadSourceImages(source);
      if (imgs.length) {
        const previews = imgs.map((im) => makeThumb(im)).filter(Boolean);
        const wrongShape = view.rows.some((r) => r.chooseFit);
        const fits = wrongShape ? makeFitOptions(imgs[0], intent.trimSize.width, intent.trimSize.height) : null;
        setJob((j) => (j && j.source === source ? { ...j, previews, fits } : j));
      }
    } catch { /* no preview */ }
  }

  async function handleAnalyze(file, intent) {
    setStage('analyzing'); setStatus(''); setFitMode('proportional');
    setRotation(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = ext(file.name) === 'pdf' ? 'pdf' : 'raster';
      const source = { kind, bytes, name: file.name, imageType: kind === 'raster' ? imageType(file.name) : undefined };
      setOrig({ source, intent });
      await analyzeSource(source, intent);
    } catch (e) {
      setError(friendlyError(e, file.name));
      setStage('error');
    }
  }

  // Re-run analysis on the artwork turned by `rot` (passed explicitly so we
  // don't read stale state right after setState).
  async function rerun(rot) {
    if (!orig) return;
    setFitMode('proportional'); setStatus('');
    try {
      const { rotateSource } = await import('./ui/rotate.js');
      const source = await rotateSource(orig.source, rot);
      await analyzeSource(source, orig.intent);
    } catch (e) {
      setStatus(`Couldn’t rotate: ${e.message}`);
    }
  }

  const rotate = (d) => { const n = (((rotation + d) % 360) + 360) % 360; setRotation(n); rerun(n); };

  // Primary button: export when good; for a low-res blocker, warn first.
  function onFix() {
    if (!job) return;
    const v = job.view.verdict;
    if (v === 'ready' || v === 'fixable') { doExport(); return; }
    if (job.view.primary?.lowRes) { setShowLowRes(true); return; }
    // other blockers: no export path
  }

  // Build + download the print-ready PDF (applies fixable actions + marks + bleed).
  // Low-res files export as-is — nothing is upscaled.
  async function doExport() {
    if (!job) return;
    if (job.source.kind !== 'pdf' && job.source.imageType === 'tiff') { setStatus('Checks apply to TIFF, but print-ready export isn’t available for TIFF yet — export a PNG, JPG, or PDF.'); return; }
    const outName = job.source.name.replace(/\.[^.]+$/, '') + '-print-ready.pdf';
    // Wrong-shape files resolve via the chosen fit; everything else fills normally.
    const wrongShape = job.view.rows.some((r) => r.chooseFit);
    const fit = wrongShape ? fitMode : 'fill';
    try {
      if (job.source.kind === 'pdf') {
        const { renderPrintReadyPdf } = await import('./fix/render-pdf.js');
        const { bytes, notes } = await renderPrintReadyPdf(job.source.bytes, job.doc, { fit });
        download(bytes, outName);
        setStatus(`Saved a print-ready PDF. ${notes.join(' ')}`.trim());
        return;
      }
      const actions = job.result.findings.filter((f) => f.fixAction).map((f) => f.fixAction);
      const plan = buildFixPlan(job.doc, actions);
      const { renderPrintReady } = await import('./fix/render.js');
      const out = await renderPrintReady(plan, job.source, { fit });
      download(out, outName);
      setStatus(`Saved a print-ready PDF.`);
    } catch (e) {
      setStatus(`Couldn’t build the print-ready file: ${e.message}`);
    }
  }

  return (
    <>
      {/* V2 drops the video for a plain backdrop while the background direction
          (Paper vs Ink) is being decided; live (non-V2) keeps the video. */}
      {USE_V2 ? <BackdropV2 mode={bgMode} /> : <Press />}
      {stage !== 'intake' && !(USE_V2 && stage === 'result') && (
        <nav style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center',
          padding: '10px 20px', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(0,0,0,.06)', fontFamily: FONT, fontSize: 12 }}>
          <button onClick={reset} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
            border: '1px solid #17161A', background: '#fff', color: '#17161A', fontWeight: 600 }}>← Check another file</button>
        </nav>
      )}

      {status && <div style={{ padding: '9px 20px', background: '#EAF3EE', borderBottom: '1px solid #CFE3D7',
        fontFamily: FONT, fontSize: 12, color: '#1E5B3E' }}>{status}</div>}

      {stage === 'intake' ? <Intake onAnalyze={handleAnalyze} v2={USE_V2} shop={SHOP} />
        : stage === 'analyzing' ? <Panel title="Checking your file…" body="One moment." />
        : stage === 'error' ? <Panel title="Couldn't read that file" body={error} />
        : <ResultView {...job.view} onFix={onFix} onReset={reset} previews={job.previews} fits={job.fits}
            fitMode={fitMode} onFitMode={setFitMode}
            rotation={rotation} onRotate={rotate} shop={SHOP} />}

      <Footer v2={USE_V2} bgMode={bgMode} setBg={setBg} shop={SHOP} />

      {showLowRes && (
        <LowResModal
          onCancel={() => setShowLowRes(false)}
          onAccept={() => { setShowLowRes(false); doExport(); }}
        />
      )}
    </>
  );
}
