import { useRef, useState } from 'react';
import s from './Intake.module.css';
import logo from '../assets/wip-logo.png';
import { PRESETS, PRESET_GROUPS, METHOD_LABEL, presetIntent, customIntent } from './presets.js';
import { DONATE_URL } from '../config.js';

const OK_EXT = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'pdf'];
const ext = (name) => name.split('.').pop().toLowerCase();

export default function Intake({ onAnalyze = () => {} }) {
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [sel, setSel] = useState('poster-11x17'); // preset key or 'custom'
  const [custom, setCustom] = useState({ w: '', h: '', unit: 'in', method: 'offset', bleed: '0.125', sides: 2, qty: 100 });
  const input = useRef(null);

  const take = (f) => {
    if (!f) return;
    if (!OK_EXT.includes(ext(f.name))) { setErr(`Can’t read .${ext(f.name)} yet — PNG, JPG, TIFF, or PDF for now.`); return; }
    setErr(''); setFile(f);
  };

  const preset = PRESETS.find((p) => p.key === sel);
  const customValid = +custom.w > 0 && +custom.h > 0;
  const ready = !!file && (sel === 'custom' ? customValid : !!preset);
  const analyze = () => onAnalyze(file, sel === 'custom' ? customIntent(custom) : presetIntent(preset));
  const setC = (k, v) => setCustom({ ...custom, [k]: v });

  const curGroup = PRESET_GROUPS.find((g) => g.items.some((p) => p.key === sel));
  const curProduct = sel === 'custom' ? 'Custom' : (curGroup ? curGroup.label : null);
  const products = [...PRESET_GROUPS.map((g) => g.label), 'Custom'];
  const pickProduct = (label) => {
    if (label === 'Custom') setSel('custom');
    else setSel(PRESET_GROUPS.find((g) => g.label === label).items[0].key);
  };

  return (
    <main className={s.stage}>
      <div className={s.wrap}>
        <section className={`${s.panel} ${s.hero}`}>
          <h1 className={s.h1}>Will your file print?</h1>
          <p className={s.sub}>Drop in your artwork, get a plain&#8209;English verdict, and
            download it press&#8209;ready — right here in your browser.</p>
        </section>

        <section className={`${s.panel} ${s.inp}`}>
          <div className={s.hdrRow}>
            <img className={s.logo} src={logo} alt="Will It Print?" />
            <div className={s.badges}>
              <span className={s.badge}><b>✓</b> Free to use</span>
              <span className={s.badge}><b>✓</b> 100% private</span>
              <span className={s.badge}><b>✓</b> ~10-second check</span>
            </div>
          </div>

          <div className={s.card}>
          <div
            className={`${s.drop} ${drag ? s.dropOn : ''} ${file ? s.hasFile : ''}`}
            onClick={() => input.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}
          >
            <input ref={input} type="file" accept=".png,.jpg,.jpeg,.tif,.tiff,.pdf" hidden
              onChange={(e) => take(e.target.files[0])} />
            {file ? (
              <div className={s.fileRow}>
                <span className={s.fdot} aria-hidden="true" />
                <span className={s.fname}>{file.name}</span>
                <button className={s.clear} onClick={(e) => { e.stopPropagation(); setFile(null); }}>Replace</button>
              </div>
            ) : (
              <div className={s.dropInner}>
                <span className={s.dropBig}>Drop your artwork here</span>
                <span className={s.dropSmall}>or click to browse — PNG, JPG, TIFF, or PDF</span>
              </div>
            )}
          </div>
          {err && <p className={s.err}>{err}</p>}

          <div className={s.specs}>
            <div className={s.pills}>
              {products.map((label) => (
                <button key={label} className={`${s.pill} ${curProduct === label ? s.pillOn : ''}`}
                  onClick={() => pickProduct(label)}>{label}</button>
              ))}
            </div>

            {curProduct !== 'Custom' && curGroup && (
              <div className={s.sizes}>
                {curGroup.items.map((p) => (
                  <button key={p.key} className={`${s.sz} ${sel === p.key ? s.szOn : ''}`}
                    onClick={() => setSel(p.key)}>{p.w} × {p.h} in</button>
                ))}
                <span className={s.meta}>{METHOD_LABEL[preset.method]} · {preset.bleed}in bleed</span>
              </div>
            )}

            {sel === 'custom' && (
              <div className={s.custom}>
                <div className={s.crow}>
                  <label className={s.f}><span>Width</span>
                    <input className={s.in} type="number" value={custom.w} onChange={(e) => setC('w', e.target.value)} /></label>
                  <span className={s.x}>×</span>
                  <label className={s.f}><span>Height</span>
                    <input className={s.in} type="number" value={custom.h} onChange={(e) => setC('h', e.target.value)} /></label>
                  <label className={s.f}><span>Unit</span>
                    <select className={s.in} value={custom.unit} onChange={(e) => setC('unit', e.target.value)}>
                      <option value="in">in</option><option value="mm">mm</option></select></label>
                </div>
                <div className={s.crow}>
                  <label className={s.f}><span>Method</span>
                    <select className={s.in} value={custom.method} onChange={(e) => setC('method', e.target.value)}>
                      {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className={s.f}><span>Bleed ({custom.unit})</span>
                    <input className={s.in} type="number" value={custom.bleed} onChange={(e) => setC('bleed', e.target.value)} /></label>
                  <label className={s.f}><span>Sides</span>
                    <select className={s.in} value={custom.sides} onChange={(e) => setC('sides', e.target.value)}>
                      <option value={1}>1</option><option value={2}>2</option></select></label>
                  <label className={s.f}><span>Qty</span>
                    <input className={s.in} type="number" value={custom.qty} onChange={(e) => setC('qty', e.target.value)} /></label>
                </div>
              </div>
            )}
          </div>

          <button className={s.cta} disabled={!ready} onClick={analyze}>Check my file</button>
          <p className={s.note}>Your file never leaves your browser. Will It Print? is a preflight
            aid, not a guarantee — always approve a printer’s proof before production.</p>
          {DONATE_URL && (
            <a className={s.donate} href={DONATE_URL} target="_blank" rel="noopener noreferrer">
              ☕ Found this useful? Support the tool
            </a>
          )}
          </div>
        </section>
      </div>
    </main>
  );
}
