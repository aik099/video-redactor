import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { addNoise, averageBlocks } from '../js/strength.js';

const fixture = new URL('./fixtures/ui.mp4', import.meta.url).pathname;
const frame = (filter, size) => execFileSync('ffmpeg', ['-v', 'error', '-i', fixture, '-frames:v', '1', '-vf', filter,
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']).subarray(0, size * 4);

// Field area of the fixture (with its separator and borders), as the preview averages it vs ffmpeg's flags=area
test('block averaging matches ffmpeg area scaling', () => {
  const crop = 'crop=330:60:590:286';
  const pixels = frame(crop, 330 * 60);
  const reference = frame(`${crop},scale=55:10:flags=area`, 55 * 10);
  const blocks = averageBlocks(pixels, 330, 60, 55, 10);
  let worst = 0;

  for (let index = 0; index < blocks.length; index += 4) {
    worst = Math.max(worst, Math.abs(blocks[index] - reference[index]), Math.abs(blocks[index + 1] - reference[index + 1]));
  }

  assert.ok(worst <= 3, `worst channel difference ${worst}`);
});

test('preview noise: fixed per seed, spread like ffmpeg noise=c0s=10', () => {
  const gray = () => new Uint8ClampedArray(64 * 64 * 4).fill(128);
  const first = addNoise(gray(), 1);
  const offsets = [];

  for (let index = 0; index < first.length; index += 4) {
    offsets.push(first[index] - 128);
  }

  const deviation = Math.sqrt(offsets.reduce((sum, value) => sum + value * value, 0) / offsets.length);

  assert.deepEqual(addNoise(gray(), 1), first);
  assert.notDeepEqual(addNoise(gray(), 2), first);
  assert.ok(Math.abs(deviation - 6.2) < 0.6, `standard deviation ${deviation.toFixed(2)}`);
});
