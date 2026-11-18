// Playback and seeking; fires 'time' whenever the shown time changes (seek, playback frame, pause)
import { clamp } from './util.js';

export class Player extends EventTarget {
  #playRangeEnd = null;

  constructor(video, clock) {
    super();
    this.video = video;
    this.clock = clock;
    video.addEventListener('play', () => requestAnimationFrame(this.#tick));
    video.addEventListener('pause', () => {
      this.#playRangeEnd = null;
      this.#notify();
    });
    video.addEventListener('seeked', () => this.#notify());
  }

  get duration() {
    return this.video.duration || 0;
  }

  get time() {
    return this.video.currentTime;
  }

  seek(time) {
    this.video.currentTime = clamp(time, 0, this.duration);
    this.#notify();
  }

  stepFrame(direction) {
    this.video.pause();
    this.seek(this.clock.neighbourTime(this.video.currentTime, direction));
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
  }

  playRange(start, end) {
    this.seek(start);
    this.video.play().then(() => {
      this.#playRangeEnd = end;
    });
  }

  #tick = () => {
    if (this.#playRangeEnd !== null && this.video.currentTime >= this.#playRangeEnd) {
      this.video.pause();
    }

    this.#notify();

    if (!this.video.paused) {
      requestAnimationFrame(this.#tick);
    }
  };

  #notify() {
    this.dispatchEvent(new Event('time'));
  }
}
