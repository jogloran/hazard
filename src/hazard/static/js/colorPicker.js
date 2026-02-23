/**
 * Index picker for the pattern designer.
 * Displays maxIndices swatches colored by the currently selected preview palette.
 * Selecting a swatch sets ui.selectedIndex.
 */
let app = null;
let onIndexChange = null;

export function initColorPicker(appRef, callback) {
    app = appRef;
    onIndexChange = callback;
    renderSwatches();
}

export function renderSwatches() {
    if (!app) return;
    const swatchContainer = document.getElementById("color-swatches");
    swatchContainer.innerHTML = "";

    const palId = app.state.ui.designerPaletteId;
    const pal = app.state.palettes.palettes[palId];
    const maxIdx = app.state.palettes.maxIndices;

    for (let i = 0; i < maxIdx; i++) {
        const el = document.createElement("div");
        el.className = "color-swatch" + (i === app.state.ui.selectedIndex ? " selected" : "");
        el.style.background = pal ? (pal.colors[i] || "#000") : "#000";
        el.title = `Index ${i}`;
        el.addEventListener("click", () => selectIndex(i));
        swatchContainer.appendChild(el);
    }

    // Update display
    updateDisplay();
}

export function selectIndex(idx) {
    app.state.ui.selectedIndex = idx;
    updateDisplay();
    refreshSwatchHighlight();
    if (onIndexChange) onIndexChange(idx);
}

export function selectColor(app, color) {
    // Legacy compatibility: no-op (eyedropper will use selectIndex instead)
}

function refreshSwatchHighlight() {
    const swatches = document.querySelectorAll("#color-swatches .color-swatch");
    swatches.forEach((el, i) => {
        el.classList.toggle("selected", i === app.state.ui.selectedIndex);
    });
}

function updateDisplay() {
    const display = document.getElementById("current-color-display");
    const palId = app.state.ui.designerPaletteId;
    const pal = app.state.palettes.palettes[palId];
    const idx = app.state.ui.selectedIndex;
    const color = pal ? (pal.colors[idx] || "#000") : "#000";
    display.style.background = color;

    const idxLabel = document.getElementById("selected-index-label");
    if (idxLabel) idxLabel.textContent = `Index: ${idx}`;
}

/**
 * Resolve a pixel index to a color string using a specific palette.
 */
export function resolveColor(state, paletteId, index) {
    if (index === null || index === undefined) return null;
    const pal = state.palettes.palettes[paletteId];
    if (!pal) return "#000";
    return pal.colors[index] || "#000";
}

/**
 * Get the preview color for the designer (uses designerPaletteId).
 */
export function getDesignerColor(state, index) {
    return resolveColor(state, state.ui.designerPaletteId, index);
}
