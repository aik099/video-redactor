import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildCommand, encoderRect } from '../js/ffmpeg.js';

const SIZE = { width: 1280, height: 720 };
const region = (id, x, y, w, h) => ({ id, x, y, w, h, start: 0, end: 20, mode: 'box', level: 2 });
// Plain, odd coordinates, touching the video's edges
const REGIONS = [region(1, 100, 100, 200, 60), region(2, 701, 401, 151, 77), region(3, 1180, 0, 100, 40), region(4, 0, 650, 90, 70)];

// Black-out output must cover exactly encoderRect, the rectangle the preview is drawn on
test('ffmpeg blacks out exactly the preview rectangle', () => {
  const folder = mkdtempSync(join(tmpdir(), 'redact-area-'));

  try {
    copyFileSync(new URL('./fixtures/ui.mp4', import.meta.url), join(folder, 'ui.mp4'));
    execSync(buildCommand('ui.mp4', REGIONS, SIZE).replace(/^ffmpeg /, 'ffmpeg -y -v error -t 2 '), { cwd: folder, shell: '/bin/bash' });
    const frame = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', join(folder, 'ui-redacted.mp4'), '-frames:v', '1',
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const black = (x, y) => frame[y * SIZE.width + x] < 30;

    for (const item of REGIONS) {
      const rect = encoderRect(item, SIZE);
      const midX = rect.x + (rect.w >> 1);
      const midY = rect.y + (rect.h >> 1);
      let left = midX;
      let right = midX;
      let top = midY;
      let bottom = midY;

      while (left > 0 && black(left - 1, midY)) {
        left--;
      }

      while (right < SIZE.width - 1 && black(right + 1, midY)) {
        right++;
      }

      while (top > 0 && black(midX, top - 1)) {
        top--;
      }

      while (bottom < SIZE.height - 1 && black(midX, bottom + 1)) {
        bottom++;
      }

      assert.deepEqual({ x: left, y: top, w: right - left + 1, h: bottom - top + 1 }, rect, `region #${item.id}`);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
