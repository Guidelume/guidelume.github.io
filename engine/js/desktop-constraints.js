import { expandDesktop } from "./desktop-records.js";
import { MAX_NOTES, MAX_WIDGETS } from "./widgets-data.js";
import { MAX_BOOKMARKS } from "./looking-glass-data.js";
import { MAX_DESKTOP_SHORTCUTS } from "./desktop-shortcuts-data.js";

function overflows(records) {
    const desktop = expandDesktop(records);
    const widgets = Object.values(desktop.widgets?.instances || {});
    const count = type => widgets.filter(widget => widget.type === type).length;
    return [
        [widgets.length - MAX_WIDGETS, `This desktop can hold ${MAX_WIDGETS} widgets. Remove a widget before keeping this addition.`],
        [count("note") - MAX_NOTES, `This desktop can hold ${MAX_NOTES} Sticky Notes. Remove a note before keeping this addition.`],
        [count("clock") - 1, "A clock is already on this desktop. Remove it before keeping this clock."],
        [count("calendar") - 1, "A calendar is already on this desktop. Remove it before keeping this calendar."],
        [Object.keys(desktop.lookingGlass?.bookmarks || {}).length - MAX_BOOKMARKS,
            `Looking Glass can hold ${MAX_BOOKMARKS} personal bookmarks. Remove a bookmark before keeping this addition.`],
        [Object.keys(desktop.shortcuts || {}).length - MAX_DESKTOP_SHORTCUTS,
            `This desktop can hold ${MAX_DESKTOP_SHORTCUTS} shortcuts, including the Recycle Bin. Permanently delete a shortcut before keeping this addition.`]
    ].map(([amount, message]) => [Math.max(0, amount), message]);
}

// Called inside the write transaction, after revision checks. Deletes run first
// so a single action may replace an item in a full collection. Existing excess
// data can still be edited or removed; no saved item is silently discarded here.
export function collectionConflicts(records, patches) {
    const collectionPatch = ({ path }) => (path[0] === "widgets" && path[1] === "instances")
        || (path[0] === "lookingGlass" && path[1] === "bookmarks") || path[0] === "shortcuts";
    if (!patches.some(collectionPatch)) return new Map();
    const groups = new Map();
    for (const patch of patches) {
        if (!groups.has(patch.group)) groups.set(patch.group, []);
        groups.get(patch.group).push(patch);
    }
    let candidate = new Map(records);
    const rejected = new Map();
    const ordered = [...groups].sort(([, a], [, b]) => Number(b.every(p => p.deleted)) - Number(a.every(p => p.deleted)));
    for (const [group, changes] of ordered) {
        const next = new Map(candidate);
        for (const patch of changes) next.set(patch.key, patch);
        if (!changes.some(collectionPatch)) { candidate = next; continue; }
        const before = overflows(candidate), after = overflows(next);
        const violation = after.find(([amount], i) => amount > before[i][0]);
        if (violation) rejected.set(group, violation[1]);
        else candidate = next;
    }
    return rejected;
}
