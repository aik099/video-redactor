// Region list in the sidebar: times, mode, strength, delete
import { MODES } from './config.js';
import { colorOf, formatTime, parseTime } from './util.js';

export function renderList(container, store, player) {
  container.replaceChildren();

  for (const region of store.regions) {
    const row = document.createElement('div');
    row.className = 'row' + (region.id === store.selectedId ? ' selected' : '');
    row.innerHTML = `<span class="swatch" style="background:${colorOf(region)}">#${region.id}</span>
      <input class="start" value="${formatTime(region.start)}" title="Start">
      <input class="end" value="${formatTime(region.end)}" title="End">
      <button class="delete" title="Delete">✕</button>
      <select class="mode">${Object.entries(MODES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
      <input class="level" type="range" min="1" max="10" value="${region.level}" title="Strength ${region.level}"
        ${region.mode === 'box' ? 'hidden' : ''}>`;
    row.querySelector('.mode').value = region.mode;

    row.addEventListener('click', event => {
      if (!event.target.closest('input, select, button')) {
        store.select(region.id);
        player.seek(region.start);
      }
    });
    row.querySelector('.start').addEventListener('change', event => {
      const time = parseTime(event.target.value);

      if (time !== null) {
        store.setStart(region, time, player.duration);
      }

      store.changed();
    });
    row.querySelector('.end').addEventListener('change', event => {
      const time = parseTime(event.target.value);

      if (time !== null) {
        store.setEnd(region, time, player.duration);
      }

      store.changed();
    });
    row.querySelector('.mode').addEventListener('change', event => {
      store.setMode(region, event.target.value);
      store.changed();
    });
    // Live while dragging; the list isn't re-rendered so the slider keeps the pointer
    row.querySelector('.level').addEventListener('input', event => {
      region.level = Number(event.target.value);
      event.target.title = 'Strength ' + region.level;
      store.changed({ skipList: true });
    });
    row.querySelector('.delete').addEventListener('click', () => store.remove(region.id));
    container.append(row);
  }
}
