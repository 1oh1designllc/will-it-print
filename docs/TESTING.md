# Will It Print? — Run & Test Runbook

Everything you need to get running and verify the whole app in one sitting.

## 1. Run it (copy-paste)

```bash
npm install          # pulls react, pdf-lib, pdfjs-dist, vite
npm test             # 41 engine checks across 5 harnesses — must be green
npm run dev          # local dev server (Vite prints the URL)
```

`npm test` runs pure Node harnesses (no browser, no real files). If it's red, stop — the engine changed. `npm run build` produces `dist/` for deploy.

## 2. Prepare 4 sample files (makes the manual pass fast)

Export/grab these so you can hit every verdict quickly:

| File | How to make it | Should give |
|---|---|---|
| `good.jpg` | ~1050×600 px photo, saved as JPEG | **Yes / Ready** (or Maybe — see note) |
| `lowres.jpg` | a small image, ~350×200 px | **Not yet** (resolution blocker) |
| `rgb.png` | any RGB PNG at ~1050×600 | **Almost** (RGB → convert) |
| `square.png` | a 1000×1000 px image | **Not yet** (wrong shape) |

Note: a normal RGB/flat file lands on **Maybe** for bleed (flat rasters carry no bleed info) — that's correct, not a bug. Pick "Business card" as the size for all of these.

## 3. Master test checklist

### Engine (automated)
- [ ] `npm test` → `ALL GREEN` on all 5 harnesses (19 + 7 + 6 + 3 + 6 = 41)

### Intake (PREVIEW → Live)
- [ ] Click zone opens picker; choosing a file shows name + Replace
- [ ] Drag-over highlights the zone; drop loads the file
- [ ] A `.docx`/unknown → inline "can't read" error, no file loads
- [ ] Preset chip highlights + shows "method · bleed (auto)"; Custom reveals fields
- [ ] "Will it print?" disabled until file + size chosen
- [ ] Analyze shows the "Ready to analyze" summary; business card → 88.9 × 50.8 mm

### Live results (one per sample file)
- [ ] `good.jpg` → Ready (or Maybe on bleed); job ticket shows filename/size/method/qty
- [ ] `lowres.jpg` → Not yet; Resolution is a red Blocker with guidance, no fix button
- [ ] `rgb.png` → Almost; Color card offers "Convert to CMYK"
- [ ] `square.png` → Not yet; Size card explains wrong shape, no fix button
- [ ] Any flat raster → Bleed card = "Couldn't check" (never a false green)
- [ ] Cards expand/collapse; mono data lines show real numbers; tags match dot colors

### Fix / export (the download)
- [ ] On Ready/Almost, primary button downloads `…-print-ready.pdf`
- [ ] PDF opens at trim + bleed + mark margin; art fills to bleed
- [ ] Crop marks at the 4 trim corners; TrimBox = ordered size, BleedBox = trim+bleed
- [ ] Green status bar shows caveat notes when bleed/color fixes applied
- [ ] Ghost states (Maybe / Not yet) do **not** download
- [ ] Rotated source → image lands upright, fills trim *(eyeball this one)*

### Formats & routing
- [ ] PNG, JPG, TIFF all analyze (TIFF too — even CMYK)
- [ ] TIFF export → status says export isn't available for TIFF yet (checks still work)
- [ ] PDF upload → honest "PDF checking is almost ready" panel
- [ ] Corrupt/tiny image → "Couldn't read that file", no crash
- [ ] "← New file" resets cleanly

### Fixture preview (regression)
- [ ] PREVIEW → Yes / Almost / Maybe / Not yet render the 4 canned states
- [ ] Live → a state → Live resets to Intake

### Responsive / a11y / print
- [ ] ~360px wide: chips wrap, fields stack, verdict scales, no h-scroll
- [ ] Tab reaches every control; cyan focus rings visible; cards toggle on Enter/Space
- [ ] Reduce-motion set → still works, no animation
- [ ] Cmd/Ctrl-P → cards print expanded, backgrounds clean

## 4. Known-incomplete (expected, not bugs)
- **PDF** checking + PDF-source export — the pdf.js adapter and PDF render branch are scaffolded; need real sample PDFs to finish.
- **PDF annotated preview** — rides with the pdf.js work.
- **90/270 rotation** export — computed but wants one visual confirmation.
- **TIFF export** — checks work; pdf-lib can't embed TIFF for the print-ready PDF yet.

## 5. Ship (when ready)
```bash
git init && git add . && git commit -m "Will It Print? — engine, UI, raster fixes"
git branch -M main
git remote add origin https://github.com/<you>/will-it-print.git
git push -u origin main
```
Then repo **Settings → Pages → Source → GitHub Actions**. The workflow runs `npm test`, builds, and publishes to `https://<you>.github.io/will-it-print/`.
