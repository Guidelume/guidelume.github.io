import { resolveLookingGlassUrl } from "./looking-glass-providers.js";

export const MAX_BOOKMARKS = 200;
export const MAX_BOOKMARK_TITLE = 160;
export const MAX_COLLECTION_NAME = 80;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

function normalizeBookmark(entry) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !identifier.test(entry.id)
        || !validText(entry.title, MAX_BOOKMARK_TITLE) || !validText(entry.collection, MAX_COLLECTION_NAME)
        || typeof entry.provider !== "string") return null;
    const content = resolveLookingGlassUrl(entry.url, entry.provider);
    if (!content) return null;
    return { id: entry.id, title: entry.title.trim(), collection: entry.collection.trim(), provider: content.provider, url: content.externalUrl };
}

export function normalizeLookingGlassState(value) {
    const source = isRecord(value) ? value : {};
    const ids = new Set();
    const bookmarks = [];
    for (const entry of Array.isArray(source.bookmarks) ? source.bookmarks.slice(0, MAX_BOOKMARKS) : []) {
        const bookmark = normalizeBookmark(entry);
        if (!bookmark || ids.has(bookmark.id)) continue;
        ids.add(bookmark.id);
        bookmarks.push(bookmark);
    }
    return {
        lastUrl: resolveLookingGlassUrl(source.lastUrl)?.externalUrl || "",
        sidebarOpen: source.sidebarOpen !== false,
        bookmarks
    };
}

export function validateLookingGlassState(value) {
    const allowed = (object, keys) => isRecord(object) && Object.keys(object).every(key => keys.includes(key));
    if (!allowed(value, ["lastUrl", "sidebarOpen", "bookmarks"])
        || typeof value.lastUrl !== "string" || (value.lastUrl !== "" && !resolveLookingGlassUrl(value.lastUrl))
        || typeof value.sidebarOpen !== "boolean" || !Array.isArray(value.bookmarks) || value.bookmarks.length > MAX_BOOKMARKS) {
        throw new Error("Looking Glass settings are invalid.");
    }
    const ids = new Set();
    for (const entry of value.bookmarks) {
        if (!allowed(entry, ["id", "title", "collection", "provider", "url"]) || !normalizeBookmark(entry) || ids.has(entry.id)) {
            throw new Error("Looking Glass contains an invalid or duplicate bookmark.");
        }
        ids.add(entry.id);
    }
    return normalizeLookingGlassState(value);
}

export function parseBuiltInBookmarks(value) {
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.collections) || value.collections.length > 32) {
        throw new Error("The built-in library is invalid.");
    }
    const ids = new Set();
    const collectionIds = new Set();
    let total = 0;
    return value.collections.map(collection => {
        if (!isRecord(collection) || typeof collection.id !== "string" || !identifier.test(collection.id)
            || collectionIds.has(collection.id) || !validText(collection.title, MAX_COLLECTION_NAME)
            || !Array.isArray(collection.entries) || (total += collection.entries.length) > MAX_BOOKMARKS) {
            throw new Error("A built-in collection is invalid.");
        }
        collectionIds.add(collection.id);
        return {
            id: collection.id, title: collection.title.trim(),
            entries: collection.entries.map(entry => {
                const bookmark = normalizeBookmark({ ...entry, collection: collection.title });
                if (!bookmark || ids.has(bookmark.id)) throw new Error("A built-in bookmark is invalid.");
                ids.add(bookmark.id);
                return bookmark;
            })
        };
    });
}
