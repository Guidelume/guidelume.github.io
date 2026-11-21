import { initTabs } from "./tabs.js";
import { shortcutGuides, shortcutTargetUrl } from "./desktop-shortcuts-data.js";

const installed = Date.UTC(2026, 9, 27, 9);
const hash = text => [...text].reduce((value, character) => (Math.imul(value, 31) + character.codePointAt(0)) >>> 0, 0);
const bytes = item => new TextEncoder().encode(JSON.stringify({ name: item.name, target: item.target })).length + 96;
const size = value => value < 1024 ? `${value.toLocaleString()} bytes` : `${(value / 1024).toFixed(2)} KB (${value.toLocaleString()} bytes)`;
const date = value => new Date(value).toLocaleString([], { dateStyle: "long", timeStyle: "short" });

// Built-in resources belong to the fictional OS. Older shortcuts receive stable
// installation-era metadata; newly created/changed shortcuts retain real dates.
export function desktopResourceProperties({ id, type, name, shortcut, folder = false, hiddenFile = false, location = "Guidelume:\\Desktop", deletedItems = [] }) {
    const created = shortcut?.createdAt ?? installed + hash(id) % 86400000;
    const modified = Math.max(created, shortcut?.modifiedAt ?? shortcut?.deletedAt ?? created);
    const length = shortcut ? bytes(shortcut) : type === "bin" ? deletedItems.reduce((total, item) => total + bytes(item), 0)
        : folder ? 0 : 1024 + hash(id) % 32 * 512;
    const kind = shortcut ? "Guide shortcut (.glink)" : type === "bin" ? "System folder" : folder ? "File folder" : type === "file" ? "File" : "System resource";
    const general = [
        ["Type", kind], ["Location", shortcut?.deletedAt != null ? "Guidelume:\\Recycle Bin" : location],
        ["Size", size(length)], ["Size on disk", size(Math.ceil(length / 4096) * 4096)],
        ["Created", date(created)], ["Last modified", date(type === "bin" ? Math.max(created, ...deletedItems.map(item => item.modifiedAt || item.deletedAt || created)) : modified)],
        ["Attributes", (hiddenFile ? "Hidden, " : "") + (shortcut ? "Shortcut" : type === "file" ? "Read-only" : "Read-only, System")]
    ];
    if (type === "bin") general.splice(2, 0, ["Contains", `${deletedItems.length} shortcut${deletedItems.length === 1 ? "" : "s"}`]);
    return { name, kind, general, shortcut: shortcut ? [
        ["Target type", shortcutGuides[shortcut.target.guide].title], ["Target", shortcutTargetUrl(shortcut.target)],
        ["Opens in", "Guidelume workspace"], ["Shortcut key", "None"]
    ] : null };
}

export function initDesktopProperties({ windowManager }) {
    const dialog = document.createElement("dialog");
    dialog.className = "guidelume-confirm-dialog desktop-properties-dialog";
    dialog.dataset.desktopProperties = "true";
    dialog.setAttribute("aria-labelledby", "desktop-properties-title");
    document.body.append(dialog);
    let opener, tabs, vaultObserver;
    dialog.addEventListener("close", () => {
        const active = document.activeElement;
        const restoreFocus = !active || active === document.body || active === opener || dialog.contains(active);
        vaultObserver?.disconnect(); vaultObserver = null;
        tabs?.destroy(); tabs = null; dialog.replaceChildren();
        const target = opener?.isConnected && opener.getClientRects().length ? opener : windowManager.getFocusTarget();
        // The native close event is queued: a newer menu or edit may already
        // have focus by the time it arrives. Preserve that newer interaction.
        if (restoreFocus) target?.focus({ preventScroll: true });
        opener = null;
    });
    const fieldList = fields => {
        const list = document.createElement("dl"); list.className = "desktop-properties-fields";
        for (const [label, value] of fields) {
            const term = document.createElement("dt"), definition = document.createElement("dd");
            term.textContent = label; definition.textContent = value; list.append(term, definition);
        }
        return list;
    };
    return { refreshVisibility() {
        if (dialog.open && (!opener?.isConnected || opener.closest("[hidden]"))) dialog.close();
    }, show(icon, resource, memory) {
        if (dialog.open || document.querySelector("dialog[open]") || !icon.isConnected) return;
        const shortcut = resource.type === "shortcut" && memory.shortcuts?.[resource.id];
        if (resource.type === "shortcut" && !shortcut) return;
        const data = desktopResourceProperties({ ...resource, id: resource.id || icon.dataset.icon, shortcut,
            folder: resource.folder ?? icon.dataset.folderIcon === "true", deletedItems: Object.values(memory.shortcuts || {}).filter(item => item.deletedAt !== null) });
        tabs?.destroy(); opener = icon;
        const header = document.createElement("div"); header.className = "setup-titlebar";
        const title = document.createElement("span"); title.id = "desktop-properties-title"; title.textContent = `${data.name} Properties`;
        const close = document.createElement("button"); close.type = "button"; close.className = "window-close";
        close.setAttribute("aria-label", "Close properties"); close.textContent = "×"; close.addEventListener("click", () => dialog.close()); header.append(title, close);
        const group = document.createElement("div"); group.dataset.tabbedWindow = "true"; group.className = "desktop-properties-content";
        const tablist = document.createElement("div"); tablist.className = "window-tabs"; tablist.setAttribute("role", "tablist"); tablist.setAttribute("aria-label", "Properties"); group.append(tablist);
        for (const [id, label, fields] of [["general", "General", data.general], ...(data.shortcut ? [["shortcut", "Shortcut", data.shortcut]] : [])]) {
            const button = document.createElement("button"); button.type = "button"; button.className = "window-tab";
            button.id = `properties-${id}-tab`; button.dataset.tabId = `properties-${id}`; button.setAttribute("role", "tab");
            button.setAttribute("aria-controls", `properties-${id}-panel`); button.setAttribute("aria-selected", String(id === "general")); button.textContent = label; tablist.append(button);
            const panel = document.createElement("section"); panel.id = `properties-${id}-panel`; panel.dataset.tabPanel = `properties-${id}`;
            panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", button.id); panel.tabIndex = 0; panel.hidden = id !== "general";
            if (id === "general") {
                const summary = document.createElement("div"); summary.className = "desktop-properties-summary";
                const picture = document.createElement("img"); picture.src = icon.querySelector("img").src; picture.alt = "";
                const name = document.createElement("strong"); name.textContent = data.name; summary.append(picture, name); panel.append(summary);
            }
            panel.append(fieldList(fields)); group.append(panel);
        }
        const footer = document.createElement("div"); footer.className = "desktop-properties-footer";
        const ok = document.createElement("button"); ok.type = "button"; ok.className = "secondary-button"; ok.textContent = "OK"; ok.addEventListener("click", () => dialog.close()); footer.append(ok);
        dialog.replaceChildren(header, group, footer); tabs = initTabs(dialog); dialog.showModal(); ok.focus();
        const vault = icon.closest('[data-window="developer-vault"]');
        if (vault) {
            vaultObserver = new MutationObserver(() => {
                if (!icon.isConnected || icon.closest("[hidden]")) dialog.close();
            });
            vaultObserver.observe(vault, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
        }
    } };
}
