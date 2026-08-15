# WebAtprint — Build Plan

*Print preflight for everyone. Upload artwork + specs → know if it'll print → fix it.*
*Working doc. Last updated 2026-08-10.*

---

## 1. What it is

A **printer-agnostic, client-side preflight tool**. A user uploads their artwork plus the print specs (trim size, print method, quantity, sides), and WebAtprint checks the file the way a commercial RIP would — then explains, in plain English, what's wrong and how to fix it. Where the fix is mechanical, it fixes it and hands back a print-ready PDF.

**Who it's for:** graphic designers, and people unfamiliar with printing guidelines and procedures, who want to catch problems before a printer rejects the job. The whole product is *guided and explanatory* — hand-holding, not a pro toolbox. The wedge is *explanation* — existing preflight is either locked in pro software (PitStop) or buried inside one printer's upload flow. Ours is open, educational, and never uploads your file to a server.

---

## 2. Scope

### Phase 1 — MVP (the target)
- **Formats in:** PDF, PNG, JPG, TIFF
- **Checks:** dimensions, bleed, resolution, color mode *(the big three + color)*
- **Report:** verdict + per-issue plain-English explanation tied to the chosen print method
- **Fixes:** add bleed canvas, crop marks, resize; RGB→CMYK as flagged preview — routed into the existing prep engine
- **Output:** corrected, print-ready PDF download

### Phase 2 — Later
- AI / EPS parsing
- Font-embedding, overprint, transparency, spot-color checks
- Safe-zone / text-position detection
- Loadable **printer profiles** (white-label / per-printer rulesets)

### Out of scope (for now)
- Any backend, accounts, or saved jobs — MVP is 100% in-browser
- True ICC color-managed CMYK conversion (approximate only, loudly flagged)

---

## 3. Architecture

Six stages, one canonical model in the middle so parsers and checkers never touch each other:

**Intake → Normalize → Resolve ruleset → Run checks → Report → Fix**

- **Canonical model** (`canonical-model.js`) — the spine. Every parser writes it, every checker reads it. Points throughout, bottom-left origin, `null` + warning for anything unknown (never a silent guess).
- **Checker contract** (`checker.js`) — a checker is `{ id, label, run(doc, ruleset) → Finding[] }`: pure, per-page capable, never throws for a bad file. `runChecks` aggregates; `rollUp` decides one of four verdicts: **Ready / Unverified / Fixable / Needs attention**.
- **Ruleset** (`ruleset.js`) — print method + product → thresholds, held as data (the white-label hook).
- **Fix engine** — *is* the print-production-tool. The checker says "no bleed," the fixer adds bleed: one rule, two verbs. This is why they're one engine, not two apps.

### Proposed folder structure
```
src/
  core/
    canonical-model.js      # the shared spine
    checker.js              # contract + runner
    ruleset.js              # profiles
    units.js                # pt/mm/in conversion (from print-prod tool)
    checks/
      bleed.js
      dimensions.js
      resolution.js
      color.js
  parsers/
    raster.js               # png/jpg/tiff → model
    pdf.js                  # pdf.js → model
  fix/                      # = print-production-tool engine (add bleed, marks, resize)
  ui/                       # intake form, report, annotated preview
  harness.js                # fixtures + assertions (dev only)
```

---

## 4. Tech decisions

- **React + Vite** — matches the print-production-tool, shares the core folder
- **pdf.js** to inspect/parse, **pdf-lib** to write/fix (already the prep tool's stack)
- **Plain JS + JSDoc types** — editor autocomplete without a TS migration; matches `units.js` convention
- **100% client-side** — the file never leaves the browser. For preflight this is a *feature*, not just a shortcut: people preflight confidential client artwork.
- **One shared core** with print-production-tool — checker and fixer are two faces of the same engine

---

## 5. Open decisions — settle before Phase 1

| # | Decision | Options | Blocks |
|---|----------|---------|--------|
| D1 | Standalone app or the preflight face of print-production-tool? | ✅ **RESOLVED — shared-core monorepo.** WebAtprint gets its own beginner-first UX; shares the engine + fix modules with print-production-tool | — |
| D2 | What does "no fails but something couldn't be checked" show? | ✅ **RESOLVED — 4th verdict `Unverified`** (wired into `rollUp`; warn = check ran, unverified = check couldn't run) | — |
| D3 | Color mode for MVP | Check-only (flag RGB) / **auto-convert with caveat (leaning — beginners can't act on a bare flag)** | color checker + fix |
| D4 | Bleed inference aggressiveness | ✅ **RESOLVED — infer when boxes missing, flag `inferred`** so shortfalls soften fail→warn; declared boxes give hard checks | — |
| D5 | Hosting | GitHub Pages (like ozo-pads-site) / other | ship |

*D1 and D2 (the two that gated starting) are settled. D3 leans toward auto-fix given the beginner audience; D4/D5 settle as their phase comes up.*

---

## 6. Build checklist

**Definition of done for any checker:** pure `run()`, returns `Finding[]`, has a fixtures block in the harness, harness stays green, messages are plain-English and method-aware.

### Phase 0 — Foundation ✅
- [x] Canonical model — `canonical-model.js`
- [x] Checker contract + runner + verdict rollup — `checker.js`
- [x] Ruleset resolver with per-method profiles — `ruleset.js`
- [x] Bleed checker — `checks/bleed.js`
- [x] Fixtures harness with assertions — `harness.js` (all green)

### Phase 1 — Checkers ✅ *(logic only, against hand-built fixtures — 19 green)*
- [x] Dimensions checker (+ fixtures) — exact = pass, rotated/rescale = fixable, wrong aspect = unfixable
- [x] Resolution checker (+ fixtures) — first **unfixable** fail; the `needs-attention` verdict is now proven end to end
- [x] Color-mode checker (+ fixtures) — RGB/mixed = fixable convert; spot = warn; unknown = unverified
- [x] Settle D2, wire `rollUp` accordingly (Unverified verdict live, harness green)
- [x] `runChecks` over all three checkers, harness green (14 fixtures, incl. whole-file clean + messy)

### Phase 2 — Parsers *(turn real files into the canonical model)*
- [x] Raster parser — **PNG + JPEG done** (byte-level header read; sees CMYK JPEGs; resolution measured at ordered size; bleed left null → unverified). End-to-end harness green (5 fixtures, bytes→verdict).
- [ ] TIFF parser (IFD walk) — sniffed + throws `UnsupportedFormatError` for now; fast follow
- [x] PDF parser — **pure builder done & tested** (`pdf-model.js`: box resolution + D4 inference, 6 fixtures green)
- [ ] PDF parser — pdf.js adapter (`pdf.js`): finish box reading (Trim/Bleed not in public API), image CTM→DPI, color detection; **test against real sample PDFs in browser**
- [x] Bleed inference (D4) — infer when boxes missing, flag `inferred` so shortfalls soften to warn
- [ ] Parser fixtures from a small folder of real sample files

### Phase 3 — Report UI
- [ ] Intake form → `PrintIntent`
- [ ] Upload → parse → run → verdict
- [ ] Findings list + annotated preview (highlight the problem area)

### Phase 4 — Fix engine *(remediation: the next step — solve the problem, not just name it; = the print-production-tool engine)*
- [ ] Bridge `fixAction` → prep engine
- [ ] Add bleed (canvas) + crop marks
- [ ] Scale to fit — **proportional** (in beginner auto-fix)
- [ ] Color convert (RGB→CMYK, preview) — per D3
- [ ] Corrected print-ready PDF export
- **Pro / later build:** **non-proportional (stretch) scaling** as an *explicit, opt-in* fix — never in the beginner "Fix everything I can" (silent distortion breaks trust); offered only as a deliberate pro choice. Same guardrail idea as progressive disclosure, applied to fixes.
- **Not fixable (by design, any build):** resolution — no honest fix exists (upscaling invents detail), so it never gets a button, only guidance.

### Phase 5 — Ship
- [ ] QA pass against the sample-file folder (a preflight testing checklist, PAD-WRK style)
- [ ] Deploy — per D5
- [ ] Landing copy

---

## 7. Milestones

1. **Checker suite green** (end of Phase 1) — ✅ **reached 2026-08-10.** All four checks (dimensions, bleed, resolution, color) proven across 19 fixtures. No real files yet.
2. **First real file scored** (end of Phase 2) — ✅ **raster reached 2026-08-10:** PNG/JPEG bytes → model → verdict, proven on 5 files. Full milestone closes when the PDF parser lands and a browser file input is wired.
3. **End-to-end fix** (end of Phase 4) — bad file in, print-ready file out
4. **Live** (Phase 5)
