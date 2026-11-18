import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { snapRect } from '../js/snapping.js';

const ALL_EDGES = ['left', 'top', 'right', 'bottom'];

// White 400x300 frame with a 1px dark field border at x=100..300, y=80..200 and a short dark "text" bar inside
function syntheticFrame() {
  const width = 400;
  const height = 300;
  const luma = new Uint8Array(width * height).fill(255);
  const paint = (x, y) => {
    luma[y * width + x] = 30;
  };

  for (let x = 100; x <= 300; x++) {
    paint(x, 80);
    paint(x, 200);
  }

  for (let y = 80; y <= 200; y++) {
    paint(100, y);
    paint(300, y);
  }

  for (let y = 120; y < 130; y++) {
    for (let x = 110; x < 116; x++) {
      paint(x, y);
    }
  }

  return { luma, width, height };
}

test('rough box snaps onto a nearby border', () => {
  assert.deepEqual(snapRect(syntheticFrame(), { x: 94, y: 86, w: 212, h: 108 }, ALL_EDGES, 10),
    { rect: { x: 100, y: 81, w: 201, h: 119 }, snapped: ALL_EDGES });
});

test('box far from any line stays put', () => {
  const rect = { x: 60, y: 40, w: 300, h: 220 };
  assert.deepEqual(snapRect(syntheticFrame(), rect, ALL_EDGES, 10), { rect, snapped: [] });
});

test('short text edges do not attract an edge', () => {
  const rect = { x: 104, y: 100, w: 14, h: 60 };
  assert.deepEqual(snapRect(syntheticFrame(), rect, ['right'], 10), { rect, snapped: [] });
});

test('only the given edges snap', () => {
  assert.deepEqual(snapRect(syntheticFrame(), { x: 94, y: 86, w: 212, h: 108 }, ['right', 'bottom'], 10),
    { rect: { x: 94, y: 86, w: 207, h: 114 }, snapped: ['right', 'bottom'] });
});

// Dark line at y=294, 6px above the 300px frame's bottom edge
test('frame edge wins over a line just inside it', () => {
  const frame = syntheticFrame();

  for (let x = 0; x < frame.width; x++) {
    frame.luma[294 * frame.width + x] = 30;
  }

  assert.deepEqual(snapRect(frame, { x: 20, y: 250, w: 40, h: 48 }, ['bottom'], 10), { rect: { x: 20, y: 250, w: 40, h: 50 }, snapped: ['bottom'] });
  assert.deepEqual(snapRect(frame, { x: 20, y: 250, w: 40, h: 50 }, ['bottom'], 10), { rect: { x: 20, y: 250, w: 40, h: 50 }, snapped: ['bottom'] });
  assert.deepEqual(snapRect(frame, { x: 3, y: 250, w: 40, h: 20 }, ['left'], 10), { rect: { x: 0, y: 250, w: 43, h: 20 }, snapped: ['left'] });
});

// Fixture frame: pale separator at x=596 (full height), field 612..911 x 300..329 with gapped side borders
test('nearest line wins over a stronger separator (fixture frame)', () => {
  const fixture = new URL('./fixtures/ui.mp4', import.meta.url).pathname;
  const gray = execFileSync('ffmpeg', ['-v', 'error', '-i', fixture, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const frame = { luma: new Uint8Array(gray), width: 1280, height: 720 };

  assert.deepEqual(snapRect(frame, { x: 606, y: 295, w: 312, h: 41 }, ALL_EDGES, 12).rect, { x: 612, y: 300, w: 300, h: 30 });
});
