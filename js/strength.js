// Effect strength, shared by the browser preview and the ffmpeg command

// Level 1..10 → video px; relative to the video's height, so text (whose size follows the recording's
// scale, 1x or Retina) gets the same treatment, and big regions don't get giant blocks
export function strengthPixels(level, videoHeight) {
  return Math.max(2, Math.round(level * videoHeight / 240));
}

// Block size for pixelate / secure blur
export function blockSize(level, rect, videoHeight) {
  return Math.min(strengthPixels(level, videoHeight), rect.w, rect.h);
}

export function smallSize(rect, block) {
  return { w: Math.max(1, Math.round(rect.w / block)), h: Math.max(1, Math.round(rect.h / block)) };
}
