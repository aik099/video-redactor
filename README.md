# Video Redactor

Hide sensitive parts of a screen recording before you share it: draw boxes over the areas, choose when each one
applies, and get a ready-to-run ffmpeg command that produces the redacted video.

**Open it: https://aik099.github.io/video-redactor/**

The video never leaves your computer. The page only plays it in your browser and builds the command; ffmpeg runs on
your machine.

## Features

- Four effects per region, each with a strength slider: black out, pixelate, secure blur (unrecoverable, looks like
  blur), smooth blur.
- Edges snap to straight lines in the frame (input fields, panel separators) and to the video's edges; hold ⌥ to
  place them freely.
- Timeline with a bar per region: drag to move or resize its time range, ends snap to the playhead, zoom in down to
  single frames.
- Frame-by-frame stepping and slow playback (down to 0.1×) to catch the exact moment something appears.
- Live preview of each effect, on the same area and block grid the ffmpeg command uses.
- Region sets can be saved and loaded as JSON.

## Usage

1. Open the page and open a video (or drop it on the page).
2. Draw a box over each area to hide. A new box starts at the playhead and lasts 5 s; adjust its time range on the
   timeline.
3. Pick the effect and strength in the region list on the right.
4. Copy the ffmpeg command at the bottom and run it in the video's folder. It writes `<name>-redacted.mp4` next to
   the original.

Needs [ffmpeg](https://ffmpeg.org/) (macOS: `brew install ffmpeg`). Tested in Brave (Chromium) on macOS.

## Development

No build step: plain ES modules. Serve the folder over http, since browsers don't load modules from `file://`:

```sh
python3 -m http.server
```

Tests:

- `npm test`: Node 20+ tests for snapping, the ffmpeg command (including a real ffmpeg run) and region-file
  validation.
- Browser smoke test: open the page, then in the console run
  `await (await import('./tests/smoke.js?' + Date.now())).run()`.

## License

[MIT](LICENSE)