import { useState } from 'react';
import Intake from './ui/Intake.jsx';
import Result from './ui/Result.jsx';
import { SCENARIOS } from './ui/fixtures.js';
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

const NAV = ['live', 'ready', 'fixable', 'unverified', 'needs'];
const LABEL = { live: 'Live', ready: 'Yes', fixable: 'Almost', unverified: 'Maybe', needs: 'Not yet' };
const PAGE = { minHeight: '100vh', background: '#F4F3EE', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', fontFamily: 'system-ui,sans-serif' };

const Panel = ({ title, body }) => (
  <div style={PAGE}><div style={{ maxWidth: 420 }}>
    <h2 style={{ fontFamily: '"Space Grotesk",sans-serif', margin: '0 0 8px' }}>{title}</h2>
    <p style={{ color: '#3A3A36' }}>{body}</p>
  </div></div>
);

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [mode, setMode] = useState('live');
  const [stage, setStage] = useState('intake');
  const [job, setJob] = useState(null);   // { view, doc, result, source }
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const reset = () => { setStage('intake'); setJob(null); setError(''); setStatus(''); };

  async function handleAnalyze(file, intent) {
    if (ext(file.name) === 'pdf') { setStage('pdf'); return; }
    setStage('analyzing'); setStatus('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = parseRaster(bytes, file.name, intent);
      const result = runChecks(doc, resolveRuleset(intent), ALL);
      setJob({ view: toView(result, { filename: file.name, intent }), doc, result,
        source: { kind: 'raster', bytes, imageType: imageType(file.name), name: file.name } });
      setStage('result');
    } catch (e) {
      setError(e.message || 'That file could not be read.');
      setStage('error');
    }
  }

  // Primary/fix action: export a print-ready PDF (applies fixable actions + marks + bleed).
  async function onFix() {
    if (!job || !(job.view.verdict === 'ready' || job.view.verdict === 'fixable')) return;
    if (job.source.imageType === 'tiff') { setStatus('Checks apply to TIFF, but print-ready export isn’t available for TIFF yet — export a PNG, JPG, or PDF.'); return; }
    try {
      const actions = job.result.findings.filter((f) => f.fixAction).map((f) => f.fixAction);
      const plan = buildFixPlan(job.doc, actions);
      const { renderPrintReady } = await import('./fix/render.js');
      const out = await renderPrintReady(plan, job.source);
      download(out, job.source.name.replace(/\.[^.]+$/, '') + '-print-ready.pdf');
      setStatus(`Saved a print-ready PDF. ${plan.notes.join(' ')}`.trim());
    } catch (e) {
      setStatus(`Couldn’t build the print-ready file: ${e.message}`);
    }
  }

  const live = mode === 'live';
  return (
    <>
      <nav style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 20px', background: '#F4F3EE', borderBottom: '1px solid #E3E1DA', fontFamily: 'monospace', fontSize: 12 }}>
        <span style={{ color: '#6B6A64', letterSpacing: '.1em' }}>PREVIEW</span>
        {NAV.map((k) => (
          <button key={k} onClick={() => { setMode(k); if (k === 'live') reset(); }}
            style={{ padding: '5px 10px', borderRadius: 100, cursor: 'pointer',
              border: `1px solid ${mode === k ? '#17161A' : '#E3E1DA'}`, background: '#fff', color: mode === k ? '#17161A' : '#6B6A64' }}>
            {LABEL[k]}
          </button>
        ))}
        {live && stage !== 'intake' && (
          <button onClick={reset} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 100, cursor: 'pointer',
            border: '1px solid #17161A', background: '#fff', color: '#17161A' }}>← New file</button>
        )}
      </nav>

      {status && <div style={{ padding: '9px 20px', background: '#EAF3EE', borderBottom: '1px solid #CFE3D7',
        fontFamily: 'monospace', fontSize: 12, color: '#1E5B3E' }}>{status}</div>}

      {!live ? <Result {...SCENARIOS[mode]} onFix={() => {}} />
        : stage === 'intake' ? <Intake onAnalyze={handleAnalyze} />
        : stage === 'analyzing' ? <Panel title="Checking your file…" body="One moment." />
        : stage === 'pdf' ? <Panel title="PDF checking is almost ready" body="The PDF reader is still being wired up. Drop a PNG or JPG to see a full result right now." />
        : stage === 'error' ? <Panel title="Couldn't read that file" body={error} />
        : <Result {...job.view} onFix={onFix} />}
    </>
  );
}
