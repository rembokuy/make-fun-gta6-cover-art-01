// Neon Coast Cover Studio: wires the editor page. A photo list, a design,
// and a preview canvas; the controls edit the design and every change
// re-paints the cover. Panels are edited right on the canvas: click one to
// select it, drag to move its photo, scroll to zoom it. Photos never leave
// the machine — uploads are read with object URLs and the app makes no
// network request at all.

import { renderCover, titleBandHeight } from './cover.js';
import { GRADES } from './grades.js';
import { LAYOUTS, panelRects, slotCount } from './layouts.js';
import { createHistory, freshDesign, normalisePanels } from './state.js';
import { EXPORT_SIZES, downloadAllSizes, downloadCover } from './export.js';
import { markReady, parseExportSize, sceneFromQuery } from './shots.js';

const el = (id) => document.getElementById(id);
const stage = el('stage');
const stageCtx = stage.getContext('2d');

// Preview sizes per aspect: the canvas itself stays small and the CSS scales
// it; exports render the same design at full post size.
const PREVIEWS = {
  square: { w: 900, h: 900 },
  portrait: { w: 720, h: 900 },
  wide: { w: 960, h: 540 },
};

const photos = []; // [{ img, name, src }]
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

/** Re-paints the preview canvas at the current aspect. */
function paint() {
  const size = PREVIEWS[aspect];
  stage.width = size.w;
  stage.height = size.h;
  renderCover(stageCtx, size.w, size.h, design, photoImages(), selected);
  el('undo').disabled = !history.canUndo;
  el('redo').disabled = !history.canRedo;
}

/** Records the design before a change, for undo. */
function remember() {
  history.push(design);
}

/** The rects of the current layout at preview size, for hit-testing. */
function previewRects() {
  return panelRects(design.layout, stage.width, stage.height, titleBandHeight(stage.height));
}

/** Copies the design's texts and toggles back into the inputs. */
function syncInputs() {
  el('title').value = design.title;
  el('subtitle').value = design.subtitle;
  el('badge').value = design.badge;
  el('grain').checked = design.grain;
  el('vignette').checked = design.vignette;
  el('halftone').checked = design.halftone;
  syncPickerStates();
}

/** Marks the active layout, grade and aspect buttons. */
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

function setStatus(text) {
  el('status').textContent = text;
}

/** Rebuilds the filmstrip thumbnails from the photo list. */
function buildFilmstrip() {
  const strip = el('filmstrip');
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
      remember();
      const slot = design.panels[selected];
      slot.photo = i;
      slot.zoom = 1;
      slot.ox = 0;
      slot.oy = 0;
      paint();
    });
    strip.appendChild(button);
  });
}

/** Builds the layout picker buttons from the layout list. */
function buildLayoutPicker() {
  const wrap = el('layouts');
  for (const layout of LAYOUTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick';
    button.dataset.layout = layout.id;
    button.textContent = layout.name;
    button.addEventListener('click', () => {
      if (design.layout === layout.id) return;
      remember();
      design.layout = layout.id;
      normalisePanels(design);
      selected = Math.min(selected, slotCount(layout.id) - 1);
      syncPickerStates();
      paint();
    });
    wrap.appendChild(button);
  }
}

/** Builds the grade swatch buttons from the grade list. */
function buildGradePicker() {
  const wrap = el('grades');
  for (const grade of GRADES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.grade = grade.id;
    const stops = grade.stops;
    const first = stops[0].slice(1);
    const mid = stops[Math.floor(stops.length / 2)].slice(1);
    const last = stops[stops.length - 1].slice(1);
    button.style.background = `linear-gradient(135deg, rgb(${first.join(',')}), rgb(${mid.join(',')}) 55%, rgb(${last.join(',')}))`;
    button.title = grade.name;
    const label = document.createElement('span');
    label.textContent = grade.name;
    button.appendChild(label);
    button.addEventListener('click', () => {
      if (design.grade === grade.id) return;
      remember();
      design.grade = grade.id;
      syncPickerStates();
      paint();
    });
    wrap.appendChild(button);
  }
}

/** Adds a loaded photo to the list and drops it into an empty selected panel. */
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

// Uploads: reads each chosen file and adds it as a photo.
el('upload').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  if (files.length === 0) return;
  remember();
  for (const file of files) {
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      addPhoto(img, file.name, url);
    } catch {
      setStatus(`Could not read ${file.name}.`);
    }
  }
  paint();
  event.target.value = '';
});

// Fill every panel with the selected panel's photo.
el('fill-all').addEventListener('click', () => {
  const photo = design.panels[selected].photo;
  if (photo === -1) return;
  remember();
  for (const slot of design.panels) {
    slot.photo = photo;
    slot.zoom = 1;
    slot.ox = 0;
    slot.oy = 0;
  }
  paint();
});

// Clear the selected panel back to an empty slot.
el('clear-panel').addEventListener('click', () => {
  remember();
  design.panels[selected] = { photo: -1, zoom: 1, ox: 0, oy: 0 };
  paint();
});

// Caption inputs: live-paint while typing, checkpoint once on change.
for (const [id, key] of [['title', 'title'], ['subtitle', 'subtitle'], ['badge', 'badge']]) {
  const input = el(id);
  input.addEventListener('input', () => {
    design[key] = input.value;
    paint();
  });
  input.addEventListener('change', () => {
    history.push(design);
    paint();
  });
}

// Finish toggles.
for (const key of ['grain', 'vignette', 'halftone']) {
  el(key).addEventListener('change', (event) => {
    remember();
    design[key] = event.target.checked;
    paint();
  });
}

// Aspect picker.
document.querySelectorAll('#aspects .pick').forEach((button) => {
  button.addEventListener('click', () => {
    aspect = button.dataset.aspect;
    syncPickerStates();
    paint();
  });
});

// Undo / redo, buttons and keyboard.
function stepBack() {
  const prev = history.undo(design);
  if (!prev) return;
  design = prev;
  selected = Math.min(selected, slotCount(design.layout) - 1);
  syncInputs();
  paint();
}
function stepForward() {
  const next = history.redo(design);
  if (!next) return;
  design = next;
  selected = Math.min(selected, slotCount(design.layout) - 1);
  syncInputs();
  paint();
}
el('undo').addEventListener('click', stepBack);
el('redo').addEventListener('click', stepForward);
document.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod || event.key.toLowerCase() !== 'z') return;
  if (event.target.matches('input, textarea')) return;
  event.preventDefault();
  if (event.shiftKey) stepForward();
  else stepBack();
});

// Export actions.
el('export-all').addEventListener('click', async () => {
  setStatus('Exporting three sizes…');
  const saved = await downloadAllSizes(design, photoImages(), (name) => {
    setStatus(`Saved ${name}…`);
  });
  setStatus(saved.length === 3 ? `Saved ${saved.join(', ')}.` : 'Export finished.');
});
for (const size of EXPORT_SIZES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pick';
  button.textContent = size.label;
  button.addEventListener('click', async () => {
    await downloadCover(design, photoImages(), size.w, size.h);
    setStatus(`Saved neon-coast-${size.w}x${size.h}.png.`);
  });
  el('export-one').appendChild(button);
}

// Canvas editing: click to select a panel, drag to pan its photo, scroll to zoom.
let drag = null;
let wheelBurst = null;

function canvasPoint(event) {
  const rect = stage.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * stage.width,
    y: ((event.clientY - rect.top) / rect.height) * stage.height,
  };
}

function hitPanel(point) {
  const rects = previewRects();
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
  }
  return -1;
}

stage.addEventListener('pointerdown', (event) => {
  const point = canvasPoint(event);
  const hit = hitPanel(point);
  if (hit === -1) return;
  if (hit !== selected) selected = hit;
  remember();
  drag = { panel: hit, last: point };
  stage.setPointerCapture(event.pointerId);
  paint();
});

stage.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const point = canvasPoint(event);
  const rect = previewRects()[drag.panel];
  const slot = design.panels[drag.panel];
  if (!rect || !slot || slot.photo === -1) return;
  slot.ox += (point.x - drag.last.x) / rect.w;
  slot.oy += (point.y - drag.last.y) / rect.h;
  slot.ox = Math.max(-0.6, Math.min(0.6, slot.ox));
  slot.oy = Math.max(-0.6, Math.min(0.6, slot.oy));
  drag.last = point;
  paint();
});

stage.addEventListener('pointerup', () => {
  drag = null;
});

stage.addEventListener('wheel', (event) => {
  event.preventDefault();
  const slot = design.panels[selected];
  if (!slot || slot.photo === -1) return;
  if (!wheelBurst) {
    remember();
    wheelBurst = setTimeout(() => {
      wheelBurst = null;
    }, 450);
  }
  slot.zoom = Math.max(1, Math.min(3.5, slot.zoom * Math.exp(-event.deltaY * 0.0012)));
  paint();
}, { passive: false });

/** Starts the studio: fonts, samples, then the first paint or a shot scene. */
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
  const isShot = query.has('shot');

  // The default samples load first so the cover is never empty.
  const sampleNames = isShot ? scene.photos : ['boulevard', 'pier'];
  for (const name of sampleNames) {
    try {
      const img = await loadImage(`samples/${name}.jpg`);
      photos.push({ img, name, src: `samples/${name}.jpg` });
    } catch {
      // A missing sample leaves its slot empty rather than breaking the app.
    }
  }
  design = freshDesign(photos.length);
  if (isShot) {
    design.layout = scene.layout;
    design.grade = scene.grade;
    design.title = scene.title;
    design.subtitle = scene.subtitle;
    design.badge = scene.badge;
    normalisePanels(design);
    design.panels.forEach((slot, i) => {
      slot.photo = photos.length > 0 ? i % photos.length : -1;
    });
    aspect = PREVIEWS[scene.aspect] ? scene.aspect : 'square';
    if (scene.shot === 'cover') document.body.classList.add('shot-cover');
  }
  syncInputs();
  buildFilmstrip();
  paint();

  if (isShot) {
    const size = parseExportSize(scene.autoexport);
    if (size) {
      await downloadCover(design, photoImages(), size.w, size.h);
      window.__exportTriggered = true;
    }
    markReady();
  }
}

start();
