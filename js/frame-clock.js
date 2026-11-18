// Frame duration of the video (measured during playback) and frame-exact stepping
import { ASSUMED_FRAME_DURATION } from './config.js';

export class FrameClock {
  frameDuration = ASSUMED_FRAME_DURATION;
  measuredFrameDuration = null;  // smallest gap between consecutive shown frames
  #lastFrameInfo = null;         // previous requestVideoFrameCallback metadata

  constructor(video) {
    this.video = video;

    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(this.#measure);
    }
  }

  reset() {
    this.frameDuration = ASSUMED_FRAME_DURATION;
    this.measuredFrameDuration = null;
    this.#lastFrameInfo = null;
  }

  frameIndex(time) {
    return Math.floor(time / this.frameDuration + 0.001);
  }

  // Middle of the neighbour frame: landing exactly on a frame boundary could show the same frame again
  neighbourTime(time, direction) {
    return (this.frameIndex(time) + direction + 0.5) * this.frameDuration;
  }

  get rateLabel() {
    return this.measuredFrameDuration ? Math.round(1 / this.measuredFrameDuration) + ' fps' : '60 fps?';
  }

  // Called for every frame the browser shows; two consecutive frames during playback give the frame duration
  // (frames shown after seeks are ignored). Smallest gap wins: screen recordings may skip frames while nothing changes
  #measure = (now, frameInfo) => {
    const playing = !this.video.paused && !this.video.seeking;
    const last = this.#lastFrameInfo;

    if (playing && last && frameInfo.presentedFrames - last.presentedFrames === 1) {
      const gap = frameInfo.mediaTime - last.mediaTime;

      if (gap > 0.001 && gap < 0.1 && (this.measuredFrameDuration === null || gap < this.measuredFrameDuration)) {
        this.measuredFrameDuration = this.frameDuration = gap;
      }
    }

    this.#lastFrameInfo = playing ? frameInfo : null;
    this.video.requestVideoFrameCallback(this.#measure);
  };
}
