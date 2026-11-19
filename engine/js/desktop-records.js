// The backup format remains a desktop snapshot. Only this adapter knows how that
// snapshot is split into shared records and a tab's private workspace.
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const sharedWindowFields = ["x", "y", "width", "height", "open", "minimized", "maximized", "hideTaskbar", "activeTab"];
export const localOnlyWindows = new Set(["developer-vault", "easter-eggs-password"]);
const privateWindow = (id, state) => Object.fromEntries(Object.entries(state || {})
    .filter(([key]) => localOnlyWindows.has(id) || !sharedWindowFields.includes(key)));
export const recordKey = path => JSON.stringify(path);
export const isPresentationRecord = path => ["focusedWindow", "sessionLocked"].includes(path[0])
    || (path[0] === "windows" && path.length === 3 && path[2] === "activeTab");
export const sameRecordValue = (a, b) => JSON.stringify(a && !a.deleted ? [a.kind, a.value] : null)
    === JSON.stringify(b && !b.deleted ? [b.kind, b.value] : null);

export function sharedDesktop(memory) {
    const shared = structuredClone(memory);
    delete shared.windowOrder;
    delete shared.taskbarOrder;
    shared.focusedWindow = typeof memory.focusedWindow === "string" && !localOnlyWindows.has(memory.focusedWindow) ? memory.focusedWindow : null;
    shared.sessionLocked = memory.sessionLocked === true;
    shared.windows = Object.fromEntries(Object.entries(memory.windows || {}).filter(([id]) => !localOnlyWindows.has(id))
        .map(([id, state]) => [id, Object.fromEntries(sharedWindowFields
            .filter(key => state[key] !== undefined).map(key => [key, state[key]]))]));
    shared.pinnedTaskbarOrder = (memory.pinnedTaskbar || []).filter(id => !localOnlyWindows.has(id));
    shared.pinnedTaskbar = Object.fromEntries(shared.pinnedTaskbarOrder.map(id => [id, true]));
    shared.widgets = { ...shared.widgets, instances: Object.fromEntries((memory.widgets?.instances || []).map(widget => [widget.id, widget])) };
    shared.lookingGlass = { ...shared.lookingGlass,
        bookmarks: Object.fromEntries((memory.lookingGlass?.bookmarks || []).map(bookmark => [bookmark.id, bookmark])) };
    delete shared.lookingGlass.sidebarOpen;
    return shared;
}

export function privateDesktop(memory) {
    return {
        windows: Object.fromEntries(Object.entries(memory.windows || {}).filter(([id]) => id !== "developer-vault").map(([id, state]) => [id, privateWindow(id, state)])),
        windowOrder: (memory.windowOrder || []).filter(id => id !== "developer-vault"),
        taskbarOrder: (memory.taskbarOrder || []).filter(id => id !== "developer-vault"),
        sidebarOpen: memory.lookingGlass?.sidebarOpen !== false
    };
}

export function flattenDesktop(value, path = [], result = new Map()) {
    const key = recordKey(path);
    if (object(value)) {
        if (path.length) result.set(key, { key, path, kind: "object" });
        for (const [name, child] of Object.entries(value)) {
            if (!unsafeKeys.has(name) && child !== undefined) flattenDesktop(child, [...path, name], result);
        }
    } else if (path.length) result.set(key, { key, path, kind: "value", value: structuredClone(value) });
    return result;
}

export function expandDesktop(records) {
    const root = {};
    for (const record of [...records.values()].filter(item => !item.deleted).sort((a, b) => a.path.length - b.path.length)) {
        if (!record.path.length || record.path.some(part => unsafeKeys.has(part))) continue;
        let parent = root;
        for (const part of record.path.slice(0, -1)) parent = parent[part] ||= {};
        parent[record.path.at(-1)] = record.kind === "object" ? {} : structuredClone(record.value);
    }
    return root;
}

export function desktopFromRecords(records, local = {}) {
    const shared = expandDesktop(records);
    shared.windows = Object.fromEntries([...new Set([...Object.keys(local.windows || {}), ...Object.keys(shared.windows || {})])]
        .filter(id => id !== "developer-vault")
        .map(id => [id, { ...privateWindow(id, local.windows?.[id]), ...shared.windows?.[id] }]));
    shared.windowOrder = local.windowOrder || [];
    shared.taskbarOrder = local.taskbarOrder || [];
    const pins = Object.keys(shared.pinnedTaskbar || {});
    shared.pinnedTaskbar = [...new Set([...(shared.pinnedTaskbarOrder || []).filter(id => pins.includes(id)), ...pins])];
    delete shared.pinnedTaskbarOrder;
    shared.widgets ||= {};
    shared.widgets.instances = Object.values(shared.widgets.instances || {});
    shared.lookingGlass ||= {};
    shared.lookingGlass.bookmarks = Object.values(shared.lookingGlass.bookmarks || {});
    shared.lookingGlass.sidebarOpen = local.sidebarOpen !== false;
    return shared;
}

export function recordGroup(path) {
    const length = ["documents", "shortcuts"].includes(path[0]) ? 2
        : (path[0] === "widgets" && path[1] === "instances") || (path[0] === "lookingGlass" && path[1] === "bookmarks") ? 3 : path.length;
    return recordKey(path.slice(0, length));
}

export function changedRecords(before, after, revision = 0) {
    return [...new Set([...before.keys(), ...after.keys()])].filter(key => !sameRecordValue(before.get(key), after.get(key))).map(key => {
        const old = before.get(key);
        const next = after.get(key) || { ...old, deleted: true };
        const guards = [];
        for (let i = 1; i < next.path.length; i++) {
            const parentKey = recordKey(next.path.slice(0, i));
            if (before.has(parentKey)) guards.push({ key: parentKey, revision: before.get(parentKey).revision || 0 });
        }
        return { ...next, expected: old?.revision || 0, baseRevision: revision, guards, group: recordGroup(next.path) };
    });
}
