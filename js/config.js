// Claude Code statusline colours (xterm-256 167, 178, 71, 110, 141, 173) + teal 73, pink 175 in the same style:
// xterm cube's middle levels (95/135/175/215), muted and readable on light and dark
export const PALETTE = ['#d75f5f', '#d7af00', '#5faf5f', '#87afd7', '#af87ff', '#d7875f', '#5fafaf', '#d787af'];
// Stored mode value → label; 'box' and 'blur' keep their names so older saved regions still load
export const MODES = { box: 'Black out', pixelate: 'Pixelate', secure: 'Blur (secure)', blur: 'Blur (smooth)' };
export const DEFAULT_MODE = 'pixelate';
// Strength 1..10 a region gets when created or switched to the mode; secure blur at 2 still shows word shapes
export const DEFAULT_LEVELS = { box: 2, pixelate: 2, secure: 3, blur: 2 };

export const DEFAULT_LENGTH = 5;   // s, range of a newly drawn region
export const MIN_LENGTH = 0.05;    // s
export const MIN_RECT = 8;         // video px
export const TIME_MARGIN = 0.1;    // s, browser and ffmpeg timestamps don't match frame-exactly
export const RECT_MARGIN = 4;      // video px

export const SNAP_DISTANCE = 10;   // screen px within which an edge sticks to a line
export const SNAP_CONTRAST = 10;   // min brightness jump (0..255) between neighbour pixels; macOS separators are ~15-35
export const SNAP_COVERAGE = 0.6;  // share of the edge's length the line must run along (ignores text)
export const RESIZE_ZONE = 8;      // screen px, resize zone width straddling a region's border; corners 1.5×

export const PLAYHEAD_SNAP = 8;    // screen px within which a dragged range edge sticks to the playhead
export const DOUBLE_CLICK = 400;   // ms
export const MAX_ZOOM = 64;        // timeline; at 64× a 60 fps frame of a ~1 min video is ~16 px
export const RULER_SPACING = 60;   // min screen px between ruler labels

// s; the browser doesn't expose fps: 60 until measured during playback (CleanShot records 60 fps)
export const ASSUMED_FRAME_DURATION = 1 / 60;
