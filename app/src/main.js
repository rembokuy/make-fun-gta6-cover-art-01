// Editor wiring for Neon Coast Cover Studio.
// Photos never leave this machine: uploads and samples are object URLs
// and local files, and the app makes no network request of its own.

import { renderCover, titleBandHeight } from './cover.js';
import { downloadAllSizes, downloadCover, EXPORT_SIZES } from './export.js';
import { findGrade, GRADES } from './grades.js';
import { findLayout, LAYOUTS, panelRects, slotCount } from './layouts.js';
import { sceneFromQuery, parseExportSize, markReady } from './shots.js';
import { createHistory, freshDesign, normalisePanels, snapshot } from './state.js';

const PREVIEW = {
  square: { w: 900, h: 900 },
  portrait: { w: 720, h: 900 },
  wide: { w: 960, h: 540 },
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const scene = sceneFromQuery(window.location.search);
const inShotMode = new URLSearchParams(window.location.search).has('shot');

let photos = [];
let design = freshDesign(0);
let selected = 0;
let aspect = scene.aspect in PREVIEW ? scene.aspect : 'square';
const history = createHistory(60);

function setStatus(message) {
  statusEl.textContent = message;
}

function draw() {
  const size = PREVIEW[aspect];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  renderCover(ctx, size.w, size.h, design, photos, selected);
}

function syncControls() {
  document.querySelectorAll('#layouts button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.layout === design.layout);
  });
  document.querySelectorAll('#grades button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.grade === design.grade);
  });
  document.querySelectorAll('#aspects button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.aspect === aspect);
  });
  document.getElementById('title').value = design.title;
  document.getElementById('subtitle').value = design.subtitle;
  document.getElementById('badge').value = design.badge;
  document.getElementById('grain').checked = design.grain;
  document.getElementById('vignette').checked = design.vignette;
  document.getElementById('halftone').checked = design.halftone;
  document.getElementById('undo').disabled = !history.canUndo;
  document.getElementById('redo').disabled = !history.canRedo;
  document.querySelectorAll('#filmstrip img').forEach((img, i) => {
    img.classList.toggle('selected-photo', design.panels[selected]?.photo === i);
  });
}

function commit() {
  normalisePanels(design, slotCount(design.layout));
  draw();
  syncControls();
}

// --- photos ---------------------------------------------------------------

function loadPhoto(src, name) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadSamples(names) {
  const loaded = [];
  for (const name of names) {
    const img = await loadPhoto(`./samples/${name}.jpg`, name);
    if (img) loaded.push(img);
  }
  return loaded;
}

function rebuildFilmstrip() {
  const strip = document.getElementById('filmstrip');
  strip.innerHTML = '';
  photos.forEach((photo, i) => {
    const thumb = document.createElement('img');
    thumb.src = photo.src;
    thumb.alt = `Photo ${i + 1}`;
    thumb.width = 64;
    thumb.height = 64;
    thumb.addEventListener('click', () => {
      history.push(design);
      normalisePanels(design, slotCount(design.layout));
      design.panels[selected] = { photo: i, zoom: 1, ox: 0, oy: 0 };
      commit();
      setStatus(`Photo ${i + 1} placed in panel ${selected + 1}.`);
    });
    strip.appendChild(thumb);
  });
}

// --- pickers ---------------------------------------------------------------

function buildPickers() {
  const layoutBox = document.getElementById('layouts');
  LAYOUTS.forEach((layout) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = layout.name;
    btn.dataset.layout = layout.id;
    btn.addEventListener('click', () => {
      if (design.layout === layout.id) return;
      history.push(design);
      design.layout = layout.id;
      normalisePanels(design, slotCount(layout.id));
      selected = 0;
      commit();
      setStatus(`Layout: ${layout.name}.`);
    });
    layoutBox.appendChild(btn);
  });

  const gradeBox = document.getElementById('grades');
  GRADES.forEach((grade) => {
    const stops = grade.stops;
    const first = stops[0];
    const mid = stops[Math.floor(stops.length / 2)];
    const last = stops[stops.length - 1];
    const rgb = (s) => `rgb(${s[1]}, ${s[2]}, ${s[3]})`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.grade = grade.id;
    btn.title = grade.name;
    btn.style.background = `linear-gradient(135deg, ${rgb(first)}, ${rgb(mid)}, ${rgb(last)})`;
    const label = document.createElement('span');
    label.textContent = grade.name;
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      if (design.grade === grade.id) return;
      history.push(design);
      design.grade = grade.id;
      commit();
      setStatus(`Grade: ${grade.name}.`);
    });
    gradeBox.appendChild(btn);
  });

  const oneBox = document.getElementById('export-one');
  EXPORT_SIZES.forEach((size) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `Export ${size.name} PNG`;
    btn.addEventListener('click', async () => {
      try {
        const name = await downloadCover(design, photos, size.w, size.h);
        setStatus(`Saved ${name}.`);
      } catch (err) {
        setStatus(`Export failed: ${err.message}`);
      }
    });
    oneBox.appendChild(btn);
  });
}

// --- controls --------------------------------------------------------------

function bindControls() {
  document.getElementById('upload').addEventListener('change', async (event) => {
    const files = [...event.target.files].filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      const img = await loadPhoto(URL.createObjectURL(file), file.name);
      if (img) photos.push(img);
    }
    if (files.length > 0) {
      design = freshDesign(photos.length);
      selected = 0;
      rebuildFilmstrip();
      commit();
      setStatus(`${files.length} photo${files.length > 1 ? 's' : ''} added.`);
    }
    event.target.value = '';
  });

  document.getElementById('fill-all').addEventListener('click', () => {
    const photo = design.panels[selected]?.photo ?? -1;
    if (photo < 0) {
      setStatus('Selected panel is empty — pick a photo first.');
      return;
    }
    history.push(design);
    normalisePanels(design, slotCount(design.layout));
    design.panels.forEach((panel) => {
      panel.photo = photo;
      panel.zoom = 1;
      panel.ox = 0;
      panel.oy = 0;
    });
    commit();
    setStatus('All panels filled with the selected photo.');
  });

  document.getElementById('clear-panel').addEventListener('click', () => {
    history.push(design);
    normalisePanels(design, slotCount(design.layout));
    design.panels[selected] = { photo: -1, zoom: 1, ox: 0, oy: 0 };
    commit();
    setStatus(`Panel ${selected + 1} cleared.`);
  });

  const captionFields = [
    ['title', 'title'],
    ['subtitle', 'subtitle'],
    ['badge', 'badge'],
  ];
  const lastCaption = {};
  captionFields.forEach(([id, key]) => {
    const input = document.getElementById(id);
    lastCaption[key] = input.value;
    input.addEventListener('input', () => {
      design[key] = input.value;
      draw();
    });
    input.addEventListener('change', () => {
      const before = { ...design, [key]: lastCaption[key] };
      history.push(before);
      lastCaption[key] = input.value;
      design[key] = input.value;
      commit();
    });
  });

  [['grain', 'grain'], ['vignette', 'vignette'], ['halftone', 'halftone']].forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', (event) => {
      history.push(design);
      design[key] = event.target.checked;
      commit();
    });
  });

  document.querySelectorAll('#aspects button').forEach((btn) => {
    btn.addEventListener('click', () => {
      aspect = btn.dataset.aspect;
      commit();
      setStatus(`Preview: ${btn.textContent}.`);
    });
  });

  document.getElementById('undo').addEventListener('click', doUndo);
  document.getElementById('redo').addEventListener('click', doRedo);

  document.getElementById('export-all').addEventListener('click', async () => {
    setStatus('Exporting all 3 sizes…');
    try {
      const names = await downloadAllSizes(design, photos, (name) => setStatus(`Saved ${name}.`));
      setStatus(`Saved ${names.join(', ')}.`);
    } catch (err) {
      setStatus(`Export failed: ${err.message}`);
    }
  });

  document.addEventListener('keydown', (event) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if (inField) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) doRedo();
      else doUndo();
    }
  });
}

function doUndo() {
  const prev = history.undo(design);
  if (prev) {
    design = prev;
    selected = Math.min(selected, slotCount(design.layout) - 1);
    commit();
    setStatus('Undone.');
  }
}

function doRedo() {
  const next = history.redo(design);
  if (next) {
    design = next;
    selected = Math.min(selected, slotCount(design.layout) - 1);
    commit();
    setStatus('Redone.');
  }
}

// --- canvas editing ---------------------------------------------------------

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function hitPanel(point) {
  const rects = panelRects(design.layout, canvas.width, canvas.height, design.layout === 'full' ? 0 : titleBandHeight(canvas.height));
  for (let i = rects.length - 1; i >= 0; i--) {
    const rect = rects[i];
    if (rect.backdrop) continue;
    let px = point.x;
    let py = point.y;
    if (rect.rot) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const rad = (-rect.rot * Math.PI) / 180;
      const dx = point.x - cx;
      const dy = point.y - cy;
      px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
      py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) return i;
  }
  return -1;
}

function bindCanvas() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let dragSnapshot = null;
  let zoomPushAt = 0;

  canvas.addEventListener('pointerdown', (event) => {
    const point = canvasPoint(event);
    const hit = hitPanel(point);
    if (hit < 0) return;
    selected = hit;
    dragging = true;
    lastX = point.x;
    lastY = point.y;
    dragSnapshot = snapshot(design);
    canvas.setPointerCapture(event.pointerId);
    commit();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const point = canvasPoint(event);
    const rects = panelRects(design.layout, canvas.width, canvas.height, design.layout === 'full' ? 0 : titleBandHeight(canvas.height));
    const rect = rects[selected];
    if (!rect) return;
    const panel = design.panels[selected];
    if (!panel || panel.photo < 0) return;
    if (dragSnapshot) {
      history.push(dragSnapshot);
      dragSnapshot = null;
    }
    panel.ox = Math.max(-0.6, Math.min(0.6, panel.ox + (point.x - lastX) / rect.w));
    panel.oy = Math.max(-0.6, Math.min(0.6, panel.oy + (point.y - lastY) / rect.h));
    lastX = point.x;
    lastY = point.y;
    draw();
  });

  canvas.addEventListener('pointerup', () => {
    dragging = false;
    dragSnapshot = null;
    commit();
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const point = canvasPoint(event);
    const hit = hitPanel(point);
    if (hit < 0) return;
    const panel = design.panels[hit];
    if (!panel || panel.photo < 0) return;
    const now = Date.now();
    if (now - zoomPushAt > 450) {
      history.push(design);
      zoomPushAt = now;
    }
    panel.zoom = Math.max(1, Math.min(3.5, panel.zoom * Math.exp(-event.deltaY * 0.0012)));
    selected = hit;
    commit();
  }, { passive: false });
}

// --- boot -------------------------------------------------------------------

async function boot() {
  buildPickers();
  bindControls();
  bindCanvas();

  try {
    await document.fonts.load('40px Anton');
    await document.fonts.load('40px Pacifico');
  } catch {
    // Fallback fonts keep the cover readable when a font fails to load.
  }

  const sampleNames = inShotMode ? scene.photos : ['boulevard', 'pier'];
  photos = await loadSamples(sampleNames);
  design = freshDesign(photos.length);
  rebuildFilmstrip();

  if (inShotMode) {
    design.layout = findLayout(scene.layout).id;
    design.grade = findGrade(scene.grade).id;
    design.title = scene.title;
    design.subtitle = scene.subtitle;
    design.badge = scene.badge;
    if (scene.aspect in PREVIEW) aspect = scene.aspect;
    normalisePanels(design, slotCount(design.layout));
    if (scene.shot === 'cover') {
      document.body.classList.add('shot-cover');
      selected = -1; // a cover shot shows no selection ring
    }
    commit();
    const size = parseExportSize(scene.autoexport);
    if (size) {
      try {
        await downloadCover(design, photos, size.w, size.h);
        window.__exportTriggered = true;
      } catch (err) {
        setStatus(`Auto-export failed: ${err.message}`);
      }
    }
  } else {
    commit();
  }

  draw();
  syncControls();
  markReady();
}

boot();
