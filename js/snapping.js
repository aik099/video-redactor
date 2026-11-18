// Edge snapping: moves region edges onto nearby straight contrast lines (field borders, separators) of a frame
import { MIN_RECT, SNAP_CONTRAST, SNAP_COVERAGE } from './config.js';

// RGBA pixels → {luma, width, height}, one brightness byte per pixel
export function frameLuma(rgba, width, height) {
  const luma = new Uint8Array(width * height);

  for (let index = 0; index < luma.length; index++) {
    luma[index] = (rgba[index * 4] * 77 + rgba[index * 4 + 1] * 150 + rgba[index * 4 + 2] * 29) >> 8;
  }

  return { luma, width, height };
}

// Position of the nearest straight contrast line (stronger one on a tie) within `radius` of `position`,
// running along from..to, or null if none; nearest, not strongest: a long panel separator nearby would win over
// a field's border. A vertical line at x lies between pixel columns x-1 and x
export function snapLine(frame, vertical, position, from, to, radius) {
  const { luma, width, height } = frame;
  const last = (vertical ? width : height) - 1;
  // Middle 80% only: rounded corners don't count against a line
  const inset = Math.floor((to - from) * 0.1);
  from += inset;
  to -= inset;
  const length = Math.max(1, to - from);
  let best = null;
  let bestScore = 0;
  let bestDistance = Infinity;

  for (let candidate = Math.max(1, position - radius); candidate <= Math.min(last, position + radius); candidate++) {
    let hits = 0;

    for (let along = from; along < to; along++) {
      const index = vertical ? along * width + candidate : candidate * width + along;
      const neighbour = vertical ? index - 1 : index - width;

      if (Math.abs(luma[index] - luma[neighbour]) >= SNAP_CONTRAST) {
        hits++;
      }
    }

    const score = hits / length;
    const distance = Math.abs(candidate - position);

    if (score >= SNAP_COVERAGE && (distance < bestDistance || (distance === bestDistance && score > bestScore))) {
      best = candidate;
      bestScore = score;
      bestDistance = distance;
    }
  }

  // Frame edges count as lines (nearest wins): a region reaches the edge even with a line just inside it
  for (const edge of [0, vertical ? width : height]) {
    const distance = Math.abs(edge - position);

    if (distance <= radius && distance <= bestDistance) {
      best = edge;
      bestDistance = distance;
    }
  }

  return best;
}

// Snaps the given edges ('left', 'top', 'right', 'bottom') of rect to nearby lines → {rect, snapped: edges on a line}
export function snapRect(frame, rect, edges, radius) {
  const original = { left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h };
  const result = { ...original };
  let snapped = [];

  // 2nd pass measures each edge along the others' snapped span: a sloppy span hides short lines (rounded fields)
  for (let pass = 0; pass < 2; pass++) {
    const span = { ...result };
    snapped = [];

    for (const edge of edges) {
      const line = edge === 'left' || edge === 'right'
        ? snapLine(frame, true, original[edge], span.top, span.bottom, radius)
        : snapLine(frame, false, original[edge], span.left, span.right, radius);
      result[edge] = line ?? original[edge];

      if (line !== null) {
        snapped.push(edge);
      }
    }
  }

  if (result.right - result.left < MIN_RECT || result.bottom - result.top < MIN_RECT) {
    return { rect, snapped: [] };
  }

  return { rect: { x: result.left, y: result.top, w: result.right - result.left, h: result.bottom - result.top }, snapped };
}
