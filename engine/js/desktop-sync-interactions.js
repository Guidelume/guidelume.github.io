// Incoming updates and theatrical notices share these interaction boundaries.
// Drafts are marked by their controllers and stay protected after focus leaves.
export function createSyncInteractionGuard() {
    let pointerActive = false;
    let quietAfter = 0;
    let endTimer;
    const editable = element => element?.matches?.('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), [contenteditable="true"]');
    const visible = node => Boolean(node && !node.closest('[hidden], .window-closing') && node.getClientRects().length);
    const activeEditor = () => editable(document.activeElement) && visible(document.activeElement) ? document.activeElement : null;
    const dirty = id => document.querySelector(`[data-window="${id}"] [data-sync-dirty="true"], [data-window="${id}"][data-sync-dirty="true"]`);
    const activeIn = id => activeEditor()?.closest(`[data-window="${id}"]`);
    const interacting = () => [...document.querySelectorAll('[data-sync-dirty="true"], [data-window-dragging], [data-window-resizing], [data-glass-editor]:not([hidden])')]
        .some(node => visible(node.closest("[data-window]") || node));
    const visibleDirty = id => visible(document.querySelector(`[data-window="${id}"]`)) && dirty(id);
    const changed = () => window.dispatchEvent(new Event("guidelume:interaction-ended"));
    window.addEventListener("pointerdown", () => { pointerActive = true; }, true);
    const settled = () => {
        quietAfter = performance.now() + 120;
        clearTimeout(endTimer);
        // Let the release's click/submit finish before a modal can take focus.
        endTimer = setTimeout(changed, 125);
    };
    const released = () => { pointerActive = false; settled(); };
    window.addEventListener("pointerup", released, true);
    window.addEventListener("pointercancel", released, true);
    window.addEventListener("lostpointercapture", released, true);
    window.addEventListener("blur", released);
    document.addEventListener("focusout", settled);
    return {
        draftScopes() {
            const paths = [...document.querySelectorAll('[data-notepad-document][data-sync-dirty="true"]')].map(node => ["documents", node.dataset.notepadDocument]);
            if (dirty("user-profile") || dirty("setup")) paths.push(["profile"]);
            if (dirty("environmental-controls")) paths.push(["settings", "environment"]);
            if (document.querySelector('[data-glass-editor]:not([hidden])')) paths.push(["lookingGlass", "bookmarks"]);
            const shortcut = document.querySelector('[data-desktop-object-dialog][open]')?.dataset.shortcutEditing;
            if (shortcut) paths.push(["shortcuts", shortcut]);
            return paths;
        },
        isProtected(path) {
            const [section, id] = path;
            if (section === "focusedWindow") return pointerActive || Boolean(activeEditor())
                || interacting();
            if (section === "sessionLocked") return !document.querySelector(".session-lock[open]") && (pointerActive || Boolean(activeEditor())
                || interacting());
            if (section === "settings" && (pointerActive || activeEditor())) return true;
            if (section === "windows") return pointerActive || Boolean(document.querySelector("[data-window-dragging], [data-window-resizing]"))
                || Boolean(activeIn(id) || visibleDirty(id))
                || (id === "looking-glass" && visible(document.querySelector('[data-glass-editor]:not([hidden])')));
            if (section === "icons") return pointerActive;
            if (section === "shortcuts") return pointerActive || Boolean(id && document.querySelector(`[data-desktop-object-dialog][open][data-shortcut-editing="${CSS.escape(id)}"]`));
            if (section === "pinnedTaskbar" || section === "pinnedTaskbarOrder") return pointerActive;
            if (section === "widgets") return pointerActive || Boolean(document.activeElement?.closest(".desktop-widget, [data-window='widgets']"));
            if (section === "documents") return Boolean(document.querySelector(`[data-notepad-document="${id}"][data-sync-dirty="true"]`)
                || activeEditor()?.closest(`[data-notepad-document="${id}"]`));
            if (section === "profile" || section === "onboarding") return Boolean(dirty("user-profile") || dirty("setup") || activeIn("user-profile") || activeIn("setup"));
            if (section === "settings" && id === "environment") return Boolean(dirty("environmental-controls") || activeIn("environmental-controls"));
            if (section === "lookingGlass") return Boolean(document.querySelector('[data-glass-editor]:not([hidden])') || activeIn("looking-glass"));
            return false;
        },
        canShowNotice() {
            return !pointerActive && performance.now() >= quietAfter && !activeEditor()
                // Hidden drafts still protect their saved fields. Keep the
                // theater queued until those drafts can finish reconciliation.
                && !document.querySelector('[data-sync-dirty="true"], [data-window-dragging], [data-window-resizing], [data-glass-editor]:not([hidden])');
        }
    };
}
