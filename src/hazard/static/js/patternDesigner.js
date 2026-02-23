import { selectColor } from "./colorPicker.js";

const MAX_UNDO = 50;
let canvas, ctx;
let app = null;
let cellSize = 32;
let painting = false;
let currentTool = "pencil";
let undoStack = [];
let redoStack = [];

export function initPatternDesigner(appRef) {
    app = appRef;
    canvas = document.getElementById("designer-canvas");
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    currentTool = app.state.ui.currentTool || "pencil";
    highlightToolButton(currentTool);

    // Mouse events
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Tool buttons
    document.querySelectorAll(".tool-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            currentTool = btn.dataset.tool;
            app.state.ui.currentTool = currentTool;
            highlightToolButton(currentTool);
        });
    });

    // Undo/Redo buttons
    document.getElementById("btn-undo").addEventListener("click", undo);
    document.getElementById("btn-redo").addEventListener("click", redo);

    // Pattern name
    const nameInput = document.getElementById("pattern-name-input");
    nameInput.addEventListener("input", () => {
        const pat = getActivePattern();
        if (pat) {
            pat.name = nameInput.value;
            app.markDirty();
            app.refreshSidebar();
        }
    });

    // Tile size (project-level — resizes all patterns)
    document.getElementById("btn-resize-pattern").addEventListener("click", () => {
        const grid = app.state.grid;
        const newW = parseInt(document.getElementById("pattern-width-input").value) || grid.tileWidth;
        const newH = parseInt(document.getElementById("pattern-height-input").value) || grid.tileHeight;
        if (newW === grid.tileWidth && newH === grid.tileHeight) return;
        if (newW < 1 || newH < 1 || newW > 64 || newH > 64) {
            alert("Dimensions must be between 1 and 64.");
            return;
        }
        if (!confirm(`Resize all tiles to ${newW}\u00d7${newH}? This may crop or expand patterns.`)) {
            document.getElementById("pattern-width-input").value = grid.tileWidth;
            document.getElementById("pattern-height-input").value = grid.tileHeight;
            return;
        }
        resizeAllPatterns(newW, newH);
        app.markDirty();
        render();
    });
}

function getActivePattern() {
    const id = app.state.ui.designerPatternId;
    return app.state.vocabulary.patterns[id] || null;
}

function resizeAllPatterns(newW, newH) {
    app.state.grid.tileWidth = newW;
    app.state.grid.tileHeight = newH;
    for (const id of app.state.vocabulary.order) {
        const pat = app.state.vocabulary.patterns[id];
        if (!pat) continue;
        const oldPixels = pat.pixels;
        const newPixels = [];
        for (let r = 0; r < newH; r++) {
            const row = [];
            for (let c = 0; c < newW; c++) {
                row.push(r < oldPixels.length && c < oldPixels[0].length ? oldPixels[r][c] : null);
            }
            newPixels.push(row);
        }
        pat.width = newW;
        pat.height = newH;
        pat.pixels = newPixels;
        app.invalidatePatternCache(id);
    }
    undoStack = [];
    redoStack = [];
}

function pushUndo() {
    const pat = getActivePattern();
    if (!pat) return;
    undoStack.push(JSON.parse(JSON.stringify(pat.pixels)));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
}

function undo() {
    const pat = getActivePattern();
    if (!pat || undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify(pat.pixels)));
    pat.pixels = undoStack.pop();
    app.markDirty();
    app.invalidatePatternCache(pat.id);
    render();
}

function redo() {
    const pat = getActivePattern();
    if (!pat || redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify(pat.pixels)));
    pat.pixels = redoStack.pop();
    app.markDirty();
    app.invalidatePatternCache(pat.id);
    render();
}

function highlightToolButton(tool) {
    document.querySelectorAll(".tool-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tool === tool);
    });
}

// --- Mouse interaction ---

function getPixelCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    return { col, row };
}

function onMouseDown(e) {
    const pat = getActivePattern();
    if (!pat) return;
    const { col, row } = getPixelCoords(e);
    if (col < 0 || col >= pat.width || row < 0 || row >= pat.height) return;

    if (e.button === 2 || currentTool === "eyedropper") {
        // Eyedropper
        const color = pat.pixels[row][col];
        if (color) selectColor(app, color);
        return;
    }

    if (currentTool === "fill") {
        pushUndo();
        floodFill(pat, row, col, app.state.ui.selectedColor);
        app.markDirty();
        app.invalidatePatternCache(pat.id);
        render();
        return;
    }

    pushUndo();
    painting = true;
    applyTool(pat, row, col);
    app.invalidatePatternCache(pat.id);
    render();
}

function onMouseMove(e) {
    const pat = getActivePattern();
    if (!pat) return;
    const { col, row } = getPixelCoords(e);

    // Update cursor info
    if (col >= 0 && col < pat.width && row >= 0 && row < pat.height) {
        document.getElementById("cursor-info").textContent = `Pixel: (${col}, ${row})`;
    }

    if (!painting) return;
    if (col < 0 || col >= pat.width || row < 0 || row >= pat.height) return;
    applyTool(pat, row, col);
    app.invalidatePatternCache(pat.id);
    render();
}

function onMouseUp() {
    if (painting) {
        painting = false;
        app.markDirty();
    }
}

function applyTool(pat, row, col) {
    if (currentTool === "pencil") {
        pat.pixels[row][col] = app.state.ui.selectedColor;
    } else if (currentTool === "eraser") {
        pat.pixels[row][col] = null;
    }
}

function floodFill(pat, startRow, startCol, fillColor) {
    const targetColor = pat.pixels[startRow][startCol];
    if (targetColor === fillColor) return;
    const stack = [[startRow, startCol]];
    const visited = new Set();
    while (stack.length > 0) {
        const [r, c] = stack.pop();
        const key = `${r},${c}`;
        if (visited.has(key)) continue;
        if (r < 0 || r >= pat.height || c < 0 || c >= pat.width) continue;
        if (pat.pixels[r][c] !== targetColor) continue;
        visited.add(key);
        pat.pixels[r][c] = fillColor;
        stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
}

// --- Rendering ---

export function render() {
    const pat = getActivePattern();
    if (!pat) return;

    // Update UI controls
    document.getElementById("pattern-name-input").value = pat.name;
    document.getElementById("pattern-width-input").value = app.state.grid.tileWidth;
    document.getElementById("pattern-height-input").value = app.state.grid.tileHeight;

    // Size canvas
    const maxDim = Math.min(
        window.innerWidth - 300,
        window.innerHeight - 250
    );
    cellSize = Math.max(4, Math.floor(Math.min(maxDim / pat.width, maxDim / pat.height)));
    // Clamp to reasonable size
    cellSize = Math.min(cellSize, 48);
    cellSize = Math.max(cellSize, 16);

    canvas.width = pat.width * cellSize;
    canvas.height = pat.height * cellSize;
    ctx.imageSmoothingEnabled = false;

    // Checkerboard background (transparency indicator)
    const checkSize = cellSize / 2;
    for (let r = 0; r < pat.height * 2; r++) {
        for (let c = 0; c < pat.width * 2; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? "#3a3a3a" : "#2a2a2a";
            ctx.fillRect(c * checkSize, r * checkSize, checkSize, checkSize);
        }
    }

    // Draw pixels
    for (let r = 0; r < pat.height; r++) {
        for (let c = 0; c < pat.width; c++) {
            const color = pat.pixels[r][c];
            if (color) {
                ctx.fillStyle = color;
                ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
        }
    }

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= pat.width; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize + 0.5, 0);
        ctx.lineTo(i * cellSize + 0.5, pat.height * cellSize);
        ctx.stroke();
    }
    for (let i = 0; i <= pat.height; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize + 0.5);
        ctx.lineTo(pat.width * cellSize, i * cellSize + 0.5);
        ctx.stroke();
    }

    // Update sidebar thumbnail live
    app.refreshSidebar();
}

export function setActivePattern(patternId) {
    if (app) {
        app.state.ui.designerPatternId = patternId;
        undoStack = [];
        redoStack = [];
    }
}

export function handleKeyboard(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
    else if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    else if (e.key === "p") { currentTool = "pencil"; highlightToolButton(currentTool); }
    else if (e.key === "e") { currentTool = "eraser"; highlightToolButton(currentTool); }
    else if (e.key === "f") { currentTool = "fill"; highlightToolButton(currentTool); }
    else if (e.key === "i") { currentTool = "eyedropper"; highlightToolButton(currentTool); }
}
