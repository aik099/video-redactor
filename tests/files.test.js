import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRegions } from '../js/files.js';
import { RegionStore } from '../js/regions.js';

const SIZE = { width: 1280, height: 720 };
const valid = { id: 1, x: 10, y: 20, w: 100, h: 30, start: 1, end: 6, mode: 'pixelate', level: 2 };

async function load(regions) {
  const store = new RegionStore();
  store.regions = [{ ...valid, id: 9 }];
  const message = await loadRegions(new File([JSON.stringify({ width: 1280, height: 720, regions })], 'r.json'), store, SIZE);

  return { message, store };
}

test('valid file loads; older files without level get the mode default; unknown fields are dropped', async () => {
  const { message, store } = await load([{ ...valid, extra: '<b>x</b>' }, { ...valid, id: 2, mode: 'secure', level: undefined }]);

  assert.equal(message, 'Loaded 2 regions.');
  assert.deepEqual(store.regions[0], valid);
  assert.equal(store.regions[1].level, 3);
  assert.equal(store.nextId, 3);
});

for (const [name, region, expected] of [
  ['html in id', { ...valid, id: '<img src=x onerror=alert(1)>' }, 'region 1: id must be a positive whole number'],
  ['html in mode', { ...valid, mode: '<script>alert(1)</script>' }, 'region 1: unknown mode "<script>alert(1)</script>"'],
  ['inherited property as mode', { ...valid, mode: '__proto__' }, 'region 1: unknown mode "__proto__"'],
  ['list as mode', { ...valid, mode: ['box'] }, 'region 1: unknown mode "box"'],
  ['text as position', { ...valid, x: '10' }, 'region 1: x must be a number'],
  ['level out of range', { ...valid, level: 11 }, 'region 1: level must be 1–10'],
]) {
  test(`rejected, current regions kept: ${name}`, async () => {
    const { message, store } = await load([region]);

    assert.equal(message, "Can't read regions: " + expected);
    assert.equal(store.regions[0].id, 9);
  });
}

test('rejected: duplicate ids, missing list', async () => {
  assert.equal((await load([valid, valid])).message, "Can't read regions: duplicate region ids");
  assert.equal((await load(undefined)).message, "Can't read regions: no regions list");
});
