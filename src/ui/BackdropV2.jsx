import s from './BackdropV2.module.css';

/* Chooseable full-screen backdrop for V2. mode: 'plain' (neutral, no texture —
   a clean slate for judging the layout), 'paper' (light + waves), 'ink' (dark +
   waves). Decorative only. Paper/Ink are ready for a user toggle later. */
const WAVES = [
  'M-50 180 C 300 60, 700 300, 1100 150 S 1600 260 1600 180',
  'M-50 260 C 300 140, 700 380, 1100 230 S 1600 340 1600 260',
  'M-50 340 C 300 220, 700 460, 1100 310 S 1600 420 1600 340',
  'M-50 640 C 300 520, 760 780, 1160 620 S 1600 720 1600 640',
  'M-50 720 C 300 600, 760 860, 1160 700 S 1600 800 1600 720',
];

export default function BackdropV2({ mode = 'plain' }) {
  if (mode === 'plain') return <div className={`${s.backdrop} ${s.plain}`} aria-hidden="true" />;
  const ink = mode === 'ink';
  const stroke = ink ? '#FFFFFF' : '#0E0F13';
  const op = ink ? 0.06 : 0.05;
  const cmyk = ink ? 0.16 : 0.1;
  return (
    <div className={`${s.backdrop} ${ink ? s.ink : s.paper}`} aria-hidden="true">
      <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke={stroke} strokeOpacity={op} strokeWidth="1.4">
          {WAVES.map((d, i) => <path key={i} d={d} />)}
        </g>
        <g>
          <path d="M1400 0 L1400 230 A230 230 0 0 0 1170 0 Z" fill="#00AEEF" fillOpacity={cmyk} />
          <path d="M1400 0 L1400 150 A150 150 0 0 0 1250 0 Z" fill="#EC008C" fillOpacity={cmyk} />
        </g>
      </svg>
    </div>
  );
}
