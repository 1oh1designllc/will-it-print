# Will It Print? — UI Spec

*Front-facing name: **Will It Print?** · internal/repo name: WebAtprint*
*Locks the Phase 3 UI. Working doc, 2026-08-10.*

---

## 1. The one job

The app answers a single question — **will it print?** — in plain words, then backs that answer with as much precision as the person wants. Every screen ladders up to a clear **Yes / Almost / Maybe / Not yet**. If a design choice doesn't help answer that question faster or more honestly, it's out.

## 2. Design principle — progressive disclosure (LOCKED)

Not a Simple mode and a Pro mode. **One adaptive surface: plain answer on top, technical depth one tap beneath.** The layman reads "this corner is too low-res to print sharp" and stops. The pro taps and sees "96 dpi at print size, needs 200, image `logo.png` at 88.9×50.8mm." Same finding, two depths — and the engine already carries both: every finding has a human `message` and a structured `detail`.

Rejected: an explicit audience toggle (doubles the work, forces people to self-identify before they know what they need).

## 3. Screens

`Intake → Analyzing → Result`. Three screens, no navigation maze.

## 4. Intake

Goal: get a file **and** a `PrintIntent` with the least friction, without demanding print vocabulary.

- **Upload first** (drag/drop or pick) — lowest-friction entry. PNG, JPG, PDF. TIFF and unknown types get a calm "can't read this type yet" (from `UnsupportedFormatError`).
- **"What are you making?" — product presets.** The layman lane: pick a product and trim size, method, and bleed auto-fill. No one has to know the word "bleed" to start.

  | Preset | Trim size | Default method | Bleed |
  |---|---|---|---|
  | Business card | 3.5 × 2 in | Offset | 0.125 in |
  | Postcard | 6 × 4 in | Digital | 0.125 in |
  | Flyer | 8.5 × 11 in | Digital | 0.125 in |
  | Poster | 18 × 24 in | Large format | 0.25 in |
  | Sticker | 3 × 3 in | Digital | 0.125 in |
  | Custom… | user-set | user-set | user-set |

- **Custom toggle** — the pro lane. Expands exact trim W×H, print method, sides, quantity, and an explicit bleed override (`intent.requestedBleed`). One toggle spans both audiences; no separate mode.
- Analyze is disabled until there's a file **and** an intent (we can't check anything without knowing what it's being checked against).

## 5. Analyzing

Brief, honest, no fake progress bar theater. Parse → `runChecks`. If it's instant, skip the screen entirely.

## 6. Result — the heart

Three stacked zones.

### 6a. Verdict banner — the headline

Direct map from the four engine verdicts to plain words:

| Engine verdict | Headline | Tone | Primary action |
|---|---|---|---|
| `ready` | **Yes — this'll print.** | green | Download / proceed |
| `fixable` | **Almost. A few things to fix first.** | amber | **Fix these for me** |
| `unverified` | **Maybe. Something we couldn't check.** | blue | Show what to check |
| `needs-attention` | **Not yet. This needs a change first.** | red | What only you can do |

The banner is the biggest thing on the screen. It *is* the answer to the app's name.

### 6b. Findings — one card per finding

Two-layer card, collapsed by default:

- **Collapsed (layman):** status icon + one plain sentence (`finding.message`). That's it.
- **Expanded (pro):** *why it matters* (one line) · *the numbers* (from `finding.detail` — dpi, mm, ratio, box coords) · *the action* (fix button if `fixable`, or plain guidance if not).

Examples straight from the engine:

- Resolution collapsed: "This image will look pixelated at print size." → expanded: "96 dpi at 88.9×50.8mm; needs 200. Use a higher-res source or place it smaller." *(unfixable — guidance, no button)*
- Bleed collapsed: "The design needs to run a little past the cut edge." → expanded: "3.2mm required, 1.4mm on the tightest side." *(fixable — Add bleed)*
- Color collapsed: "Screen colors — some will shift in print." → expanded: "RGB; this press needs CMYK." *(fixable — Convert, preview only)*

### 6c. Annotated preview

Render the file with problem spots highlighted using each finding's `bbox`. This is the single most layman-friendly element. *MVP: raster preview (draw image + overlay rects — genuinely cheap); PDF preview fast-follows once the pdf.js renderer is wired.* "Oh, *that* corner" beats any paragraph.

### 6d. Fix bar

- Verdict `fixable` → primary **"Fix everything I can"** runs every `fixAction`, returns a corrected print-ready PDF (routes into the print-production-tool engine).
- Per-finding fix buttons for granular control (pro).
- **Caveats surface as calm sub-text, never hidden fine print:** RGB→CMYK is "a preview — confirm critical colors with your printer"; bleed is "adds the space, but pull your artwork out to fill it"; resize is "scaling up softens the image."
- Unfixable findings are excluded from auto-fix and shown as "You'll need to: …". After fixing, the app **auto re-checks and lands on the updated verdict**, with caveats persisting on now-passing items and the corrected file available to download there.

## 7. Copy & tone

Zero jargon in the top layer, full precision in the detail layer. The translation contract:

| Concept | Top layer | Detail layer |
|---|---|---|
| Bleed | design runs past the cut so there's no white sliver | 3.2mm required, 1.4mm present |
| Trim/size | the finished size | TrimBox 88.9×50.8mm vs ordered 88.9×50.8mm |
| Resolution | sharp enough / will look pixelated | 96 dpi at size, 200 min |
| Color mode | screen colors vs print colors, some shift | RGB → CMYK, convert = preview, no ICC |
| Aspect | wrong shape for this size | 1.0 ratio vs 1.75 target |

**The Unverified state and the caveats are the trust, not friction.** A calm "we couldn't check bleed on a flat image, here's why" makes the green badges believable. Never hide them.

## 8. Edge & empty states

- No file → invite upload.
- Unsupported type (TIFF/other) → "PNG, JPG, or PDF for now."
- Parse error → honest fallback, no crash, offer to try another file.
- No intent chosen → ask before analyzing.
- `doc.warnings` (e.g. `raster_no_bleed`, `pdf_boxes_inferred`) → attach to the related finding as a "why we couldn't be sure" note.

## 9. Component tree & data flow

```
App                         state: file, intent, doc, results
├─ IntakeScreen
│   ├─ FileDrop             -> file
│   ├─ ProductPresetPicker  -> intent (preset)
│   └─ CustomSpecs (toggle) -> intent (manual)
├─ AnalyzingScreen
└─ ResultScreen
    ├─ VerdictBanner        <- results.verdict
    ├─ FindingsList
    │   └─ FindingCard[]    <- findings[]  (collapsed message / expanded detail)
    ├─ AnnotatedPreview     <- findings[].bbox over the file
    └─ FixBar               <- findings[].fixAction

file --parser(raster|pdf)--> PrintDocument
intent (preset|custom) ----> PrintIntent
runChecks(doc, ruleset, ALL) -> { verdict, findings }  -> ResultScreen
```

Nothing new in the engine — the UI is a pure view over `{ verdict, findings }`.

## 10. Accessibility

Status is never color alone — always icon + label + color. Keyboard-navigable, AA contrast. Run the accessibility-review pass before handoff.

## 11. Build order

1. **Result screen first**, against a mock `PrintDocument` + findings — we already have perfect fixture data from the harnesses, so it renders real content on day one.
2. Intake (presets, then custom toggle).
3. Wire the real parsers + fix engine.
4. Empty/error states, annotated preview polish.

*(Pull the frontend-design skill when writing components — it governs the styling constraints for the Vite setup.)*

## 12. Settled UI decisions

- **U1 ✅** — MVP presets = Business card, Postcard, Flyer, Poster, Sticker (+ Custom). Chosen to span all three print methods so every ruleset path is reachable from a real preset.
- **U2 ✅** — "Fix everything" **auto re-checks and lands on the updated verdict**; caveats persist on now-passing items (e.g. "confirm CMYK on your printer's proof"); corrected-file download lives on that updated result.
- **U3 ✅** — Annotated preview **in MVP for raster** (cheap, high layman value); **PDF preview fast-follows** with the pdf.js canvas renderer. Findings list works regardless.
- **U4 ✅** — **In-app for MVP + print-clean stylesheet** (result prints cleanly to PDF from the browser); a shareable link/report is v1.1.
