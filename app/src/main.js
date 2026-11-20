// Editor wiring: controls, filmstrip, canvas editing, export, and the
// deterministic ?shot scenes used for screenshots.

import { LAYOUTS, findLayout, panelRects, slotCount } from "./layouts.js";
import { GRADES, findGrade } from "./grades.js";
import { createHistory, emptyPanel, freshDesign, normalisePanels, snapshot } from "./state.js";
import { renderCover, titleBandHeight } from "./cover.js";
import { EXPORT_SIZES, downloadAllSizes, downloadCover } from "./export.js";
import { markReady, parseExportSize, sceneFromQuery } from "./shots.js";

const PREVIEW = {
  square: { w: 900, h: 900 },
  portrait: { w: 720, h: 900 },
  wide: { w: 960, h: 540 },
};

const $ = (sel) => document.querySelector(sel);
const stage = $("#stage");
const ctx = stage.getContext("2d");
const statusEl = $("#status");
const history = createHistory(60);

const hasScene = new URLSearchParams(location.search).has("shot");
const scene = hasScene ? sceneFromQuery(location.search) : null;

let photos = [];
let design = freshDesign(0);
let selected = 0;
let aspect = "square";
let lastWheelPush = 0;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load("40px Anton"),
      document.fonts.load("40px Pacifico"),
    ]);
  } catch {
    // Fall back to system fonts; the cover still renders.
  }
}

function render() {
  const size = PREVIEW[aspect];
  stage.width = size.w;
  stage.height = size.h;
  renderCover(ctx, size.w, size.h, design, photos, scene && scene.shot === "cover" ? -1 : selected);
  updateUndoButtons();
}

function updateUndoButtons() {
  $("#undo").disabled = !history.canUndo;
  $("#redo").disabled = !history.canRedo;
}

function syncControls() {
  $("#title").value = design.title;
  $("#subtitle").value = design.subtitle;
  $("#badge").value = design.badge;
  $("#grain").checked = design.grain;
  $("#vignette").checked = design.vignette;
  $("#halftone").checked = design.halftone;
  document.querySelectorAll("#layouts button").forEach((b) => {
    b.classList.toggle("active", b.dataset.layout === design.layout);
  });
  document.querySelectorAll("#grades button").forEach((b) => {
    b.classList.toggle("active", b.dataset.grade === design.grade);
  });
  document.querySelectorAll("#aspects button").forEach((b) => {
    b.classList.toggle("active", b.dataset.aspect === aspect);
  });
}

function buildLayoutPicker() {
  const box = $("#layouts");
  box.innerHTML = "";
  for (const layout of LAYOUTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = layout.name;
    b.dataset.layout = layout.id;
    b.addEventListener("click", () => {
      if (design.layout === layout.id) return;
      history.push(design);
      design.layout = layout.id;
      normalisePanels(design);
      selected = clamp(selected, 0, slotCount(layout.id) - 1);
      syncControls();
      render();
    });
    box.appendChild(b);
  }
}

function gradeGradient(grade) {
  const stops = grade.stops;
  const first = stops[0];
  const mid = stops[Math.floor(stops.length / 2)];
  const last = stops[stops.length - 1];
  const rgb = (s) => `rgb(${s[1]},${s[2]},${s[3]})`;
  return `linear-gradient(135deg, ${rgb(first)}, ${rgb(mid)}, ${rgb(last)})`;
}

function buildGradePicker() {
  const box = $("#grades");
  box.innerHTML = "";
  for (const grade of GRADES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.title = grade.name;
    b.dataset.grade = grade.id;
    b.style.background = gradeGradient(grade);
    const label = document.createElement("span");
    label.textContent = grade.name;
    b.appendChild(label);
    b.addEventListener("click", () => {
      if (design.grade === grade.id) return;
      history.push(design);
      design.grade = grade.id;
      syncControls();
      render();
    });
    box.appendChild(b);
  }
}

function buildExportOne() {
  const box = $("#export-one");
  box.innerHTML = "";
  for (const size of EXPORT_SIZES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${size.label} PNG`;
    b.addEventListener("click", async () => {
      setStatus(`Exporting ${size.label}…`);
      const name = await downloadCover(design, photos, size);
      setStatus(name ? `Exported ${name}` : "Export failed.");
    });
    box.appendChild(b);
  }
}

function rebuildFilmstrip() {
  const strip = $("#filmstrip");
  strip.innerHTML = "";
  photos.forEach((photo, i) => {
    const thumb = document.createElement("img");
    thumb.src = photo.src;
    thumb.alt = `Photo ${i + 1}`;
    thumb.width = 64;
    thumb.height = 64;
    thumb.addEventListener("click", () => {
      history.push(design);
      const panel = design.panels[selected] || emptyPanel();
      design.panels[selected] = { ...panel, photo: i, zoom: 1, ox: 0, oy: 0 };
      render();
      setStatus(`Photo ${i + 1} placed in panel ${selected + 1}.`);
    });
    strip.appendChild(thumb);
  });
}

function canvasPoint(e) {
  const rect = stage.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * stage.width,
    y: ((e.clientY - rect.top) / rect.height) * stage.height,
  };
}

function hitPanel(p) {
  const rects = panelRects(design.layout, stage.width, stage.height, titleBandHeight(stage.height));
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
  }
  return -1;
}

let drag = null;

stage.addEventListener("pointerdown", (e) => {
  const p = canvasPoint(e);
  const hit = hitPanel(p);
  if (hit < 0) return;
  selected = hit;
  const rects = panelRects(design.layout, stage.width, stage.height, titleBandHeight(stage.height));
  drag = { panel: hit, rect: rects[hit], lastX: p.x, lastY: p.y, moved: false };
  history.push(design);
  stage.setPointerCapture(e.pointerId);
  render();
});

stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const dx = p.x - drag.lastX;
  const dy = p.y - drag.lastY;
  drag.lastX = p.x;
  drag.lastY = p.y;
  if (Math.abs(dx) + Math.abs(dy) > 0.5) drag.moved = true;
  const panel = design.panels[drag.panel];
  if (!panel || panel.photo < 0) return;
  panel.ox = clamp(panel.ox + dx / drag.rect.w, -0.6, 0.6);
  panel.oy = clamp(panel.oy + dy / drag.rect.h, -0.6, 0.6);
  render();
});

stage.addEventListener("pointerup", () => {
  drag = null;
});

stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const p = canvasPoint(e);
  const hit = hitPanel(p);
  if (hit < 0) return;
  const panel = design.panels[hit];
  if (!panel || panel.photo < 0) return;
  const now = Date.now();
  if (now - lastWheelPush > 450) {
    history.push(design);
    lastWheelPush = now;
  }
  const factor = Math.exp(-e.deltaY * 0.0012);
  panel.zoom = clamp(panel.zoom * factor, 1, 3.5);
  selected = hit;
  render();
}, { passive: false });

function bindControls() {
  $("#upload").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      if (img) {
        photos.push(img);
        rebuildFilmstrip();
      }
    }
    if (files.length) {
      render();
      setStatus(`${files.length} photo(s) added.`);
    }
    e.target.value = "";
  });

  $("#fill-all").addEventListener("click", () => {
    const src = design.panels[selected];
    if (!src || src.photo < 0) {
      setStatus("Select a panel with a photo first.");
      return;
    }
    history.push(design);
    const count = slotCount(design.layout);
    for (let i = 0; i < count; i++) {
      design.panels[i] = { ...src };
    }
    render();
    setStatus("All panels filled with the selected photo.");
  });

  $("#clear-panel").addEventListener("click", () => {
    history.push(design);
    design.panels[selected] = emptyPanel();
    render();
    setStatus(`Panel ${selected + 1} cleared.`);
  });

  const captionBefore = {};
  for (const key of ["title", "subtitle", "badge"]) {
    const input = $(`#${key}`);
    input.addEventListener("focus", () => {
      captionBefore[key] = design[key];
    });
    input.addEventListener("input", () => {
      design[key] = input.value;
      render();
    });
    input.addEventListener("change", () => {
      const before = { ...design, [key]: captionBefore[key] ?? design[key] };
      history.push(before);
      design[key] = input.value;
      render();
    });
  }

  for (const key of ["grain", "vignette", "halftone"]) {
    $(`#${key}`).addEventListener("change", (e) => {
      history.push(design);
      design[key] = e.target.checked;
      render();
    });
  }

  document.querySelectorAll("#aspects button").forEach((b) => {
    b.addEventListener("click", () => {
      aspect = b.dataset.aspect;
      syncControls();
      render();
    });
  });

  $("#undo").addEventListener("click", doUndo);
  $("#redo").addEventListener("click", doRedo);

  $("#export-all").addEventListener("click", async () => {
    setStatus("Exporting all 3 sizes…");
    const saved = await downloadAllSizes(design, photos, (name) => {
      setStatus(`Exported ${name}…`);
    });
    setStatus(saved.length ? `Exported ${saved.join(", ")}` : "Export failed.");
  });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    }
  });
}

function doUndo() {
  const prev = history.undo(design);
  if (!prev) return;
  design = prev;
  selected = clamp(selected, 0, slotCount(design.layout) - 1);
  syncControls();
  render();
}

function doRedo() {
  const next = history.redo(design);
  if (!next) return;
  design = next;
  selected = clamp(selected, 0, slotCount(design.layout) - 1);
  syncControls();
  render();
}

async function init() {
  buildLayoutPicker();
  buildGradePicker();
  buildExportOne();
  bindControls();

  const names = scene ? scene.photos : ["boulevard", "pier"];
  for (const name of names) {
    const img = await loadImage(`./samples/${name}.jpg`);
    if (img) photos.push(img);
  }
  design = freshDesign(photos.length);
  rebuildFilmstrip();

  if (scene) {
    design.layout = findLayout(scene.layout).id;
    design.grade = findGrade(scene.grade).id;
    design.title = scene.title;
    design.subtitle = scene.subtitle;
    design.badge = scene.badge;
    normalisePanels(design);
    if (scene.aspect in PREVIEW) aspect = scene.aspect;
    if (scene.shot === "cover") document.body.classList.add("shot-cover");
  }

  await loadFonts();
  syncControls();
  render();

  if (scene) {
    if (scene.autoexport) {
      const size = parseExportSize(scene.autoexport);
      if (size) {
        await downloadCover(design, photos, size);
        window.__exportTriggered = true;
      }
    }
    markReady();
  }
}

init();
