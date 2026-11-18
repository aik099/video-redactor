import { PALETTE } from './config.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const floorEven = value => Math.floor(value / 2) * 2;
export const ceilEven = value => Math.ceil(value / 2) * 2;
export const baseName = fileName => fileName.replace(/\.[^.]+$/, '');
export const shellQuote = text => "'" + text.replaceAll("'", "'\\''") + "'";
export const colorOf = region => PALETTE[(region.id - 1) % PALETTE.length];

export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);

  return minutes + ':' + (seconds - minutes * 60).toFixed(3).padStart(6, '0');
}

// Accepts "ss.mmm", "m:ss.mmm" or "h:mm:ss.mmm"
export function parseTime(text) {
  const seconds = text.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0);

  return Number.isFinite(seconds) ? seconds : null;
}
