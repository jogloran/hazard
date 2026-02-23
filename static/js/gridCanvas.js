import { makeEmptyGrid } from "./storage.js";

let canvas, ctx;
let app = null;
let scale = 4;
let panX = 0, panY = 0;
let panning = false;
let panStartX = 0, panStartY = 0;
let stamping = false;
let hoverCol = -1, hoverRow = -1;
let spaceHeld = false;

// Pattern rendering cache: patternId -> OffscreenCanvas
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
}

function applyGridSize() {
    const newCols = parseInt(document.getElementById("grid-cols").value) || 20;
    const newRows = parseInt(document.getElementById("grid-rows").value) || 15;
    const grid = app.state.grid;
    const oldCells = grid.cells;
    const newCells = makeEmptyGrid(newCols, newRows);

    // Preserve existing data where possible
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

    // Left click: stamp
    if (e.button === 0 && !spaceHeld) {
        stamping = true;
        if (inBounds(col, row)) {
            app.state.grid.cells[row][col] = app.state.ui.selectedPatternId;
            app.markDirty();
            render();
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
        document.getElementById("cursor-info").textContent = `Tile: (${col}, ${row})`;
    }

    if (stamping && inBounds(col, row)) {
        app.state.grid.cells[row][col] = app.state.ui.selectedPatternId;
        app.markDirty();
    }

    render();
}

function onMouseUp() {
    panning = false;
    stamping = false;
    canvas.style.cursor = "crosshair";
}

function onMouseLeave() {
    hoverCol = -1;
    hoverRow = -1;
    panning = false;
    stamping = false;
    canvas.style.cursor = "crosshair";
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
        // Zoom toward mouse position
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

function getCachedPattern(pat) {
    const key = pat.id + "_" + scale;
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
            const color = pat.pixels[r][c];
            if (color) {
                offCtx.fillStyle = color;
                offCtx.fillRect(c * scale, r * scale, scale, scale);
            }
        }
    }

    patternCache.set(key, offscreen);
    return offscreen;
}

export function invalidatePatternCache(patternId) {
    // Remove all cached entries for this pattern (at any scale)
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

    // Clear
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panX, panY);

    const tilePixelW = grid.tileWidth * scale;
    const tilePixelH = grid.tileHeight * scale;
    const totalW = grid.width * tilePixelW;
    const totalH = grid.height * tilePixelH;

    // Grid background
    ctx.fillStyle = "#222228";
    ctx.fillRect(0, 0, totalW, totalH);

    // Draw tiles
    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            const patId = grid.cells[r][c];
            if (patId && app.state.vocabulary.patterns[patId]) {
                const pat = app.state.vocabulary.patterns[patId];
                const cached = getCachedPattern(pat);
                ctx.drawImage(cached, c * tilePixelW, r * tilePixelH);
            }
        }
    }

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
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

    // Hover preview
    if (inBounds(hoverCol, hoverRow) && !panning) {
        const selId = app.state.ui.selectedPatternId;
        const selPat = app.state.vocabulary.patterns[selId];
        if (selPat) {
            ctx.globalAlpha = 0.4;
            const cached = getCachedPattern(selPat);
            ctx.drawImage(cached, hoverCol * tilePixelW, hoverRow * tilePixelH);
            ctx.globalAlpha = 1.0;

            // Highlight border
            ctx.strokeStyle = "rgba(91, 155, 213, 0.6)";
            ctx.lineWidth = 2;
            ctx.strokeRect(hoverCol * tilePixelW, hoverRow * tilePixelH, tilePixelW, tilePixelH);
        }
    }

    ctx.restore();

    // Update grid dimension inputs
    document.getElementById("grid-cols").value = grid.width;
    document.getElementById("grid-rows").value = grid.height;
}

export function handleKeyboard(e) {
    if (e.key === " ") {
        e.preventDefault();
        spaceHeld = e.type === "keydown";
        canvas.style.cursor = spaceHeld ? "grab" : "crosshair";
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
            const patId = grid.cells[r][c];
            if (patId && app.state.vocabulary.patterns[patId]) {
                const pat = app.state.vocabulary.patterns[patId];
                for (let pr = 0; pr < pat.height; pr++) {
                    for (let pc = 0; pc < pat.width; pc++) {
                        const color = pat.pixels[pr][pc];
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

    exportCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "hazard-art.png";
        a.click();
        URL.revokeObjectURL(url);
    });
}
