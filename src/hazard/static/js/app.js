import { loadFromLocal, saveToLocal, createDefaultState, migrateState } from "./storage.js";
import { initColorPicker, renderSwatches } from "./colorPicker.js";
import { initPatternDesigner, render as renderDesigner, handleKeyboard as designerKeys } from "./patternDesigner.js";
import { initPatternVocab, renderList as renderSidebar } from "./patternVocab.js";
import {
    initGridCanvas,
    render as renderGrid,
    invalidatePatternCache,
    handleKeyboard as gridKeys,
    exportPNG,
    renderPaletteEditor,
} from "./gridCanvas.js";

const app = {
    state: null,
    dirty: false,
    saveTimer: null,

    markDirty() {
        this.dirty = true;
        document.getElementById("save-status").textContent = "Unsaved changes";
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            saveToLocal(this.state);
            this.dirty = false;
            document.getElementById("save-status").textContent = "Saved";
        }, 2000);
    },

    switchView(viewName) {
        const designerView = document.getElementById("designer-view");
        const canvasView = document.getElementById("canvas-view");
        designerView.style.display = viewName === "designer" ? "flex" : "none";
        canvasView.style.display = viewName === "canvas" ? "flex" : "none";
        this.state.ui.currentView = viewName;

        document.getElementById("btn-designer").classList.toggle("active", viewName === "designer");
        document.getElementById("btn-canvas").classList.toggle("active", viewName === "canvas");

        if (viewName === "designer") {
            renderSwatches();
            renderDesigner();
        }
        if (viewName === "canvas") {
            renderPaletteEditor();
            renderGrid();
        }
    },

    invalidatePatternCache(patternId) {
        invalidatePatternCache(patternId);
    },

    refreshSidebar() {
        renderSidebar();
    },

    refreshSwatches() {
        renderSwatches();
    },
};

// --- Initialization ---

function init() {
    // Load or create state
    let saved = loadFromLocal();
    if (saved) {
        saved = migrateState(saved);
    }
    app.state = saved || createDefaultState();

    // Ensure UI defaults exist
    if (!app.state.ui.currentTool) app.state.ui.currentTool = "pencil";
    if (app.state.ui.selectedIndex === undefined) app.state.ui.selectedIndex = 0;

    // Init modules
    initColorPicker(app, () => {});
    initPatternDesigner(app);
    initPatternVocab(app);
    initGridCanvas(app);

    // View nav buttons
    document.getElementById("btn-designer").addEventListener("click", () => app.switchView("designer"));
    document.getElementById("btn-canvas").addEventListener("click", () => app.switchView("canvas"));

    // Header action buttons
    document.getElementById("btn-save").addEventListener("click", saveToServer);
    document.getElementById("btn-load").addEventListener("click", loadFromServer);
    document.getElementById("btn-export-json").addEventListener("click", exportJSON);
    document.getElementById("btn-export-png").addEventListener("click", exportPNG);
    document.getElementById("btn-import").addEventListener("click", () => document.getElementById("import-file").click());
    document.getElementById("import-file").addEventListener("change", importJSON);

    // Keyboard
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // Window resize
    window.addEventListener("resize", () => {
        if (app.state.ui.currentView === "designer") renderDesigner();
        else renderGrid();
    });

    // Render initial view
    app.switchView(app.state.ui.currentView || "designer");
}

// --- Keyboard ---

function onKeyDown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

    // View switching
    if (e.key === "1") { app.switchView("designer"); return; }
    if (e.key === "2") { app.switchView("canvas"); return; }

    if (app.state.ui.currentView === "designer") {
        designerKeys(e);
    } else {
        gridKeys(e);
    }
}

function onKeyUp(e) {
    if (app.state.ui.currentView === "canvas") {
        gridKeys(e);
    }
}

// --- Server save/load ---

async function saveToServer() {
    try {
        const resp = await fetch("/api/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(app.state),
        });
        const data = await resp.json();
        if (data.ok) {
            document.getElementById("save-status").textContent = "Saved to server";
        }
    } catch (err) {
        document.getElementById("save-status").textContent = "Save failed";
    }
}

async function loadFromServer() {
    if (!confirm("Load from server? This will replace your current work.")) return;
    try {
        const resp = await fetch("/api/load");
        const data = await resp.json();
        if (data.ok && data.state) {
            app.state = migrateState(data.state);
            saveToLocal(app.state);
            location.reload();
        } else {
            alert("No saved state on server.");
        }
    } catch (err) {
        alert("Failed to load from server.");
    }
}

async function exportJSON() {
    try {
        const resp = await fetch("/api/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(app.state),
        });
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "hazard-project.json";
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert("Export failed.");
    }
}

function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            let imported = JSON.parse(reader.result);
            if (imported.vocabulary && imported.grid) {
                imported = migrateState(imported);
                app.state = imported;
                saveToLocal(app.state);
                location.reload();
            } else {
                alert("Invalid project file.");
            }
        } catch (err) {
            alert("Failed to parse JSON file.");
        }
    };
    reader.readAsText(file);
    e.target.value = "";
}

// --- Start ---
document.addEventListener("DOMContentLoaded", init);
