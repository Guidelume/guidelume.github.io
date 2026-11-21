import { flattenDesktop, isPresentationRecord, sameRecordValue } from "./desktop-records.js";
import { collectionConflicts } from "./desktop-constraints.js";

export const DESKTOP_DATABASE = "guidelume-desktop";
// Version 4 retires clients that require persisted tombstones after an epoch
// replacement. Their connections close before compaction can occur.
export const DESKTOP_SCHEMA_VERSION = 4;

// Every mutation includes meta and records in the SAME read/write transaction.
// Request callbacks keep transactions active; success is reported on complete,
// never on an individual put's success event.
export function createDesktopDatabase({ factory, name = DESKTOP_DATABASE,
    version = DESKTOP_SCHEMA_VERSION, onStatus = () => {} } = {}) {
    let connection = null;
    let opening = null;
    let outdated = false;
    let closed = false;

    function open() {
        if (closed || outdated) return Promise.reject(new DOMException("This desktop needs to reload before saving to the upgraded database.", outdated ? "VersionError" : "InvalidStateError"));
        if (connection) return Promise.resolve(connection);
        if (opening) return opening;
        opening = new Promise((resolve, reject) => {
            const provider = factory === undefined ? globalThis.indexedDB : factory;
            if (!provider) { reject(new Error("Browser database storage is unavailable.")); return; }
            const request = provider.open(name, version);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
                if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "key" });
            };
            request.onblocked = () => onStatus("blocked");
            request.onerror = () => {
                if (request.error?.name === "VersionError") { outdated = true; onStatus("versionchange"); }
                reject(request.error);
            };
            request.onsuccess = () => {
                const db = request.result;
                if (closed) { db.close(); reject(new Error("Desktop storage closed.")); return; }
                connection = db;
                db.onversionchange = () => {
                    // Do not immediately reopen the old schema and block the upgrader.
                    outdated = true;
                    db.close();
                    connection = null;
                    onStatus("versionchange");
                };
                db.onclose = () => { if (connection === db) connection = null; };
                onStatus("ready");
                resolve(db);
            };
        }).finally(() => { opening = null; });
        return opening;
    }

    async function transaction(mode, operation, { since } = {}) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(["meta", "records"], mode);
            let result;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(tx.error || new Error("Desktop transaction was aborted."));
            tx.onerror = () => {}; // onabort supplies the final error.
            const metaStore = tx.objectStore("meta");
            const store = tx.objectStore("records");
            const metaRequest = metaStore.get("desktop");
            if (since) {
                // Metadata and the conditional snapshot share one transaction.
                // An unchanged focus check does not copy every saved record.
                metaRequest.onsuccess = () => {
                    if (metaRequest.result?.epoch === since.epoch && metaRequest.result?.revision === since.revision) { result = null; return; }
                    const request = store.getAll();
                    request.onsuccess = () => {
                        try { result = operation({ meta: metaRequest.result, records: new Map(request.result.map(record => [record.key, record])), metaStore, store }); }
                        catch (error) { tx.abort(); reject(error); }
                    };
                };
                return;
            }
            const recordsRequest = store.getAll();
            let received = 0;
            const run = () => {
                if (++received !== 2) return;
                try {
                    const records = new Map(recordsRequest.result.map(record => [record.key, record]));
                    result = operation({ meta: metaRequest.result, records, metaStore, store });
                } catch (error) { tx.abort(); reject(error); }
            };
            metaRequest.onsuccess = run;
            recordsRequest.onsuccess = run;
        });
    }

    function snapshot(meta, records) { return { meta: { ...meta }, records }; }

    return {
        open,
        async initialize(shared, { privateSeed } = {}) {
            return transaction("readwrite", ({ meta, records, metaStore, store }) => {
                if (meta) {
                    if (meta.sharedLayoutVersion !== 2) {
                        // Promote the first valid v1 private lifecycle cache once;
                        // existing geometry/content and their revisions survive.
                        meta = { ...meta, revision: meta.revision + 1, sharedLayoutVersion: 2 };
                        const local = privateSeed?.epoch === meta.epoch ? privateSeed.state?.windows : null;
                        const windows = { ...shared.windows, ...local };
                        for (const [id, state] of Object.entries(windows)) {
                            if (["developer-vault", "easter-eggs-password"].includes(id)) continue;
                            if (!state || typeof state !== "object") continue;
                            for (const field of ["open", "minimized", "maximized", "hideTaskbar"]) {
                                const path = ["windows", id, field], key = JSON.stringify(path);
                                if (records.has(key)) continue;
                                const record = { key, path, kind: "value", value: state[field] === true, revision: meta.revision };
                                records.set(key, record); store.put(record);
                            }
                        }
                        const pins = [...records.values()].filter(record => !record.deleted && record.path[0] === "pinnedTaskbar"
                            && record.path.length === 2 && record.value === true).map(record => record.path[1]);
                        const order = [...new Set([...(shared.pinnedTaskbarOrder || []).filter(id => pins.includes(id)), ...pins])];
                        const path = ["pinnedTaskbarOrder"], key = JSON.stringify(path);
                        const record = { key, path, kind: "value", value: order, revision: meta.revision };
                        records.set(key, record); store.put(record);
                        metaStore.put(meta, "desktop");
                    }
                    if (meta.sharedPresentationVersion !== 1) {
                        meta = { ...meta, revision: meta.revision + 1, sharedPresentationVersion: 1 };
                        const local = privateSeed?.epoch === meta.epoch ? privateSeed.state : null;
                        const put = (path, value) => {
                            const key = JSON.stringify(path);
                            if (records.has(key)) return;
                            const record = { key, path, kind: "value", value, revision: meta.revision };
                            records.set(key, record); store.put(record);
                        };
                        const focused = [...(local?.windowOrder || [])].reverse().find(id => !["developer-vault", "easter-eggs-password"].includes(id)
                            && records.get(JSON.stringify(["windows", id, "open"]))?.value === true
                            && records.get(JSON.stringify(["windows", id, "minimized"]))?.value !== true);
                        put(["focusedWindow"], focused || shared.focusedWindow || null);
                        put(["sessionLocked"], shared.sessionLocked === true);
                        for (const [id, state] of Object.entries({ ...shared.windows, ...local?.windows })) {
                            if (["developer-vault", "easter-eggs-password"].includes(id)) continue;
                            const tab = state?.activeTab || state?.view?.activeTab;
                            if (typeof tab === "string" && tab.length <= 100) put(["windows", id, "activeTab"], tab);
                        }
                        metaStore.put(meta, "desktop");
                    }
                    if (meta.desktopShortcutsVersion !== 1) {
                        meta = { ...meta, revision: meta.revision + 1, desktopShortcutsVersion: 1 };
                        for (const record of flattenDesktop({ shortcuts: shared.shortcuts || {}, settings: { desktopContextMenus: shared.settings?.desktopContextMenus || "guidelume" } }).values()) {
                            if (record.path.length === 1 && record.path[0] === "settings") continue;
                            if (records.has(record.key)) continue;
                            record.revision = meta.revision; store.put(record); records.set(record.key, record);
                        }
                        metaStore.put(meta, "desktop");
                    }
                    return snapshot(meta, records);
                }
                meta = { epoch: crypto.randomUUID(), revision: 1, sharedLayoutVersion: 2, sharedPresentationVersion: 1, desktopShortcutsVersion: 1 };
                records = flattenDesktop(shared);
                for (const record of records.values()) { record.revision = 1; store.put(record); }
                metaStore.put(meta, "desktop");
                return snapshot(meta, records);
            });
        },
        read() { return transaction("readonly", ({ meta, records }) => snapshot(meta, records)); },
        readIfNewer(since) { return transaction("readonly", ({ meta, records }) => snapshot(meta, records), { since }); },
        commit({ epoch, patches }) {
            return transaction("readwrite", ({ meta, records, metaStore, store }) => {
                if (!meta || meta.epoch !== epoch) return { ...snapshot(meta, records), stale: true, conflicts: patches, written: [] };
                const rejected = new Set();
                for (const patch of patches) {
                    const current = records.get(patch.key);
                    const guarded = patch.guards.every(guard => (records.get(guard.key)?.revision || 0) === guard.revision);
                    const deletedNewerChildren = patch.deleted && patch.kind === "object" && [...records.values()].some(record =>
                        record.path.length > patch.path.length && patch.path.every((part, i) => record.path[i] === part)
                        && record.revision > patch.baseRevision);
                    if ((!guarded || ((current?.revision || 0) !== patch.expected && !isPresentationRecord(patch.path)) || deletedNewerChildren)
                        && !sameRecordValue(current, patch)) rejected.add(patch.group);
                }
                const limits = collectionConflicts(records, patches.filter(patch => !rejected.has(patch.group)));
                for (const group of limits.keys()) rejected.add(group);
                const conflicts = patches.filter(patch => rejected.has(patch.group)).map(patch => limits.has(patch.group)
                    ? { ...patch, reason: limits.get(patch.group) } : patch);
                const accepted = patches.filter(patch => !rejected.has(patch.group));
                const written = accepted.filter(patch => !sameRecordValue(records.get(patch.key), patch));
                if (written.length) {
                    meta = { ...meta, revision: meta.revision + 1 };
                    for (const patch of written) {
                        const record = { key: patch.key, path: patch.path, kind: patch.kind, revision: meta.revision,
                            ...(patch.deleted ? { deleted: true } : patch.kind === "value" ? { value: patch.value } : {}) };
                        store.put(record);
                        records.set(record.key, record);
                    }
                    metaStore.put(meta, "desktop");
                }
                return { ...snapshot(meta, records), conflicts, written, stale: false };
            });
        },
        // Reset and selective restore build from the latest committed data while
        // holding the write transaction. Other tabs cannot slip writes between
        // reading that data, bumping the epoch and replacing selected categories.
        replace({ epoch, transform, fullReset = false }) {
            return transaction("readwrite", ({ meta, records, metaStore, store }) => {
                if (!meta || meta.epoch !== epoch) return { ...snapshot(meta, records), stale: true };
                const next = flattenDesktop(transform(records));
                meta = { ...meta, epoch: crypto.randomUUID(), revision: meta.revision + 1 };
                if (fullReset) meta.resetGeneration = crypto.randomUUID();
                // Advancing the epoch rejects all pre-replacement writes. This
                // is the safe boundary for dropping accumulated tombstones.
                store.clear();
                const compacted = new Map();
                for (const [key, value] of next) {
                    const record = { ...value, revision: sameRecordValue(records.get(key), value) ? records.get(key).revision : meta.revision };
                    store.put(record);
                    compacted.set(key, record);
                }
                metaStore.put(meta, "desktop");
                return { ...snapshot(meta, compacted), stale: false };
            });
        },
        disconnect() { connection?.close(); connection = null; },
        close() { closed = true; connection?.close(); connection = null; }
    };
}
