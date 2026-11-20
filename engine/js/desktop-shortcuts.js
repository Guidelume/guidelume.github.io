import { findAvailableIconPosition, getDesktopBounds } from "./desktop-bounds.js";
import { initDesktopContextMenu } from "./desktop-context-menu.js";
import { initDesktopProperties } from "./desktop-properties.js";
import { MAX_DESKTOP_SHORTCUTS, MAX_SHORTCUT_NAME, shortcutGuides, shortcutTargetFromUrl, shortcutTargetUrl,
    nativeContextMenuRequested } from "./desktop-shortcuts-data.js";

export function initDesktopShortcuts({ desktop, memory, saveMemory, iconController, windowManager, toast, confirmAction, onDeleteRecycleBin }) {
    const menu = initDesktopContextMenu();
    if (!desktop.hasAttribute("tabindex")) desktop.tabIndex = -1;
    const properties = initDesktopProperties({ windowManager });
    const bin = desktop.querySelector('[data-icon="recycle-bin"]');
    const binWindow = document.querySelector('[data-window="recycle-bin"]');
    const list = binWindow.querySelector("[data-recycle-items]");
    const preference = document.querySelector("[data-desktop-context-menus]");
    const icons = new Map();
    const items = () => Object.entries(memory.shortcuts || {});
    const deleted = () => items().filter(([, item]) => item.deletedAt !== null);
    const image = full => `./engine/img/environment/recycle-bin-${full ? "full" : "empty"}.svg`;

    // Native modal behavior supplies focus containment, Escape and inert background.
    // The shared OS confirmation styling keeps naming/properties in the same shell.
    const dialog = document.createElement("dialog");
    dialog.className = "guidelume-confirm-dialog desktop-object-dialog";
    dialog.dataset.desktopObjectDialog = "true";
    dialog.setAttribute("aria-labelledby", "desktop-object-dialog-title");
    const form = document.createElement("form"); form.method = "dialog";
    form.className = "guidelume-confirm-dialog__content";
    const heading = document.createElement("h2"); heading.id = "desktop-object-dialog-title";
    const message = document.createElement("p"); message.className = "desktop-object-message";
    const label = document.createElement("label"); label.textContent = "Shortcut name";
    const input = document.createElement("input"); input.type = "text"; input.required = true;
    input.maxLength = MAX_SHORTCUT_NAME; input.autocomplete = "off"; input.dataset.shortcutName = "true"; label.append(input);
    const actions = document.createElement("div"); actions.className = "guidelume-confirm-dialog__actions";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
    const accept = document.createElement("button"); accept.type = "submit"; accept.textContent = "Save";
    for (const button of [cancel, accept]) button.className = "guidelume-confirm-dialog__button";
    actions.append(cancel, accept); form.append(heading, message, label, actions); dialog.append(form); document.body.append(dialog);
    let finishPrompt;
    function finish(value) { finishPrompt?.(value); }
    cancel.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    form.addEventListener("submit", event => {
        event.preventDefault();
        if (!label.hidden && !input.value.trim()) { input.setCustomValidity("Enter a shortcut name."); input.reportValidity(); return; }
        finish(label.hidden ? true : input.value.trim());
    });
    input.addEventListener("input", () => input.setCustomValidity(""));
    function prompt({ title, text = "", name, id = "", opener }) {
        if (dialog.open || document.querySelector("dialog[open]")) return Promise.resolve(null);
        heading.textContent = title; message.textContent = text; message.hidden = !text;
        label.hidden = name === undefined; input.disabled = label.hidden;
        input.value = Array.from(name || "").slice(0, MAX_SHORTCUT_NAME).join(""); input.setCustomValidity("");
        cancel.hidden = label.hidden; accept.textContent = label.hidden ? "Close" : "Save";
        dialog.dataset.shortcutEditing = id;
        return new Promise(resolve => {
            finishPrompt = value => {
                finishPrompt = null; dialog.close(); delete dialog.dataset.shortcutEditing;
                const target = opener?.isConnected && opener.getClientRects().length ? opener : windowManager.getFocusTarget();
                target?.focus({ preventScroll: true });
                window.dispatchEvent(new Event("guidelume:interaction-ended"));
                resolve(value);
            };
            dialog.showModal();
            if (label.hidden) accept.focus(); else { input.focus(); input.select(); }
        });
    }
    async function save() {
        let result = false;
        try { result = await saveMemory(); } catch { /* The staged change remains available for retry/review. */ }
        if (result !== true) toast.show("This change is retained in this tab. Review saved changes in Blackwall or try saving again.", "error", { title: "SYSTEM NOTICE" });
        return result === true;
    }

    function captureGuide(id) {
        const frame = document.querySelector(`[data-window="${id}"] iframe`);
        try {
            const child = frame?.contentWindow;
            if (!frame?.hasAttribute("src") || child.document.readyState !== "complete") return null;
            const bookmarkState = child.guidelumeGetBookmarkState?.();
            if (child.guidelumeGetBookmarkState && (!bookmarkState || bookmarkState.error)) return null;
            const state = child.guidelumeGetResourceState?.();
            const section = state?.activeAnchorId || state?.currentPanelId || "";
            const target = shortcutTargetFromUrl(id, bookmarkState?.href || child.location.href, section);
            if (!target || target.path === shortcutGuides[id].home) return null;
            const sectionNode = section ? child.document.getElementById(section) : null;
            const sectionName = sectionNode?.querySelector("h2,h3,h4")?.textContent?.trim();
            const pageName = (bookmarkState?.title || child.document.title).replace(/^\s*\|\s*/, "").trim() || shortcutGuides[id].title;
            return { target, name: sectionName ? `${sectionName} — ${pageName}` : pageName };
        } catch { return null; }
    }
    async function bookmarkGuide(guide, opener) {
        const current = captureGuide(guide);
        if (!current) { toast.show("This guide page is still loading or cannot be bookmarked.", "error", { title: "SYSTEM NOTICE" }); return; }
        if (items().length >= MAX_DESKTOP_SHORTCUTS) {
            toast.show(`You can keep ${MAX_DESKTOP_SHORTCUTS} shortcuts, including those in the Recycle Bin. Empty the bin to make room.`, "error", { title: "SYSTEM NOTICE" }); return;
        }
        const id = `shortcut-${crypto.randomUUID()}`;
        const name = await prompt({ title: "Create Desktop Shortcut", name: current.name, id, opener });
        if (!name) return;
        const now = Date.now();
        memory.shortcuts[id] = { name, target: current.target, x: .5, y: .18, deletedAt: null, createdAt: now, modifiedAt: now };
        render();
        placeInFreeSpace(id);
        if (await save()) toast.show(`“${name}” added to the desktop. Click it to return to this location.`, "success", { title: "SHORTCUT CREATED" });
    }
    for (const id of Object.keys(shortcutGuides)) {
        const root = document.querySelector(`[data-window="${id}"]`);
        const navigation = root?.querySelector(".iframe-navigation-controls");
        const frame = root?.querySelector("iframe");
        if (!navigation || !frame) continue;
        const button = document.createElement("button"); button.type = "button";
        button.className = "iframe-navigation-button"; button.dataset.bookmarkGuide = id;
        button.title = "Create desktop shortcut"; button.setAttribute("aria-label", "Create desktop shortcut");
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 8h6M12 5v6"/></svg>';
        navigation.querySelector('[data-iframe-navigation="home"]')?.after(button);
        const refresh = () => {
            button.disabled = !captureGuide(id);
            button.title = button.disabled ? "Open a content page to create a shortcut" : "Create desktop shortcut";
        };
        button.addEventListener("click", () => { void bookmarkGuide(id, button); });
        let childEvents;
        frame.addEventListener("load", () => {
            childEvents?.abort(); childEvents = new AbortController();
            try { frame.contentWindow.addEventListener("guidelume:bookmark-state-changed", refresh, { signal: childEvents.signal }); } catch { /* Cross-origin destinations are unsupported. */ }
            refresh();
        });
        root.addEventListener("windowclosing", () => cancelNavigation(id));
        new MutationObserver(() => { button.disabled = true; }).observe(frame, { attributes: true, attributeFilter: ["src"] });
        refresh();
    }

    const navigationVersions = new Map();
    const navigationCleanups = new Map();
    function cancelNavigation(guide) {
        navigationCleanups.get(guide)?.();
        navigationVersions.set(guide, (navigationVersions.get(guide) || 0) + 1);
    }
    window.addEventListener("pagehide", () => { for (const guide of navigationCleanups.keys()) cancelNavigation(guide); });
    async function openShortcut(id) {
        const shortcut = memory.shortcuts?.[id];
        if (!shortcut || shortcut.deletedAt !== null) return;
        const target = structuredClone(shortcut.target), url = shortcutTargetUrl(target);
        if (!url) { toast.show("This shortcut points to an unavailable guide location.", "error", { title: "SYSTEM NOTICE" }); return; }
        navigationCleanups.get(target.guide)?.();
        const token = (navigationVersions.get(target.guide) || 0) + 1;
        navigationVersions.set(target.guide, token);
        const opened = await windowManager.openWindow(target.guide);
        if (opened === false || navigationVersions.get(target.guide) !== token) return;
        const root = windowManager.getWindow(target.guide), frame = root?.querySelector("iframe");
        if (!frame || root.hidden || !memory.windows[target.guide]?.open) return;
        const state = windowManager.getWindowMemory(target.guide);
        delete state.iframePageState; delete frame.dataset.resourceRestore;
        state.iframeUrl = url;
        // Setting src also cancels the manager's deferred initial navigation.
        // Each guide's existing hash restoration runs after its DOM is ready.
        let timeout, readerWindow;
        const cleanup = () => {
            clearTimeout(timeout); frame.removeEventListener("load", complete);
            readerWindow?.removeEventListener("guidelume:bookmark-state-changed", complete);
            navigationCleanups.delete(target.guide);
        };
        const complete = () => {
            if (navigationVersions.get(target.guide) !== token) return;
            try {
                const current = frame.contentWindow.location;
                // A previous navigation's queued load must not complete this one.
                const destination = new URL(url);
                if (current.pathname !== destination.pathname || current.search !== destination.search) return;
                const child = frame.contentWindow;
                if (readerWindow !== child) {
                    readerWindow?.removeEventListener("guidelume:bookmark-state-changed", complete);
                    readerWindow = child;
                    child.addEventListener("guidelume:bookmark-state-changed", complete);
                }
                const bookmarkState = child.guidelumeGetBookmarkState?.();
                if (child.guidelumeGetBookmarkState && !bookmarkState) return;
                cleanup();
                const status = frame.contentWindow.performance.getEntriesByType("navigation")[0]?.responseStatus;
                if (status >= 400 || !frame.contentDocument?.title || bookmarkState?.error) throw new Error("Unavailable page");
                if (bookmarkState?.unavailableChapter) {
                    toast.show("That chapter is no longer available. The story’s first chapter has been opened instead.", "error", { title: "SYSTEM NOTICE" });
                } else if (target.hash) {
                    const doc = frame.contentDocument;
                    const found = doc?.getElementById(target.hash) || [...(doc?.querySelectorAll("[data-guide-legacy-id]") || [])].find(node => node.dataset.guideLegacyId === target.hash);
                    if (!found) toast.show("That section is no longer available. The guide page has been opened instead.", "error", { title: "SYSTEM NOTICE" });
                }
            } catch { cleanup(); toast.show("The shortcut destination could not be loaded. You can use the guide’s Home button to continue.", "error", { title: "SYSTEM NOTICE" }); }
        };
        navigationCleanups.set(target.guide, cleanup);
        frame.addEventListener("load", complete);
        timeout = setTimeout(() => {
            cleanup();
            if (navigationVersions.get(target.guide) === token) toast.show("The guide is taking longer to load. Your shortcut remains saved; try opening it again.", "error", { title: "SYSTEM NOTICE" });
        }, 20000);
        frame.src = url;
        await save();
    }

    function placeInFreeSpace(id) {
        const node = icons.get(id), item = memory.shortcuts[id];
        if (!node || !item) return;
        const rect = node.getBoundingClientRect(), desktopRect = desktop.getBoundingClientRect();
        const occupied = [...desktop.querySelectorAll(".desktop-icon")].filter(other => other !== node && other.getClientRects().length).map(other => other.getBoundingClientRect());
        const position = findAvailableIconPosition(rect, getDesktopBounds(), occupied, { gap: 8 });
        item.x = (position.left - desktopRect.left + desktop.scrollLeft) / desktopRect.width;
        item.y = (position.top - desktopRect.top + desktop.scrollTop) / desktopRect.height;
        iconController.refreshRestoredPositions();
    }
    async function rename(id, opener) {
        const item = memory.shortcuts?.[id];
        if (!item || item.deletedAt !== null) return;
        const name = await prompt({ title: "Rename Shortcut", name: item.name, id, opener });
        if (!name || !memory.shortcuts?.[id]) return;
        memory.shortcuts[id].name = name; memory.shortcuts[id].modifiedAt = Date.now(); render(); await save();
    }
    async function recycle(id) {
        const item = memory.shortcuts?.[id];
        if (!item || item.deletedAt !== null) return;
        item.deletedAt = Date.now(); item.modifiedAt = item.deletedAt; render(); await save();
    }
    async function restore(id) {
        const item = memory.shortcuts?.[id];
        if (!item || item.deletedAt === null) return;
        item.deletedAt = null; item.modifiedAt = Date.now(); render(); placeInFreeSpace(id); await save();
    }
    async function removePermanently(ids) {
        const entries = ids.map(id => [id, memory.shortcuts?.[id]?.deletedAt]).filter(([, time]) => Number.isFinite(time));
        if (!entries.length) return;
        if (!await confirmAction({ title: "Delete shortcuts permanently?", message: `Permanently delete ${entries.length} shortcut${entries.length === 1 ? "" : "s"}? Their guide pages are kept. This cannot be undone.`, confirmLabel: "Delete permanently" })) return;
        for (const [id, time] of entries) if (memory.shortcuts?.[id]?.deletedAt === time) delete memory.shortcuts[id];
        render(); await save();
    }

    function render() {
        menu.close();
        const focusedShortcut = document.activeElement?.closest(".desktop-shortcut");
        const current = new Set();
        for (const [id, item] of items()) {
            if (item.deletedAt !== null) continue;
            current.add(id);
            let icon = icons.get(id);
            if (!icon) {
                icon = document.createElement("div"); icon.className = "desktop-icon desktop-shortcut";
                icon.setAttribute("role", "button"); icon.tabIndex = 0;
                icon.dataset.icon = id; icon.dataset.shortcutId = id; icon.dataset.resourceType = "shortcut";
                const picture = document.createElement("img"); picture.alt = "";
                const caption = document.createElement("span"); icon.append(picture, caption); desktop.append(icon); icons.set(id, icon);
            }
            icon.querySelector("img").src = new URL(shortcutGuides[item.target.guide].icon, new URL("../../", import.meta.url)).href;
            icon.querySelector("span").textContent = item.name;
            icon.title = `${item.name}\nShortcut to ${shortcutGuides[item.target.guide].title}`;
            icon.setAttribute("aria-label", `${item.name}, shortcut`);
        }
        for (const [id, icon] of icons) if (!current.has(id)) { icon.remove(); icons.delete(id); }
        if (focusedShortcut && !focusedShortcut.isConnected) {
            if (focusedShortcut.dataset.pointerFocus) bin.dataset.pointerFocus = "true";
            bin.focus({ preventScroll: true });
        }
        const deletedItems = deleted();
        for (const node of [bin, binWindow]) node?.querySelector("img")?.setAttribute("src", image(deletedItems.length > 0));
        bin.dataset.binState = deletedItems.length ? "full" : "empty";
        bin.title = `Recycle Bin (${deletedItems.length ? `${deletedItems.length} deleted shortcut${deletedItems.length === 1 ? "" : "s"}` : "empty"})`;
        bin.setAttribute("aria-label", `Recycle Bin, ${deletedItems.length} deleted shortcut${deletedItems.length === 1 ? "" : "s"}`);
        const active = document.activeElement?.closest("[data-bin-shortcut]");
        const focusedId = active?.dataset.binShortcut, focusedAction = document.activeElement?.dataset.binAction;
        const scroll = list.scrollTop;
        list.replaceChildren(...deletedItems.map(([id, item]) => {
            const row = document.createElement("li"); row.dataset.binShortcut = id; row.className = "recycle-bin-item";
            const title = document.createElement("strong"); title.textContent = item.name;
            const detail = document.createElement("span"); detail.textContent = shortcutGuides[item.target.guide].title;
            const copy = document.createElement("div"); copy.append(title, detail); row.append(copy);
            for (const [text, action] of [["Restore", "restore"], ["Delete permanently", "delete"]]) {
                const button = document.createElement("button"); button.type = "button"; button.className = "setup-button";
                button.textContent = text; button.dataset.binAction = action;
                button.setAttribute("aria-label", `${text}: ${item.name}`);
                button.addEventListener("click", () => { if (action === "restore") void restore(id); else void removePermanently([id]); });
                row.append(button);
            }
            return row;
        }));
        list.scrollTop = scroll;
        binWindow.querySelector("[data-recycle-empty]").hidden = deletedItems.length !== 0;
        binWindow.querySelector("[data-empty-recycle-bin]").disabled = deletedItems.length === 0;
        binWindow.querySelector("[data-recycle-count]").textContent = `${deletedItems.length} deleted shortcut${deletedItems.length === 1 ? "" : "s"}`;
        if (focusedId) (list.querySelector(`[data-bin-shortcut="${CSS.escape(focusedId)}"] [data-bin-action="${focusedAction}"]`)
            || list.querySelector("button") || binWindow.querySelector("[data-recycle-count]"))?.focus({ preventScroll: true });
        iconController.syncIcons(); windowManager.updateTaskbar();
    }
    function resource(icon) {
        if (icon === bin) return { type: "bin", name: "Recycle Bin" };
        if (icon.dataset.resourceType === "shortcut" && memory.shortcuts?.[icon.dataset.shortcutId]) return { type: "shortcut", id: icon.dataset.shortcutId, name: memory.shortcuts[icon.dataset.shortcutId].name };
        if (icon.matches(".virtual-folder-entry")) {
            const owner = icon.closest("[data-window]"), windowId = owner?.dataset.window;
            const name = icon.querySelector("span")?.textContent || "System resource";
            const paths = { "folder-documents": "Documents", "folder-system": "System", "folder-unfinished": "System\\Unfinished", "folder-mods": "Mods" };
            const vault = windowId === "developer-vault";
            const path = vault ? "Developer Vault" + (icon.closest("[data-vault-folder-list]") ? "\\" + owner.querySelector("[data-vault-folder-path]").textContent.split(" / ").join("\\") : "")
                : paths[windowId] || owner?.querySelector(".titlebar-left span")?.textContent || "Desktop";
            return { type: vault ? "file" : "system", id: `${windowId}:${icon.dataset.openWindow || path + "\\" + name}`, name,
                location: `Guidelume:\\${path}`, hiddenFile: icon.hasAttribute("data-hidden-file"),
                folder: icon.dataset.openWindow?.startsWith("folder-") || icon.querySelector('img[data-seasonal-icon="folder"]') !== null };
        }
        return { type: "system", name: icon.querySelector("span")?.textContent || "System resource" };
    }
    function refreshHiddenFiles() {
        menu.close(true);
        const focused = document.activeElement?.closest("[data-hidden-file]");
        desktop.querySelectorAll("[data-hidden-file]").forEach(item => { item.hidden = memory.settings.showHiddenFiles !== true; });
        if (focused?.hidden) focused.closest(".virtual-folder-content")?.focus({ preventScroll: true });
        properties.refreshVisibility();
    }
    async function toggleHiddenFiles() {
        memory.settings.showHiddenFiles = memory.settings.showHiddenFiles !== true;
        refreshHiddenFiles();
        await save();
    }
    function showMenu(event, icon, surface = desktop) {
        const native = event.type === "keydown" ? memory.settings?.desktopContextMenus === "browser" : nativeContextMenuRequested(event, memory);
        if (native) { menu.close(); return; }
        event.preventDefault();
        const rect = (icon || surface).getBoundingClientRect();
        const actions = icon ? (() => {
            const object = resource(icon), shortcut = object.type === "shortcut", recycleBin = object.type === "bin", folderEntry = icon.matches(".virtual-folder-entry");
            return [
                { label: "Open", disabled: folderEntry && (icon.disabled || icon.classList.contains("is-placeholder")),
                    run: () => shortcut ? openShortcut(object.id) : folderEntry ? icon.isConnected && icon.getClientRects().length && icon.click() : windowManager.openWindow(icon.dataset.openWindow) },
                ...(recycleBin ? [{ label: "Empty Recycle Bin", disabled: !deleted().length, run: () => removePermanently(deleted().map(([id]) => id)) }] : []),
                { label: "Rename", disabled: !shortcut, run: () => rename(object.id, icon) },
                { label: "Delete", disabled: !shortcut && !recycleBin, run: () => recycleBin
                    ? onDeleteRecycleBin() : recycle(object.id) },
                { label: "Properties", run: () => properties.show(icon, object, memory) }
            ];
        })() : surface !== desktop ? [] : [
            { label: "Open Recycle Bin", run: () => windowManager.openWindow("recycle-bin") },
            { label: "Desktop Settings…", run: () => windowManager.openWindow("settings") }
        ];
        actions.push({ label: "Show hidden files", checked: memory.settings.showHiddenFiles === true, run: toggleHiddenFiles });
        menu.show({ x: event.clientX || rect.left + 12, y: event.clientY || rect.top + 12, target: icon || surface, actions,
            label: icon?.matches(".virtual-folder-entry") ? "Folder item actions" : surface !== desktop ? "Folder actions" : "Desktop actions" });
    }
    desktop.querySelectorAll(".virtual-folder-content").forEach(surface => { if (!surface.hasAttribute("tabindex")) surface.tabIndex = 0; });
    desktop.addEventListener("contextmenu", event => {
        const icon = event.target.closest(".desktop-icon, .virtual-folder-entry");
        const surface = event.target.closest(".virtual-folder-content");
        // Other window content, widgets, text and embedded pages keep native menus.
        if (icon || event.target === desktop || event.target === surface) showMenu(event, icon, surface || desktop);
    });
    desktop.addEventListener("keydown", event => {
        const icon = event.target.closest(".desktop-icon, .virtual-folder-entry");
        const surface = event.target.closest(".virtual-folder-content");
        if ((event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) && (icon || event.target === surface)) {
            showMenu(event, icon, surface || desktop);
        }
        if (event.key === "F2" && icon && resource(icon).type === "shortcut") { event.preventDefault(); void rename(icon.dataset.shortcutId, icon); }
        if (event.key === "Delete" && icon) {
            const object = resource(icon);
            if (object.type === "shortcut") { event.preventDefault(); void recycle(object.id); }
            else if (object.type === "bin") { event.preventDefault(); onDeleteRecycleBin(); }
        }
    });
    binWindow.querySelector("[data-empty-recycle-bin]").addEventListener("click", () => { void removePermanently(deleted().map(([id]) => id)); });
    function refreshPreference() {
        preference.value = memory.settings.desktopContextMenus;
        window.dispatchEvent(new Event("guidelume:context-menu-preference"));
    }
    preference.addEventListener("change", () => { memory.settings.desktopContextMenus = preference.value; refreshPreference(); void save(); });
    refreshPreference(); render(); refreshHiddenFiles();
    return { render, refreshPreference, refreshHiddenFiles, openShortcut,
        handleDrop(icon, event) {
            if (icon === bin) return false;
            const rect = bin.getBoundingClientRect();
            if (!bin.getClientRects().length || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return false;
            const object = resource(icon);
            if (object.type === "shortcut") void recycle(object.id);
            else toast.show("Protected resources cannot be deleted.", "error", { title: "SYSTEM NOTICE" });
            return true;
        }
    };
}
