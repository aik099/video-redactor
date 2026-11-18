import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildCommand, encoderRect } from '../js/ffmpeg.js';

const FIXTURE_SIZE = { width: 1280, height: 720 };

const region = (id, mode, level, x, y, w, h, start, end) => ({ id, mode, level, x, y, w, h, start, end });
const REGIONS = [
  region(1, 'box', 2, 100, 100, 400, 200, 1, 6),
  region(2, 'pixelate', 2, 701, 301, 301, 151, 4, 10),
  region(3, 'secure', 3, 900, 50, 9, 9, 5, 12),
  region(4, 'blur', 6, 200, 500, 333, 111, 8, 15),
];

test('encoder rect grows by the margin and lands on even pixels', () => {
  assert.deepEqual(encoderRect({ x: 41, y: 13, w: 31, h: 21 }, FIXTURE_SIZE), { x: 36, y: 8, w: 40, h: 30 });
  assert.deepEqual(encoderRect({ x: 1275, y: 0, w: 5, h: 10 }, FIXTURE_SIZE), { x: 1270, y: 0, w: 10, h: 14 });
});

test('command: per-mode filters, time margins, audio kept, names quoted', () => {
  const command = buildCommand("CleanShot 12.00 it's.mp4", REGIONS, FIXTURE_SIZE);

  assert.match(command, /^ffmpeg -hide_banner -i 'CleanShot 12\.00 it'\\''s\.mp4'/);
  assert.match(command, /drawbox=x=96:y=96:w=408:h=208:color=black:t=fill:enable='between\(t,0\.900,6\.100\)'\[v0\]/);
  // 720p: one level = 3px; pixelate Lv2 → 6px blocks
  assert.match(command, /crop=310:160:696:296,scale=52:27:flags=area,scale=310:160:flags=neighbor,format=yuv420p/);
  // Secure Lv3 → 9px blocks on a tiny 18px rect → 2x2 blocks, blur sigma 4.5
  assert.match(command, /crop=18:18:896:46,scale=2:2:flags=area,noise=c0s=10,scale=18:18:flags=bicubic,gblur=sigma=4.5,format=yuv420p/);
  assert.match(command, /gblur=sigma=18,format=yuv420p\[effect3\];\[base3\]\[effect3\]overlay=196:496:enable='between\(t,7\.900,15\.100\)'\[out\]/);
  assert.match(command, /-map '\[out\]' -map '0:a\?' -c:v libx264 -crf 12 -preset slow -pix_fmt yuv420p -fps_mode passthrough/);
  assert.match(command, /'CleanShot 12\.00 it'\\''s-redacted\.mp4'$/);
});

test('generated command runs in ffmpeg and keeps video + audio', () => {
  const folder = mkdtempSync(join(tmpdir(), 'redact-test-'));

  try {
    copyFileSync(new URL('./fixtures/ui.mp4', import.meta.url), join(folder, "ui fixture it's.mp4"));
    const command = buildCommand("ui fixture it's.mp4", REGIONS, FIXTURE_SIZE).replace(/^ffmpeg /, 'ffmpeg -y -v error -t 3 ');
    execSync(command, { cwd: folder, shell: '/bin/bash' });
    const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', join(folder, "ui fixture it's-redacted.mp4")]);

    assert.deepEqual(streams.toString().trim().split('\n'), ['video', 'audio']);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
