const DEFAULT_PALETTE = [
    "#000000", "#1d2b53", "#7e2553", "#008751",
    "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
    "#ff004d", "#ffa300", "#ffec27", "#00e436",
    "#29adff", "#83769c", "#ff77a8", "#ffccaa",
];

let onColorChange = null;

export function initColorPicker(app, callback) {
    onColorChange = callback;
    const swatchContainer = document.getElementById("color-swatches");
    const customInput = document.getElementById("custom-color");
    const display = document.getElementById("current-color-display");

    // Build swatches
    DEFAULT_PALETTE.forEach((color) => {
        const el = document.createElement("div");
        el.className = "color-swatch";
        el.style.background = color;
        el.dataset.color = color;
        el.addEventListener("click", () => selectColor(app, color));
        swatchContainer.appendChild(el);
    });

    customInput.addEventListener("input", (e) => {
        selectColor(app, e.target.value);
    });

    // Initial display
    updateDisplay(app.state.ui.selectedColor);
}

export function selectColor(app, color) {
    app.state.ui.selectedColor = color;
    updateDisplay(color);
    if (onColorChange) onColorChange(color);
}

function updateDisplay(color) {
    const display = document.getElementById("current-color-display");
    const customInput = document.getElementById("custom-color");
    display.style.background = color;
    customInput.value = color;

    // Highlight active swatch
    document.querySelectorAll(".color-swatch").forEach((el) => {
        el.classList.toggle("selected", el.dataset.color === color);
    });
}

export function getSelectedColor(app) {
    return app.state.ui.selectedColor;
}
