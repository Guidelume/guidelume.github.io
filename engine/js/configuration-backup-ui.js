import {
    applyConfiguration,
    configurationCategories,
    configurationPreview,
    createConfiguration,
    decodeConfigurationCode,
    encodeConfiguration,
    parseConfiguration,
    serializeConfiguration,
    MAX_CONFIGURATION_BYTES
} from "./configuration-backup.js";
import { concealUndiscoveredCategoryNames, configurationCategoryGroups } from "./configuration-backup-categories.js";
import { findDiscovery } from "./discovery-registry.js";

export function initConfigurationBackup({ memory, saveMemory, knownIcons, knownWindows, applyLiveConfiguration }) {
    const root = document.querySelector("[data-window='backup-restore'] .backup-restore");
    if (!root) return;
    const exportList = root.querySelector("[data-export-categories]");
    const importList = root.querySelector("[data-import-categories]");
    const status = root.querySelector("[data-backup-status]");
    const preview = root.querySelector("[data-import-preview]");
    const summary = root.querySelector("[data-import-summary]");
    const fileInput = root.querySelector("[data-import-file]");
    const codeInput = root.querySelector("[data-import-code]");
    const importVersion = root.querySelector("[data-import-version]");
    let pendingConfiguration = null;
    let pendingSource = null;
    let importRequestId = 0;

    function cancelPendingImport() {
        importRequestId += 1;
        pendingConfiguration = null;
        pendingSource = null;
        preview.hidden = true;
    }

    const selectedChecks = container => Array.from(container.querySelectorAll(".backup-category-option[aria-pressed='true']"), button => button.dataset.category);
    const updateGroupCounts = container => container.querySelectorAll(".backup-category-group").forEach(group => {
        const total = group.querySelectorAll(".backup-category-option").length;
        group.querySelector(".backup-group-count").textContent = `${selectedChecks(group).length} of ${total} selected`;
        group.querySelectorAll(".backup-category-entry").forEach(entry => {
            const badge = entry.querySelector(".backup-preview-badge");
            if (badge) badge.textContent = entry.querySelector("button").getAttribute("aria-pressed") === "true" ? "RESTORE" : "SKIP";
        });
    });
    const makeCategoryChecks = (container, prefix, groups, { preserveSelection = false, changes = {} } = {}) => {
        const previous = new Map(Array.from(container.querySelectorAll(".backup-category-option"), button => [button.dataset.category, button.getAttribute("aria-pressed") === "true"]));
        const expanded = new Set(Array.from(container.querySelectorAll(".backup-category-group[open]"), group => group.dataset.group));
        container.replaceChildren();
        groups.forEach(group => {
            const disclosure = document.createElement("details");
            disclosure.className = "backup-category-group";
            disclosure.dataset.group = group.id;
            disclosure.open = preserveSelection && expanded.has(group.id);
            const heading = document.createElement("summary");
            const label = document.createElement("span");
            label.textContent = group.label;
            const count = document.createElement("span");
            count.className = "backup-group-count";
            heading.append(label, count);
            const content = document.createElement("div");
            content.className = "backup-group-content";
            if (group.description) {
                const description = document.createElement("p");
                description.className = "backup-group-description";
                description.textContent = group.description;
                content.append(description);
            }
            group.categories.forEach(category => {
                const entry = document.createElement("div");
                entry.className = "backup-category-entry";
                const button = document.createElement("button");
                button.type = "button";
                button.className = "backup-category-option";
                button.dataset.category = category.id;
                const selected = preserveSelection ? previous.get(category.id) ?? true : true;
                button.setAttribute("aria-pressed", String(selected));
                button.classList.toggle("is-selected", selected);
                button.textContent = category.label;
                button.addEventListener("click", () => {
                    const pressed = button.getAttribute("aria-pressed") !== "true";
                    button.setAttribute("aria-pressed", String(pressed));
                    button.classList.toggle("is-selected", pressed);
                    updateGroupCounts(container);
                    container.dispatchEvent(new Event("change", { bubbles: false }));
                });
                entry.append(button);
                if (prefix === "import") {
                    const details = document.createElement("div");
                    details.className = "backup-preview-details";
                    const description = document.createElement("span");
                    description.id = `backup-${prefix}-${category.id}-preview`;
                    const fields = changes[category.id] || [];
                    description.textContent = category.hidden ? "Saved application contents and preferences. Discovery state is kept."
                        : fields.length ? fields.join(" · ") : "Values from this backup will be applied";
                    button.setAttribute("aria-describedby", description.id);
                    const badge = document.createElement("span");
                    badge.className = "backup-preview-badge";
                    details.append(description, badge);
                    entry.append(details);
                }
                content.append(entry);
            });
            disclosure.append(heading, content);
            container.append(disclosure);
        });
        updateGroupCounts(container);
    };

    const exportChecks = () => selectedChecks(exportList);
    const setSelection = (container, selected) => {
        container.querySelectorAll(".backup-category-option").forEach(button => {
            button.setAttribute("aria-pressed", String(selected));
            button.classList.toggle("is-selected", selected);
        });
        updateGroupCounts(container);
    };
    const updateExportButtons = () => {
        const disabled = exportChecks().length === 0;
        root.querySelectorAll("[data-export-json], [data-export-code]").forEach(button => { button.disabled = disabled; });
    };
    const setStatus = (message, kind = "") => {
        status.textContent = concealUndiscoveredCategoryNames(message, memory);
        status.dataset.state = kind;
    };
    const createSelectedConfiguration = () => createConfiguration(memory, exportChecks(), knownIcons, knownWindows);
    const refreshCategories = () => {
        makeCategoryChecks(exportList, "export", configurationCategoryGroups(memory), { preserveSelection: true });
        updateExportButtons();
        if (pendingConfiguration) renderImportPreview(true);
        status.textContent = concealUndiscoveredCategoryNames(status.textContent, memory);
    };

    root.querySelector("[data-select-all-categories]").addEventListener("click", () => {
        setSelection(exportList, true);
        updateExportButtons();
    });
    root.querySelector("[data-deselect-all-categories]").addEventListener("click", () => {
        setSelection(exportList, false);
        updateExportButtons();
    });
    exportList.addEventListener("change", updateExportButtons);
    refreshCategories();

    root.querySelector("[data-export-json]").addEventListener("click", () => {
        try {
            const bytes = serializeConfiguration(createSelectedConfiguration());
            const url = URL.createObjectURL(new Blob([bytes], { type: "application/json;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "guidelume-settings.json";
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus("Your settings file is ready to save.", "success");
        } catch (error) {
            setStatus(error.message || "Could not export these settings.", "error");
        }
    });

    root.querySelector("[data-export-code]").addEventListener("click", async () => {
        let code;
        try {
            code = encodeConfiguration(createSelectedConfiguration());
        } catch (error) {
            setStatus(error.message || "Could not export these settings.", "error");
            return;
        }
        try {
            await navigator.clipboard.writeText(code);
            setStatus("Configuration code copied to the clipboard.", "success");
        } catch {
            let temporary;
            try {
                temporary = document.createElement("textarea");
                temporary.value = code;
                temporary.setAttribute("readonly", "");
                temporary.style.position = "fixed";
                temporary.style.opacity = "0";
                document.body.append(temporary);
                temporary.select();
                const copied = document.execCommand("copy");
                if (!copied) throw new Error();
                setStatus("Configuration code copied to the clipboard.", "success");
            } catch {
                setStatus("Clipboard access is unavailable. Try again from a secure browser context.", "error");
            } finally {
                temporary?.remove();
            }
        }
    });

    function showPreview(configuration, source) {
        pendingConfiguration = configuration;
        pendingSource = source;
        renderImportPreview();
        importVersion.textContent = `Guidelume configuration · version ${configuration.formatVersion}`;
        preview.hidden = false;
        setStatus("Review the categories and confirm before applying.");
    }

    function renderImportPreview(preserveSelection = false) {
        const configuration = pendingConfiguration;
        const categories = configurationCategories.filter(category => Object.hasOwn(configuration.categories, category.id));
        const groups = configurationCategoryGroups(memory, categories);
        const changes = configurationPreview(configuration, memory);
        makeCategoryChecks(importList, "import", groups, { preserveSelection, changes });
        const instructions = document.createElement("p");
        instructions.className = "backup-preview-instructions";
        instructions.textContent = "Selected categories replace matching preferences. Unselected and missing categories remain unchanged.";
        const previewNodes = [instructions];
        if (categories.some(category => category.id === "widgets")) {
            const warning = document.createElement("p");
            warning.className = "backup-preview-warning";
            warning.textContent = "Restoring Widgets replaces the current widget setup and all current Sticky Notes, including their text.";
            previewNodes.push(warning);
        }
        if (categories.some(category => category.id === "documents")) {
            const warning = document.createElement("p");
            warning.className = "backup-preview-warning";
            warning.textContent = "Restoring Documents replaces the locally saved edits to supported documents.";
            previewNodes.push(warning);
        }
        const applicationWarnings = new Set(groups.flatMap(group => group.categories.map(category => category.restoreWarning)).filter(Boolean));
        applicationWarnings.forEach(message => {
            const warning = document.createElement("p");
            warning.className = "backup-preview-warning";
            warning.textContent = message;
            previewNodes.push(warning);
        });
        summary.replaceChildren(...previewNodes);
        updateImportButton();
    }

    function updateImportButton() {
        root.querySelector("[data-apply-import]").disabled = selectedChecks(importList).length === 0;
    }
    importList.addEventListener("change", updateImportButton);

    async function readFile(file) {
        if (!file) return;
        cancelPendingImport();
        const requestId = importRequestId;
        pendingSource = "file";
        if (file.size > MAX_CONFIGURATION_BYTES) {
            fileInput.value = "";
            setStatus("This configuration file is too large.", "error");
            return;
        }
        try {
            const text = await file.text();
            if (requestId !== importRequestId) return;
            const configuration = parseConfiguration(text, knownIcons, knownWindows);
            showPreview(configuration, "file");
        } catch (error) {
            if (requestId === importRequestId) setStatus(error.message || "Could not read this configuration file.", "error");
        } finally {
            if (requestId === importRequestId) fileInput.value = "";
        }
    }
    fileInput.addEventListener("change", () => readFile(fileInput.files?.[0]));

    root.querySelector("[data-preview-code]").addEventListener("click", () => {
        cancelPendingImport();
        const code = codeInput.value;
        const discovery = findDiscovery(code);
        if (discovery) {
            pendingConfiguration = null;
            preview.hidden = true;
            const icon = document.querySelector(`.desktop-icon[data-icon="${discovery.id}"]`);
            const alreadyDiscovered = memory.settings[discovery.flag] === true;
            memory.settings[discovery.flag] = true;
            if (icon) icon.hidden = false;
            if (saveMemory() !== true) {
                memory.settings[discovery.flag] = alreadyDiscovered;
                if (icon) icon.hidden = !alreadyDiscovered;
                setStatus("The discovery could not be saved in this browser.", "error");
                return;
            }
            codeInput.value = "";
            refreshCategories();
            setStatus("A hidden desktop item has appeared.", "success");
            return;
        }
        try {
            const configuration = decodeConfigurationCode(code, knownIcons, knownWindows);
            showPreview(configuration, "code");
        } catch (error) {
            pendingConfiguration = null;
            preview.hidden = true;
            setStatus(error.message || "Could not read this configuration code.", "error");
        }
    });

    root.querySelector("[data-clear-code]").addEventListener("click", () => {
        codeInput.value = "";
        if (pendingSource === "code" || !pendingConfiguration) cancelPendingImport();
        setStatus("Pasted code cleared.");
        codeInput.focus();
    });

    root.querySelector("[data-cancel-import]").addEventListener("click", () => {
        cancelPendingImport();
        setStatus("Import cancelled.");
    });
    root.closest("[data-window]")?.addEventListener("windowclosing", () => {
        // Keep a completed preview, but never publish a read after closing.
        if (!pendingConfiguration) cancelPendingImport();
    });

    root.querySelector("[data-apply-import]").addEventListener("click", () => {
        if (!pendingConfiguration) return;
        const selected = selectedChecks(importList);
        if (selected.length === 0) {
            setStatus("Choose at least one category to restore.", "error");
            return;
        }
        const categories = configurationCategories.filter(category => Object.hasOwn(pendingConfiguration.categories, category.id));
        const presented = configurationCategoryGroups(memory, categories).flatMap(group => group.categories)
            .filter(category => selected.includes(category.id));
        const labels = presented.map(category => category.label).join(", ");
        const widgetWarning = selected.includes("widgets")
            ? "\n\nRestoring Widgets replaces the current widget setup and all current Sticky Notes, including their text."
            : "";
        const documentsWarning = selected.includes("documents")
            ? "\n\nRestoring Documents replaces saved local edits for supported documents."
            : "";
        const applicationWarnings = Array.from(new Set(presented.map(category => category.restoreWarning).filter(Boolean)))
            .map(message => `\n\n${message}`).join("");
        if (!window.confirm(`Replace the current preferences in these categories?\n\n${labels}\n\nOther settings will remain unchanged.${widgetWarning}${documentsWarning}${applicationWarnings}`)) return;
        // applyConfiguration stages replacements without mutating the old objects.
        // Retain those originals so rollback keeps live widget references valid.
        const backup = { ...memory };
        try {
            applyConfiguration(memory, pendingConfiguration, selected, {
                knownIcons,
                knownWindows,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            });
            applyLiveConfiguration(selected);
            if (saveMemory() !== true) throw new Error("Could not save restored settings.");
            if (selected.includes("documents")) window.dispatchEvent(new Event("guidelume:documents-updated"));
            cancelPendingImport();
            refreshCategories();
            setStatus("Selected settings restored.", "success");
        } catch {
            try {
                Object.keys(memory).forEach(key => delete memory[key]);
                Object.assign(memory, backup);
                applyLiveConfiguration(selected);
                if (saveMemory() !== true) {
                    console.error("Backup & Restore could not save the recovered settings after a failed import.");
                }
            } catch (rollbackError) {
                console.error("Backup & Restore could not fully roll back a failed import.", rollbackError);
            }
            setStatus("Settings could not be applied. Your current preferences were restored.", "error");
        }
    });
    return { refreshCategories };
}
