import { applyWorkspaceBackup, createWorkspaceBackup, parseWorkspaceBackup, restoreBackupPreferences, serializeWorkspaceBackup, MAX_BACKUP_BYTES } from "./workspace-backup.js";

export function initConfigurationBackup({ memory, defaultMemory, saveMemory, replaceSavedState, knownIcons, knownWindows,
    confirmAction = async ({ message }) => window.confirm(message), beforeRestore = () => {}, getGeneration = () => "", reload = () => window.location.reload() }) {
    const root = document.querySelector("[data-window='backup-restore'] .backup-restore");
    if (!root) return;
    const status = root.querySelector("[data-backup-status]"), preview = root.querySelector("[data-import-preview]");
    const summary = root.querySelector("[data-import-summary]"), fileInput = root.querySelector("[data-import-file]");
    const applyButton = root.querySelector("[data-apply-import]");
    let pendingConfiguration = null, importRequestId = 0, pendingGeneration = "", restoring = false;
    const storage = name => { try { return window[name]; } catch { return null; } };
    const options = () => ({ defaultMemory, knownIcons, knownWindows, viewport: { width: innerWidth, height: innerHeight },
        localStorage: storage("localStorage"), sessionStorage: storage("sessionStorage") });
    function protectImport(value) { root.dataset.syncDirty = String(value); }
    function cancelPendingImport() {
        importRequestId += 1;
        pendingConfiguration = null;
        preview.hidden = true;
        fileInput.value = "";
        protectImport(false);
    }
    const setStatus = (message, state = "") => { status.textContent = message; status.dataset.state = state; };
    function showPreview(configuration, name) {
        pendingConfiguration = configuration;
        protectImport(true);
        summary.textContent = configuration.legacy
            ? `${name}: an older Guidelume backup. Restore all the data it contains; values it never saved stay as they are.`
            : `${name}: a complete Guidelume backup. Restoring replaces your saved desktop, notes, document edits, discoveries, bookmarks and guide preferences.`;
        preview.hidden = false;
        setStatus("Your file is ready. Restore it below, or cancel to keep your current desktop.");
    }
    async function readFile(file) {
        if (!file || restoring) return;
        cancelPendingImport();
        protectImport(true);
        const requestId = importRequestId, generation = getGeneration();
        if (file.size > MAX_BACKUP_BYTES) { protectImport(false); setStatus("This backup exceeds the 4 MiB limit.", "error"); return; }
        try {
            const text = await file.text();
            if (requestId !== importRequestId) return;
            if (generation !== getGeneration()) { cancelPendingImport(); setStatus("Your saved desktop changed. Choose the file again to restore it.", "error"); return; }
            const configuration = parseWorkspaceBackup(text, options());
            pendingGeneration = generation;
            showPreview(configuration, file.name || "Selected file");
        } catch (error) {
            if (requestId === importRequestId) { protectImport(false); setStatus(error.message || "This backup could not be read.", "error"); }
        } finally { if (requestId === importRequestId) fileInput.value = ""; }
    }
    fileInput.addEventListener("change", () => { void readFile(fileInput.files?.[0]); });
    root.closest("[data-window]").addEventListener("windowclosing", () => { if (!restoring) cancelPendingImport(); });
    root.querySelector("[data-cancel-import]").addEventListener("click", () => { if (!restoring) { cancelPendingImport(); setStatus(""); } });
    root.querySelector("[data-export-json]").addEventListener("click", () => {
        try {
            const text = serializeWorkspaceBackup(createWorkspaceBackup(memory, options()));
            const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
            const link = document.createElement("a"); link.href = url; link.download = "guidelume-backup.json"; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus("Your complete backup is ready to save.", "success");
        } catch (error) { setStatus(error.message || "The backup could not be created.", "error"); }
    });
    applyButton.addEventListener("click", async () => {
        if (!pendingConfiguration || restoring) return;
        const configuration = pendingConfiguration, requestId = importRequestId;
        if (pendingGeneration !== getGeneration()) { cancelPendingImport(); setStatus("Your saved desktop changed. Choose the file again to restore it.", "error"); return; }
        if (!await confirmAction({ title: "Restore this backup?", message: "This replaces saved data with the backup and reloads Guidelume. Unsaved edits will be discarded. Export a backup first if you want to keep this desktop.", confirmLabel: "Restore backup" })) return;
        if (configuration !== pendingConfiguration || requestId !== importRequestId) return;
        if (pendingGeneration !== getGeneration()) { cancelPendingImport(); setStatus("Your saved desktop changed. Choose the file again to restore it.", "error"); return; }
        restoring = true; applyButton.disabled = true;
        let rollbackPreferences;
        try {
            beforeRestore();
            const restoreOptions = options();
            rollbackPreferences = restoreBackupPreferences(configuration, restoreOptions);
            if (replaceSavedState) {
                if (!await replaceSavedState(next => applyWorkspaceBackup(next, configuration, restoreOptions), { discardLocal: () => true })) throw new Error("The backup could not be saved. Your current desktop has been kept.");
            } else {
                const previous = { ...memory };
                try { applyWorkspaceBackup(memory, configuration, restoreOptions); if (await saveMemory() === false) throw new Error("The backup could not be saved."); }
                catch (error) { for (const key of Object.keys(memory)) delete memory[key]; Object.assign(memory, previous); throw error; }
            }
            cancelPendingImport();
            setStatus("Backup restored. Reloading your desktop…", "success");
            window.guidelumeFullResetInProgress = true;
            reload();
        } catch (error) {
            try { rollbackPreferences?.(); } catch { setStatus("Restore failed and guide preferences could not be recovered. Keep your backup file and try again.", "error"); return; }
            setStatus(error.message || "The backup could not be restored.", "error");
        } finally { restoring = false; applyButton.disabled = false; }
    });
    return { readFile, cancelPendingImport };
}
