const STORAGE_KEY = "hazard-state";

export function generateId() {
    return "pat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function createBlankPattern(width = 8, height = 8) {
    const pixels = [];
    for (let r = 0; r < height; r++) {
        pixels.push(new Array(width).fill(null));
    }
    return {
        id: generateId(),
        name: "Untitled",
        width,
        height,
        pixels,
    };
}

export function createDefaultState() {
    const pat = createBlankPattern(8, 8);
    pat.name = "Pattern 1";
    return {
        version: 1,
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
            selectedColor: "#ff004d",
            designerPatternId: pat.id,
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
