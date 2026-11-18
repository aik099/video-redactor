// Wiring: creates the parts, re-renders on changes, handles buttons, keys and dropped files
import { $, setStatus } from './dom.js';
import { buildCommand } from './ffmpeg.js';
import { loadRegions, saveRegions } from './files.js';
import { FrameClock } from './frame-clock.js';
import { renderList } from './list.js';
import { Overlay } from './overlay.js';
import { Player } from './player.js';
import { RegionStore } from './regions.js';
import { Timeline } from './timeline.js';
import { formatTime } from './util.js';

const video = $('#video');
const store = new RegionStore();
const clock = new FrameClock(video);
const player = new Player(video, clock);
const overlay = new Overlay($('#overlay'), video, store, player);
const timeline = new Timeline($('#timeline'), store, player, clock);
let videoFile = null;

const videoSize = () => ({ width: video.videoWidth, height: video.videoHeight });

function renderCommand() {
  const output = $('#command');

  if (!videoFile || !video.videoWidth) {
    output.value = 'Open a video first.';
  } else if (!store.regions.length) {
    output.value = 'Draw at least one region on the video.';
  } else {
    output.value = buildCommand(videoFile.name, store.regions, videoSize());
  }
}

function renderAll({ skipList = false } = {}) {
  overlay.render();
  timeline.render();

  if (!skipList) {
    renderList($('#regionList'), store, player);
  }

  renderCommand();

  for (const id of ['setStartButton', 'setEndButton', 'playRangeButton', 'deleteButton']) {
    $('#' + id).disabled = !store.selected;
  }
}

function openVideo(file) {
  if (video.src) {
    URL.revokeObjectURL(video.src);
  }

  videoFile = file;
  clock.reset();
  video.src = URL.createObjectURL(file);
  $('#fileName').textContent = file.name;
  setStatus('');
}

async function openRegions(file) {
  setStatus(await loadRegions(file, store, videoSize()));
  store.changed();
}

store.addEventListener('change', event => renderAll(event.detail));
player.addEventListener('time', () => {
  timeline.renderPlayhead();
  overlay.render();
});

video.addEventListener('loadedmetadata', () => {
  $('#stage').classList.add('has-video');
  setStatus(`${video.videoWidth}×${video.videoHeight}, ${formatTime(player.duration)}`);
  overlay.fitVideo($('#stage'));
  timeline.setZoom(1);
  renderAll();
});
// First frame arrives after the metadata: previews copy its pixels, so regions loaded before the video need a redraw
video.addEventListener('loadeddata', () => overlay.render());
video.addEventListener('error', () => setStatus("This browser can't play the file, try Safari."));
video.addEventListener('play', () => {
  $('#playButton').textContent = '❚❚';
});
video.addEventListener('pause', () => {
  $('#playButton').textContent = '▶';
});
// Stage shrinks not only with the window but also when the timeline gains rows (e.g. after loading regions)
new ResizeObserver(() => overlay.fitVideo($('#stage'))).observe($('#stage'));
window.addEventListener('resize', () => {
  timeline.renderRuler();
});

$('#videoInput').addEventListener('change', event => event.target.files[0] && openVideo(event.target.files[0]));
$('#regionsInput').addEventListener('change', event => event.target.files[0] && openRegions(event.target.files[0]));
$('#saveButton').addEventListener('click', () => saveRegions(store, videoFile?.name ?? null, videoSize()));
$('#playButton').addEventListener('click', () => player.togglePlay());
$('#zoomInButton').addEventListener('click', () => timeline.setZoom(timeline.zoom * 2));
$('#zoomOutButton').addEventListener('click', () => timeline.setZoom(timeline.zoom / 2));
$('#previousFrameButton').addEventListener('click', () => player.stepFrame(-1));
$('#nextFrameButton').addEventListener('click', () => player.stepFrame(1));
$('#speedSelect').addEventListener('change', event => {
  // defaultPlaybackRate survives opening another video
  video.defaultPlaybackRate = video.playbackRate = Number(event.target.value);
  event.target.blur();
});
$('#setStartButton').addEventListener('click', () => {
  store.setStart(store.selected, player.time, player.duration);
  store.changed();
});
$('#setEndButton').addEventListener('click', () => {
  store.setEnd(store.selected, player.time, player.duration);
  store.changed();
});
$('#playRangeButton').addEventListener('click', () => player.playRange(store.selected.start, store.selected.end));
$('#deleteButton').addEventListener('click', () => store.remove(store.selectedId));
$('#command').addEventListener('focus', event => event.target.select());

// Buttons keep focus after a click, and Space would then click them again
document.addEventListener('click', event => event.target.closest('button')?.blur());

document.addEventListener('keydown', event => {
  if (event.target.closest('input, select, textarea')) {
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    player.togglePlay();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;

    if (event.shiftKey) {
      video.pause();
      player.seek(player.time + direction);
    } else {
      player.stepFrame(direction);
    }
  } else if (event.key === '+' || event.key === '=') {
    timeline.setZoom(timeline.zoom * 2);
  } else if (event.key === '-') {
    timeline.setZoom(timeline.zoom / 2);
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && store.selectedId !== null) {
    store.remove(store.selectedId);
  }
});

// Files dropped anywhere on the page; the stage is outlined while they're dragged over it.
// Enter/leave also fire when moving between child elements, hence the depth count
let dragDepth = 0;
const draggingFiles = event => event.dataTransfer?.types.includes('Files');

document.addEventListener('dragenter', event => {
  if (draggingFiles(event)) {
    dragDepth++;
    $('#stage').classList.add('dragging');
  }
});
document.addEventListener('dragleave', event => {
  if (draggingFiles(event) && --dragDepth === 0) {
    $('#stage').classList.remove('dragging');
  }
});
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => {
  event.preventDefault();
  dragDepth = 0;
  $('#stage').classList.remove('dragging');

  for (const file of event.dataTransfer.files) {
    if (file.name.endsWith('.json')) {
      openRegions(file);
    } else if (file.type.startsWith('video/')) {
      openVideo(file);
    }
  }
});

renderAll();
