// Timeline: ruler, region bars (move/resize ranges, playhead magnet, edge double-click), playhead, zoom
import { DOUBLE_CLICK, MAX_ZOOM, MIN_LENGTH, MODES, PLAYHEAD_SNAP, RULER_SPACING } from './config.js';
import { $ } from './dom.js';
import { clamp, colorOf, formatTime } from './util.js';

export class Timeline {
  zoom = 1;                // track width as a multiple of the visible width
  #drag = null;            // {kind: 'scrub', offset} or {kind: 'start'|'end'|'shift', region, origin, original, snapped}
  #lastEdgeClick = null;   // {key, time} for double-click detection on bar edges

  constructor(element, store, player, clock) {
    this.element = element;
    this.store = store;
    this.player = player;
    this.clock = clock;
    this.track = $('#track');
    this.ruler = $('#ruler');
    this.lanes = $('#lanes');
    this.playhead = $('#playhead');
    element.addEventListener('pointerdown', event => this.#onPointerDown(event));
    element.addEventListener('pointermove', event => this.#onPointerMove(event));
    element.addEventListener('pointerup', () => this.#onPointerUp());
    element.addEventListener('wheel', event => this.#onWheel(event), { passive: false });
  }

  #percentOf(time) {
    const duration = this.player.duration;

    return (duration ? time / duration * 100 : 0) + '%';
  }

  timeAt(event) {
    const box = this.track.getBoundingClientRect();

    return clamp((event.clientX - box.left) / box.width, 0, 1) * this.player.duration;
  }

  render() {
    this.lanes.replaceChildren();

    for (const region of this.store.regions) {
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.innerHTML = `<div class="bar${region.id === this.store.selectedId ? ' selected' : ''}" data-id="${region.id}">`
        + `<div class="edge edge-start"></div>#${region.id} (${MODES[region.mode]}`
        + `${region.mode === 'box' ? '' : `, Lv${region.level}`})<div class="edge edge-end"></div></div>`;
      const bar = lane.firstElementChild;
      bar.style.left = this.#percentOf(region.start);
      bar.style.width = this.#percentOf(region.end - region.start);
      bar.style.background = colorOf(region);
      this.lanes.append(lane);
    }

    this.renderPlayhead();
  }

  renderRuler() {
    this.ruler.replaceChildren();
    const duration = this.player.duration;

    if (!duration) {
      return;
    }

    const pixelsPerSecond = this.track.clientWidth / duration;
    const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
      .find(seconds => seconds * pixelsPerSecond >= RULER_SPACING) ?? 600;

    // Index, not `time += step`: float steps like 0.1 would drift
    for (let index = 0; index * step <= duration; index++) {
      const time = index * step;
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.left = this.#percentOf(time);
      tick.textContent = step < 1 ? formatTime(time).replace(/(\.\d)\d+$/, '$1') : formatTime(time).replace(/\.\d+$/, '');
      this.ruler.append(tick);
    }
  }

  renderPlayhead() {
    const { player, playhead, track, element } = this;
    const stuck = Boolean(this.#drag?.snapped);
    playhead.style.left = this.#percentOf(player.time);
    playhead.classList.toggle('snapped', stuck);
    playhead.style.background = stuck ? colorOf(this.#drag.region) : '';

    // Zoomed in: keep the playhead in view while stepping/playing (not while dragging on the timeline)
    if (this.zoom > 1 && !this.#drag && player.duration) {
      const x = track.offsetLeft + player.time / player.duration * track.clientWidth;

      if (x < element.scrollLeft + 20 || x > element.scrollLeft + element.clientWidth - 20) {
        element.scrollLeft = x - element.clientWidth / 2;
      }
    }

    const frame = this.clock.frameIndex(player.time);
    $('#timeLabel').textContent = `${formatTime(player.time)} / ${formatTime(player.duration)} · frame ${frame} (${this.clock.rateLabel})`;
  }

  // Zooms keeping the time under `anchorClientX` (default: the playhead) in place
  setZoom(newZoom, anchorClientX = null) {
    const { track, element, player } = this;
    const duration = player.duration || 1;
    const viewport = element.getBoundingClientRect();
    const anchor = anchorClientX ?? track.getBoundingClientRect().left + player.time / duration * track.clientWidth;
    const anchorTime = this.timeAt({ clientX: anchor });

    this.zoom = clamp(newZoom, 1, MAX_ZOOM);
    track.style.width = this.zoom * 100 + '%';
    $('#zoomLabel').textContent = `Zoom ${Number(this.zoom.toFixed(1))}×`;
    element.scrollLeft = track.offsetLeft + anchorTime / duration * track.clientWidth - (anchor - viewport.left);
    this.renderRuler();
  }

  // Playhead time if `time` is within PLAYHEAD_SNAP screen px of it, else null
  #playheadSnap(time, event) {
    const distance = PLAYHEAD_SNAP * this.player.duration / this.track.clientWidth;

    return !event.altKey && Math.abs(time - this.player.time) <= distance ? this.player.time : null;
  }

  #onPointerDown(event) {
    const { store, player } = this;

    if (!player.duration) {
      return;
    }

    this.element.setPointerCapture(event.pointerId);
    const bar = event.target.closest('.bar');

    if (!bar) {
      // Grabbing the playhead keeps its time; clicking elsewhere jumps there
      const offset = event.target.closest('#playhead') ? player.time - this.timeAt(event) : 0;
      this.#drag = { kind: 'scrub', offset };
      player.seek(this.timeAt(event) + offset);

      return;
    }

    const region = store.find(Number(bar.dataset.id));
    const classes = event.target.classList;
    const kind = classes.contains('edge-start') ? 'start' : classes.contains('edge-end') ? 'end' : 'shift';
    this.#drag = { kind, region, origin: this.timeAt(event), original: { start: region.start, end: region.end } };
    store.select(region.id);

    // Own double-click detection: select() re-renders the bar, so the browser's dblclick may not fire
    const edgeKey = kind === 'shift' ? null : region.id + kind;
    const last = this.#lastEdgeClick;

    if (edgeKey && last?.key === edgeKey && event.timeStamp - last.time < DOUBLE_CLICK) {
      if (kind === 'start') {
        store.setStart(region, player.time, player.duration);
      } else {
        store.setEnd(region, player.time, player.duration);
      }

      this.#drag = null;
      this.#lastEdgeClick = null;
      store.changed();

      return;
    }

    this.#lastEdgeClick = edgeKey ? { key: edgeKey, time: event.timeStamp } : null;
  }

  #onPointerMove(event) {
    const drag = this.#drag;
    const duration = this.player.duration;

    if (!drag) {
      return;
    }

    if (drag.kind === 'scrub') {
      this.player.seek(this.timeAt(event) + drag.offset);

      return;
    }

    const { kind, region, origin, original } = drag;
    const delta = this.timeAt(event) - origin;
    let snappedTo = null;

    if (kind === 'start') {
      snappedTo = this.#playheadSnap(original.start + delta, event);
      region.start = clamp(snappedTo ?? original.start + delta, 0, region.end - MIN_LENGTH);
    } else if (kind === 'end') {
      snappedTo = this.#playheadSnap(original.end + delta, event);
      region.end = clamp(snappedTo ?? original.end + delta, region.start + MIN_LENGTH, duration);
    } else {
      const length = original.end - original.start;
      let start = original.start + delta;
      const startSnap = this.#playheadSnap(start, event);
      const endSnap = this.#playheadSnap(start + length, event);

      if (startSnap !== null) {
        start = startSnap;
      } else if (endSnap !== null) {
        start = endSnap - length;
      }

      snappedTo = startSnap ?? endSnap;
      region.start = clamp(start, 0, duration - length);
      region.end = region.start + length;
    }

    drag.snapped = snappedTo !== null;
    this.store.changed();
  }

  #onPointerUp() {
    this.#drag = null;
    this.store.changed();
  }

  // ⌘+scroll, or a trackpad pinch (arrives as ctrl+wheel); plain scrolling moves along the timeline
  #onWheel(event) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    this.setZoom(this.zoom * Math.exp(-event.deltaY * 0.01), event.clientX);
  }
}
