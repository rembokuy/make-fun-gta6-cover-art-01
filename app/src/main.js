import { renderCover, titleBandHeight } from "./cover.js";
import { downloadAllSizes, downloadCover, EXPORT_SIZES, renderCoverCanvas } from "./export.js";
import { findGrade, GRADES } from "./grades.js";
import { findLayout, LAYOUTS, panelRects, slotCount } from "./layouts.js";
import { markReady, parseExportSize, sceneFromQuery } from "./shots.js";
import { createHistory, emptyPanel, freshDesign, normalisePanels, snapshot } from "./state.js";

const PREVIEW = {
  square: { w: 900, h: 900 },
  portrait: { w: 720, h: 900 },
  wide: { w: 960, h: 540 },
};

const stage = document.querySelector("#stage");
const filmstrip = document.querySelector("#filmstrip");
const layoutsEl = document.querySelector("#layouts");
const gradesEl = document.querySelector("#grades");
const aspectsEl = document.querySelector("#aspects");
const exportOneEl = document.querySelector("#export-one");
const statusEl = document.querySelector("#status");
const titleInput = document.querySelector("#title");
const subtitleInput = document.querySelector("#subtitle");
const badgeInput = document.querySelector("#badge");
const grainInput = document.querySelector("#grain");
const vignetteInput = document.querySelector("#vignette");
const halftoneInput = document.querySelector("#halftone");
const undoBtn = document.querySelector("#undo");
const redoBtn = document.querySelector("#redo");
const uploadInput = document.querySelector("#upload");
const fillAllBtn = document.querySelector("#fill-all");
const clearPanelBtn = document.querySelector("#clear-panel");
const exportAllBtn = document.querySelector("#export-all");

const history = createHistory(60);
const scene = new URLSearchParams(window.location.search).has("shot")
  ? sceneFromQuery(window.location.search)
  : null;

let photos = [];
let design = freshDesign(0);
let selected = 0;
let aspect = "square";
let drag = null;
let lastWheelPush = 0;

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
    await document.fonts.load("40px Anton");
  } catch (err) {
    // Fall back to system fonts.
  }
  try {
    await document.fonts.load("40px Pacifico");
  } catch (err) {
    // Fall back to system fonts.
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function render() {
  const size = PREVIEW[aspect] || PREVIEW.square;
  stage.width = size.w;
  stage.height = size.h;
  const ctx = stage.getContext("2d");
  const sel = scene && scene.shot === "cover" ? -1 : selected;
  renderCover(ctx, size.w, size.h, design, photos, sel);
  undoBtn.disabled = !history.canUndo;
  redoBtn.disabled = !history.canRedo;
}

function syncControls() {
  titleInput.value = design.title;
  subtitleInput.value = design.subtitle;
  badgeInput.value = design.badge;
  grainInput.checked = design.grain;
  vignetteInput.checked = design.vignette;
  halftoneInput.checked = design.halftone;
  layoutsEl.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layout === design.layout);
  });
  gradesEl.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.grade === design.grade);
  });
  aspectsEl.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.aspect === aspect);
  });
}

function gradeGradient(grade) {
  const stops = grade.stops;
  const first = stops[0];
  const mid = stops[Math.floor(stops.length / 2)];
  const last = stops[stops.length - 1];
  const rgb = (s) => `rgb(${s[1]}, ${s[2]}, ${s[3]})`;
  return `linear-gradient(135deg, ${rgb(first)}, ${rgb(mid)}, ${rgb(last)})`;
}

function buildLayoutPicker() {
  for (const layout of LAYOUTS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.layout = layout.id;
    btn.textContent = layout.name;
    btn.addEventListener("click", () => {
      history.push(design);
      design.layout = layout.id;
      normalisePanels(design);
      selected = Math.min(selected, slotCount(design.layout) - 1);
      syncControls();
      render();
    });
    layoutsEl.appendChild(btn);
  }
}

function buildGradePicker() {
  for (const grade of GRADES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.grade = grade.id;
    btn.className = "swatch";
    btn.style.background = gradeGradient(grade);
    const label = document.createElement("span");
    label.textContent = grade.name;
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      history.push(design);
      design.grade = grade.id;
      syncControls();
      render();
    });
    gradesEl.appendChild(btn);
  }
}

function buildExportOne() {
  for (const size of EXPORT_SIZES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${size.label} PNG`;
    btn.addEventListener("click", async () => {
      const canvas = renderCoverCanvas(design, photos, size.w, size.h);
      const name = await downloadCover(canvas, size.w, size.h);
      setStatus(name ? `Exported ${name}` : "Export failed.");
    });
    exportOneEl.appendChild(btn);
  }
}

function rebuildFilmstrip() {
  filmstrip.innerHTML = "";
  photos.forEach((photo, index) => {
    const thumb = document.createElement("img");
    thumb.src = photo.src;
    thumb.alt = `Photo ${index + 1}`;
    thumb.width = 64;
    thumb.height = 64;
    thumb.addEventListener("click", () => {
      history.push(design);
      const panel = design.panels[selected] || emptyPanel();
      panel.photo = index;
      panel.zoom = 1;
      panel.ox = 0;
      panel.oy = 0;
      design.panels[selected] = panel;
      render();
    });
    filmstrip.appendChild(thumb);
  });
}

function hitPanel(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const x = (clientX - rect.left) * (stage.width / rect.width);
  const y = (clientY - rect.top) * (stage.height / rect.height);
  const rects = panelRects(design.layout, stage.width, stage.height, titleBandHeight(stage.height));
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

function canvasPoint(e) {
  const rect = stage.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (stage.width / rect.width),
    y: (e.clientY - rect.top) * (stage.height / rect.height),
  };
}

stage.addEventListener("pointerdown", (e) => {
  const hit = hitPanel(e.clientX, e.clientY);
  if (hit < 0) return;
  selected = hit;
  const point = canvasPoint(e);
  history.push(design);
  drag = { panel: hit, startX: point.x, startY: point.y, lastX: point.x, lastY: point.y, moved: false };
  stage.setPointerCapture(e.pointerId);
  render();
});

stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const point = canvasPoint(e);
  if (Math.abs(point.x - drag.startX) > 0.5 || Math.abs(point.y - drag.startY) > 0.5) {
    drag.moved = true;
  }
  const rects = panelRects(design.layout, stage.width, stage.height, titleBandHeight(stage.height));
  const rect = rects[drag.panel];
  const panel = design.panels[drag.panel];
  if (rect && panel) {
    panel.ox = Math.max(-0.6, Math.min(0.6, panel.ox + (point.x - drag.lastX) / rect.w));
    panel.oy = Math.max(-0.6, Math.min(0.6, panel.oy + (point.y - drag.lastY) / rect.h));
  }
  drag.lastX = point.x;
  drag.lastY = point.y;
  render();
});

stage.addEventListener("pointerup", () => {
  drag = null;
});

stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const hit = hitPanel(e.clientX, e.clientY);
  if (hit < 0) return;
  const panel = design.panels[hit];
  if (!panel) return;
  const now = Date.now();
  if (now - lastWheelPush > 450) {
    history.push(design);
    lastWheelPush = now;
  }
  const factor = Math.exp(-e.deltaY * 0.0012);
  panel.zoom = Math.max(1, Math.min(3.5, panel.zoom * factor));
  selected = hit;
  render();
}, { passive: false });

function bindCaption(input, key) {
  let before = snapshot(design);
  input.addEventListener("focus", () => {
    before = snapshot(design);
  });
  input.addEventListener("input", () => {
    design[key] = input.value;
    render();
  });
  input.addEventListener("change", () => {
    history.push(before);
    design[key] = input.value;
    render();
  });
}

function bindFinishToggle(input, key) {
  input.addEventListener("change", () => {
    history.push(design);
    design[key] = input.checked;
    render();
  });
}

uploadInput.addEventListener("change", async () => {
  const files = Array.from(uploadInput.files || []).filter((file) => file.type.startsWith("image/"));
  let added = 0;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    if (img) {
      photos.push(img);
      added++;
    }
  }
  uploadInput.value = "";
  if (added > 0) {
    rebuildFilmstrip();
    render();
    setStatus(`${added} photo(s) added.`);
  } else {
    setStatus("No valid photos found.");
  }
});

fillAllBtn.addEventListener("click", () => {
  const source = design.panels[selected];
  if (!source || source.photo < 0) {
    setStatus("Select a panel with a photo first.");
    return;
  }
  history.push(design);
  const count = slotCount(design.layout);
  for (let i = 0; i < count; i++) {
    design.panels[i] = { photo: source.photo, zoom: source.zoom, ox: source.ox, oy: source.oy };
  }
  render();
});

clearPanelBtn.addEventListener("click", () => {
  history.push(design);
  design.panels[selected] = emptyPanel();
  render();
});

aspectsEl.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    aspect = btn.dataset.aspect;
    syncControls();
    render();
  });
});

undoBtn.addEventListener("click", () => {
  const prev = history.undo(design);
  if (prev) {
    design = prev;
    selected = Math.min(selected, design.panels.length - 1);
    syncControls();
    render();
  }
});

redoBtn.addEventListener("click", () => {
  const next = history.redo(design);
  if (next) {
    design = next;
    selected = Math.min(selected, design.panels.length - 1);
    syncControls();
    render();
  }
});

document.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) {
      const next = history.redo(design);
      if (next) {
        design = next;
        syncControls();
        render();
      }
    } else {
      const prev = history.undo(design);
      if (prev) {
        design = prev;
        syncControls();
        render();
      }
    }
  }
});

exportAllBtn.addEventListener("click", async () => {
  exportAllBtn.disabled = true;
  try {
    const saved = await downloadAllSizes(design, photos, (name) => {
      setStatus(`Exported ${name}`);
    });
    setStatus(saved.length > 0 ? `Exported ${saved.join(", ")}` : "Export failed.");
  } finally {
    exportAllBtn.disabled = false;
  }
});

async function init() {
  buildLayoutPicker();
  buildGradePicker();
  buildExportOne();
  bindCaption(titleInput, "title");
  bindCaption(subtitleInput, "subtitle");
  bindCaption(badgeInput, "badge");
  bindFinishToggle(grainInput, "grain");
  bindFinishToggle(vignetteInput, "vignette");
  bindFinishToggle(halftoneInput, "halftone");

  const sampleNames = scene ? scene.photos : ["boulevard", "pier"];
  for (const name of sampleNames) {
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
    if (PREVIEW[scene.aspect]) aspect = scene.aspect;
    normalisePanels(design);
    if (scene.shot === "cover") document.body.classList.add("shot-cover");
  }

  const fontsDone = loadFonts();
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  await Promise.race([fontsDone, timeout]);
  syncControls();
  render();

  if (scene && scene.autoexport) {
    const size = parseExportSize(scene.autoexport);
    if (size) {
      const canvas = renderCoverCanvas(design, photos, size.w, size.h);
      await downloadCover(canvas, size.w, size.h);
      window.__exportTriggered = true;
    }
  }
  if (scene) markReady();
}

init();
