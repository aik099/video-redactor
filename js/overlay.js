// Regions drawn over the video: drawing, moving, resizing (with edge snapping) and effect previews
import { DEFAULT_LEVELS, DEFAULT_MODE, MIN_RECT, RESIZE_ZONE, SNAP_DISTANCE } from './config.js';
import { setStatus } from './dom.js';
import { encoderRect } from './ffmpeg.js';
import { isActive } from './regions.js';
import { frameLuma, snapRect } from './snapping.js';
import { addNoise, averageBlocks, blockSize, smallSize, strengthPixels } from './strength.js';

// Larger previews let the browser shrink the image (fast, but samples instead of averaging): averaging every
// pixel on each redraw would slow playback
const MAX_AVERAGED_PIXELS = 2_000_000;
import { clamp, colorOf, formatTime } from './util.js';

// Invisible resize zones as [edges moved, cursor]; corners last so they sit above the edge strips
const RESIZE_HANDLES = [
  ['top', 'ns'], ['bottom', 'ns'], ['left', 'ew'], ['right', 'ew'],
  ['top left', 'nwse'], ['bottom right', 'nwse'], ['top right', 'nesw'], ['bottom left', 'nesw'],
];

function zoneStyle(edges, zone) {
  const corner = edges.includes(' ');
  const size = corner ? zone * 1.5 : zone;
  let style = corner ? `width:${size}px;height:${size}px;`
    : edges === 'top' || edges === 'bottom' ? `left:0;right:0;height:${size}px;` : `top:0;bottom:0;width:${size}px;`;

  for (const edge of edges.split(' ')) {
    style += `${edge}:${-size / 2}px;`;
  }

  return style;
}

// Edges stuck to a line drawn thick and solid, so snapping is visible (and ⌥ visibly releases it)
function markSnapped(box, edges) {
  for (const edge of edges) {
    const side = edge[0].toUpperCase() + edge.slice(1);
    box.style[`border${side}Style`] = 'solid';
    box.style[`border${side}Width`] = '4px';
  }
}

function positionBox(element, rect, scale) {
  Object.assign(element.style, {
    left: rect.x * scale + 'px', top: rect.y * scale + 'px',
    width: rect.w * scale + 'px', height: rect.h * scale + 'px',
  });
}

// One axis of a resize as {from, to, moved}: the dragged edge may cross the opposite one (flips, like drawing);
// `moved` names the side the dragged edge ended up on, null when this axis isn't dragged
export function resizeAxis(start, size, delta, edges, lowEdge, highEdge, limit) {
  const end = start + size;

  if (!edges.includes(lowEdge) && !edges.includes(highEdge)) {
    return { from: start, to: end, moved: null };
  }

  const dragsLow = edges.includes(lowEdge);
  const anchor = dragsLow ? end : start;
  const moving = clamp((dragsLow ? start : end) + delta, 0, limit);

  return moving < anchor ? { from: moving, to: anchor, moved: lowEdge } : { from: anchor, to: moving, moved: highEdge };
}

export class Overlay {
  #drag = null;       // {kind: 'draw'|'move'|'resize', origin, region?, original?, edges?}
  #draftRect = null;  // region being drawn
  #snapFrame = null;  // frame brightness during a draw/resize drag
  #snappedEdges = []; // edges of the drawn/resized box currently on a line
  #lastPointer = null;
  #scratchCanvas = null;  // reused for reading frame pixels of previews

  constructor(element, video, store, player) {
    this.element = element;
    this.video = video;
    this.store = store;
    this.player = player;
    element.addEventListener('pointerdown', event => this.#onPointerDown(event));
    element.addEventListener('pointermove', event => this.#onPointerMove(event));
    element.addEventListener('pointerup', () => this.#onPointerUp());

    // ⌥ pressed/released mid-drag takes effect at once, not on the next mouse move
    for (const type of ['keydown', 'keyup']) {
      document.addEventListener(type, event => {
        if (event.key === 'Alt' && this.#drag && this.#lastPointer) {
          this.#onPointerMove({ ...this.#lastPointer, altKey: event.altKey });
        }
      });
    }
  }

  // Video at the largest size fitting the stage, at its exact aspect ratio (overlay has no letterbox to offset)
  fitVideo(stage) {
    const video = this.video;

    if (!video.videoWidth) {
      return;
    }

    const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
    video.style.width = Math.floor(video.videoWidth * scale) + 'px';
    video.style.height = Math.floor(video.videoHeight * scale) + 'px';
    this.render();
  }

  render() {
    const { element, video, store } = this;
    element.replaceChildren();

    if (!video.videoWidth) {
      return;
    }

    const cssPerVideoPixel = video.clientWidth / video.videoWidth;
    const time = video.currentTime;
    const shown = store.regions.filter(region => isActive(region, time) || region.id === store.selectedId);

    for (const region of shown) {
      const box = document.createElement('div');
      box.dataset.id = region.id;
      box.style.borderColor = colorOf(region);
      box.innerHTML = `<span class="label" style="background:${colorOf(region)}">#${region.id}</span>`;
      positionBox(box, region, cssPerVideoPixel);
      element.append(box);

      // Selected but outside its time range: editing here would place/snap it against the wrong frame
      if (!isActive(region, time)) {
        box.className = 'box ghost selected';
        box.title = `Region #${region.id} has no effect at this time; click to jump to its start`;
        box.innerHTML += `<span class="ghost-text">Not active at this time · click to jump to ${formatTime(region.start)}</span>`;
        continue;
      }

      box.className = `box mode-${region.mode} active` + (region.id === store.selectedId ? ' selected' : '');

      // Shrinks on small boxes so their middle still moves; per axis, so a thin field keeps wide left/right zones
      const zoneX = Math.min(RESIZE_ZONE, region.w * cssPerVideoPixel / 4);
      const zoneY = Math.min(RESIZE_ZONE, region.h * cssPerVideoPixel / 4);

      for (const [edges, cursor] of RESIZE_HANDLES) {
        const zone = edges.includes(' ') ? Math.min(zoneX, zoneY) : edges === 'left' || edges === 'right' ? zoneX : zoneY;
        box.innerHTML += `<span class="handle" data-edges="${edges}" style="${zoneStyle(edges, zone)}cursor:${cursor}-resize"></span>`;
      }

      // First child: below every box
      element.prepend(this.#effectPreview(region, cssPerVideoPixel));

      if (this.#drag?.kind === 'resize' && this.#drag.region === region) {
        markSnapped(box, this.#snappedEdges);
      }
    }

    if (this.#draftRect) {
      const draft = this.#draftRect;
      const box = document.createElement('div');
      box.className = `box draft mode-${DEFAULT_MODE}`;
      // Colour the region will get
      box.style.borderColor = colorOf({ id: store.nextId });

      // Effect the new region will get
      if (draft.w >= MIN_RECT && draft.h >= MIN_RECT) {
        element.prepend(this.#effectPreview({ ...draft, mode: DEFAULT_MODE, level: DEFAULT_LEVELS[DEFAULT_MODE] }, cssPerVideoPixel));
      }

      markSnapped(box, this.#snappedEdges);
      positionBox(box, draft, cssPerVideoPixel);
      element.append(box);
    }
  }

  // Effect on ffmpeg's rectangle (region + margin, even pixels) with its block grid, so it matches the output.
  // Black out: black fill; pixelate / secure blur: the frame's part shrunk to blocks, stretched back by CSS
  // (hard edges or smooth + blurred); smooth blur: browser blur of the video behind it
  #effectPreview(region, cssPerVideoPixel) {
    const video = this.video;
    const rect = encoderRect(region, { width: video.videoWidth, height: video.videoHeight });
    const preview = document.createElement('div');
    preview.className = `preview ${region.mode}`;
    positionBox(preview, rect, cssPerVideoPixel);

    if (region.mode === 'box') {
      return preview;
    }

    if (region.mode === 'blur') {
      // CSS blur radius is a gaussian sigma, same as ffmpeg's gblur
      const sigma = strengthPixels(region.level, video.videoHeight) * cssPerVideoPixel;
      preview.style.backdropFilter = preview.style.webkitBackdropFilter = `blur(${sigma}px)`;

      return preview;
    }

    const block = blockSize(region.level, rect, video.videoHeight);
    const small = smallSize(rect, block);
    const canvas = document.createElement('canvas');
    canvas.width = small.w;
    canvas.height = small.h;
    const context = canvas.getContext('2d');

    if (rect.w * rect.h <= MAX_AVERAGED_PIXELS) {
      // Same block colours as ffmpeg (area averaging), plus its noise for secure blur
      const blocks = averageBlocks(this.#framePixels(rect), rect.w, rect.h, small.w, small.h);

      if (region.mode === 'secure') {
        addNoise(blocks, region.id ?? 0);
      }

      context.putImageData(new ImageData(blocks, small.w, small.h), 0, 0);
    } else {
      context.imageSmoothingQuality = 'high';
      context.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, small.w, small.h);
    }

    if (region.mode === 'secure') {
      // Unblurred copy underneath: CSS blur fades the canvas edges, which would show the original there
      const base = document.createElement('canvas');
      base.width = small.w;
      base.height = small.h;
      base.getContext('2d').drawImage(canvas, 0, 0);
      preview.append(base);
      canvas.style.filter = `blur(${block / 2 * cssPerVideoPixel}px)`;
    }

    preview.append(canvas);

    return preview;
  }

  // RGBA pixels of the current frame inside rect, through one reused canvas
  #framePixels(rect) {
    this.#scratchCanvas ??= document.createElement('canvas');
    this.#scratchCanvas.width = rect.w;
    this.#scratchCanvas.height = rect.h;
    const context = this.#scratchCanvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.video, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

    return context.getImageData(0, 0, rect.w, rect.h).data;
  }

  #toVideoPoint(event) {
    const box = this.element.getBoundingClientRect();

    return {
      x: Math.round(clamp((event.clientX - box.left) / box.width, 0, 1) * this.video.videoWidth),
      y: Math.round(clamp((event.clientY - box.top) / box.height, 0, 1) * this.video.videoHeight),
    };
  }

  // Brightness of every pixel of the current frame; null if the browser blocks reading it
  #captureFrame() {
    const { videoWidth: width, videoHeight: height } = this.video;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.video, 0, 0);

    try {
      return frameLuma(context.getImageData(0, 0, width, height).data, width, height);
    } catch (error) {
      setStatus('Snapping unavailable: ' + error.message);

      return null;
    }
  }

  // Snapped rect; remembers which edges found a line, for drawing them solid
  #snap(rect, edges) {
    const radius = Math.round(SNAP_DISTANCE * this.video.videoWidth / this.video.clientWidth);
    const result = snapRect(this.#snapFrame, rect, edges, radius);
    this.#snappedEdges = result.snapped;

    return result.rect;
  }

  #onPointerDown(event) {
    if (!this.video.videoWidth) {
      return;
    }

    event.preventDefault();
    this.element.setPointerCapture(event.pointerId);
    const point = this.#toVideoPoint(event);
    const boxElement = event.target.closest('.box');
    const region = boxElement ? this.store.find(Number(boxElement.dataset.id)) : null;

    if (region && boxElement.classList.contains('ghost')) {
      this.player.seek(region.start);

      return;
    }

    if (region) {
      const handle = event.target.closest('.handle');
      const kind = handle ? 'resize' : 'move';
      this.#drag = { kind, region, origin: point, original: { ...region }, edges: handle?.dataset.edges.split(' ') };
      this.store.select(region.id);
    } else {
      this.#drag = { kind: 'draw', origin: point };
    }

    if (this.#drag.kind !== 'move') {
      this.#snapFrame = this.#captureFrame();
    }
  }

  #onPointerMove(event) {
    if (!this.#drag) {
      return;
    }

    const { videoWidth, videoHeight } = this.video;
    this.#lastPointer = { clientX: event.clientX, clientY: event.clientY };
    const point = this.#toVideoPoint(event);
    const { kind, region, origin, original, edges } = this.#drag;
    const deltaX = point.x - origin.x;
    const deltaY = point.y - origin.y;
    const snap = this.#snapFrame && !event.altKey;
    this.#snappedEdges = [];

    if (kind === 'move') {
      region.x = clamp(original.x + deltaX, 0, videoWidth - original.w);
      region.y = clamp(original.y + deltaY, 0, videoHeight - original.h);
    } else if (kind === 'resize') {
      const horizontal = resizeAxis(original.x, original.w, deltaX, edges, 'left', 'right', videoWidth);
      const vertical = resizeAxis(original.y, original.h, deltaY, edges, 'top', 'bottom', videoHeight);
      const rect = { x: horizontal.from, y: vertical.from, w: horizontal.to - horizontal.from, h: vertical.to - vertical.from };
      const movedEdges = [horizontal.moved, vertical.moved].filter(Boolean);

      if (rect.w >= MIN_RECT && rect.h >= MIN_RECT) {
        Object.assign(region, snap ? this.#snap(rect, movedEdges) : rect);
      }
    } else {
      const rect = {
        x: Math.min(origin.x, point.x), y: Math.min(origin.y, point.y),
        w: Math.abs(point.x - origin.x), h: Math.abs(point.y - origin.y),
      };
      // Only the dragged corner's edges: the pressed corner stays where it was pressed
      const pointerEdges = [point.x < origin.x ? 'left' : 'right', point.y < origin.y ? 'top' : 'bottom'];
      this.#draftRect = snap ? this.#snap(rect, pointerEdges) : rect;
    }

    this.render();
  }

  #onPointerUp() {
    const draft = this.#draftRect;

    if (draft && draft.w >= MIN_RECT && draft.h >= MIN_RECT) {
      this.store.add(draft, this.video.currentTime, this.video.duration || 0);
    }

    this.#draftRect = null;
    this.#drag = null;
    this.#snapFrame = null;
    this.#snappedEdges = [];
    this.#lastPointer = null;
    this.store.changed();
  }
}
