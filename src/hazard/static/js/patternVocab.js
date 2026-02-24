import { createBlankPattern } from "./storage.js";
import { setActivePattern, render as renderDesigner } from "./patternDesigner.js";
import { getDesignerColor } from "./colorPicker.js";

const THUMB_SIZE = 40;
let app = null;
// Map from pattern id -> { el, canvas, nameSpan } for in-place updates
let thumbElements = new Map();

export function initPatternVocab(appRef) {
    app = appRef;

    document.getElementById("btn-new-pattern").addEventListener("click", createNew);
    document.getElementById("btn-dup-pattern").addEventListener("click", duplicateSelected);
    document.getElementById("btn-del-pattern").addEventListener("click", deleteSelected);

    renderList();
}

function createNew() {
    const tileW = app.state.grid.tileWidth || 8;
    const tileH = app.state.grid.tileHeight || 8;
    const pat = createBlankPattern(tileW, tileH);
    const count = app.state.vocabulary.order.length + 1;
    pat.name = "Pattern " + count;
    app.state.vocabulary.patterns[pat.id] = pat;
    app.state.vocabulary.order.push(pat.id);
    app.state.ui.selectedPatternId = pat.id;
    app.state.ui.designerPatternId = pat.id;
    setActivePattern(pat.id);
    app.markDirty();
    renderList();
    app.switchView("designer");
    renderDesigner();
}

function duplicateSelected() {
    const srcId = app.state.ui.selectedPatternId;
    const src = app.state.vocabulary.patterns[srcId];
    if (!src) return;
    const dup = createBlankPattern(src.width, src.height);
    dup.name = src.name + " copy";
    dup.pixels = JSON.parse(JSON.stringify(src.pixels));
    app.state.vocabulary.patterns[dup.id] = dup;
    app.state.vocabulary.order.push(dup.id);
    app.state.ui.selectedPatternId = dup.id;
    app.markDirty();
    renderList();
}

function deleteSelected() {
    const id = app.state.ui.selectedPatternId;
    if (!id) return;
    if (app.state.vocabulary.order.length <= 1) {
        alert("Cannot delete the last pattern.");
        return;
    }
    if (!confirm(`Delete pattern "${app.state.vocabulary.patterns[id].name}"?`)) return;

    delete app.state.vocabulary.patterns[id];
    app.state.vocabulary.order = app.state.vocabulary.order.filter((pid) => pid !== id);

    // Scrub grid references
    const grid = app.state.grid;
    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            const cell = grid.cells[r][c];
            if (cell && cell.patternId === id) grid.cells[r][c] = null;
        }
    }

    // Select first remaining
    const first = app.state.vocabulary.order[0];
    app.state.ui.selectedPatternId = first;
    if (app.state.ui.designerPatternId === id) {
        app.state.ui.designerPatternId = first;
        setActivePattern(first);
    }

    app.invalidatePatternCache(id);
    app.markDirty();
    renderList();
    renderDesigner();
}

export function renderList() {
    const container = document.getElementById("pattern-list");
    const order = app.state.vocabulary.order;

    // Check if we can do an in-place update (same set of pattern ids in same order)
    const canUpdate = thumbElements.size === order.length &&
        order.every((id, i) => {
            const el = thumbElements.get(id);
            return el && container.children[i] === el.el;
        });

    if (canUpdate) {
        for (const id of order) {
            const entry = thumbElements.get(id);
            const pat = app.state.vocabulary.patterns[id];
            if (!entry || !pat) continue;
            const tCtx = entry.canvas.getContext("2d");
            drawPatternThumb(tCtx, pat, THUMB_SIZE);
            entry.nameSpan.textContent = pat.name;
            entry.el.className = "pattern-thumb" + (id === app.state.ui.selectedPatternId ? " selected" : "");
        }
        return;
    }

    // Full rebuild
    container.innerHTML = "";
    thumbElements = new Map();

    order.forEach((id) => {
        const pat = app.state.vocabulary.patterns[id];
        if (!pat) return;

        const el = document.createElement("div");
        el.className = "pattern-thumb" + (id === app.state.ui.selectedPatternId ? " selected" : "");

        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = THUMB_SIZE;
        thumbCanvas.height = THUMB_SIZE;
        const tCtx = thumbCanvas.getContext("2d");
        tCtx.imageSmoothingEnabled = false;
        drawPatternThumb(tCtx, pat, THUMB_SIZE);

        const nameSpan = document.createElement("span");
        nameSpan.className = "thumb-name";
        nameSpan.textContent = pat.name;

        el.appendChild(thumbCanvas);
        el.appendChild(nameSpan);

        el.addEventListener("click", () => {
            app.state.ui.selectedPatternId = id;
            app.state.ui.designerPatternId = id;
            setActivePattern(id);
            app.switchView("designer");
            renderDesigner();
            renderList();
        });

        container.appendChild(el);
        thumbElements.set(id, { el, canvas: thumbCanvas, nameSpan });
    });
}

function drawPatternThumb(ctx, pat, size) {
    const scaleX = size / Math.max(pat.width, pat.height);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < pat.height; r++) {
        for (let c = 0; c < pat.width; c++) {
            const idx = pat.pixels[r][c];
            if (idx !== null && idx !== undefined) {
                const color = getDesignerColor(app.state, idx);
                if (color) {
                    ctx.fillStyle = color;
                    ctx.fillRect(
                        Math.floor(c * scaleX),
                        Math.floor(r * scaleX),
                        Math.ceil(scaleX),
                        Math.ceil(scaleX)
                    );
                }
            }
        }
    }
}
