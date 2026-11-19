import { normalizeBlackwallPreferences, lockTimeouts } from "./blackwall-preferences.js";
import { initSessionLock } from "./session-lock.js";
import { initSessionIdle } from "./session-idle.js";
import { initDuplicateSession } from "./duplicate-session.js";
import { initBlackwallSessionNotice } from "./blackwall-session-notice.js";
import { initTabs } from "./tabs.js";
import { initSecurityEventLog } from "./blackwall-events.js";
import { blackwallViewKey, normalizeBlackwallView } from "./blackwall-view.js";

export function initBlackwallApp({ memory, saveMemory, queueSave = saveMemory, toast, canLock, beforeLock,
    canShowNotice = () => true, getConflicts = () => [], resolveConflict = async () => false, getReturnFocus, getHistoryGeneration }) {
    const windowElement = document.querySelector('[data-window="blackwall"]');
    const content = windowElement.querySelector(".blackwall-content");
    const listeners = new AbortController();
    let warningDismiss;
    let idle;
    const preferences = () => normalizeBlackwallPreferences(memory.settings.blackwall);
    content.innerHTML = `
        <div class="window-tablist" role="tablist" aria-label="Blackwall categories">
            <button type="button" class="window-tab" id="blackwall-home-tab" role="tab" aria-selected="true" aria-controls="blackwall-home-panel" tabindex="0" data-tab-id="blackwall-home">Home</button>
            <button type="button" class="window-tab" id="blackwall-sessions-tab" role="tab" aria-selected="false" aria-controls="blackwall-sessions-panel" tabindex="-1" data-tab-id="blackwall-sessions">Sessions</button>
            <button type="button" class="window-tab" id="blackwall-events-tab" role="tab" aria-selected="false" aria-controls="blackwall-events-panel" tabindex="-1" data-tab-id="blackwall-events">Security Events</button>
        </div>
        <section class="window-tab-panel" id="blackwall-home-panel" role="tabpanel" aria-labelledby="blackwall-home-tab" tabindex="0" data-tab-panel="blackwall-home">
            <header class="blackwall-app-header"><p class="blackwall-eyebrow">GUIDELUME // WORKSPACE PROTECTION</p><h1>BLACKWALL</h1><p class="blackwall-app-status">● SYSTEM SECURE</p><p>Perimeter intact. Your cooperation is assumed.</p></header>
            <section class="blackwall-section" aria-labelledby="blackwall-about-title"><h2 id="blackwall-about-title">About Blackwall</h2><p>Blackwall supervises this simulated desktop with unwavering seriousness and a frankly unnecessary sense of authority.</p><p class="blackwall-app-disclaimer">Part of Guidelume’s fictional environment. No real authentication, antivirus scanning, or device protection.</p></section>
            <section class="blackwall-section" data-sync-conflicts hidden aria-live="polite"><h2>Saved changes need review</h2><p>Another session saved a different version. Your changes remain here. Choose which version to keep.</p><div data-sync-conflict-list></div></section>
        </section>
        <section class="window-tab-panel" id="blackwall-sessions-panel" role="tabpanel" aria-labelledby="blackwall-sessions-tab" tabindex="0" data-tab-panel="blackwall-sessions" hidden>
        <section class="blackwall-section" aria-labelledby="blackwall-session-title"><h2 id="blackwall-session-title">Session Management</h2>
            <label class="blackwall-option"><input type="checkbox" data-security-preference="autoLock"><span>Automatically lock an inactive session<small>Off by default. Background tabs only unless you opt in below.</small></span></label>
            <label class="blackwall-timeout">Lock after <select data-security-preference="lockAfterMinutes" aria-label="Automatic lock timeout">${lockTimeouts.map(minutes => `<option value="${minutes}">${minutes} minutes</option>`).join("")}</select></label>
            <label class="blackwall-option"><input type="checkbox" data-security-preference="warnBeforeLock"><span>Warn before automatic locking<small>Blackwall gives up to two minutes’ notice. Activity cancels the warning.</small></span></label>
            <label class="blackwall-option"><input type="checkbox" data-security-preference="lockWhileReading"><span>Also lock during foreground inactivity<small>Optional: a guide left open for reading may lock. Leave off to read uninterrupted.</small></span></label>
            <button type="button" class="blackwall-app-button" data-lock-session>Lock Session</button>
        </section>
        <section class="blackwall-section" aria-labelledby="blackwall-notices-title"><h2 id="blackwall-notices-title">Session Notices</h2><label class="blackwall-option"><input type="checkbox" data-security-preference="duplicateWarnings"><span>Show a notice when another Guidelume tab is open<small>Acknowledge the notice to continue. Additional terminals remain permitted.</small></span></label></section>
        <p class="blackwall-preference-status" data-security-save-status role="status" aria-live="polite"></p>
        </section>
        <section class="window-tab-panel" id="blackwall-events-panel" role="tabpanel" aria-labelledby="blackwall-events-tab" tabindex="0" data-tab-panel="blackwall-events" hidden>
            <h2 id="blackwall-events-title">Security Events</h2><ol class="blackwall-events" data-security-events></ol>
        </section>`;
    // The dashboard is rendered after the desktop's initial tab scan.
    const tabs = initTabs(windowElement, { memory, saveMemory });
    let cachedView;
    try { cachedView = JSON.parse(sessionStorage.getItem(blackwallViewKey)); } catch { /* Use the saved desktop view. */ }
    const view = normalizeBlackwallView(cachedView || memory.windows.blackwall?.view);
    view.activeTab = memory.windows.blackwall?.activeTab || view.activeTab;
    tabs.activateTab(view.activeTab, { external: true });
    const panels = [...content.querySelectorAll("[data-tab-panel]")];
    function saveView(immediate = false, external = false) {
        if (window.guidelumeFullResetInProgress === true) return;
        // Scroll positions remain local; the selected tab has its own shared field.
        try { sessionStorage.setItem(blackwallViewKey, JSON.stringify(view)); } catch { /* Desktop memory remains available. */ }
        memory.windows.blackwall ||= {};
        memory.windows.blackwall.view = view;
        if (!external) { if (immediate) saveMemory(); else queueSave(); }
    }
    function restoreScroll() {
        if (windowElement.hidden) return;
        const panel = panels.find(panel => !panel.hidden);
        if (panel) panel.scrollTop = view.scrollPositions[panel.dataset.tabPanel] || 0;
    }
    content.addEventListener("tabchange", event => {
        view.activeTab = event.detail.tabId;
        restoreScroll();
        saveView(true, event.detail.external);
    }, { signal: listeners.signal });
    panels.forEach(panel => panel.addEventListener("scroll", () => {
        if (panel.hidden || windowElement.hidden || windowElement.classList.contains("window-closing")) return;
        const id = panel.dataset.tabPanel;
        if (view.scrollPositions[id] === panel.scrollTop) return;
        view.scrollPositions[id] = panel.scrollTop;
        saveView();
    }, { passive: true, signal: listeners.signal }));
    let restoreOnOpen = windowElement.hidden;
    windowElement.addEventListener("windowclosing", () => { restoreOnOpen = true; }, { signal: listeners.signal });
    windowElement.addEventListener("windowfocus", () => {
        if (!restoreOnOpen) return;
        restoreOnOpen = false;
        restoreScroll();
    }, { signal: listeners.signal });

    function renderEvents(events) {
        const list = content.querySelector("[data-security-events]");
        list.replaceChildren(...events.map(event => {
            const item = document.createElement("li");
            const time = document.createElement("time");
            const date = new Date(event.time);
            time.dateTime = date.toISOString();
            time.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            item.append(time, document.createTextNode(event.message));
            return item;
        }));
    }
    const eventLog = initSecurityEventLog({ onChange: renderEvents, getGeneration: getHistoryGeneration });
    restoreScroll();
    const recordEvent = message => eventLog.record(message);
    const sessionNotice = initBlackwallSessionNotice({
        canShow: canShowNotice,
        onProceed() { recordEvent("Duplicate session acknowledged. Additional terminal permitted."); idle?.refresh(); }
    });
    const synchronizationNotice = initBlackwallSessionNotice({ synchronization: true,
        getReturnFocus,
        canShow: () => canShowNotice() && getConflicts().length === 0,
        onProceed() { recordEvent("Desktop synchronization acknowledged. Order restored."); idle?.refresh(); }
    });
    const session = initSessionLock({
        getResumeFocus: getReturnFocus,
        getFocusKey: () => memory.focusedWindow,
        getProfile: () => memory.profile,
        canLock,
        beforeLock() { warningDismiss?.(); beforeLock(); },
        onRestrictedAccess() { recordEvent("Administrator account access denied."); },
        onChange(locked, reason, { external = false } = {}) {
            if (!external) {
                memory.sessionLocked = locked;
                void saveMemory();
                recordEvent(locked ? `Session locked${reason === "idle" ? " after inactivity" : " manually"}.` : "Session resumed.");
            }
            if (!locked) idle?.refresh();
        }
    });
    idle = initSessionIdle({
        getPreferences: preferences,
        canLock: () => !session.isLocked && canLock(),
        onLock: () => session.lock("idle"),
        onWarning: minutes => {
            warningDismiss = toast.show(`Your terminal has been inactive. Automatic session lock in ${minutes} ${minutes === 1 ? "minute" : "minutes"}. Resume activity to prevent locking.`, "blackwall", {
                title: "BLACKWALL SECURITY", duration: 0,
                actionLabel: "Keep Session Active", onAction: () => idle.refresh()
            });
        },
        dismissWarning: () => { warningDismiss?.(); warningDismiss = null; }
    });
    const duplicate = initDuplicateSession({
        enabled: () => preferences().duplicateWarnings,
        notify() {
            recordEvent("Another Guidelume terminal is already operational.");
            sessionNotice.show();
        }
    });
    function refresh() {
        const settings = preferences();
        content.querySelectorAll("[data-security-preference]").forEach(input => {
            const key = input.dataset.securityPreference;
            if (input.type === "checkbox") input.checked = settings[key];
            else input.value = String(settings[key]);
            input.disabled = ["lockAfterMinutes", "warnBeforeLock", "lockWhileReading"].includes(key) && !settings.autoLock;
        });
        if (!settings.duplicateWarnings) sessionNotice.hide();
        idle.refresh();
    }
    content.addEventListener("change", async event => {
        const input = event.target.closest("[data-security-preference]");
        if (!input) return;
        memory.settings.blackwall = normalizeBlackwallPreferences({ ...preferences(),
            [input.dataset.securityPreference]: input.type === "checkbox" ? input.checked : Number(input.value)
        });
        content.querySelector("[data-security-save-status]").textContent = await saveMemory() === true
            ? "Preferences saved on this device." : "Preferences apply for this visit; this browser could not save them.";
        refresh();
    }, { signal: listeners.signal });
    document.querySelectorAll("[data-lock-session]").forEach(button => button.addEventListener("click", () => session.lock(), { signal: listeners.signal }));
    recordEvent("Blackwall service online. No undue enthusiasm detected.");
    let conflictToast;
    let previousConflictCount = 0;
    let conflictSignature = "";
    function refreshConflicts() {
        const conflicts = getConflicts();
        // A conflict can be discovered after the theatrical notice opened.
        // Never leave review controls trapped behind its disabled dismissal.
        if (conflicts.length) synchronizationNotice.hide();
        const signature = JSON.stringify(conflicts);
        if (signature === conflictSignature) return;
        conflictSignature = signature;
        const section = content.querySelector("[data-sync-conflicts]");
        section.hidden = conflicts.length === 0;
        const list = content.querySelector("[data-sync-conflict-list]");
        const names = new Map(conflicts.filter(conflict => conflict.path[0] === "shortcuts" && conflict.path[2] === "name").map(conflict => [conflict.group, conflict]));
        const groups = [...new Map(conflicts.map(conflict => [conflict.group, names.get(conflict.group) || conflict])).values()];
        list.replaceChildren(...groups.map(conflict => {
            const item = document.createElement("article");
            item.className = "blackwall-sync-conflict";
            const title = document.createElement("h3");
            const sectionName = { documents: "Document", widgets: "Widget", windows: "Window layout", settings: "Preference",
                profile: "Profile", lookingGlass: "Looking Glass", shortcuts: "Desktop shortcut", icons: "Desktop icon", pinnedTaskbar: "Taskbar", pinnedTaskbarOrder: "Taskbar order" }[conflict.path[0]] || "Saved change";
            const entity = ["documents", "windows", "icons"].includes(conflict.path[0]) ? conflict.path[1] : null;
            const windowName = entity && document.querySelector(`[data-window="${CSS.escape(entity === "progress-report-1" ? "progress-report-01" : entity)}"] .titlebar-left span`)?.textContent.trim();
            const fieldNames = { autoLock: "Automatic session lock", lockAfterMinutes: "Lock timeout", warnBeforeLock: "Lock warning", lockWhileReading: "Foreground inactivity",
                duplicateWarnings: "Duplicate session notices", theme: "Theme", background: "Background", displayName: "Display name", avatar: "Avatar",
                x: "Horizontal position", y: "Vertical position", width: "Width", height: "Height", text: "Note text", content: "Text", title: "Bookmark title" };
            const fieldName = fieldNames[conflict.path.at(-1)];
            title.textContent = [sectionName, windowName, fieldName].filter(Boolean).join(" · ");
            const display = record => record?.deleted || !record ? "Removed" : record.kind === "object" ? "Item" : typeof record.value === "string" ? record.value : JSON.stringify(record.value);
            const local = document.createElement("pre");
            local.textContent = `This tab: ${display(conflict)}`;
            const saved = document.createElement("pre");
            saved.textContent = `Saved version: ${display(conflict.saved)}`;
            item.append(title, local, saved);
            if (conflict.reason) {
                const reason = document.createElement("p");
                reason.textContent = conflict.reason;
                item.append(reason);
            }
            for (const [label, keepMine] of [["Keep My Change", true], ["Use Saved Version", false]]) {
                const button = document.createElement("button");
                button.type = "button"; button.className = "blackwall-app-button"; button.textContent = label;
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    if (await resolveConflict(conflict.key, keepMine)) {
                        window.dispatchEvent(new CustomEvent("guidelume:conflict-resolved", { detail: { path: conflict.path } }));
                        window.dispatchEvent(new Event("guidelume:interaction-ended"));
                    }
                    refreshConflicts();
                    if (button.isConnected) button.disabled = false;
                });
                item.append(button);
            }
            return item;
        }));
        if (conflicts.length && !previousConflictCount) conflictToast = toast.show("Another session saved different changes. Your version has been retained for review in Blackwall.", "blackwall", {
            title: "BLACKWALL — SAVED CHANGES", duration: 0, actionLabel: "Review Changes", onAction() {
                document.querySelector('[data-open-window="blackwall"]')?.click();
                tabs.activateTab("blackwall-home");
                section.scrollIntoView({ block: "nearest" });
            }
        });
        if (!conflicts.length) { conflictToast?.(); conflictToast = null; }
        previousConflictCount = conflicts.length;
    }
    refresh();
    return {
        refresh, recordEvent, refreshConflicts,
        denyRecycleBinDeletion() {
            recordEvent("Attempt to delete Recycle Bin blocked. Protected system resource retained.");
            toast.show("Cannot delete Recycle Bin. The Recycle Bin is required to delete the Recycle Bin. Your request has been logged.", "blackwall", {
                title: "BLACKWALL — DELETION DENIED", duration: 5000
            });
        },
        refreshHistoryGeneration() { eventLog.refreshGeneration(); },
        applySharedTabs() { tabs.applySharedState(); },
        applySharedSession() {
            synchronizationNotice.hide();
            if (memory.sessionLocked === true && !session.isLocked) {
                if (!session.lock("synchronized", { external: true })) return { deferredPaths: [["sessionLocked"]] };
            } else if (memory.sessionLocked !== true && session.isLocked) session.unlock({ external: true });
            return { deferredPaths: [] };
        },
        synchronizationStatus(state) { synchronizationNotice.update(state); },
        destroy() {
            listeners.abort(); eventLog.destroy(); tabs.destroy(); idle.destroy(); duplicate.destroy();
            warningDismiss?.(); conflictToast?.(); synchronizationNotice.destroy(); sessionNotice.destroy(); session.destroy();
        }
    };
}
