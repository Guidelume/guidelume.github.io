import { changedRecords, desktopFromRecords, flattenDesktop, isPresentationRecord, privateDesktop, recordGroup, sameRecordValue, sharedDesktop } from "./desktop-records.js";

export const TAB_DESKTOP_KEY = "guidelume_tab_desktop_v1";
export const DESKTOP_JOURNAL_KEY = "guidelume_desktop_journal_v1";
export const BOOTSTRAP_KEY = "guidelume_desktop_bootstrap_v1";
const optionalStorage = name => { try { return globalThis[name]; } catch { return null; } };

function reconcileObject(target, source) {
    for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) delete target[key];
    for (const [key, value] of Object.entries(source)) {
        if (Array.isArray(value)) {
            if (value.every(item => item && typeof item === "object" && typeof item.id === "string")) {
                const old = new Map((Array.isArray(target[key]) ? target[key] : []).map(item => [item.id, item]));
                target[key] = value.map(item => { const existing = old.get(item.id) || {}; reconcileObject(existing, item); return existing; });
            } else target[key] = structuredClone(value);
        } else if (value && typeof value === "object") {
            if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
            reconcileObject(target[key], value);
        } else target[key] = value;
    }
}

// Adapts the existing mutable controller model at its save boundary. Differences
// are captured synchronously at the user action, before any asynchronous reads.
// Incoming changes never pass through that boundary as new local actions.
export function createDesktopSync({ memory, database, initial, normalize = value => value,
    storage = optionalStorage("sessionStorage"), bootstrapStorage = optionalStorage("localStorage"),
    createChannel = name => new BroadcastChannel(name), onError = () => {} }) {
    let known = initial;
    let applied = new Map(initial.records);
    let observed = flattenDesktop(sharedDesktop(memory));
    let pending = new Map();
    let conflicts = new Map();
    let serial = Promise.resolve();
    let suppress = false;
    let started = false;
    let destroyed = false;
    let suspended = false;
    let saveTimer;
    let channel;
    let apply = () => {};
    let protect = () => false;
    let draftScopes = () => [];
    const invalidatedDrafts = new Map();
    const unrendered = new Set();
    let syncStatus = () => {};
    let conflictStatus = () => {};
    let resetStatus = () => {};
    let awaitingSynchronization = false;
    let journalFailed = false;
    const reportFailure = (error, fallback) => onError(error?.name === "VersionError" ? "versionchange" : fallback);
    const readSession = key => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
    const writeSession = (key, value) => {
        try { storage.setItem(key, JSON.stringify(value)); journalFailed = false; }
        catch { if (!journalFailed) onError("journal"); journalFailed = true; }
    };
    const enqueue = operation => {
        const result = serial.then(operation);
        serial = result.catch(() => {});
        return result;
    };
    const journal = () => writeSession(DESKTOP_JOURNAL_KEY, { epoch: known.meta.epoch, pending: [...pending.values()], conflicts: [...conflicts.values()] });
    function cacheBootstrap() {
        // A tiny first-paint hint only. Startup always awaits the database before
        // initializing controls, and no database write ever reads this hint.
        const onboarding = known.records.get('["onboarding","completed"]');
        try { bootstrapStorage?.setItem(BOOTSTRAP_KEY, JSON.stringify({ completed: onboarding?.value === true })); } catch { /* Hint is optional. */ }
    }
    function capture() {
        if (suppress || destroyed) return;
        writeSession(TAB_DESKTOP_KEY, { epoch: known.meta.epoch, state: privateDesktop(memory) });
        if (!started) return;
        const current = flattenDesktop(sharedDesktop(memory));
        const base = new Map([...observed].map(([key, record]) => [key, { ...record, revision: applied.get(key)?.revision || 0 }]));
        for (const [key, record] of applied) if (record.deleted && !base.has(key)) base.set(key, record);
        for (const patch of changedRecords(base, current, known.meta.revision)) {
            const previous = pending.get(patch.key) || conflicts.get(patch.key);
            const next = previous ? { ...patch, expected: previous.expected, guards: previous.guards, baseRevision: previous.baseRevision } : patch;
            // Once conflicted, typing updates the retained draft rather than
            // silently authorizing a retry over someone else's saved copy.
            const invalidated = [...invalidatedDrafts.values()].find(scope => scope.path.every((part, i) => patch.path[i] === part));
            if (invalidated) { pending.delete(patch.key); conflicts.set(patch.key, { ...next, previousEpoch: invalidated.epoch }); }
            else if (conflicts.has(patch.key)) conflicts.set(patch.key, next);
            else pending.set(patch.key, next);
        }
        observed = current;
        journal();
    }
    function announce() { try { channel?.postMessage({ epoch: known.meta.epoch, revision: known.meta.revision }); } catch { /* Focus reconciliation is the fallback. */ } }
    function connectChannel() {
        if (channel) return;
        try {
            channel = createChannel("guidelume-desktop-commits-v1");
            channel.addEventListener("message", () => { void api.reconcile(); });
        } catch { /* Database + focus checks work without BroadcastChannel. */ }
    }
    function notifyConflicts() { conflictStatus([...conflicts.values()]); }

    async function ingest(snapshot, { external = true, force = false } = {}) {
        capture();
        const epochChanged = snapshot.meta.epoch !== known.meta.epoch;
        const newer = epochChanged || snapshot.meta.revision > known.meta.revision;
        if (epochChanged) {
            for (const path of draftScopes()) invalidatedDrafts.set(JSON.stringify(path), { path, epoch: known.meta.epoch });
            for (const patch of pending.values()) if (!isPresentationRecord(patch.path)) conflicts.set(patch.key, { ...patch, previousEpoch: known.meta.epoch });
            pending.clear();
            // Private windows survive, but old private caches cannot be replayed
            // into a newly reset workspace after a reload.
        }
        const resetChanged = (snapshot.meta.resetGeneration || "initial") !== (known.meta.resetGeneration || "initial");
        known = snapshot;
        if (resetChanged) resetStatus();
        for (const [key, scope] of invalidatedDrafts) if (!protect(scope.path)) invalidatedDrafts.delete(key);
        if (external && newer) { awaitingSynchronization = true; syncStatus("synchronizing"); }
        const desired = flattenDesktop(sharedDesktop(memory));
        const changed = [];
        let deferred = false;
        const heldGroups = new Set([...pending.values(), ...conflicts.values()].map(patch => patch.group));
        // Protect entire edited entities, including their deletion markers.
        const forced = record => force === true || (typeof force === "function" && force(record.path));
        for (const record of snapshot.records.values()) if (!forced(record) && protect(record.path)) heldGroups.add(recordGroup(record.path));
        for (const [key, record] of snapshot.records) {
            if (sameRecordValue(applied.get(key), record) && applied.get(key)?.revision === record.revision
                && !forced(record) && !unrendered.has(key) && !epochChanged) continue;
            const held = !forced(record) && (heldGroups.has(recordGroup(record.path)) || protect(record.path)
                || (record.deleted && record.kind === "object" && [...desired.values()].some(child =>
                    child.path.length > record.path.length && record.path.every((part, i) => child.path[i] === part)
                    && (protect(child.path) || heldGroups.has(recordGroup(child.path))))));
            if (held) { deferred = true; unrendered.add(key); continue; }
            if (!sameRecordValue(desired.get(key), record) || unrendered.has(key)) changed.push(record.path);
            if (record.deleted) desired.delete(key); else desired.set(key, record);
            applied.set(key, record);
        }
        let rendered;
        if (changed.length) {
            suppress = true;
            try {
                reconcileObject(memory, normalize(desktopFromRecords(desired, privateDesktop(memory))));
                rendered = apply(changed, { epochChanged, external, force });
                observed = flattenDesktop(sharedDesktop(memory));
            } finally { suppress = false; }
        }
        cacheBootstrap();
        capture();
        notifyConflicts();
        // Controller promises include font/environment transitions. The theater
        // may announce completion only after actual rendering has finished.
        try {
            const result = await rendered;
            for (const path of changed) unrendered.delete(JSON.stringify(path));
            for (const scope of result?.deferredPaths || []) {
                for (const [key, record] of snapshot.records) if (scope.every((part, i) => record.path[i] === part)) unrendered.add(key);
                deferred = true;
            }
        }
        catch {
            for (const path of changed) unrendered.add(JSON.stringify(path));
            onError("apply"); syncStatus("unavailable");
            return false;
        }
        if (awaitingSynchronization && !deferred && !pending.size && !conflicts.size) {
            awaitingSynchronization = false;
            syncStatus("complete");
        }
        return !deferred;
    }

    async function flush() {
        if (!started || destroyed || suspended) return false;
        const batch = [...pending.values()];
        if (!batch.length) return conflicts.size === 0;
        try {
            const result = await database.commit({ epoch: known.meta.epoch, patches: batch });
            for (const patch of batch) {
                // Do not drop edits made while the transaction was pending.
                if (pending.get(patch.key) !== patch) continue;
                pending.delete(patch.key);
                if (result.stale || result.conflicts.some(item => item.key === patch.key)) {
                    if (!result.stale || !isPresentationRecord(patch.path)) conflicts.set(patch.key, {
                        ...patch, ...result.conflicts.find(item => item.key === patch.key)
                    });
                }
                else {
                    applied.set(patch.key, result.records.get(patch.key));
                }
            }
            // A second edit to an accepted record is based on my commit.
            const writtenKeys = new Set(result.written.map(patch => patch.key));
            for (const [key, queued] of pending) {
                pending.set(key, { ...queued,
                    expected: writtenKeys.has(key) ? result.records.get(key).revision : queued.expected,
                    guards: queued.guards.map(guard => writtenKeys.has(guard.key)
                        ? { ...guard, revision: result.records.get(guard.key).revision } : guard)
                });
            }
            await ingest(result, { external: result.stale || result.meta.revision > known.meta.revision + (result.written.length ? 1 : 0) });
            if (result.written.length) announce();
            return !result.stale && result.conflicts.length === 0;
        } catch (error) { journal(); reportFailure(error, "save"); return false; }
    }

    const savedJournal = readSession(DESKTOP_JOURNAL_KEY);
    if (savedJournal) {
        const savedPending = Array.isArray(savedJournal.pending) ? savedJournal.pending : [];
        const savedConflicts = Array.isArray(savedJournal.conflicts) ? savedJournal.conflicts : [];
        for (const patch of [...savedPending, ...savedConflicts].slice(0, 10000)) {
            if (!patch || !Array.isArray(patch.path) || !patch.path.length
                || patch.path.some(part => typeof part !== "string" || ["__proto__", "prototype", "constructor"].includes(part))
                || patch.key !== JSON.stringify(patch.path) || !["object", "value"].includes(patch.kind)
                || !Array.isArray(patch.guards) || !Number.isFinite(patch.expected) || typeof patch.group !== "string") continue;
            if (savedJournal.epoch !== known.meta.epoch && isPresentationRecord(patch.path)) continue;
            if (savedJournal.epoch === known.meta.epoch && !savedConflicts.some(item => item.key === patch.key)) pending.set(patch.key, patch);
            else conflicts.set(patch.key, patch);
        }
        const draft = flattenDesktop(sharedDesktop(memory));
        for (const patch of [...pending.values(), ...conflicts.values()]) {
            if (patch.deleted) draft.delete(patch.key); else draft.set(patch.key, patch);
        }
        reconcileObject(memory, normalize(desktopFromRecords(draft, privateDesktop(memory))));
        observed = flattenDesktop(sharedDesktop(memory));
    }
    cacheBootstrap();

    const api = {
        start({ onApply = () => {}, isProtected = () => false, getDraftScopes = () => [], onSync = () => {}, onConflicts = () => {}, onReset = () => {}, initialDeferredPaths = [] } = {}) {
            apply = onApply; protect = isProtected; syncStatus = onSync; conflictStatus = onConflicts;
            resetStatus = onReset;
            draftScopes = getDraftScopes;
            for (const scope of initialDeferredPaths) for (const [key, record] of known.records) {
                if (scope.every((part, i) => record.path[i] === part)) unrendered.add(key);
            }
            // Ignore initialization/normalization writes; those are not edits.
            observed = flattenDesktop(sharedDesktop(memory));
            started = true;
            connectChannel();
            notifyConflicts();
            if (pending.size) void api.save();
            return api.reconcile();
        },
        save() {
            if (suppress) return Promise.resolve(true);
            capture(); notifyConflicts(); clearTimeout(saveTimer); return enqueue(flush);
        },
        queue() {
            capture();
            if (!started || suppress) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => { void enqueue(flush); }, 200);
        },
        capture,
        reconcile() {
            capture();
            if (!started || destroyed || suspended) return Promise.resolve(false);
            return enqueue(async () => {
                try { return await ingest(await database.read()); }
                catch (error) { reportFailure(error, "read"); syncStatus("unavailable"); return false; }
            });
        },
        async replace(transform, { discardLocal = () => false, fullReset = false } = {}) {
            capture();
            return enqueue(async () => {
                try {
                    let stagedPrivate;
                    const result = await database.replace({ epoch: known.meta.epoch, fullReset, transform(records) {
                        const next = normalize(desktopFromRecords(records, privateDesktop(memory)));
                        transform(next);
                        stagedPrivate = privateDesktop(next);
                        return sharedDesktop(next);
                    } });
                    if (result.stale) { await ingest(result); return false; }
                    for (const [key, patch] of pending) {
                        if (!discardLocal(patch.path) && !isPresentationRecord(patch.path)) conflicts.set(key, patch);
                    }
                    pending.clear();
                    for (const [key, patch] of conflicts) if (discardLocal(patch.path) || isPresentationRecord(patch.path)) conflicts.delete(key);
                    // A restore may explicitly change local taskbar order or
                    // library visibility. Apply those only to its initiating tab.
                    reconcileObject(memory, normalize(desktopFromRecords(flattenDesktop(sharedDesktop(memory)), stagedPrivate)));
                    observed = flattenDesktop(sharedDesktop(memory));
                    await ingest(result, { external: false, force: discardLocal });
                    announce();
                    return true;
                } catch (error) { reportFailure(error, "save"); return false; }
            });
        },
        get conflicts() { return [...conflicts.values()].map(patch => ({ ...patch, saved: known.records.get(patch.key) })); },
        get resetGeneration() { return known.meta.resetGeneration || "initial"; },
        get hasDeferredChanges() { return awaitingSynchronization; },
        pause() { capture(); suspended = true; clearTimeout(saveTimer); channel?.close(); channel = null; database.disconnect?.(); },
        async resume() {
            if (destroyed || !started) return;
            suspended = false; connectChannel();
            await api.reconcile();
            if (pending.size) await api.save();
        },
        async resolve(key, keepMine) {
            return enqueue(async () => {
                try {
                    const patch = conflicts.get(key);
                    if (!patch) return false;
                    const group = [...conflicts.values()].filter(item => item.group === patch.group);
                    const latest = await database.read();
                    if (keepMine) {
                        const creating = new Set(group.filter(item => !item.deleted && item.kind === "object").map(item => item.key));
                        const parentMissing = group.some(item => item.guards.some(guard => (!latest.records.get(guard.key) || latest.records.get(guard.key).deleted) && !creating.has(guard.key)));
                        // Recreating a deleted entity needs an explicit new item;
                        // a text edit alone must never resurrect deleted content.
                        if (parentMissing) { onError("deleted"); return false; }
                        const next = group.map(item => ({ ...item, expected: latest.records.get(item.key)?.revision || 0, baseRevision: latest.meta.revision,
                            guards: item.guards.map(guard => ({ key: guard.key, revision: latest.records.get(guard.key)?.revision || 0 })) }));
                        const result = await database.commit({ epoch: latest.meta.epoch, patches: next });
                        if (result.stale || result.conflicts.length) { await ingest(result); return false; }
                        for (const item of group) { conflicts.delete(item.key); applied.delete(item.key); }
                        await ingest(result, { external: false });
                        announce();
                    } else {
                        for (const item of group) { conflicts.delete(item.key); applied.delete(item.key); }
                        // A rejected creation may never have existed in the DB.
                        // Treat its missing records as deletions for this apply.
                        for (const item of group) if (!latest.records.has(item.key)) latest.records.set(item.key, {
                            key: item.key, path: item.path, kind: item.kind, deleted: true, revision: 0
                        });
                        await ingest(latest, { external: false });
                    }
                    journal(); notifyConflicts();
                    return true;
                } catch (error) { reportFailure(error, "save"); return false; }
            });
        },
        destroy() { destroyed = true; clearTimeout(saveTimer); channel?.close(); database.close(); }
    };
    return api;
}
