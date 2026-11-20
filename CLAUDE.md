# Video Redactor

Browser editor for hiding screen areas in screencasts: draw regions on a video, give each a time range, get an
ffmpeg command (black out / pixelate / secure blur / smooth blur). The video never leaves the browser.

## Running

- Native ES modules, no build step: serve the folder over http(s) (any static server, e.g.
  `python3 -m http.server`). Doesn't work from `file://` (browsers block module imports there).
- Published with GitHub Pages from `main` (`.nojekyll`: files served as-is). Pages caches files ~10 min, so
  right after a push a page may briefly mix old and new modules.
- Machine-specific setup, if present: `CLAUDE.local.md` (git-ignored, never published).

## Tests

- `npm test`: Node tests of the pure modules (snapping, ffmpeg command incl. a real ffmpeg run, region-file
  validation). Needs `ffmpeg`/`ffprobe`.
- Browser smoke test, on a fresh page load (console or Claude in Chrome):
  `const { run } = await import('./tests/smoke.js?' + Date.now()); await run()` → `{passed, failed, results}`.
  Drives the page only through DOM events and reads labels/command, so it survives refactors.
- Fixture `tests/fixtures/ui.mp4`: synthetic (1280×720, 60 fps, 20 s, audio; pale separator x=596, field
  612..911 × 300..329 with corner gaps). Never commit real recordings.

## Modules (`js/`)

- `config.js`: all tunables (palette, modes, default levels, snap/zoom limits).
- Pure (no DOM, Node-tested): `snapping.js`, `ffmpeg.js` (incl. `encoderRect`), `strength.js`, `util.js`.
- `regions.js`: `RegionStore` (regions + selection); `change` event re-renders the views (`skipList` keeps a
  dragged slider alive).
- `player.js` (`Player`: seek/play, `time` event), `frame-clock.js` (`FrameClock`: fps measured during playback).
- `overlay.js` (`Overlay`: draw/move/resize, snapping, previews), `timeline.js` (`Timeline`: bars, playhead,
  ruler, zoom).
- `list.js`, `files.js` (save/load + validation), `dom.js`, `main.js` (wiring, keys, drag and drop).

## Decisions (don't undo without asking)

- Snapping takes the nearest qualifying line (not the strongest), frame edges count as lines, only the dragged
  edges snap, ⌥ disables it (also mid-drag).
- Preview and ffmpeg share `encoderRect` (region + 4 px margin, even pixels) and the block grid. The preview
  averages blocks itself (`averageBlocks`, like ffmpeg's `flags=area`): the browser's own downscaling samples,
  which left 23% of blocks visibly off. Smooth blur preview blurs the region's own pixels with border pixels
  repeated outwards (gblur keeps edges; a backdrop-filter pulled in content from outside the region). Above
  `MAX_AVERAGED_PIXELS` both fall back to the browser's faster, less exact way.
- Default levels (`DEFAULT_LEVELS`) were picked by rendering text: lower levels leave it guessable.
- Strength levels scale with the video's height (`strengthPixels`), not the region's.
- Secure blur: shrink → luma-only noise → upscale → gblur; every effect ends with `format=yuv420p` (an alpha
  plane let the original show through). Noise is fixed (no `allf=t`: per-frame noise can be averaged away over
  frames, and shimmers) and light (`SECURE_NOISE` 10); the preview adds seeded noise of the same spread.
- Encoding: `-crf 12 -preset slow -fps_mode passthrough` (screencast text quality, source frames kept).
- A selected region outside its time range is a read-only ghost; clicking it jumps to its start. Selection
  isn't dropped then: Set start/end and edge double-click work from outside the range.
- Region files are validated on load (ids and modes are put into HTML).
- fps is measured only during playback (frames shown after seeks gave wrong frame durations).
