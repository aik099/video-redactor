// Regions + selection; views re-render on its 'change' event (detail: {skipList} keeps a slider being dragged)
import { DEFAULT_LENGTH, DEFAULT_LEVELS, DEFAULT_MODE, MIN_LENGTH } from './config.js';
import { clamp } from './util.js';

export const isActive = (region, time) => time >= region.start && time <= region.end;

export class RegionStore extends EventTarget {
  regions = [];  // {id, x, y, w, h, start, end, mode, level}; x/y/w/h in video pixels
  nextId = 1;
  selectedId = null;

  find(id) {
    return this.regions.find(region => region.id === id);
  }

  get selected() {
    return this.find(this.selectedId);
  }

  // New region at `start` (selected); no change event, the caller sends it
  add(rect, start, duration) {
    const region = {
      id: this.nextId++, ...rect, start, end: Math.min(duration, start + DEFAULT_LENGTH),
      mode: DEFAULT_MODE, level: DEFAULT_LEVELS[DEFAULT_MODE],
    };
    this.regions.push(region);
    this.selectedId = region.id;

    return region;
  }

  remove(id) {
    this.regions = this.regions.filter(region => region.id !== id);

    if (this.selectedId === id) {
      this.selectedId = null;
    }

    this.changed();
  }

  select(id) {
    this.selectedId = id;
    this.changed();
  }

  // Loaded regions; older files lack `level`
  replace(regions) {
    this.regions = regions.map(region => ({ level: DEFAULT_LEVELS[region.mode] ?? DEFAULT_LEVELS[DEFAULT_MODE], ...region }));
    this.nextId = Math.max(0, ...this.regions.map(region => region.id)) + 1;
    this.selectedId = null;
  }

  setStart(region, time, duration) {
    region.start = clamp(time, 0, duration);

    if (region.end < region.start + MIN_LENGTH) {
      region.end = Math.min(duration, region.start + DEFAULT_LENGTH);
    }
  }

  setEnd(region, time, duration) {
    region.end = clamp(time, 0, duration);

    if (region.start > region.end - MIN_LENGTH) {
      region.start = Math.max(0, region.end - DEFAULT_LENGTH);
    }
  }

  setMode(region, mode) {
    region.mode = mode;
    region.level = DEFAULT_LEVELS[mode];
  }

  changed(detail = {}) {
    this.dispatchEvent(new CustomEvent('change', { detail }));
  }
}
