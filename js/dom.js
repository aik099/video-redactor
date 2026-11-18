export const $ = selector => document.querySelector(selector);

export function setStatus(text) {
  $('#status').textContent = text;
}
