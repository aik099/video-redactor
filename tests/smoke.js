// Browser smoke test: drives index.html only through the DOM (events in, labels/command out), on a fresh page load.
// Run from the page's console or javascript_tool:
//   const { run } = await import('./tests/smoke.js?' + Date.now()); await run();
// Fixture tests/fixtures/ui.mp4: 1280x720, 60 fps, 20 s, white; grey panel separator at x=596 (full height);
// grey field border 612..911 x 300..329, side borders with 5px corner gaps (like rounded fields).

const $ = selector => document.querySelector(selector);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function label() {
  return $('#timeLabel').textContent;
}

function frameNumber() {
  return Number(label().match(/frame (\d+)/)[1]);
}

function timeText() {
  return label().split(' / ')[0];
}

function command() {
  return $('#command').value;
}

function barText() {
  return $('.bar')?.textContent ?? null;
}

function press(key, options = {}) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

function pointer(target, type, clientX, clientY, options = {}) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY, ...options }));
}

// Video pixel → client coordinates over the overlay
function videoPoint(x, y) {
  const video = $('#video');
  const box = $('#overlay').getBoundingClientRect();

  return [box.left + x / video.videoWidth * box.width, box.top + y / video.videoHeight * box.height];
}

function timelineX(time) {
  const track = $('#track').getBoundingClientRect();

  return track.left + time / $('#video').duration * track.width;
}

// Click on the ruler at `time` (jumps the playhead there)
async function clickRuler(time) {
  const ruler = $('#ruler').getBoundingClientRect();
  pointer($('#ruler'), 'pointerdown', timelineX(time), ruler.top + 5);
  pointer($('#timeline'), 'pointerup', timelineX(time), ruler.top + 5);
  await pause(200);
}

export async function run() {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: String(detail) });
  const video = $('#video');
  // Synthetic pointers have no active pointer to capture
  const originalCapture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = () => {};

  try {
    check('drop hint shown before a video is open', getComputedStyle($('#dropHint')).display !== 'none');

    // Dragging files outlines the stage, through enter/leave on child elements, until leaving the page
    const files = new DataTransfer();
    files.items.add(new File([''], 'x.mp4', { type: 'video/mp4' }));
    const drag = (target, type) => target.dispatchEvent(new DragEvent(type, { bubbles: true, dataTransfer: files }));
    drag($('#stage'), 'dragenter');
    drag($('#dropHint'), 'dragenter');
    drag($('#stage'), 'dragleave');
    const outlinedInside = $('#stage').classList.contains('dragging');
    drag($('#dropHint'), 'dragleave');
    check('stage outlined while files are dragged over the page', outlinedInside && !$('#stage').classList.contains('dragging'));

    // Load the fixture through the file input
    const blob = await fetch(new URL('./fixtures/ui.mp4', import.meta.url)).then(response => response.blob());
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'ui fixture.mp4', { type: 'video/mp4' }));
    const input = $('#videoInput');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }));
    await pause(500);
    check('video loads', $('#status').textContent.includes('1280×720'), $('#status').textContent);
    check('drop hint hidden once a video is open', getComputedStyle($('#dropHint')).display === 'none');
    check('fps assumed before playback', label().includes('(60 fps?)'), label());

    // Seeks must not set the frame rate
    await clickRuler(5);
    await clickRuler(10);
    await clickRuler(1);
    check('seeks keep fps assumed', label().includes('(60 fps?)'), label());

    // Frame stepping: buttons, keys
    const startFrame = frameNumber();
    for (let i = 0; i < 3; i++) {
      $('#nextFrameButton').click();
      await pause(120);
    }

    check('› button steps 3 frames', frameNumber() === startFrame + 3, `${startFrame} → ${frameNumber()}`);
    press('ArrowLeft');
    await pause(120);
    press('ArrowLeft');
    await pause(120);
    check('← key steps back 2 frames', frameNumber() === startFrame + 1, frameNumber());
    press('ArrowRight', { shiftKey: true });
    await pause(150);
    check('Shift+→ jumps 60 frames', frameNumber() === startFrame + 61, frameNumber());

    // Playback measures fps
    video.muted = true;
    await video.play();
    await pause(800);
    video.pause();
    await pause(100);
    check('fps measured after playback', label().includes('(60 fps)'), label());

    // Draw from the field's exact bottom-right corner to a rough top-left: the dragged edges snap to the field
    // (nearest line), not the separator; the pressed corner stays put
    await clickRuler(1);
    const overlay = $('#overlay');
    pointer(overlay, 'pointerdown', ...videoPoint(912, 330));
    pointer(overlay, 'pointermove', ...videoPoint(800, 320));
    pointer(overlay, 'pointermove', ...videoPoint(606, 295));
    let draft = overlay.querySelector('.box.draft');
    check('draft shows effect preview', overlay.querySelector('.preview.pixelate canvas'));
    check('draft border has next region colour', draft?.style.borderColor === 'rgb(215, 95, 95)', draft?.style.borderColor);
    check('snapped edges drawn thick and solid, pressed corner not',
      draft?.style.borderLeftStyle === 'solid' && draft?.style.borderTopStyle === 'solid' && !draft?.style.borderRightStyle,
      `${draft?.style.borderLeftStyle}/${draft?.style.borderTopStyle}/${draft?.style.borderRightStyle}`);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    draft = overlay.querySelector('.box.draft');
    check('pressing ⌥ mid-drag releases snapping at once', !draft?.style.borderLeftStyle, draft?.style.borderLeftStyle);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false }));
    pointer(overlay, 'pointerup', ...videoPoint(606, 295));
    await pause(100);
    // Region 612,300 300x30 → ffmpeg rect +4px margin, even: 608,296 308x38
    check('drawn region snaps to field', command().includes('crop=308:38:608:296'), command().match(/crop=[\d:]+/)?.[0]);
    check('new region is Pixelate Lv2', barText() === '#1 (Pixelate, Lv2)', barText());
    check('new region starts at playhead', $('.row .start').value === timeText(), `${$('.row .start').value} vs ${timeText()}`);
    check('active region shows preview', overlay.querySelector('.preview.pixelate canvas'));
    // On ffmpeg's rectangle 608,296 308x38 and its block grid (720p Lv2 → 6px blocks → 51x6)
    const previewElement = overlay.querySelector('.preview.pixelate');
    const scale = overlay.getBoundingClientRect().width / video.videoWidth;
    const previewCanvasSize = `${previewElement.firstElementChild.width}x${previewElement.firstElementChild.height}`;
    check('preview covers ffmpeg\'s rectangle with its block grid',
      Math.abs(parseFloat(previewElement.style.left) - 608 * scale) < 0.5 && Math.abs(parseFloat(previewElement.style.width) - 308 * scale) < 0.5
        && previewCanvasSize === '51x6', `${previewElement.style.left} ${previewElement.style.width} ${previewCanvasSize}`);

    // Resize: drag left edge past the right edge (⌥: no snapping) → flips
    const boxBefore = overlay.querySelector('.box.selected').getBoundingClientRect();
    const leftZone = overlay.querySelector('.handle[data-edges="left"]').getBoundingClientRect();
    pointer(overlay.querySelector('.handle[data-edges="left"]'), 'pointerdown', leftZone.left + leftZone.width / 2, leftZone.top + leftZone.height / 2);
    pointer(overlay, 'pointermove', ...videoPoint(1050, 315), { altKey: true });
    pointer(overlay, 'pointerup', ...videoPoint(1050, 315), { altKey: true });
    await pause(50);
    const boxAfter = overlay.querySelector('.box.selected').getBoundingClientRect();
    check('resize past opposite edge flips', boxAfter.left >= boxBefore.right - 3, `${boxBefore.left.toFixed(0)}..${boxBefore.right.toFixed(0)} → ${boxAfter.left.toFixed(0)}..${boxAfter.right.toFixed(0)}`);
    check('edge zone has resize cursor', overlay.querySelector('.handle[data-edges="left"]').style.cursor === 'ew-resize');

    // Timeline magnet: drag end edge (6 s) so it lands 3px past the playhead (8 s)
    await clickRuler(8);
    const endEdge = $('.bar .edge-end').getBoundingClientRect();
    const barEnd = $('.bar').getBoundingClientRect().right;
    const grabX = endEdge.left + 2;
    const dropX = grabX + (timelineX(8) - barEnd) + 3;
    pointer($('.bar .edge-end'), 'pointerdown', grabX, endEdge.top + 5);
    pointer($('#timeline'), 'pointermove', dropX, endEdge.top + 5);
    check('playhead marks snap while dragging', $('#playhead').classList.contains('snapped'));
    pointer($('#timeline'), 'pointerup', dropX, endEdge.top + 5);
    await pause(50);
    check('end edge sticks to playhead', $('.row .end').value === timeText(), `${$('.row .end').value} vs ${timeText()}`);

    // Double-click start edge → playhead (2 s)
    await clickRuler(2);
    for (let i = 0; i < 2; i++) {
      const startEdge = $('.bar .edge-start').getBoundingClientRect();
      pointer($('.bar .edge-start'), 'pointerdown', startEdge.left + 2, startEdge.top + 5);
      pointer($('#timeline'), 'pointerup', startEdge.left + 2, startEdge.top + 5);
      await pause(80);
    }

    check('double-click start edge moves it to playhead', $('.row .start').value === timeText(), `${$('.row .start').value} vs ${timeText()}`);

    // Outside its range the selected region is a read-only ghost; clicking it jumps to its start
    await clickRuler(12);
    const ghost = overlay.querySelector('.box.ghost');
    check('selected region outside its range is a labelled ghost',
      ghost && ghost.textContent.includes('Not active at this time') && !ghost.querySelector('.handle') && !overlay.querySelector('.preview'),
      ghost?.textContent);
    const ghostBox = ghost.getBoundingClientRect();
    pointer(ghost, 'pointerdown', ghostBox.left + ghostBox.width / 2, ghostBox.top + ghostBox.height / 2);
    pointer(overlay, 'pointerup', ghostBox.left + ghostBox.width / 2, ghostBox.top + ghostBox.height / 2);
    await pause(200);
    check('clicking the ghost jumps to the region start', timeText() === $('.row .start').value && overlay.querySelector('.box.active.selected'),
      `${timeText()} vs ${$('.row .start').value}`);
    check('ghost click creates no region', document.querySelectorAll('.bar').length === 1);

    // Mode + slider
    const mode = $('.row .mode');
    mode.value = 'secure';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    check('secure blur defaults to Lv3', $('.row .level').value === '3' && barText() === '#1 (Secure blur, Lv3)', barText());
    check('command: secure blur, no alpha, audio kept',
      command().includes('noise=c0s=10,') && command().includes('format=yuv420p') && command().includes("-map '0:a?'"));
    const slider = $('.row .level');
    slider.value = '5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    check('slider updates level live', barText() === '#1 (Secure blur, Lv5)', barText());
    const smooth = $('.row .mode');
    smooth.value = 'blur';
    smooth.dispatchEvent(new Event('change', { bubbles: true }));
    check('smooth blur defaults to Lv4', $('.row .level').value === '4' && barText() === '#1 (Smooth blur, Lv4)', barText());
    const blurPreview = overlay.querySelector('.preview.blur');
    const blurCanvas = blurPreview?.querySelector('canvas');
    const videoPixelsWide = blurPreview && parseFloat(blurPreview.style.width) * video.videoWidth / overlay.getBoundingClientRect().width;
    check('smooth blur preview blurs the region itself at full resolution',
      blurCanvas && Math.abs(blurCanvas.width - videoPixelsWide) < 1 && !blurPreview.style.backdropFilter,
      `${blurCanvas?.width} vs ${videoPixelsWide?.toFixed(1)}`);
    const modeAgain = $('.row .mode');
    modeAgain.value = 'box';
    modeAgain.dispatchEvent(new Event('change', { bubbles: true }));
    await clickRuler(3);
    const blackOut = overlay.querySelector('.preview.box');
    check('black out preview is solid', blackOut && getComputedStyle(blackOut).backgroundColor === 'rgb(0, 0, 0)', blackOut && getComputedStyle(blackOut).backgroundColor);
    check('command: black out drawbox', command().includes('color=black:t=fill'));
    // Black box on screen, in video pixels, must be the rectangle ffmpeg blacks out
    const screenBox = blackOut.getBoundingClientRect();
    const videoArea = video.getBoundingClientRect();
    const toVideo = value => Math.round(value * video.videoWidth / videoArea.width);
    const onScreen = [screenBox.left - videoArea.left, screenBox.top - videoArea.top, screenBox.width, screenBox.height].map(toVideo).join(',');
    const drawbox = command().match(/drawbox=x=(\d+):y=(\d+):w=(\d+):h=(\d+)/)?.slice(1).join(',');
    check('black out preview covers exactly the ffmpeg drawbox', onScreen === drawbox, `${onScreen} vs ${drawbox}`);

    // Playhead over the bar: grabbing 3px beside it keeps the time, dragging moves it by the drag only
    const playheadBox = $('#playhead').getBoundingClientRect();
    const barBox = $('.bar').getBoundingClientRect();
    const lineX = playheadBox.left + playheadBox.width / 2;
    const grabbed = document.elementFromPoint(lineX + 3, barBox.top + barBox.height / 2);
    check('playhead is grabbable over a bar', grabbed?.id === 'playhead', grabbed?.className || grabbed?.id);
    const timeBefore = video.currentTime;
    pointer(grabbed, 'pointerdown', lineX + 3, barBox.top + 5);
    const timeOnGrab = video.currentTime;
    pointer($('#timeline'), 'pointermove', lineX + 53, barBox.top + 5);
    pointer($('#timeline'), 'pointerup', lineX + 53, barBox.top + 5);
    const expected = timeBefore + 50 * video.duration / $('#track').getBoundingClientRect().width;
    check('grabbing playhead keeps its time', Math.abs(timeOnGrab - timeBefore) < 0.001, `${timeBefore} → ${timeOnGrab}`);
    check('dragging playhead moves by the drag', Math.abs(video.currentTime - expected) < 0.01, `${video.currentTime.toFixed(3)} vs ${expected.toFixed(3)}`);

    // Zoom
    for (let i = 0; i < 6; i++) {
      $('#zoomInButton').click();
    }

    check('zoom in to 64×', $('#zoomLabel').textContent === 'Zoom 64×', $('#zoomLabel').textContent);
    const track = () => $('#track').getBoundingClientRect();
    const playheadInTrack = () => $('#playhead').getBoundingClientRect().left - track().left;
    const pixelsPerFrame = track().width / video.duration / 60;
    $('#nextFrameButton').click();
    await pause(150);
    const before = playheadInTrack();
    $('#nextFrameButton').click();
    await pause(150);
    const moved = playheadInTrack() - before;
    check('frame step at 64× moves playhead one frame', Math.abs(moved - pixelsPerFrame) < 2, `${moved.toFixed(1)} px vs ${pixelsPerFrame.toFixed(1)}`);
    const viewport = $('#timeline').getBoundingClientRect();
    const playheadX = $('#playhead').getBoundingClientRect().left;
    check('playhead stays in view when zoomed', playheadX > viewport.left && playheadX < viewport.right);

    for (let i = 0; i < 8; i++) {
      $('#zoomOutButton').click();
    }

    check('zoom out to 1×', $('#zoomLabel').textContent === 'Zoom 1×', $('#zoomLabel').textContent);

    // Esc deselects; clicking the list row selects again
    press('Escape');
    await pause(50);
    check('Esc deselects the region', !$('.bar.selected') && !$('.row.selected') && $('#setStartButton').disabled);
    $('.row').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await pause(100);
    check('clicking the list row selects it again', $('.bar.selected') && !$('#setStartButton').disabled);

    // Delete
    press('Delete');
    await pause(50);
    check('Delete key removes region', !$('.bar') && command().startsWith('Draw at least one region'), command().slice(0, 40));

    // Stop 6px short of the video's bottom in a plain white area: the frame edge pulls the region onto it
    pointer(overlay, 'pointerdown', ...videoPoint(100, 650));
    pointer(overlay, 'pointermove', ...videoPoint(300, 714));
    pointer(overlay, 'pointerup', ...videoPoint(300, 714));
    await pause(50);
    // Region 100,650 200x70 → ffmpeg rect 96,646 208x74 (bottom clamped to 720)
    check('region reaches the video edge', command().includes('crop=208:74:96:646'), command().match(/crop=[\d:]+/)?.[0]);

    // Regions loaded before the video: their previews must show once the video's first frame arrives
    const regionsTransfer = new DataTransfer();
    regionsTransfer.items.add(new File([JSON.stringify({ width: 1280, height: 720, regions: [
      { id: 1, x: 600, y: 280, w: 340, h: 70, start: 0, end: 5, mode: 'pixelate', level: 2 },
    ] })], 'fixture.regions.json'));
    $('#regionsInput').files = regionsTransfer.files;
    $('#regionsInput').dispatchEvent(new Event('change', { bubbles: true }));
    await pause(100);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
    await pause(100);
    const previewCanvas = overlay.querySelector('.preview canvas');
    const previewPixels = previewCanvas?.getContext('2d').getImageData(0, 0, previewCanvas.width, previewCanvas.height).data;
    check('regions loaded before the video show their effect', previewPixels?.some((value, index) => index % 4 === 3 && value > 0));

    // Regions loaded with a video open: the timeline grows, the video must shrink to still fit its area
    const manyTransfer = new DataTransfer();
    manyTransfer.items.add(new File([JSON.stringify({ width: 1280, height: 720, regions: [1, 2, 3, 4, 5, 6].map(id => (
      { id, x: 10 * id, y: 10, w: 50, h: 50, start: 0, end: 5, mode: 'box' }
    )) })], 'many.regions.json'));
    $('#regionsInput').files = manyTransfer.files;
    $('#regionsInput').dispatchEvent(new Event('change', { bubbles: true }));
    await pause(200);
    const stageBox = $('#stage').getBoundingClientRect();
    const videoBox = video.getBoundingClientRect();
    check('video still fits after the timeline grows', videoBox.top >= stageBox.top - 1 && videoBox.bottom <= stageBox.bottom + 1,
      `video ${videoBox.top.toFixed(0)}..${videoBox.bottom.toFixed(0)}, stage ${stageBox.top.toFixed(0)}..${stageBox.bottom.toFixed(0)}`);
  } catch (error) {
    check('smoke test ran without exceptions', false, error.stack);
  } finally {
    Element.prototype.setPointerCapture = originalCapture;
  }

  const failed = results.filter(result => !result.ok);

  return { passed: results.length - failed.length, failed: failed.length, results: failed.length ? results : results.map(result => result.name) };
}
