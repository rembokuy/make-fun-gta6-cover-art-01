// Neon Coast Cover Studio: wires the editor page. A photo list, a design, and
// a preview canvas; the controls edit the design and every change re-renders
// the cover. Panels are edited right on the canvas: click one to select it,
// drag to move its photo, scroll to zoom it. Photos never leave the machine —
// uploads are read with object URLs and the app makes no network request.

import { renderCover, titleBandHeight } from './cover.js';
import { GRADES } from './grades.js';
import { LAYOUTS, panelRects, slotCount } from './layouts.js';
import { createHistory, freshDesign, normalisePanels } from './state.js';
import { EXPORT_SIZES, downloadAllSizes, downloadCover } from './export.js';
import { markReady, parseExportSize, sceneFromQuery } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');

const ASPECTS = {
  square: { w: 900, h: 900, label: 'Square' },
  portrait: { w: 720, h: 900, label: 'Portrait' },
  wide: { w: 960, h: 540, label: 'Wide' },
};

const photos = []; // [{ img, name }]
let design = freshDesign(0);
let aspect = 'square';
let selected = 0;
const history = createHistory();

/** Loads an image from a URL, resolving once it can be drawn. */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** The images in photo order, for the renderer. */
function photoImages() {
  return photos.map((p) => p.img);
}

/** Re-renders the preview canvas at the current aspect. */
function render() {
  const size = ASPECTS[aspect];
  canvas.width = size.w;
  canvas.height = size.h;
  renderCover(ctx, size.w, size.h, design, photoImages(), selected);
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
}

/** Records the design before a change, for undo. */
function checkpoint() {
  history.push(design);
}

/** The rects of the current layout at preview size, for hit-testing. */
function currentRects() {
  return panelRects(design.layout, canvas.width, canvas.height, titleBandHeight(canvas.height));
}

/** Builds the filmstrip thumbnails from the photo list. */
function buildFilmstrip() {
  const strip = $('filmstrip');
  strip.innerHTML = '';
  photos.forEach((photo, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.title = `${photo.name} — click to put it in the selected panel`;
    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.name;
    button.appendChild(img);
    button.addEventListener('click', () => {
      checkpoint();
      design.panels[selected].photo = i;
      design.panels[selected].zoom = 1;
      design.panels[selected].ox = 0;
      design.panels[selected].oy = 0;
      render();
    });
    strip.appendChild(button);
  });
}

/** Builds the layout picker buttons from the layout list. */
function buildLayoutPicker() {
  const wrap = $('layouts');
  LAYOUTS.forEach((layout) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick';
    button.dataset.layout = layout.id;
    button.textContent = layout.name;
    button.addEventListener('click', () => {
      if (design.layout === layout.id) return;
      checkpoint();
      design.layout = layout.id;
      normalisePanels(design);
      selected = Math.min(selected, slotCount(layout.id) - 1);
      syncPickerStates();
      render();
    });
    wrap.appendChild(button);
  });
}

/** Builds the grade swatch buttons from the grade list. */
function buildGradePicker() {
  const wrap = $('grades');
  GRADES.forEach((grade) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.grade = grade.id;
    const stops = grade.stops;
    const first = stops[0][1];
    const mid = stops[Math.floor(stops.length / 2)][1];
    const last = stops[stops.length - 1][1];
    button.style.background = `linear-gradient(135deg, rgb(${first.join(',')}), rgb(${mid.join(',')}) 55%, rgb(${last.join(',')}))`;
    button.title = grade.name;
    const label = document.createElement('span');
    label.textContent = grade.name;
    button.appendChild(label);
    button.addEventListener('click', () => {
      if (design.grade === grade.id) return;
      checkpoint();
      design.grade = grade.id;
      syncPickerStates();
      render();
    });
    wrap.appendChild(button);
  });
}

/** Marks the active layout and grade buttons. */
function syncPickerStates() {
  document.querySelectorAll('#layouts .pick').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === design.layout);
  });
  document.querySelectorAll('#grades .swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === design.grade);
  });
  document.querySelectorAll('#aspects .pick').forEach((b) => {
    b.classList.toggle('active', b.dataset.aspect === aspect);
  });
}

/** Adds a loaded photo to the list and puts it in the selected panel. */
function addPhoto(img, name, src) {
  photos.push({ img, name, src });
  const slot = design.panels[selected];
  if (slot.photo === -1) {
    slot.photo = photos.length - 1;
    slot.zoom = 1;
    slot.ox = 0;
    slot.oy = 0;
  }
  buildFilmstrip();
}

/** Uploads: reads each chosen file and adds it as a photo. */
$('upload').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  if (files.length === 0) return;
  checkpoint();
  for (const file of files) {
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      addPhoto(img, file.name, url);
    } catch {
      setStatus(`Could not read ${file.name}.`);
    }
  }
  render();
  event.target.value = '';
});

/** Fill every panel with the selected panel's photo. */
$('fill-all').addEventListener('click', () => {
  const photo = design.panels[selected].photo;
  if (photo === -1) return;
  checkpoint();
  design.panels.forEach((slot) => {
    slot.photo = photo;
    slot.zoom = 1;
    slot.ox = 0;
    slot.oy = 0;
  });
  render();
});

/** Clear the selected panel back to an empty slot. */
$('clear-panel').addEventListener('click', () => {
  checkpoint();
  design.panels[selected] = { photo: -1, zoom: 1, ox: 0, oy: 0 };
  render();
});

// Caption inputs: live-render while typing, checkpoint once on change.
for (const [id, key] of [['title', 'title'], ['subtitle', 'subtitle'], ['badge', 'badge']]) {
  const input = $(id);
  input.addEventListener('input', () => {
    design[key] = input.value;
    render();
  });
  input.addEventListener('change', () => {
    history.push(design);
    render();
  });
}

// Finish toggles.
for (const key of ['grain', 'vignette', 'halftone']) {
  $(key).addEventListener('change', (event) => {
    checkpoint();
    design[key] = event.target.checked;
    render();
  });
}

// Aspect picker.
document.querySelectorAll('#aspects .pick').forEach((button) => {
  button.addEventListener('click', () => {
    aspect = button.dataset.aspect;
    syncPickerStates();
    render();
  });
});

// Undo / redo, buttons and keyboard.
$('undo').addEventListener('click', () => {
  const prev = history.undo(design);
  if (prev) {
    design = prev;
    selected = Math.min(selected, slotCount(design.layout) - 1);
    syncInputs();
    render();
  }
});
$('redo').addEventListener('click', () => {
  const next = history.redo(design);
  if (next) {
    design = next;
    selected = Math.min(selected, slotCount(design.layout) - 1);
    syncInputs();
    render();
  }
});
document.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod || event.key.toLowerCase() !== 'z') return;
  if (event.target.matches('input, textarea')) return;
  event.preventDefault();
  if (event.shiftKey) $('redo').click();
  else $('undo').click();
});

/** Copies the design's texts and toggles back into the inputs. */
function syncInputs() {
  $('title').value = design.title;
  $('subtitle').value = design.subtitle;
  $('badge').value = design.badge;
  $('grain').checked = design.grain;
  $('vignette').checked = design.vignette;
  $('halftone').checked = design.halftone;
  syncPickerStates();
}

function setStatus(text) {
  $('status').textContent = text;
}

// Export actions.
$('export-all').addEventListener('click', async () => {
  setStatus('Exporting three sizes…');
  const saved = await downloadAllSizes(design, photoImages(), (name) => {
    setStatus(`Saved ${name}…`);
  });
  setStatus(saved.length === 3 ? `Saved ${saved.join(', ')}.` : 'Export finished.');
});
EXPORT_SIZES.forEach((size) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pick';
  button.textContent = size.label;
  button.addEventListener('click', async () => {
    await downloadCover(design, photoImages(), size.w, size.h);
    setStatus(`Saved neon-coast-${size.w}x${size.h}.png.`);
  });
  $('export-one').appendChild(button);
});

// Canvas editing: click to select a panel, drag to pan its photo, scroll to zoom.
let drag = null;
let wheelBurst = null;

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function hitPanel(point) {
  const rects = currentRects();
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
  }
  return -1;
}

canvas.addEventListener('pointerdown', (event) => {
  const point = canvasPoint(event);
  const hit = hitPanel(point);
  if (hit === -1) return;
  if (hit !== selected) selected = hit;
  checkpoint();
  drag = { panel: hit, last: point };
  canvas.setPointerCapture(event.pointerId);
  render();
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const point = canvasPoint(event);
  const rects = currentRects();
  const rect = rects[drag.panel];
  const slot = design.panels[drag.panel];
  if (!rect || !slot || slot.photo === -1) return;
  slot.ox += (point.x - drag.last.x) / rect.w;
  slot.oy += (point.y - drag.last.y) / rect.h;
  slot.ox = Math.max(-0.6, Math.min(0.6, slot.ox));
  slot.oy = Math.max(-0.6, Math.min(0.6, slot.oy));
  drag.last = point;
  render();
});

canvas.addEventListener('pointerup', () => {
  drag = null;
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const slot = design.panels[selected];
  if (!slot || slot.photo === -1) return;
  if (!wheelBurst) {
    checkpoint();
    wheelBurst = setTimeout(() => {
      wheelBurst = null;
    }, 450);
  }
  slot.zoom = Math.max(1, Math.min(3.5, slot.zoom * Math.exp(-event.deltaY * 0.0012)));
  render();
}, { passive: false });

/** Starts the studio: fonts, samples, then the first render or a shot scene. */
async function start() {
  buildLayoutPicker();
  buildGradePicker();
  try {
    await Promise.all([
      document.fonts.load('40px Anton'),
      document.fonts.load('40px Pacifico'),
    ]);
    await document.fonts.ready;
  } catch {
    // The cover still draws with fallback fonts if a vendored font fails.
  }

  const query = new URLSearchParams(location.search);
  const scene = sceneFromQuery(query);
  const hasShot = query.has('shot');

  // The default samples load first so the cover is never empty.
  const sampleNames = hasShot ? scene.photos : ['boulevard', 'pier'];
  for (const name of sampleNames) {
    try {
      const img = await loadImage(`samples/${name}.jpg`);
      photos.push({ img, name, src: `samples/${name}.jpg` });
    } catch {
      // A missing sample leaves its slot empty rather than breaking the app.
    }
  }
  design = freshDesign(photos.length);
  if (hasShot) {
    design.layout = scene.layout;
    design.grade = scene.grade;
    design.title = scene.title;
    design.subtitle = scene.subtitle;
    design.badge = scene.badge;
    normalisePanels(design);
    design.panels.forEach((slot, i) => {
      slot.photo = photos.length > 0 ? i % photos.length : -1;
    });
    aspect = ASPECTS[scene.aspect] ? scene.aspect : 'square';
    if (scene.shot === 'cover') document.body.classList.add('shot-cover');
  }
  syncInputs();
  buildFilmstrip();
  render();

  if (hasShot) {
    const size = parseExportSize(scene.autoexport);
    if (size) {
      await downloadCover(design, photoImages(), size.w, size.h);
      window.__exportTriggered = true;
    }
    markReady();
  }
}

start();
