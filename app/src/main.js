// Bootstrap: wires the controls to the state, re-renders the
// preview canvas on every change, and exposes a small handle
// (window.__studio) the screenshot and probe scripts drive.

import { freshState, createHistory, snapshot } from './state.js';
import { PHOTOS, loadAllPhotos } from './photos.js';
import { LAYOUTS } from './layouts.js';
import { PALETTES } from './palettes.js';
import { drawCover } from './render.js';
import { EXPORT_SIZES, downloadPNG, exportAllSizes, exportDataURL } from './export.js';

const state = freshState();
const history = createHistory(40);
let images = [];
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const $ = (id) => document.getElementById(id);

function render() {
  const stage = $('stage');
  drawCover(stage, state, images, 1080, 1080);
  document.querySelectorAll('[data-layout]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.layout === state.layout);
    btn.setAttribute('aria-pressed', String(btn.dataset.layout === state.layout));
  });
  document.querySelectorAll('[data-palette]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.palette === state.palette);
    btn.setAttribute('aria-pressed', String(btn.dataset.palette === state.palette));
  });
  document.querySelectorAll('[data-photo]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.photo) === state.photo);
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.photo) === state.photo));
  });
  $('undo-btn').disabled = !history.canUndo();
  $('status').textContent = 'Photo: ' + PHOTOS[state.photo].label
    + ' · Layout: ' + state.layout
    + ' · Palette: ' + state.palette
    + ' · Undo steps: ' + history.depth();
}

function change(mutator) {
  history.push(state);
  mutator();
  render();
}

function buildButtons() {
  const photoBox = $('photo-picker');
  PHOTOS.forEach((photo, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'photo-' + photo.id;
    btn.dataset.photo = String(index);
    btn.className = 'pick photo-pick';
    const thumb = document.createElement('img');
    thumb.src = photo.src;
    thumb.alt = photo.label;
    const cap = document.createElement('span');
    cap.textContent = photo.label;
    btn.append(thumb, cap);
    btn.addEventListener('click', () => change(() => { state.photo = index; }));
    photoBox.appendChild(btn);
  });

  const layoutBox = $('layout-picker');
  LAYOUTS.forEach((layout) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'layout-' + layout.id;
    btn.dataset.layout = layout.id;
    btn.className = 'pick';
    btn.innerHTML = '<strong></strong><span></span>';
    btn.querySelector('strong').textContent = layout.label;
    btn.querySelector('span').textContent = layout.hint;
    btn.addEventListener('click', () => change(() => { state.layout = layout.id; }));
    layoutBox.appendChild(btn);
  });

  const paletteBox = $('palette-picker');
  PALETTES.forEach((palette) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'palette-' + palette.id;
    btn.dataset.palette = palette.id;
    btn.className = 'pick swatch-pick';
    btn.innerHTML = '<i></i><strong></strong><span></span>';
    btn.querySelector('i').style.background = 'linear-gradient(135deg,' + palette.accent + ',' + palette.accent2 + ')';
    btn.querySelector('strong').textContent = palette.label;
    btn.querySelector('span').textContent = palette.hint;
    btn.addEventListener('click', () => change(() => { state.palette = palette.id; }));
    paletteBox.appendChild(btn);
  });
}

function wireInputs() {
  const titleInput = $('title-input');
  const taglineInput = $('tagline-input');
  titleInput.value = state.title;
  taglineInput.value = state.tagline;
  titleInput.addEventListener('input', () => {
    state.title = titleInput.value.toUpperCase() || 'NEON COAST';
    render();
  });
  titleInput.addEventListener('focus', () => { history.push(state); render(); });
  taglineInput.addEventListener('input', () => {
    state.tagline = taglineInput.value || 'A VICE CITY STORY';
    render();
  });
  taglineInput.addEventListener('focus', () => { history.push(state); render(); });

  $('undo-btn').addEventListener('click', () => {
    const previous = history.undo(state);
    Object.assign(state, previous);
    titleInput.value = state.title;
    taglineInput.value = state.tagline;
    render();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      $('undo-btn').click();
    }
  });
}

function wireExports() {
  EXPORT_SIZES.forEach((size) => {
    const btn = $('export-' + size.width + 'x' + size.height);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const result = await downloadPNG(state, images, size.width, size.height);
        $('status').textContent = 'Exported ' + result.name + ' (' + result.bytes + ' bytes)';
      } catch (err) {
        $('status').textContent = 'Export failed: ' + err.message;
      }
      btn.disabled = false;
      render();
    });
  });
  $('export-all').addEventListener('click', async () => {
    const btn = $('export-all');
    btn.disabled = true;
    try {
      const done = await exportAllSizes(state, images, (result) => {
        $('status').textContent = 'Exported ' + result.name;
      });
      $('status').textContent = 'Exported all ' + done.length + ' sizes';
    } catch (err) {
      $('status').textContent = 'Export-all failed: ' + err.message;
    }
    btn.disabled = false;
    render();
  });
}

async function boot() {
  buildButtons();
  wireInputs();
  wireExports();
  try {
    images = await loadAllPhotos();
    await document.fonts.ready;
    render();
    readyResolve(true);
  } catch (err) {
    $('status').textContent = 'Could not load photos: ' + err.message;
    readyResolve(false);
  }
}

window.__studio = {
  ready,
  get state() { return snapshot(state); },
  get undoDepth() { return history.depth(); },
  setLayout(id) { change(() => { state.layout = id; }); },
  setPalette(id) { change(() => { state.palette = id; }); },
  setPhoto(index) { change(() => { state.photo = index; }); },
  setTitle(text) { change(() => { state.title = text.toUpperCase(); }); $('title-input').value = state.title; },
  undo() { $('undo-btn').click(); },
  renderPreview() { render(); },
  exportDataURL(width, height, mime, quality) {
    return exportDataURL(state, images, width, height, mime, quality);
  },
  exportPNG(width, height) { return downloadPNG(state, images, width, height); },
  exportAll() { return exportAllSizes(state, images); },
};

document.addEventListener('DOMContentLoaded', boot);
