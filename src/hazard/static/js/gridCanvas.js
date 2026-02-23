import { makeEmptyGrid, generateId } from "./storage.js";
import { resolveColor } from "./colorPicker.js";

let canvas, ctx;
let app = null;
let scale = 4;
let panX = 0, panY = 0;
let panning = false;
let panStartX = 0, panStartY = 0;
let stamping = false;
let hoverCol = -1, hoverRow = -1;
let spaceHeld = false;
let showGridLines = true;
let paletteMode = false; // when true, clicking assigns palette instead of pattern

// Pattern rendering cache: "patternId_paletteId_scale" -> OffscreenCanvas
const patternCache = new Map();

export function initGridCanvas(appRef) {
    app = appRef;
    canvas = document.getElementById("grid-canvas");
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Grid dimension controls
    document.getElementById("btn-apply-grid-size").addEventListener("click", applyGridSize);
    document.getElementById("btn-clear-grid").addEventListener("click", clearGrid);
    document.getElementById("btn-toggle-grid").addEventListener("click", toggleGridLines);

    // Palette mode toggle
    document.getElementById("btn-palette-mode").addEventListener("click", togglePaletteMode);

    // Max indices control
    document.getElementById("btn-apply-max-indices").addEventListener("click", applyMaxIndices);

    // Palette management
    document.getElementById("btn-new-palette").addEventListener("click", createNewPalette);
    document.getElementById("btn-del-palette").addEventListener("click", deleteSelectedPalette);
    document.getElementById("grid-palette-select").addEventListener("change", onPaletteSelectChange);
    document.getElementById("palette-name-input").addEventListener("input", onPaletteNameChange);

    renderPaletteEditor();
}

// --- Palette mode ---

function togglePaletteMode() {
    paletteMode = !paletteMode;
    const btn = document.getElementById("btn-palette-mode");
    btn.classList.toggle("active", paletteMode);
    btn.textContent = paletteMode ? "Mode: Palette" : "Mode: Stamp";
    canvas.style.cursor = paletteMode ? "pointer" : "crosshair";
    render();
}

// --- Max indices ---

function applyMaxIndices() {
    const input = document.getElementById("max-indices-input");
    const newMax = parseInt(input.value);
    if (!newMax || newMax < 1 || newMax > 256) {
        alert("Max indices must be between 1 and 256.");
        return;
    }
    const oldMax = app.state.palettes.maxIndices;
    if (newMax === oldMax) return;

    // Resize all palettes
    for (const palId of app.state.palettes.order) {
        const pal = app.state.palettes.palettes[palId];
        if (!pal) continue;
        if (newMax > pal.colors.length) {
            // Extend with black
            while (pal.colors.length < newMax) pal.colors.push("#000000");
        } else {
            pal.colors.length = newMax;
        }
    }

    // Clamp any pixel indices that are now out of range
    for (const patId of app.state.vocabulary.order) {
        const pat = app.state.vocabulary.patterns[patId];
        if (!pat) continue;
        for (let r = 0; r < pat.height; r++) {
            for (let c = 0; c < pat.width; c++) {
                if (pat.pixels[r][c] !== null && pat.pixels[r][c] >= newMax) {
                    pat.pixels[r][c] = null;
                }
            }
        }
    }

    app.state.palettes.maxIndices = newMax;
    if (app.state.ui.selectedIndex >= newMax) {
        app.state.ui.selectedIndex = 0;
    }
    patternCache.clear();
    app.markDirty();
    app.refreshSwatches();
    renderPaletteEditor();
    render();
}

// --- Palette management ---

function getSelectedGridPalette() {
    const sel = document.getElementById("grid-palette-select");
    return sel.value;
}

function createNewPalette() {
    const maxIdx = app.state.palettes.maxIndices;
    const pal = {
        id: generateId("pal"),
        name: "Palette " + (app.state.palettes.order.length + 1),
        colors: new Array(maxIdx).fill("#000000"),
    };
    app.state.palettes.palettes[pal.id] = pal;
    app.state.palettes.order.push(pal.id);
    app.markDirty();
    renderPaletteEditor();
    // Select the new palette
    document.getElementById("grid-palette-select").value = pal.id;
    onPaletteSelectChange();
}

function deleteSelectedPalette() {
    const palId = getSelectedGridPalette();
    if (!palId) return;
    if (app.state.palettes.order.length <= 1) {
        alert("Cannot delete the last palette.");
        return;
    }
    const pal = app.state.palettes.palettes[palId];
    if (!confirm(`Delete palette "${pal.name}"?`)) return;

    delete app.state.palettes.palettes[palId];
    app.state.palettes.order = app.state.palettes.order.filter((id) => id !== palId);

    // Clear palette references in grid cells
    const grid = app.state.grid;
    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            const cell = grid.cells[r][c];
            if (cell && cell.paletteId === palId) {
                cell.paletteId = app.state.palettes.order[0];
            }
        }
    }

    // Update designer preview if needed
    if (app.state.ui.designerPaletteId === palId) {
        app.state.ui.designerPaletteId = app.state.palettes.order[0];
    }

    patternCache.clear();
    app.markDirty();
    renderPaletteEditor();
    render();
}

function onPaletteSelectChange() {
    renderPaletteColorEditor();
    const palId = getSelectedGridPalette();
    const pal = app.state.palettes.palettes[palId];
    document.getElementById("palette-name-input").value = pal ? pal.name : "";
}

function onPaletteNameChange() {
    const palId = getSelectedGridPalette();
    const pal = app.state.palettes.palettes[palId];
    if (!pal) return;
    pal.name = document.getElementById("palette-name-input").value;
    // Update the option text
    const sel = document.getElementById("grid-palette-select");
    for (const opt of sel.options) {
        if (opt.value === palId) { opt.textContent = pal.name; break; }
    }
    app.markDirty();
}

export function renderPaletteEditor() {
    const sel = document.getElementById("grid-palette-select");
    const prevVal = sel.value;
    sel.innerHTML = "";
    for (const palId of app.state.palettes.order) {
        const pal = app.state.palettes.palettes[palId];
        if (!pal) continue;
        const opt = document.createElement("option");
        opt.value = palId;
        opt.textContent = pal.name;
        sel.appendChild(opt);
    }
    // Restore selection or default to first
    if (prevVal && app.state.palettes.palettes[prevVal]) {
        sel.value = prevVal;
    } else {
        sel.value = app.state.palettes.order[0];
    }

    document.getElementById("max-indices-input").value = app.state.palettes.maxIndices;

    onPaletteSelectChange();
}

function renderPaletteColorEditor() {
    const container = document.getElementById("palette-color-editor");
    container.innerHTML = "";
    const palId = getSelectedGridPalette();
    const pal = app.state.palettes.palettes[palId];
    if (!pal) return;

    pal.colors.forEach((color, i) => {
        const wrapper = document.createElement("div");
        wrapper.className = "palette-color-entry";

        const label = document.createElement("span");
        label.className = "palette-index-label";
        label.textContent = i;

        const input = document.createElement("input");
        input.type = "color";
        input.value = color;
        input.title = `Index ${i}`;
        input.addEventListener("input", (e) => {
            pal.colors[i] = e.target.value;
            patternCache.clear();
            app.markDirty();
            render();
            // Refresh designer swatches if this is the preview palette
            if (palId === app.state.ui.designerPaletteId) {
                app.refreshSwatches();
            }
        });

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        container.appendChild(wrapper);
    });
}

// --- Grid controls ---

function toggleGridLines() {
    showGridLines = !showGridLines;
    document.getElementById("btn-toggle-grid").textContent = "Grid: " + (showGridLines ? "On" : "Off");
    render();
}

function applyGridSize() {
    const newCols = parseInt(document.getElementById("grid-cols").value) || 20;
    const newRows = parseInt(document.getElementById("grid-rows").value) || 15;
    const grid = app.state.grid;
    const oldCells = grid.cells;
    const newCells = makeEmptyGrid(newCols, newRows);

    for (let r = 0; r < Math.min(newRows, oldCells.length); r++) {
        for (let c = 0; c < Math.min(newCols, oldCells[r].length); c++) {
            newCells[r][c] = oldCells[r][c];
        }
    }

    grid.width = newCols;
    grid.height = newRows;
    grid.cells = newCells;
    app.markDirty();
    render();
}

function clearGrid() {
    if (!confirm("Clear all tiles from the grid?")) return;
    const grid = app.state.grid;
    grid.cells = makeEmptyGrid(grid.width, grid.height);
    app.markDirty();
    render();
}

// --- Coordinate conversion ---

function getTileCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - panX;
    const my = e.clientY - rect.top - panY;
    const grid = app.state.grid;
    const tilePixelW = grid.tileWidth * scale;
    const tilePixelH = grid.tileHeight * scale;
    const col = Math.floor(mx / tilePixelW);
    const row = Math.floor(my / tilePixelH);
    return { col, row };
}

function inBounds(col, row) {
    const grid = app.state.grid;
    return col >= 0 && col < grid.width && row >= 0 && row < grid.height;
}

// --- Mouse interaction ---

function onMouseDown(e) {
    const { col, row } = getTileCoords(e);

    // Pan: middle button or space+left
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        panning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        canvas.style.cursor = "grabbing";
        e.preventDefault();
        return;
    }

    // Right click: clear tile
    if (e.button === 2) {
        if (inBounds(col, row)) {
            app.state.grid.cells[row][col] = null;
            app.markDirty();
            render();
        }
        return;
    }

    // Left click
    if (e.button === 0 && !spaceHeld) {
        if (paletteMode) {
            // Assign palette to existing tile
            if (inBounds(col, row)) {
                const cell = app.state.grid.cells[row][col];
                if (cell) {
                    cell.paletteId = getSelectedGridPalette();
                    patternCache.clear();
                    app.markDirty();
                    render();
                }
            }
        } else {
            // Stamp pattern
            stamping = true;
            if (inBounds(col, row)) {
                stampTile(row, col);
                app.markDirty();
                render();
            }
        }
    }
}

function onMouseMove(e) {
    if (panning) {
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        render();
        return;
    }

    const { col, row } = getTileCoords(e);
    hoverCol = col;
    hoverRow = row;

    if (inBounds(col, row)) {
        const cell = app.state.grid.cells[row][col];
        let info = `Tile: (${col}, ${row})`;
        if (cell) {
            const pat = app.state.vocabulary.patterns[cell.patternId];
            const pal = app.state.palettes.palettes[cell.paletteId];
            if (pat) info += ` [${pat.name}]`;
            if (pal) info += ` pal: ${pal.name}`;
        }
        document.getElementById("cursor-info").textContent = info;
    }

    if (stamping && !paletteMode && inBounds(col, row)) {
        stampTile(row, col);
        app.markDirty();
    }

    render();
}

function stampTile(row, col) {
    const defaultPalId = getSelectedGridPalette() || app.state.palettes.order[0];
    const existing = app.state.grid.cells[row][col];
    app.state.grid.cells[row][col] = {
        patternId: app.state.ui.selectedPatternId,
        paletteId: existing ? existing.paletteId : defaultPalId,
    };
}

function onMouseUp() {
    panning = false;
    stamping = false;
    canvas.style.cursor = paletteMode ? "pointer" : "crosshair";
}

function onMouseLeave() {
    hoverCol = -1;
    hoverRow = -1;
    panning = false;
    stamping = false;
    canvas.style.cursor = paletteMode ? "pointer" : "crosshair";
    render();
}

function onWheel(e) {
    e.preventDefault();
    const oldScale = scale;
    if (e.deltaY < 0) {
        scale = Math.min(scale + 1, 10);
    } else {
        scale = Math.max(scale - 1, 1);
    }
    if (scale !== oldScale) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        panX = mx - (mx - panX) * (scale / oldScale);
        panY = my - (my - panY) * (scale / oldScale);

        patternCache.clear();
        document.getElementById("zoom-display").textContent = `Zoom: ${scale}x`;
        render();
    }
}

// --- Pattern cache ---

function getCachedPattern(pat, paletteId) {
    const key = pat.id + "_" + paletteId + "_" + scale;
    if (patternCache.has(key)) return patternCache.get(key);

    const w = pat.width * scale;
    const h = pat.height * scale;
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext("2d");
    offCtx.imageSmoothingEnabled = false;

    for (let r = 0; r < pat.height; r++) {
        for (let c = 0; c < pat.width; c++) {
            const idx = pat.pixels[r][c];
            if (idx !== null && idx !== undefined) {
                const color = resolveColor(app.state, paletteId, idx);
                if (color) {
                    offCtx.fillStyle = color;
                    offCtx.fillRect(c * scale, r * scale, scale, scale);
                }
            }
        }
    }

    patternCache.set(key, offscreen);
    return offscreen;
}

export function invalidatePatternCache(patternId) {
    for (const key of patternCache.keys()) {
        if (key.startsWith(patternId + "_")) {
            patternCache.delete(key);
        }
    }
}

// --- Rendering ---

export function render() {
    const grid = app.state.grid;
    const container = document.getElementById("grid-canvas-container");
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panX, panY);

    const tilePixelW = grid.tileWidth * scale;
    const tilePixelH = grid.tileHeight * scale;
    const totalW = grid.width * tilePixelW;
    const totalH = grid.height * tilePixelH;

    ctx.fillStyle = "#222228";
    ctx.fillRect(0, 0, totalW, totalH);

    // Draw tiles
    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            const cell = grid.cells[r][c];
            if (cell && cell.patternId) {
                const pat = app.state.vocabulary.patterns[cell.patternId];
                if (pat) {
                    const cached = getCachedPattern(pat, cell.paletteId);
                    ctx.drawImage(cached, c * tilePixelW, r * tilePixelH);
                }
            }
        }
    }

    // Grid lines
    if (showGridLines) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        for (let c = 0; c <= grid.width; c++) {
            ctx.beginPath();
            ctx.moveTo(c * tilePixelW + 0.5, 0);
            ctx.lineTo(c * tilePixelW + 0.5, totalH);
            ctx.stroke();
        }
        for (let r = 0; r <= grid.height; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * tilePixelH + 0.5);
            ctx.lineTo(totalW, r * tilePixelH + 0.5);
            ctx.stroke();
        }
    }

    // Hover preview
    if (inBounds(hoverCol, hoverRow) && !panning) {
        if (paletteMode) {
            // Highlight tile for palette assignment
            ctx.strokeStyle = "rgba(255, 200, 50, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(hoverCol * tilePixelW, hoverRow * tilePixelH, tilePixelW, tilePixelH);
        } else {
            const selId = app.state.ui.selectedPatternId;
            const selPat = app.state.vocabulary.patterns[selId];
            if (selPat) {
                const previewPalId = getSelectedGridPalette() || app.state.palettes.order[0];
                ctx.globalAlpha = 0.4;
                const cached = getCachedPattern(selPat, previewPalId);
                ctx.drawImage(cached, hoverCol * tilePixelW, hoverRow * tilePixelH);
                ctx.globalAlpha = 1.0;

                ctx.strokeStyle = "rgba(91, 155, 213, 0.6)";
                ctx.lineWidth = 2;
                ctx.strokeRect(hoverCol * tilePixelW, hoverRow * tilePixelH, tilePixelW, tilePixelH);
            }
        }
    }

    ctx.restore();

    document.getElementById("grid-cols").value = grid.width;
    document.getElementById("grid-rows").value = grid.height;
}

export function handleKeyboard(e) {
    if (e.key === " ") {
        e.preventDefault();
        spaceHeld = e.type === "keydown";
        canvas.style.cursor = spaceHeld ? "grab" : (paletteMode ? "pointer" : "crosshair");
    }
    if (e.type === "keydown" && e.key === "g") {
        toggleGridLines();
    }
    if (e.type === "keydown" && e.key === "m") {
        togglePaletteMode();
    }
}

export function exportPNG() {
    const grid = app.state.grid;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = grid.width * grid.tileWidth;
    exportCanvas.height = grid.height * grid.tileHeight;
    const eCtx = exportCanvas.getContext("2d");
    eCtx.imageSmoothingEnabled = false;

    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            const cell = grid.cells[r][c];
            if (cell && cell.patternId) {
                const pat = app.state.vocabulary.patterns[cell.patternId];
                if (!pat) continue;
                for (let pr = 0; pr < pat.height; pr++) {
                    for (let pc = 0; pc < pat.width; pc++) {
                        const idx = pat.pixels[pr][pc];
                        if (idx !== null && idx !== undefined) {
                            const color = resolveColor(app.state, cell.paletteId, idx);
                            if (color) {
                                eCtx.fillStyle = color;
                                eCtx.fillRect(
                                    c * grid.tileWidth + pc,
                                    r * grid.tileHeight + pr,
                                    1, 1
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    exportCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "hazard-art.png";
        a.click();
        URL.revokeObjectURL(url);
    });
}
