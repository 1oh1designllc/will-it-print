import { useState } from 'react';
import Intake from './ui/Intake.jsx';
import Result from './ui/Result.jsx';
import Press from './ui/Press.jsx';
import { toView } from './ui/present.js';
import { parseRaster } from './parsers/raster.js';
import { resolveRuleset } from './core/ruleset.js';
import { runChecks } from './core/checker.js';
import { dimensionsChecker } from './core/checks/dimensions.js';
import { bleedChecker } from './core/checks/bleed.js';
import { resolutionChecker } from './core/checks/resolution.js';
import { colorChecker } from './core/checks/color.js';
import { buildFixPlan } from './fix/plan.js';

const ALL = [dimensionsChecker, bleedChecker, resolutionChecker, colorChecker];
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

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
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
      setError(e.message || 'That file could not be read.');
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
      <Press />
      {stage !== 'intake' && (
        <nav style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center',
          padding: '10px 20px', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(0,0,0,.06)', fontFamily: FONT, fontSize: 12 }}>
          <button onClick={reset} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
            border: '1px solid #17161A', background: '#fff', color: '#17161A', fontWeight: 600 }}>← Check another file</button>
        </nav>
      )}

      {status && <div style={{ padding: '9px 20px', background: '#EAF3EE', borderBottom: '1px solid #CFE3D7',
        fontFamily: FONT, fontSize: 12, color: '#1E5B3E' }}>{status}</div>}

      {stage === 'intake' ? <Intake onAnalyze={handleAnalyze} />
        : stage === 'analyzing' ? <Panel title="Checking your file…" body="One moment." />
        : stage === 'error' ? <Panel title="Couldn't read that file" body={error} />
        : <Result {...job.view} onFix={onFix} previews={job.previews} fits={job.fits}
            fitMode={fitMode} onFitMode={setFitMode}
            rotation={rotation} onRotate={rotate} />}

      <footer style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '20px 16px 30px',
        fontFamily: FONT, fontSize: 12.5, color: '#4A4A50', textShadow: '0 1px 6px rgba(255,255,255,.95)' }}>
        <a href="/privacy.html" style={{ color: '#4A4A50', fontWeight: 600, textDecoration: 'none' }}>Privacy</a>
        <span style={{ margin: '0 9px', opacity: .5 }}>·</span>
        <a href="/terms.html" style={{ color: '#4A4A50', fontWeight: 600, textDecoration: 'none' }}>Terms</a>
        <span style={{ margin: '0 9px', opacity: .5 }}>·</span>
        <a href="mailto:info@1oh1designllc.com?subject=Will%20It%20Print%3F%20feedback" style={{ color: '#4A4A50', fontWeight: 600, textDecoration: 'none' }}>Feedback</a>
        <span style={{ margin: '0 9px', opacity: .5 }}>·</span>
        <span>© {new Date().getFullYear()} 1Oh1 Design LLC</span>
      </footer>

      {showLowRes && (
        <LowResModal
          onCancel={() => setShowLowRes(false)}
          onAccept={() => { setShowLowRes(false); doExport(); }}
        />
      )}
    </>
  );
}
