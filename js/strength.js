// Effect strength and block maths, shared by the browser preview and the ffmpeg command

// ffmpeg `noise` strength for secure blur (fixed pattern); measured spread: standard deviation ≈ 0.62 × strength
export const SECURE_NOISE = 10;

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

// RGBA (width×height) → RGBA (smallWidth×smallHeight), each pixel the average of its block, like ffmpeg's
// scale=…:flags=area (whole-pixel block edges; ffmpeg weighs partial edge pixels, a negligible difference)
export function averageBlocks(rgba, width, height, smallWidth, smallHeight) {
  const result = new Uint8ClampedArray(smallWidth * smallHeight * 4);

  for (let blockY = 0; blockY < smallHeight; blockY++) {
    const top = Math.floor(blockY * height / smallHeight);
    const bottom = Math.max(top + 1, Math.floor((blockY + 1) * height / smallHeight));

    for (let blockX = 0; blockX < smallWidth; blockX++) {
      const left = Math.floor(blockX * width / smallWidth);
      const right = Math.max(left + 1, Math.floor((blockX + 1) * width / smallWidth));
      const sums = [0, 0, 0];

      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const index = (y * width + x) * 4;
          sums[0] += rgba[index];
          sums[1] += rgba[index + 1];
          sums[2] += rgba[index + 2];
        }
      }

      const count = (bottom - top) * (right - left);
      const target = (blockY * smallWidth + blockX) * 4;
      result.set([sums[0] / count, sums[1] / count, sums[2] / count, 255], target);
    }
  }

  return result;
}

// Preview imitation of ffmpeg's fixed noise: same spread, brightness only, same pattern on every redraw (seeded)
export function addNoise(rgba, seed, strength = SECURE_NOISE) {
  const deviation = 0.62 * strength;
  let state = seed * 2654435761 >>> 0;
  // mulberry32
  const random = () => {
    state = state + 0x6d2b79f5 >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);

    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };

  for (let index = 0; index < rgba.length; index += 4) {
    // Sum of 3 uniforms: bell-shaped, standard deviation 1
    const offset = (random() + random() + random() - 1.5) * 2 * deviation;
    rgba[index] += offset;
    rgba[index + 1] += offset;
    rgba[index + 2] += offset;
  }

  return rgba;
}
