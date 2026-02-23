const STORAGE_KEY = "hazard-state";

export function generateId(prefix = "pat") {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function createBlankPattern(width = 8, height = 8) {
    const pixels = [];
    for (let r = 0; r < height; r++) {
        pixels.push(new Array(width).fill(null));
    }
    return {
        id: generateId("pat"),
        name: "Untitled",
        width,
        height,
        pixels, // each cell is null or an integer index 0..maxIndices-1
    };
}

export function createDefaultPalette(maxIndices) {
    const FALLBACK_COLORS = [
        "#000000", "#1d2b53", "#7e2553", "#008751",
        "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
        "#ff004d", "#ffa300", "#ffec27", "#00e436",
        "#29adff", "#83769c", "#ff77a8", "#ffccaa",
    ];
    const colors = [];
    for (let i = 0; i < maxIndices; i++) {
        colors.push(FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
    }
    const pal = {
        id: generateId("pal"),
        name: "Default",
        colors,
    };
    return pal;
}

export function createDefaultState() {
    const maxIndices = 4;
    const pat = createBlankPattern(8, 8);
    pat.name = "Pattern 1";
    const pal = createDefaultPalette(maxIndices);
    return {
        version: 2,
        palettes: {
            maxIndices,
            palettes: { [pal.id]: pal },
            order: [pal.id],
        },
        vocabulary: {
            patterns: { [pat.id]: pat },
            order: [pat.id],
        },
        grid: {
            width: 20,
            height: 15,
            tileWidth: 8,
            tileHeight: 8,
            cells: makeEmptyGrid(20, 15),
        },
        ui: {
            currentView: "designer",
            selectedPatternId: pat.id,
            selectedIndex: 0,
            designerPatternId: pat.id,
            designerPaletteId: pal.id,
            currentTool: "pencil",
        },
    };
}

export function makeEmptyGrid(cols, rows) {
    const cells = [];
    for (let r = 0; r < rows; r++) {
        cells.push(new Array(cols).fill(null));
    }
    return cells;
}

export function saveToLocal(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
        // localStorage full or unavailable
    }
}

export function loadFromLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) {
        // corrupt data
    }
    return null;
}

export function clearLocal() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Migrate old v1 state (color strings in pixels, no palettes) to v2 (indices + palettes).
 */
export function migrateState(state) {
    if (state.version >= 2) return state;

    // Collect all unique colors used across all patterns
    const colorSet = new Set();
    for (const id of state.vocabulary.order) {
        const pat = state.vocabulary.patterns[id];
        if (!pat) continue;
        for (const row of pat.pixels) {
            for (const cell of row) {
                if (cell && typeof cell === "string") colorSet.add(cell);
            }
        }
    }
    const usedColors = [...colorSet];

    // Build palette
    const maxIndices = Math.max(usedColors.length, 4);
    const FALLBACK_COLORS = [
        "#000000", "#1d2b53", "#7e2553", "#008751",
        "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
        "#ff004d", "#ffa300", "#ffec27", "#00e436",
        "#29adff", "#83769c", "#ff77a8", "#ffccaa",
    ];
    const colors = [];
    for (let i = 0; i < maxIndices; i++) {
        colors.push(usedColors[i] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
    }
    const colorToIndex = {};
    usedColors.forEach((c, i) => { colorToIndex[c] = i; });

    const pal = {
        id: generateId("pal"),
        name: "Default",
        colors,
    };

    // Convert pattern pixels from color strings to indices
    for (const id of state.vocabulary.order) {
        const pat = state.vocabulary.patterns[id];
        if (!pat) continue;
        for (let r = 0; r < pat.pixels.length; r++) {
            for (let c = 0; c < pat.pixels[r].length; c++) {
                const cell = pat.pixels[r][c];
                if (cell && typeof cell === "string") {
                    pat.pixels[r][c] = colorToIndex[cell] ?? null;
                }
            }
        }
    }

    // Convert grid cells from patternId strings to { patternId, paletteId } objects
    if (state.grid && state.grid.cells) {
        for (let r = 0; r < state.grid.cells.length; r++) {
            for (let c = 0; c < state.grid.cells[r].length; c++) {
                const cell = state.grid.cells[r][c];
                if (cell && typeof cell === "string") {
                    state.grid.cells[r][c] = { patternId: cell, paletteId: pal.id };
                }
            }
        }
    }

    state.palettes = {
        maxIndices,
        palettes: { [pal.id]: pal },
        order: [pal.id],
    };
    state.ui.selectedIndex = 0;
    delete state.ui.selectedColor;
    state.ui.designerPaletteId = pal.id;
    state.version = 2;

    return state;
}
