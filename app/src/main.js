// The editor wiring: controls, canvas editing, scenes and exports.
//
// Everything the user sees on the page lives here. The design itself is in
// state.js, the painting in cover.js; this file only connects the two to
// the DOM and to the ?shot scenes the screenshot scripts use.
//
// Photos never leave this machine: uploads become object URLs and the
// sample photos are served from this same folder. Nothing here fetches
// anything from the network.

import { LAYOUTS, findLayout, slotCount, panelRects } from './layouts.js';
import { GRADES, findGrade } from './grades.js';
import { freshDesign, normalisePanels, createHistory, snapshot } from './state.js';
import { renderCover, titleBandHeight } from './cover.js';
import { EXPORT_SIZES, downloadCover, downloadAllSizes } from './export.js';
import { sceneFromQuery, parseExportSize, markReady } from './shots.js';

const $ = (id) => document.getElementById(id);

// Preview canvas size per aspect ratio.
const PREVIEW = {
  square: { w: 900, h: 900 },
  portrait: { w: 720, h: 900 },
  wide: { w: 960, h: 540 },
};

const stage = $('stage');
const ctx = stage.getContext('2d');
const statusEl = $('status');

let photos = []; // { img, name } — images loaded from samples or uploads
let design = freshDesign(0);
let selected = 0;
let aspect = 'square';
let sceneMode = false;
const history = createHistory();

function setStatus(text) {
  statusEl.textContent = text;
}

function previewSize() {
  return PREVIEW[aspect] ?? PREVIEW.square;
}

function render() {
  const { w, h } = previewSize();
  if (stage.width !== w) stage.width = w;
  if (stage.height !== h) stage.height = h;
  const images = photos.map((p) => p.img);
  renderCover(ctx, w, h, design, images, sceneMode ? -1 : selected);
  syncUndoButtons();
}

function syncUndoButtons() {
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
}

function syncControls() {
  document.querySelectorAll('#layouts button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === design.layout);
    b.setAttribute('aria-pressed', b.dataset.layout === design.layout ? 'true' : 'false');
  });
  document.querySelectorAll('#grades button').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === design.grade);
    b.setAttribute('aria-pressed', b.dataset.grade === design.grade ? 'true' : 'false');
  });
  document.querySelectorAll('#aspects button').forEach((b) => {
    b.classList.toggle('active', b.dataset.aspect === aspect);
    b.setAttribute('aria-pressed', b.dataset.aspect === aspect ? 'true' : 'false');
  });
  $('title').value = design.title;
  $('subtitle').value = design.subtitle;
  $('badge').value = design.badge;
  $('grain').checked = design.grain;
  $('vignette').checked = design.vignette;
  $('halftone').checked = design.halftone;
  document.querySelectorAll('#filmstrip img').forEach((img, i) => {
    img.classList.toggle('in-panel', design.panels[selected]?.photo === i);
  });
}

// ------------------------------------------------------------------ photos

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cannot load ${src}`));
    img.src = src;
  });
}

async function loadSamples(names) {
  for (const name of names) {
    try {
      const img = await loadImage(`./samples/${name}.jpg`);
      photos.push({ img, name });
    } catch {
      setStatus(`Sample photo ${name} could not be loaded.`);
    }
  }
  buildFilmstrip();
}

function buildFilmstrip() {
  const strip = $('filmstrip');
  strip.innerHTML = '';
  photos.forEach((photo, i) => {
    const thumb = document.createElement('img');
    thumb.src = photo.img.src;
    thumb.alt = photo.name;
    thumb.width = 64;
    thumb.height = 64;
    thumb.addEventListener('click', () => {
      history.push(design);
      const panel = design.panels[selected];
      if (!panel) return;
      panel.photo = i;
      panel.zoom = 1;
      panel.ox = 0;
      panel.oy = 0;
      setStatus(`Put ${photo.name} in panel ${selected + 1}.`);
      syncControls();
      render();
    });
    strip.appendChild(thumb);
  });
}

// ------------------------------------------------------------------ pickers

function buildPickers() {
  const layoutsEl = $('layouts');
  for (const layout of LAYOUTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = layout.name;
    button.dataset.layout = layout.id;
    button.addEventListener('click', () => {
      history.push(design);
      design.layout = layout.id;
      normalisePanels(design, slotCount(layout.id));
      if (selected >= slotCount(layout.id)) selected = 0;
      setStatus(`Layout: ${layout.name}.`);
      syncControls();
      render();
    });
    layoutsEl.appendChild(button);
  }

  const gradesEl = $('grades');
  for (const grade of GRADES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.grade = grade.id;
    button.title = grade.name;
    button.setAttribute('aria-label', grade.name);
    const [first, mid, last] = [grade.stops[0], grade.stops[2], grade.stops[4]];
    const css = (stop) => `rgb(${stop[1]},${stop[2]},${stop[3]})`;
    button.style.background = `linear-gradient(135deg, ${css(first)}, ${css(mid)}, ${css(last)})`;
    const label = document.createElement('span');
    label.textContent = grade.name;
    button.appendChild(label);
    button.addEventListener('click', () => {
      history.push(design);
      design.grade = grade.id;
      setStatus(`Grade: ${grade.name}.`);
      syncControls();
      render();
    });
    gradesEl.appendChild(button);
  }

  const aspectsEl = $('aspects');
  for (const size of EXPORT_SIZES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = size.name;
    button.dataset.aspect = size.id;
    button.addEventListener('click', () => {
      aspect = size.id;
      setStatus(`Preview: ${size.name} ${size.w}×${size.h}.`);
      syncControls();
      render();
    });
    aspectsEl.appendChild(button);
  }

  const oneEl = $('export-one');
  for (const size of EXPORT_SIZES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `PNG ${size.name}`;
    button.addEventListener('click', async () => {
      setStatus(`Exporting ${size.name}…`);
      const name = await downloadCover(size, design, photos.map((p) => p.img));
      setStatus(`Saved ${name}.`);
    });
    oneEl.appendChild(button);
  }
}

// ------------------------------------------------------------------ controls

function bindControls() {
  $('upload').addEventListener('change', (event) => {
    const files = [...event.target.files];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        photos.push({ img, name: file.name.replace(/\.[^.]+$/, '') });
        buildFilmstrip();
        render();
      };
      img.src = url;
    }
    event.target.value = '';
    if (files.length > 0) setStatus(`Added ${files.length} photo${files.length > 1 ? 's' : ''}.`);
  });

  $('fill-all').addEventListener('click', () => {
    const panel = design.panels[selected];
    if (!panel || panel.photo < 0) {
      setStatus('Select a panel with a photo first.');
      return;
    }
    history.push(design);
    for (const p of design.panels) p.photo = panel.photo;
    setStatus('Filled all panels with the selected photo.');
    render();
  });

  $('clear-panel').addEventListener('click', () => {
    const panel = design.panels[selected];
    if (!panel) return;
    history.push(design);
    panel.photo = -1;
    panel.zoom = 1;
    panel.ox = 0;
    panel.oy = 0;
    setStatus(`Cleared panel ${selected + 1}.`);
    syncControls();
    render();
  });

  // Caption fields: redraw as you type; the history entry is the design
  // as it was when the field got focus, stored on focus and pushed when
  // the edit is committed (change), so undo restores the old caption.
  for (const [id, key] of [['title', 'title'], ['subtitle', 'subtitle'], ['badge', 'badge']]) {
    const input = $(id);
    let before = null;
    input.addEventListener('focus', () => {
      before = snapshot(design);
    });
    input.addEventListener('input', () => {
      design[key] = input.value;
      render();
    });
    input.addEventListener('change', () => {
      if (before) history.push(before);
      before = null;
      syncUndoButtons();
    });
  }

  for (const [id, key] of [['grain', 'grain'], ['vignette', 'vignette'], ['halftone', 'halftone']]) {
    $(id).addEventListener('change', (event) => {
      history.push(design);
      design[key] = event.target.checked;
      render();
    });
  }

  $('undo').addEventListener('click', doUndo);
  $('redo').addEventListener('click', doRedo);

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) doRedo();
      else doUndo();
    }
  });

  $('export-all').addEventListener('click', async () => {
    setStatus('Exporting all 3 sizes…');
    const names = await downloadAllSizes(design, photos.map((p) => p.img), (name) => {
      setStatus(`Saved ${name}.`);
    });
    setStatus(`Exported ${names.length} files: ${names.join(', ')}.`);
  });
}

function doUndo() {
  const previous = history.undo(design);
  if (previous) {
    design = previous;
    normalisePanels(design, slotCount(design.layout));
    setStatus('Undid.');
    syncControls();
    render();
  }
}

function doRedo() {
  const next = history.redo(design);
  if (next) {
    design = next;
    normalisePanels(design, slotCount(design.layout));
    setStatus('Redid.');
    syncControls();
    render();
  }
}

// ------------------------------------------------------------------ canvas editing

function canvasPoint(event) {
  const box = stage.getBoundingClientRect();
  const { w, h } = previewSize();
  return {
    x: ((event.clientX - box.left) / box.width) * w,
    y: ((event.clientY - box.top) / box.height) * h,
  };
}

function currentRects() {
  const { w, h } = previewSize();
  const bandH = design.layout === 'full' ? 0 : titleBandHeight(h);
  return panelRects(design.layout, w, h, bandH);
}

function hitPanel(point) {
  const rects = currentRects();
  // Topmost first: later panels paint over earlier ones.
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
  }
  return -1;
}

function bindCanvas() {
  let dragging = false;
  let dragPanel = -1;
  let lastX = 0;
  let lastY = 0;
  let moved = false;
  let lastWheelPush = 0;

  stage.addEventListener('pointerdown', (event) => {
    const point = canvasPoint(event);
    const hit = hitPanel(point);
    if (hit < 0) return;
    selected = hit;
    dragPanel = hit;
    dragging = true;
    moved = false;
    lastX = point.x;
    lastY = point.y;
    history.push(design);
    stage.setPointerCapture(event.pointerId);
    stage.style.cursor = 'grabbing';
    syncControls();
    render();
  });

  stage.addEventListener('pointermove', (event) => {
    if (!dragging || dragPanel < 0) return;
    const point = canvasPoint(event);
    const rects = currentRects();
    const rect = rects[dragPanel];
    const panel = design.panels[dragPanel];
    if (!rect || !panel || panel.photo < 0) return;
    panel.ox = Math.max(-0.6, Math.min(0.6, panel.ox + (point.x - lastX) / rect.w));
    panel.oy = Math.max(-0.6, Math.min(0.6, panel.oy + (point.y - lastY) / rect.h));
    if (point.x !== lastX || point.y !== lastY) moved = true;
    lastX = point.x;
    lastY = point.y;
    render();
  });

  const endDrag = () => {
    dragging = false;
    dragPanel = -1;
    stage.style.cursor = 'grab';
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    const point = canvasPoint(event);
    const hit = hitPanel(point);
    if (hit < 0) return;
    const panel = design.panels[hit];
    if (!panel || panel.photo < 0) return;
    // One history entry per scroll burst, not one per wheel tick.
    const now = Date.now();
    if (now - lastWheelPush > 450) {
      history.push(design);
      lastWheelPush = now;
    }
    const factor = Math.exp(-event.deltaY * 0.0012);
    panel.zoom = Math.max(1, Math.min(3.5, panel.zoom * factor));
    selected = hit;
    syncControls();
    render();
  }, { passive: false });
}

// ------------------------------------------------------------------ boot

async function boot() {
  buildPickers();
  bindControls();
  bindCanvas();

  // Load the display fonts; the canvas falls back to system fonts when
  // they cannot load, so a failure never blocks the editor.
  try {
    await document.fonts.load('40px Anton');
    await document.fonts.load('40px Pacifico');
  } catch {
    // Fallbacks in the canvas font stacks cover this.
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has('shot')) {
    sceneMode = true;
    const scene = sceneFromQuery(window.location.search);
    await loadSamples(scene.photos);
    design = freshDesign(photos.length);
    design.layout = findLayout(scene.layout).id;
    design.grade = findGrade(scene.grade).id;
    design.title = scene.title;
    design.subtitle = scene.subtitle;
    design.badge = scene.badge;
    aspect = PREVIEW[scene.aspect] ? scene.aspect : 'square';
    normalisePanels(design, slotCount(design.layout));
    selected = -1;
    if (scene.shot === 'cover') document.body.classList.add('shot-cover');
    syncControls();
    render();
    if (scene.autoexport) {
      const size = parseExportSize(scene.autoexport);
      if (size) {
        await downloadCover(size, design, photos.map((p) => p.img));
        window.__exportTriggered = true;
      }
    }
    markReady();
    return;
  }

  await loadSamples(['boulevard', 'pier']);
  design = freshDesign(photos.length);
  normalisePanels(design, slotCount(design.layout));
  syncControls();
  render();
  setStatus('Ready.');
}

boot();
