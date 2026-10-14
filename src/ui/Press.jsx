import s from './Press.module.css';

// Fixed full-bleed video background behind every page. Muted + looping so it
// autoplays everywhere; a light veil keeps the crisp white boxes legible on top.
const BG = import.meta.env.BASE_URL;

export default function Press() {
  return (
    <div className={s.press} aria-hidden="true">
      <video
        className={s.video}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={`${BG}wip-logo.png`}
      >
        <source src={`${BG}bg.webm`} type="video/webm" />
        <source src={`${BG}bg.mp4`} type="video/mp4" />
      </video>
      <div className={s.veil} />
    </div>
  );
}
