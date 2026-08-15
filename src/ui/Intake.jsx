import { useRef, useState } from 'react';
import s from './Intake.module.css';
import { PRESETS, METHOD_LABEL, presetIntent, customIntent } from './presets.js';

const OK_EXT = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'pdf'];
const ext = (name) => name.split('.').pop().toLowerCase();
const dims = (pt) => `${(pt / 72).toFixed(2)} in · ${(pt / 72 * 25.4).toFixed(1)} mm`;

export default function Intake({ onAnalyze = () => {} }) {
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [sel, setSel] = useState(null); // preset key or 'custom'
  const [custom, setCustom] = useState({ w: '', h: '', unit: 'in', method: 'offset', bleed: '0.125', sides: 2, qty: 100 });
  const [built, setBuilt] = useState(null);
  const input = useRef(null);

  const take = (f) => {
    if (!f) return;
    if (!OK_EXT.includes(ext(f.name))) { setErr(`Can’t read .${ext(f.name)} yet — PNG, JPG, or PDF for now.`); return; }
    setErr(''); setFile(f); setBuilt(null);
  };

  const preset = PRESETS.find((p) => p.key === sel);
  const customValid = +custom.w > 0 && +custom.h > 0;
  const ready = !!file && (sel === 'custom' ? customValid : !!preset);

  const analyze = () => {
    const intent = sel === 'custom' ? customIntent(custom) : presetIntent(preset);
    setBuilt(intent);
    onAnalyze(file, intent);
  };

  const setC = (k, v) => setCustom({ ...custom, [k]: v });

  return (
    <main className={s.intake}>
      <div className={s.wrap}>
        <p className={s.eyebrow}>New job · <b>will it print?</b></p>

        {/* Upload */}
        <p className={s.label}>Your file</p>
        <div
          className={`${s.drop} ${drag ? s.dropOn : ''} ${file ? s.hasFile : ''}`}
          onClick={() => input.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}
        >
          <input ref={input} type="file" accept=".png,.jpg,.jpeg,.tif,.tiff,.pdf" hidden
            onChange={(e) => take(e.target.files[0])} />
          {file
            ? <><span className={s.fname}>{file.name}</span><button className={s.clear}
                onClick={(e) => { e.stopPropagation(); setFile(null); setBuilt(null); }}>Replace</button></>
            : <span className={s.dropHint}>Drop a PNG, JPG, or PDF here, or click to choose</span>}
        </div>
        {err && <p className={s.err}>{err}</p>}

        {/* Presets */}
        <p className={s.label}>What are you making?</p>
        <div className={s.chips}>
          {PRESETS.map((p) => (
            <button key={p.key} className={`${s.chip} ${sel === p.key ? s.chipOn : ''}`}
              onClick={() => { setSel(p.key); setBuilt(null); }}>
              {p.label}<span className={s.chipDim}>{p.w}×{p.h} in</span>
            </button>
          ))}
          <button className={`${s.chip} ${sel === 'custom' ? s.chipOn : ''}`}
            onClick={() => { setSel('custom'); setBuilt(null); }}>Custom…</button>
        </div>

        {preset && <p className={s.note}>{METHOD_LABEL[preset.method]} · {preset.bleed} in bleed (auto)</p>}

        {/* Custom (pro lane) */}
        {sel === 'custom' && (
          <div className={s.custom}>
            <div className={s.row}>
              <label className={s.f}><span>Width</span>
                <input className={s.in} type="number" value={custom.w} onChange={(e) => setC('w', e.target.value)} /></label>
              <span className={s.x}>×</span>
              <label className={s.f}><span>Height</span>
                <input className={s.in} type="number" value={custom.h} onChange={(e) => setC('h', e.target.value)} /></label>
              <label className={s.f}><span>Unit</span>
                <select className={s.in} value={custom.unit} onChange={(e) => setC('unit', e.target.value)}>
                  <option value="in">in</option><option value="mm">mm</option></select></label>
            </div>
            <div className={s.row}>
              <label className={s.f}><span>Print method</span>
                <select className={s.in} value={custom.method} onChange={(e) => setC('method', e.target.value)}>
                  {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className={s.f}><span>Bleed ({custom.unit})</span>
                <input className={s.in} type="number" value={custom.bleed} onChange={(e) => setC('bleed', e.target.value)} /></label>
              <label className={s.f}><span>Sides</span>
                <select className={s.in} value={custom.sides} onChange={(e) => setC('sides', e.target.value)}>
                  <option value={1}>1</option><option value={2}>2</option></select></label>
              <label className={s.f}><span>Quantity</span>
                <input className={s.in} type="number" value={custom.qty} onChange={(e) => setC('qty', e.target.value)} /></label>
            </div>
          </div>
        )}

        {/* Analyze */}
        <div className={s.foot}>
          <button className={s.analyze} disabled={!ready} onClick={analyze}>Will it print?</button>
          {!ready && <span className={s.hint}>Add a file and pick a size to check.</span>}
        </div>

        {/* Dev summary of the built intent (removed once wired to the engine) */}
        {built && (
          <div className={s.summary}>
            <p className={s.label}>Ready to analyze</p>
            <div className={s.sumGrid}>
              <span>File</span><span>{file.name}</span>
              <span>Trim</span><span>{dims(built.trimSize.width)} × {dims(built.trimSize.height)}</span>
              <span>Method</span><span>{METHOD_LABEL[built.printMethod]}</span>
              <span>Bleed</span><span>{built.requestedBleed ? dims(built.requestedBleed) : 'ruleset default'}</span>
              <span>Sides · Qty</span><span>{built.sides} · {built.quantity}</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
