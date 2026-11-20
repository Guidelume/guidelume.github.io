import { createPersistableDesktopMemory } from "./desktop-state.js";
import { applyConfiguration, configurationCategories, createConfiguration, parseConfiguration, validateConfiguration } from "./configuration-backup.js";
import { validateDocumentOverrides } from "./document-registry.js";
import { validateDesktopShortcuts } from "./desktop-shortcuts-data.js";
import { validateWidgetState } from "./widgets-data.js";
import { validateLookingGlassState } from "./looking-glass-data.js";
import { blackwallTabIds, blackwallViewKey, normalizeBlackwallView } from "./blackwall-view.js";

export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
const format = "guidelume-workspace";
const rootKeys = new Set(["icons", "windows", "documents", "shortcuts", "lookingGlass", "onboarding", "profile", "widgets", "windowOrder", "taskbarOrder", "pinnedTaskbar", "settings", "focusedWindow", "sessionLocked"]);
const windowKeys = new Set(["x", "y", "width", "height", "open", "minimized", "maximized", "hideTaskbar", "activeTab", "view", "scrollTop", "iframeUrl", "iframePageState", "windowScrollX", "windowScrollY", "scrollPositions"]);
const privateWindows = new Set(["developer-vault", "easter-eggs-password"]);
const record = value => value && typeof value === "object" && !Array.isArray(value);
const siteRoot = new URL("../../", import.meta.url);
const localKey = key => /^(?:accessibleFonts|easterEggFont|fontAccessible|readerSettings|basementSettings|storiesSettings|projectsSettings|userMode|isCozy|matureAcknowledged_v1|archive\.[\w.-]+|corkboard\.[\w.-]+|storyProgress:[\w-]+|twfg:volume-1:[\w:-]+)$/.test(key);
const sessionKey = key => /^(?:(?:mwbc|twfg)-guide-state:.+|twfg:volume-1:installation-path|storiesReaderMode|entriesReaderMode|matureAcknowledged_v1)$/.test(key);

function checkTree(value, depth = 0) {
    if (depth > 24) throw new Error("This backup is nested too deeply.");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("This backup contains an invalid number.");
    if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("This backup contains an unsafe property.");
        checkTree(child, depth + 1);
    }
}
function frameUrl(id, value, base = siteRoot, portable = false) {
    const prefixes = { mwbc: ["index-mwbc.html", "milky-way-bar-crawl/"], twfg: ["index-twfg.html", "the-warden-field-guide/"], "varkorax-archive": ["varkorax-archive/"] };
    if (!prefixes[id] || typeof value !== "string") return null;
    const root = new URL(base), url = new URL(value, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) throw new Error("A saved guide location points outside Guidelume.");
    const path = url.pathname.slice(root.pathname.length);
    if (!prefixes[id].some(prefix => prefix.endsWith("/") ? path.startsWith(prefix) && path.endsWith(".html") : path === prefix)) throw new Error("A saved guide location is unsupported.");
    return portable ? path + url.search + url.hash : url.href;
}
function transformFrameUrls(desktop, base, portable) {
    for (const [id, state] of Object.entries(desktop.windows || {})) {
        if (!["mwbc", "twfg", "varkorax-archive"].includes(id)) { delete state.iframeUrl; delete state.iframePageState; continue; }
        for (const [holder, key] of [[state, "iframeUrl"], [state.iframePageState, "href"]]) {
            if (!holder?.[key]) continue;
            const next = frameUrl(id, holder[key], base, portable);
            if (next) holder[key] = next; else delete holder[key];
        }
    }
}
function transformStandalonePreferences(preferences, base, portable) {
    const result = {}, root = new URL(base);
    for (const [key, value] of Object.entries(preferences)) {
        const match = key.match(/^(mwbc|twfg)-guide-state:(.+)$/);
        if (!match) { result[key] = value; continue; }
        const url = new URL(match[2], root);
        if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) {
            if (portable) continue;
            throw new Error("A saved standalone guide location is unsupported.");
        }
        const location = (portable ? url.pathname.slice(root.pathname.length) : url.pathname) + url.search;
        let text = value;
        try {
            const state = JSON.parse(value);
            if (record(state) && state.href) { state.href = frameUrl(match[1], state.href, root, portable); text = JSON.stringify(state); }
        } catch { /* An older unreadable reading cache is retained as-is. */ }
        result[`${match[1]}-guide-state:${location}`] = text;
    }
    return result;
}
export function readBackupPreferences(storage, scope = "local") {
    const result = {}, allowed = scope === "local" ? localKey : sessionKey;
    if (!storage) return result;
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (allowed(key)) result[key] = storage.getItem(key);
    }
    return result;
}
function validatePreferences(value, allowed) {
    if (!record(value)) throw new Error("Guide preferences are malformed.");
    for (const [key, text] of Object.entries(value)) if (!allowed(key) || typeof text !== "string" || text.length > 1024 * 1024) throw new Error("A guide preference is unsupported or too large.");
}
function validWindowDimension(value, depth = 0) {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 && value <= 10000;
    if (typeof value !== "string" || value.length > 256 || depth > 4) return false;
    const text = value.trim();
    const length = text.match(/^(\d+(?:\.\d+)?|\.\d+)(px|vw|vh|vmin|vmax|rem|em|%)$/);
    if (length) return Number(length[1]) > 0 && Number(length[1]) <= 10000;
    const expression = text.match(/^(min|max|clamp)\((.*)\)$/);
    if (!expression) return false;
    const args = [];
    let nesting = 0, start = 0;
    for (let index = 0; index < expression[2].length; index++) {
        const char = expression[2][index];
        if (char === "(") nesting += 1;
        else if (char === ")" && --nesting < 0) return false;
        else if (char === "," && nesting === 0) { args.push(expression[2].slice(start, index)); start = index + 1; }
    }
    args.push(expression[2].slice(start));
    return nesting === 0 && args.length <= 8 && (expression[1] !== "clamp" || args.length === 3)
        && args.every(arg => validWindowDimension(arg, depth + 1));
}
function validateDesktop(desktop, { knownIcons, knownWindows, defaultMemory, base = siteRoot }) {
    if (!record(desktop) || Object.keys(desktop).some(key => !rootKeys.has(key))) throw new Error("The saved desktop is malformed.");
    for (const key of ["icons", "windows", "onboarding", "profile", "settings"]) if (!record(desktop[key])) throw new Error(`The saved ${key} are malformed.`);
    if (Object.keys(desktop.onboarding).some(key => key !== "completed") || typeof desktop.onboarding.completed !== "boolean") throw new Error("Setup completion is invalid.");
    if (Object.keys(desktop.settings).some(key => !Object.hasOwn(defaultMemory.settings, key))) throw new Error("The backup contains an unsupported setting.");
    for (const [key, value] of Object.entries(defaultMemory.settings)) {
        if (typeof value === "boolean" && typeof desktop.settings[key] !== "boolean") throw new Error(`The saved ${key} setting is invalid.`);
    }
    const iconIds = new Set(knownIcons.map(icon => icon.id));
    for (const [id, position] of Object.entries(desktop.icons)) {
        if (!iconIds.has(id) || !record(position) || Object.keys(position).some(key => !["x", "y"].includes(key)) || ![position.x, position.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error("An icon position is invalid.");
    }
    for (const key of ["windowOrder", "taskbarOrder", "pinnedTaskbar"]) {
        if (!Array.isArray(desktop[key]) || new Set(desktop[key]).size !== desktop[key].length || desktop[key].some(id => !knownWindows.includes(id) || privateWindows.has(id))) throw new Error("A saved window list is invalid.");
    }
    if (desktop.focusedWindow != null && !knownWindows.includes(desktop.focusedWindow)) throw new Error("The focused window is invalid.");
    if (typeof desktop.sessionLocked !== "boolean") throw new Error("Session state is invalid.");
    for (const [id, state] of Object.entries(desktop.windows)) {
        if (!knownWindows.includes(id) || privateWindows.has(id) || !record(state)) throw new Error(`The saved window ${id} is invalid.`);
        const unknownKeys = Object.keys(state).filter(key => !windowKeys.has(key));
        if (unknownKeys.length) throw new Error(`The saved window ${id} has unsupported fields: ${unknownKeys.join(", ")}.`);
        if (state.view !== undefined && (id !== "blackwall" || !record(state.view)
            || Object.keys(state.view).some(key => !["activeTab", "scrollPositions"].includes(key))
            || !blackwallTabIds.includes(state.view.activeTab) || !record(state.view.scrollPositions)
            || Object.entries(state.view.scrollPositions).some(([key, value]) => !blackwallTabIds.includes(key) || !Number.isFinite(value) || value < 0 || value > 100000))) throw new Error(`The saved view for ${id} is invalid.`);
        for (const key of ["open", "minimized", "maximized", "hideTaskbar"]) if (state[key] !== undefined && typeof state[key] !== "boolean") throw new Error("A saved window state is invalid.");
        for (const key of ["x", "y"]) if (state[key] !== undefined && !(Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1)) throw new Error("A saved window position is invalid.");
        for (const key of ["width", "height"]) if (state[key] !== undefined && !validWindowDimension(state[key])) throw new Error(`The saved ${key} for ${id} is invalid.`);
        if (state.activeTab !== undefined && (typeof state.activeTab !== "string" || state.activeTab.length > 100)) throw new Error("A saved window tab is invalid.");
        for (const key of ["scrollTop", "windowScrollX", "windowScrollY"]) if (state[key] !== undefined && !(Number.isFinite(state[key]) && state[key] >= 0)) throw new Error(`The saved ${key} for ${id} is invalid.`);
        if (state.iframeUrl !== undefined && !frameUrl(id, state.iframeUrl, base)) throw new Error("A saved guide location is unsupported.");
        if (state.iframePageState !== undefined && (!record(state.iframePageState) || !frameUrl(id, state.iframePageState.href, base))) throw new Error("A saved guide reading state is invalid.");
    }
    validateDocumentOverrides(desktop.documents);
    validateDesktopShortcuts(desktop.shortcuts);
    validateWidgetState(desktop.widgets);
    validateLookingGlassState(desktop.lookingGlass);
    // Reuse the established enum, profile, layout and preferences validation.
    const configuration = createConfiguration(desktop, configurationCategories.map(category => category.id), knownIcons, knownWindows);
    configuration.categories.profile = desktop.profile;
    configuration.categories.blackwall = desktop.settings.blackwall;
    configuration.categories.environment = desktop.settings.environment;
    configuration.categories.shortcuts.contextMenus = desktop.settings.desktopContextMenus;
    validateConfiguration(configuration, knownIcons.filter(icon => icon.exportable !== false).map(icon => icon.id), knownWindows);
}
export function createWorkspaceBackup(memory, options) {
    const desktop = structuredClone(createPersistableDesktopMemory(memory));
    const iconIds = new Set(options.knownIcons.map(icon => icon.id));
    desktop.icons = Object.fromEntries(Object.entries(desktop.icons).filter(([id]) => iconIds.has(id)));
    desktop.windows = Object.fromEntries(Object.entries(desktop.windows).filter(([id]) => options.knownWindows.includes(id) && !privateWindows.has(id)));
    if (desktop.windows.blackwall?.view !== undefined) desktop.windows.blackwall.view = normalizeBlackwallView(desktop.windows.blackwall.view);
    desktop.settings = Object.fromEntries(Object.entries(options.defaultMemory.settings).map(([key, fallback]) => [key, desktop.settings[key] ?? fallback]));
    for (const key of ["windowOrder", "taskbarOrder", "pinnedTaskbar"]) desktop[key] = desktop[key].filter(id => !privateWindows.has(id) && options.knownWindows.includes(id));
    desktop.focusedWindow = options.knownWindows.includes(desktop.focusedWindow) && !privateWindows.has(desktop.focusedWindow) ? desktop.focusedWindow : null;
    desktop.sessionLocked = desktop.sessionLocked === true;
    transformFrameUrls(desktop, options.base || siteRoot, true);
    const result = { format, version: 1, desktop, preferences: {
        local: { ...readBackupPreferences(options.localStorage, "local"), accessibleFonts: String(desktop.settings.accessibleFonts) },
        session: transformStandalonePreferences(readBackupPreferences(options.sessionStorage, "session"), options.base || siteRoot, true)
    } };
    validateDesktop(desktop, options);
    return result;
}
export function serializeWorkspaceBackup(backup) {
    const text = JSON.stringify(backup, null, 2);
    if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error("This backup exceeds the 4 MiB limit.");
    return text;
}
export function parseWorkspaceBackup(text, options) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error("This backup exceeds the 4 MiB limit.");
    let value;
    try { value = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
    checkTree(value);
    if (record(value) && Number.isInteger(value.formatVersion)) return { legacy: parseConfiguration(text, options.knownIcons, options.knownWindows) };
    if (!record(value) || value.format !== format || value.version !== 1 || Object.keys(value).some(key => !["format", "version", "desktop", "preferences"].includes(key))) throw new Error("This is not a supported Guidelume backup.");
    validateDesktop(value.desktop, options);
    if (!record(value.preferences) || Object.keys(value.preferences).some(key => !["local", "session"].includes(key))) throw new Error("Guide preferences are malformed.");
    validatePreferences(value.preferences.local, localKey); validatePreferences(value.preferences.session, sessionKey);
    transformStandalonePreferences(value.preferences.session, options.base || siteRoot, false);
    value.preferences.local.accessibleFonts = String(value.desktop.settings.accessibleFonts);
    return value;
}
export function applyWorkspaceBackup(memory, backup, options) {
    if (backup.legacy) {
        applyConfiguration(memory, backup.legacy, Object.keys(backup.legacy.categories), options);
        return;
    }
    const next = structuredClone(backup.desktop);
    transformFrameUrls(next, options.base || siteRoot, false);
    for (const key of Object.keys(memory)) delete memory[key];
    Object.assign(memory, next);
}
export function restoreBackupPreferences(backup, { localStorage, sessionStorage, base = siteRoot }) {
    if (backup.legacy) return () => {};
    const writes = [];
    const rollback = () => {
        let failure;
        for (const [storage, key, previous, staged] of [...writes].reverse()) {
            try {
                // Preserve a preference changed by another tab after staging.
                if (storage.getItem(key) !== staged) continue;
                if (previous === null) storage.removeItem(key); else storage.setItem(key, previous);
            } catch (error) { failure ||= error; }
        }
        if (failure) throw failure;
    };
    try {
        for (const [storage, next] of [[localStorage, backup.preferences.local], [sessionStorage, transformStandalonePreferences(backup.preferences.session, base, false)]]) {
            if (!storage) {
                if (Object.keys(next).length) throw new Error("Guide preferences cannot be saved in this browser.");
                continue;
            }
            const previous = readBackupPreferences(storage, storage === localStorage ? "local" : "session");
            for (const key of Object.keys(previous)) { const original = storage.getItem(key); storage.removeItem(key); writes.push([storage, key, original, null]); }
            for (const [key, value] of Object.entries(next)) { const original = storage.getItem(key); storage.setItem(key, value); writes.push([storage, key, original, value]); }
        }
        // An older tab-local cache must not override the restored dashboard view.
        if (sessionStorage) {
            const original = sessionStorage.getItem(blackwallViewKey);
            const value = backup.desktop.windows.blackwall?.view;
            const staged = value ? JSON.stringify(value) : null;
            if (staged === null) sessionStorage.removeItem(blackwallViewKey); else sessionStorage.setItem(blackwallViewKey, staged);
            writes.push([sessionStorage, blackwallViewKey, original, staged]);
        }
    } catch (error) {
        try { rollback(); } catch { /* The original failure is reported to the user. */ }
        throw error;
    }
    return rollback;
}
