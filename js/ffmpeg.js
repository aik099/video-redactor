// ffmpeg command for the regions; videoSize = {width, height}
import { RECT_MARGIN, TIME_MARGIN } from './config.js';
import { SECURE_NOISE, strengthPixels, blockSize, smallSize } from './strength.js';
import { baseName, ceilEven, floorEven, shellQuote } from './util.js';

// Grows the rectangle by RECT_MARGIN and snaps it to even pixels (yuv420p crops odd sizes down)
export function encoderRect(region, videoSize) {
  const left = Math.max(0, floorEven(region.x - RECT_MARGIN));
  const top = Math.max(0, floorEven(region.y - RECT_MARGIN));
  const right = Math.min(floorEven(videoSize.width), ceilEven(region.x + region.w + RECT_MARGIN));
  const bottom = Math.min(floorEven(videoSize.height), ceilEven(region.y + region.h + RECT_MARGIN));

  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function regionFilter(region, index, inputLabel, outputLabel, videoSize) {
  const rect = encoderRect(region, videoSize);
  const from = Math.max(0, region.start - TIME_MARGIN).toFixed(3);
  const to = (region.end + TIME_MARGIN).toFixed(3);
  const enable = `enable='between(t,${from},${to})'`;

  if (region.mode === 'box') {
    return `[${inputLabel}]drawbox=x=${rect.x}:y=${rect.y}:w=${rect.w}:h=${rect.h}:color=black:t=fill:${enable}[${outputLabel}]`;
  }

  let effect;

  if (region.mode === 'blur') {
    effect = `gblur=sigma=${strengthPixels(region.level, videoSize.height)}`;
  } else {
    const block = blockSize(region.level, rect, videoSize.height);
    const small = smallSize(rect, block);
    const shrink = `scale=${small.w}:${small.h}:flags=area`;

    // Secure: blocks drop the text, luma noise hides block averages, smooth upscale + blur makes it soft.
    // Fixed noise pattern: per-frame noise could be averaged away over frames, and it shimmers
    effect = region.mode === 'pixelate'
      ? `${shrink},scale=${rect.w}:${rect.h}:flags=neighbor`
      : `${shrink},noise=c0s=${SECURE_NOISE},scale=${rect.w}:${rect.h}:flags=bicubic,gblur=sigma=${block / 2}`;
  }

  // format: no alpha plane, or overlay could let the original show through
  return `[${inputLabel}]split[base${index}][source${index}];`
    + `[source${index}]crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},${effect},format=yuv420p[effect${index}];`
    + `[base${index}][effect${index}]overlay=${rect.x}:${rect.y}:${enable}[${outputLabel}]`;
}

// Regions applied one after another, each filter's output feeding the next
export function buildCommand(fileName, regions, videoSize) {
  let inputLabel = '0:v';
  const filters = regions.map((region, index) => {
    const outputLabel = index === regions.length - 1 ? 'out' : `v${index}`;
    const filter = regionFilter(region, index, inputLabel, outputLabel, videoSize);
    inputLabel = outputLabel;

    return filter;
  });

  return [
    'ffmpeg -hide_banner -i ' + shellQuote(fileName),
    `-filter_complex "${filters.join(';')}"`,
    // crf 12 + slow: text stays crisp (~+6 dB over crf 18 on a screencast), still well below the source's size;
    // passthrough keeps the source's own frames (screen recorders skip frames while nothing changes)
    "-map '[out]' -map '0:a?' -c:v libx264 -crf 12 -preset slow -pix_fmt yuv420p -fps_mode passthrough -c:a copy",
    '-map_metadata -1 -movflags +faststart',
    shellQuote(baseName(fileName) + '-redacted.mp4'),
  ].join(' \\\n  ');
}
