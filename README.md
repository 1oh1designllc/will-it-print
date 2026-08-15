# Will It Print?

Client-side print preflight. Upload your artwork and print specs, and it tells you — in plain language — whether the file will print, what's wrong if it won't, and fixes what it honestly can. Everything runs in the browser; **your file never leaves your machine.**

*Front-facing name: **Will It Print?** · internal name: WebAtprint*

## How it works

```
file  ──parser──▶  canonical model  ──checkers──▶  { verdict, findings }  ──▶  Result UI
specs ──▶ intent                     (ruleset)
```

One canonical model sits between parsers and checkers so neither knows about the other. Checkers are pure `(doc, ruleset) → Finding[]`. The runner rolls all findings into one of four verdicts:

| Verdict | Meaning |
|---|---|
| **Ready** | No problems, everything could be checked. |
| **Unverified** | Nothing failed, but a check couldn't run (e.g. bleed on a flat image). |
| **Fixable** | Problems found, but every one has an honest fix. |
| **Needs attention** | A problem with no honest fix (e.g. too low-res). |

The guiding rule: never a false green badge, never a fix we can't honestly perform.

## Repo layout

```
src/
  core/            the shared engine (also shared with print-production-tool)
    canonical-model.js   the model every parser writes / every checker reads
    checker.js           checker contract + runner + verdict rollup
    ruleset.js           per-print-method thresholds (config, not hardcoded)
    checks/              bleed, resolution, color, dimensions
  parsers/
    raster.js            PNG/JPEG → model (byte-level; done)
    pdf-model.js         pure PDF model builder + box/bleed inference (done)
    pdf.js               pdf.js adapter (skeleton — finish against real PDFs)
  ui/                    Result + Intake screens (to build)
  fix/                   remediation engine (later)
tests/                   node harnesses — 30 fixtures, no browser needed
docs/                    build plan, UI spec, Result-screen prototype
```

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # run the engine harnesses (bleed/res/color/dimensions + parsers)
npm run build    # production build to dist/
```

`npm test` runs pure Node harnesses with hand-built fixtures — the engine is verified without a browser or any real files.

## Deploy (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`: it runs the harnesses, builds, and publishes `dist/` to Pages. Because the app is fully static, there's no server that could receive an upload — the privacy promise is structural.

One setting to match: `vite.config.js` has `base: '/will-it-print/'` for a project page at `https://<user>.github.io/will-it-print/`. For a custom domain or user/org page (served from root), set `base: '/'`.

## Status

Engine + raster parser + PDF model: done and green. PDF pdf.js adapter, the Result/Intake UI, and the fix engine are next. See `docs/WebAtprint_Build_Plan.md` for the full phased checklist and `docs/WillItPrint_UI_Spec.md` for the locked UI design.
