import { applyWorkspaceBackup, createWorkspaceBackup, parseWorkspaceBackup, restoreBackupPreferences, serializeWorkspaceBackup, MAX_BACKUP_BYTES } from "./workspace-backup.js";

export function initConfigurationBackup({ memory, defaultMemory, saveMemory, replaceSavedState, knownIcons, knownWindows,
    confirmAction = async ({ message }) => window.confirm(message), beforeRestore = () => {}, getGeneration = () => "", reload = () => window.location.reload() }) {
    const root = document.querySelector("[data-window='backup-restore'] .backup-restore");
    if (!root) return;
    const status = root.querySelector("[data-backup-status]"), fileInput = root.querySelector("[data-import-file]");
    let importRequestId = 0, confirmation = null, restoring = false;
    const storage = name => { try { return window[name]; } catch { return null; } };
    const options = () => ({ defaultMemory, knownIcons, knownWindows, viewport: { width: innerWidth, height: innerHeight },
        localStorage: storage("localStorage"), sessionStorage: storage("sessionStorage") });
    function protectImport(value) { root.dataset.syncDirty = String(value); }
    function cancelPendingImport() {
        importRequestId += 1;
        confirmation?.abort();
        confirmation = null;
        fileInput.value = "";
        protectImport(false);
    }
    const setStatus = (message, state = "") => { status.textContent = message; status.dataset.state = state; };
    async function readFile(file) {
        if (!file || restoring) return;
        cancelPendingImport();
        protectImport(true);
        setStatus("");
        const requestId = importRequestId, generation = getGeneration();
        if (file.size > MAX_BACKUP_BYTES) { protectImport(false); setStatus("This backup exceeds the 4 MiB limit.", "error"); return; }
        try {
            const text = await file.text();
            if (requestId !== importRequestId) return;
            if (generation !== getGeneration()) { cancelPendingImport(); setStatus("Your saved desktop changed. Choose the file again to restore it.", "error"); return; }
            const configuration = parseWorkspaceBackup(text, options());
            await restoreConfiguration(configuration, requestId, generation);
        } catch (error) {
            if (requestId === importRequestId) { protectImport(false); setStatus(error.message || "This backup could not be read.", "error"); }
        } finally { if (requestId === importRequestId) fileInput.value = ""; }
    }
    fileInput.addEventListener("change", () => { void readFile(fileInput.files?.[0]); });
    root.closest("[data-window]").addEventListener("windowclosing", () => { if (!restoring) cancelPendingImport(); });
    root.querySelector("[data-export-json]").addEventListener("click", () => {
        try {
            const text = serializeWorkspaceBackup(createWorkspaceBackup(memory, options()));
            const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
            const link = document.createElement("a"); link.href = url; link.download = "guidelume-backup.json"; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus("Your complete backup is ready to save.", "success");
        } catch (error) { setStatus(error.message || "The backup could not be created.", "error"); }
    });
    async function restoreConfiguration(configuration, requestId, generation) {
        const controller = new AbortController();
        confirmation = controller;
        const accepted = await confirmAction({ title: "Restore this backup?", intro: "Backup looks valid. Continue?",
            message: (configuration.legacy ? "This older backup replaces the data it contains; anything it never saved stays as it is. " : "This replaces saved data with the backup. ")
                + "Guidelume will reload. Unsaved edits will be discarded. Export a backup first if you want to keep this desktop.",
            confirmLabel: "Restore backup", signal: controller.signal });
        if (requestId !== importRequestId) return;
        confirmation = null;
        if (!accepted) { cancelPendingImport(); setStatus(""); return; }
        if (generation !== getGeneration()) { cancelPendingImport(); setStatus("Your saved desktop changed. Choose the file again to restore it.", "error"); return; }
        restoring = true; fileInput.disabled = true;
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
        } finally { restoring = false; fileInput.disabled = false; protectImport(false); }
    }
    return { readFile, cancelPendingImport };
}
