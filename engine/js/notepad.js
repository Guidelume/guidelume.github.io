import { renderMarkdown } from "./markdown-renderer.js";
import {
    DOCUMENT_REGISTRY,
    getDocumentTextError,
    normalizeDocumentOverrides
} from "./document-registry.js";

function normalizeLineEndings(value) {
    return value.replace(/\r\n?/g, "\n");
}

export function initNotepad({ memory, saveMemory }) {
    const states = new Map();
    let resetInProgress = false;
    const hasUnsavedChanges = () => [...states.values()].some(state => state.dirty);

    function setStatus(state, message, kind = "") {
        state.status.textContent = message;
        state.status.dataset.state = kind;
    }

    function updateState(state, message = null, kind = "") {
        if (!state.documentInfo.editable) {
            state.saveButton.disabled = true;
            state.restoreButton.hidden = true;
            state.restoreButton.disabled = true;
            setStatus(state, message || "Editing disabled by Administrator", kind);
            return;
        }

        const draft = state.editor.value;
        const contentError = getDocumentTextError(draft);
        state.dirty = state.ready && draft !== state.savedContent;
        state.saveButton.disabled = !state.ready || !state.dirty || Boolean(contentError);
        state.restoreButton.hidden = false;
        state.restoreButton.disabled = !state.ready || !state.hasOverride;

        if (message) {
            setStatus(state, message, kind);
        } else if (contentError) {
            setStatus(state, contentError, "error");
        } else {
            setStatus(state, state.dirty ? "Unsaved changes" : "All changes saved", state.dirty ? "unsaved" : "saved");
        }
    }

    function loadDisplayedContent(state, content) {
        if (state.documentInfo.editable) {
            state.editor.value = content;
            state.view.hidden = true;
            state.editor.hidden = false;
        } else {
            state.view.replaceChildren();
            if (state.documentInfo.format === "markdown") renderMarkdown(state.view, content);
            else state.view.textContent = content;
            state.view.hidden = false;
            state.editor.hidden = true;
        }
    }

    async function loadDocument(state) {
        try {
            const source = new URL(state.documentInfo.source, document.baseURI);
            if (source.origin !== window.location.origin || !["http:", "https:"].includes(source.protocol)) {
                throw new Error("This document source is unavailable.");
            }
            const response = await fetch(source.href, { credentials: "same-origin" });
            if (!response.ok) throw new Error("The original document could not be loaded.");
            state.originalContent = await response.text();
            const override = normalizeDocumentOverrides(memory.documents)[state.documentInfo.id];
            state.hasOverride = Boolean(override);
            state.savedContent = normalizeLineEndings(override?.content ?? state.originalContent);
            state.ready = true;
            loadDisplayedContent(state, state.savedContent);
            updateState(state);
        } catch (error) {
            state.view.replaceChildren();
            state.view.textContent = "This document could not be loaded right now.";
            state.view.hidden = false;
            state.editor.hidden = true;
            state.saveButton.disabled = true;
            state.restoreButton.disabled = true;
            setStatus(state, error.message || "This document could not be loaded right now.", "error");
        }
    }

    function saveDocument(state) {
        if (!state.documentInfo.editable || !state.ready) return;
        const content = state.editor.value;
        const contentError = getDocumentTextError(content);
        if (contentError) {
            updateState(state, contentError, "error");
            return;
        }
        if (content === state.savedContent) {
            updateState(state);
            return;
        }

        const previousDocuments = memory.documents;
        memory.documents = {
            ...normalizeDocumentOverrides(previousDocuments),
            [state.documentInfo.id]: { content }
        };
        if (saveMemory() !== true) {
            memory.documents = previousDocuments;
            updateState(state, "Could not save this document in this browser. Your edits are still here.", "error");
            return;
        }

        state.savedContent = content;
        state.hasOverride = true;
        updateState(state, "All changes saved locally", "saved");
    }

    function restoreOriginal(state) {
        if (!state.documentInfo.editable || !state.ready || !state.hasOverride || state.originalContent === null) return;
        if (!window.confirm(`Restore the bundled original for ${state.documentInfo.title}? This removes its saved local edits.`)) return;

        const previousDocuments = memory.documents;
        const nextDocuments = normalizeDocumentOverrides(previousDocuments);
        delete nextDocuments[state.documentInfo.id];
        memory.documents = nextDocuments;
        if (saveMemory() !== true) {
            memory.documents = previousDocuments;
            updateState(state, "Could not restore the original in this browser. Your text is still here.", "error");
            return;
        }

        state.hasOverride = false;
        state.savedContent = normalizeLineEndings(state.originalContent);
        loadDisplayedContent(state, state.savedContent);
        updateState(state, "Original restored", "saved");
    }

    function canCloseWindow(windowId) {
        const state = Array.from(states.values()).find(item => item.documentInfo.windowId === windowId);
        if (!state?.dirty) return true;
        if (!window.confirm(`Discard unsaved changes to ${state.documentInfo.title}? Choose Cancel to keep editing.`)) return false;
        state.editor.value = state.savedContent;
        updateState(state);
        return true;
    }

    async function refreshFromMemory() {
        for (const state of states.values()) {
            await state.loading;
            if (!state.documentInfo.editable || !state.ready) continue;
            const override = normalizeDocumentOverrides(memory.documents)[state.documentInfo.id];
            const incoming = normalizeLineEndings(override?.content ?? state.originalContent);
            state.hasOverride = Boolean(override);
            state.savedContent = incoming;
            if (!state.dirty) state.editor.value = incoming;
            const remainsDirty = state.editor.value !== incoming;
            updateState(state, remainsDirty ? "A backup changed the saved copy; your unsaved edits remain." : null, remainsDirty ? "unsaved" : "");
        }
    }

    DOCUMENT_REGISTRY.forEach(documentInfo => {
        const panel = document.querySelector(`[data-notepad-document="${documentInfo.id}"]`);
        if (!panel) return;
        const state = {
            documentInfo,
            panel,
            editor: panel.querySelector("[data-document-editor]"),
            view: panel.querySelector("[data-document-view]"),
            saveButton: panel.querySelector("[data-document-save]"),
            restoreButton: panel.querySelector("[data-document-restore]"),
            status: panel.querySelector("[data-document-status]"),
            originalContent: null,
            savedContent: "",
            hasOverride: false,
            dirty: false,
            ready: false,
            loading: Promise.resolve()
        };
        if (!state.editor || !state.view || !state.saveButton || !state.restoreButton || !state.status) return;
        states.set(documentInfo.id, state);
        state.saveButton.disabled = true;
        state.restoreButton.disabled = true;
        state.status.textContent = "Loading document…";
        state.editor.addEventListener("input", () => updateState(state));
        state.saveButton.addEventListener("click", () => saveDocument(state));
        state.restoreButton.addEventListener("click", () => restoreOriginal(state));
        state.loading = loadDocument(state);
    });

    window.addEventListener("beforeunload", event => {
        if (resetInProgress || window.guidelumeFullResetInProgress === true || !hasUnsavedChanges()) return;
        event.preventDefault();
        event.returnValue = "";
    });
    window.addEventListener("guidelume:documents-updated", () => { void refreshFromMemory(); });

    return { canCloseWindow, hasUnsavedChanges, setResetInProgress(value) { resetInProgress = value === true; } };
}
