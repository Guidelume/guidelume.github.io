const siteRoot = new URL("../../", import.meta.url);
export const MAX_DESKTOP_SHORTCUTS = 100;
export const MAX_SHORTCUT_NAME = 80;
export const shortcutGuides = Object.freeze({
    mwbc: { title: "Milky Way Bar Crawl", icon: "milky-way-bar-crawl/custom/img/logo-bare.png",
        home: "index-mwbc.html", directory: "milky-way-bar-crawl/",
        pages: ["intro", "setup", "textures", "me1", "me2", "me3", "extras", "finish", "questions", "credits", "changelog"] },
    twfg: { title: "The Warden's Field Guide", icon: "the-warden-field-guide/volume-1/custom/favicon.svg",
        home: "index-twfg.html", directory: "the-warden-field-guide/volume-1/",
        pages: ["intro", "setup", "manual", "paths", "elfroot", "appearance", "finish", "questions", "credits", "changelog", "ea-note"] },
    "varkorax-archive": { title: "Varkorax Archive", icon: "varkorax-archive/custom/favicon.svg",
        home: "varkorax-archive/index.html", directory: "varkorax-archive/",
        pages: ["pages/landing_collections", "pages/landing_corkboard", "pages/corkboard/archive", "pages/changelog", "pages/info", "pages/collections/filter", "pages/collections/reader", "pages/collections/projects/old-hub/index"] }
});
const record = value => value && typeof value === "object" && !Array.isArray(value);
export const isShortcutId = id => typeof id === "string" && /^shortcut-[a-zA-Z0-9_-]{1,70}$/.test(id);
export const normalizeDesktopContextMenus = value => value === "browser" ? "browser" : "guidelume";
export const nativeContextMenuRequested = (event, memory) => event.shiftKey || memory.settings?.desktopContextMenus === "browser";

export function normalizeShortcutTarget(value) {
    if (!record(value) || !Object.hasOwn(shortcutGuides, value.guide)) return null;
    const guide = shortcutGuides[value.guide];
    if (value.path !== guide.home && !guide.pages.some(page => value.path === `${guide.directory}${page}.html`)) return null;
    if (typeof value.hash !== "string" || value.hash.length > 240 || /[\u0000-\u001f\u007f]/.test(value.hash)) return null;
    if (value.query !== undefined && (typeof value.query !== "string" || value.query.length > 4096)) return null;
    const target = { guide: value.guide, path: value.path, hash: value.hash };
    if (value.guide === "varkorax-archive") {
        const params = new URLSearchParams(value.query || "");
        if ([...params.keys()].some(key => !["type", "id", "story", "chapter"].includes(key) || params.getAll(key).length !== 1)) return null;
        const type = params.get("type"), reader = value.path.endsWith("/reader.html"), filter = value.path.endsWith("/filter.html");
        if (reader || filter) {
            if (!(reader ? ["entry", "stories"] : ["entry", "stories", "projects"]).includes(type)) return null;
            const identity = reader && params.get(type === "entry" ? "id" : "story");
            if (reader && (typeof identity !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(identity))) return null;
            if (filter && params.size !== 1) return null;
            if (reader && (params.has(type === "entry" ? "story" : "id") || (type !== "stories" && params.has("chapter")))) return null;
            if (params.has("chapter") && (!params.get("chapter") || params.get("chapter").length > 240 || /[\u0000-\u001f\u007f]/.test(params.get("chapter")))) return null;
        } else if (params.size) return null;
        if (params.size) { params.sort(); target.query = params.toString(); }
    } else if (value.query) return null;
    return target;
}

export function shortcutTargetFromUrl(guide, href, section = "", base = siteRoot) {
    try {
        const root = new URL(base), url = new URL(href, root);
        if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
        const hash = section || decodeURIComponent(url.hash.slice(1));
        return normalizeShortcutTarget({ guide, path: decodeURIComponent(url.pathname.slice(root.pathname.length)), hash, query: url.search.slice(1) });
    } catch { return null; }
}

export function shortcutTargetUrl(target, base = siteRoot) {
    const valid = normalizeShortcutTarget(target);
    if (!valid) return null;
    const url = new URL(valid.path, base);
    if (valid.query) url.search = valid.query;
    if (valid.hash) url.hash = valid.hash;
    return url.href;
}

export function normalizeDesktopShortcuts(value) {
    const result = {};
    if (!record(value)) return result;
    for (const [id, item] of Object.entries(value)) {
        if (!isShortcutId(id) || !record(item)) continue;
        const target = normalizeShortcutTarget(item.target);
        if (!target || typeof item.name !== "string" || !item.name.trim()) continue;
        if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
        if (item.deletedAt !== null && (!Number.isFinite(item.deletedAt) || item.deletedAt < 0 || item.deletedAt > 8.64e15)) continue;
        result[id] = { name: Array.from(item.name.trim()).slice(0, MAX_SHORTCUT_NAME).join(""), target,
            x: Math.max(0, Math.min(1, item.x)), y: Math.max(0, Math.min(1, item.y)), deletedAt: item.deletedAt };
        for (const field of ["createdAt", "modifiedAt"]) if (Number.isFinite(item[field]) && item[field] >= 0 && item[field] <= 8.64e15) result[id][field] = item[field];
    }
    return result;
}

export function validateDesktopShortcuts(value) {
    if (!record(value) || Object.keys(value).length > MAX_DESKTOP_SHORTCUTS) throw new Error("The desktop shortcut collection is too large or malformed.");
    const normalized = normalizeDesktopShortcuts(value);
    for (const [id, item] of Object.entries(value)) {
        if (!Object.hasOwn(normalized, id) || Object.keys(item).some(key => !["name", "target", "x", "y", "deletedAt", "createdAt", "modifiedAt"].includes(key))
            || Object.keys(item.target).some(key => !["guide", "path", "hash", "query"].includes(key))
            || ["createdAt", "modifiedAt"].some(field => Object.hasOwn(item, field) && !Object.hasOwn(normalized[id], field))
            || Array.from(item.name).length > MAX_SHORTCUT_NAME || item.x < 0 || item.x > 1 || item.y < 0 || item.y > 1) {
            throw new Error("A desktop shortcut is invalid or points outside a supported guide.");
        }
    }
    return normalized;
}
