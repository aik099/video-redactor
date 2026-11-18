// Region files (.regions.json); videoSize = {width, height}
import { MODES } from './config.js';
import { baseName } from './util.js';

const NUMBER_FIELDS = ['x', 'y', 'w', 'h', 'start', 'end'];

// Known fields with valid values only: ids and modes end up in the page's HTML, so a crafted file could inject script
function checkedRegion(region, index) {
  const problem = message => new Error(`region ${index + 1}: ${message}`);

  if (!Number.isInteger(region?.id) || region.id < 1) {
    throw problem('id must be a positive whole number');
  }

  // String first: a key lookup turns ['box'] into 'box', but the ffmpeg command compares the exact value
  if (typeof region.mode !== 'string' || !Object.hasOwn(MODES, region.mode)) {
    throw problem(`unknown mode "${String(region.mode)}"`);
  }

  for (const field of NUMBER_FIELDS) {
    if (!Number.isFinite(region[field])) {
      throw problem(`${field} must be a number`);
    }
  }

  // Older files have no level
  if (region.level !== undefined && !(Number.isInteger(region.level) && region.level >= 1 && region.level <= 10)) {
    throw problem('level must be 1–10');
  }

  const { id, x, y, w, h, start, end, mode, level } = region;

  return { id, x, y, w, h, start, end, mode, ...(level === undefined ? {} : { level }) };
}

export function saveRegions(store, fileName, videoSize) {
  const data = { video: fileName, width: videoSize.width, height: videoSize.height, regions: store.regions };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  link.download = baseName(fileName ?? 'video') + '.regions.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Loads into the store (all regions valid, or nothing changes); returns the status message
export async function loadRegions(file, store, videoSize) {
  try {
    const data = JSON.parse(await file.text());

    if (!Array.isArray(data?.regions)) {
      throw new Error('no regions list');
    }

    const regions = data.regions.map(checkedRegion);

    if (new Set(regions.map(region => region.id)).size !== regions.length) {
      throw new Error('duplicate region ids');
    }

    store.replace(regions);
    const sizeDiffers = videoSize.width && (data.width !== videoSize.width || data.height !== videoSize.height);

    return sizeDiffers ? `Regions were made for a ${data.width}×${data.height} video.` : `Loaded ${store.regions.length} regions.`;
  } catch (error) {
    return "Can't read regions: " + error.message;
  }
}
