import { normalizeUserProfile, PROFILE_AVATARS } from "./profile-data.js";
import { initToastNotifications } from "./toast-notifications.js";

// The lock screen belongs to Guidelume's OS shell and inherits its theme tokens.
export function initSessionLock({ getProfile, canLock = () => true, beforeLock = () => {}, onChange = () => {}, onRestrictedAccess = () => {},
    getResumeFocus = previous => previous, getFocusKey = () => null }) {
    const dialog = document.createElement("dialog");
    dialog.className = "session-lock";
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "session-lock-title");
    dialog.setAttribute("aria-describedby", "session-lock-description");
    dialog.setAttribute("closedby", "none");
    dialog.innerHTML = `
        <div class="session-lock-layout">
            <header class="session-lock-brand"><img src="./engine/dagaz.svg" alt=""><span>Guidelume</span><small>WORKSPACE / SESSION</small></header>
            <div class="session-lock-clock"><time data-session-time aria-label="Current local time" aria-live="off"></time><p data-session-date></p></div>
            <section class="session-lock-account">
                <img class="session-lock-avatar" data-session-avatar alt="">
                <p class="session-lock-kicker">SESSION LOCKED</p>
                <h1 id="session-lock-title" data-session-name></h1>
                <p id="session-lock-description">Your workspace is right where you left it.</p>
                <button type="button" class="session-lock-resume" data-session-resume autofocus>Resume Session <span aria-hidden="true">→</span></button>
            </section>
            <div class="session-lock-other">
                <button type="button" class="session-lock-admin" aria-disabled="true"><span aria-hidden="true">▣</span><span>Administrator<small>Restricted account</small></span><span aria-hidden="true">⊘</span></button>
            </div>
            <footer class="session-lock-footer"><span>Guidelume desktop environment</span><span>Secured by Blackwall</span></footer>
        </div>`;
    document.body.append(dialog);
    const listeners = new AbortController();
    const resume = dialog.querySelector("[data-session-resume]");
    let returnFocus;
    let focusAtLock;
    let clockTimer;
    let accessToast;
    let destroyed = false;

    function updateClock() {
        clearTimeout(clockTimer);
        if (!dialog.open) return;
        const date = new Date();
        const time = dialog.querySelector("[data-session-time]");
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        time.setAttribute("aria-label", `Current local time: ${time.textContent}`);
        dialog.querySelector("[data-session-date]").textContent = date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        clockTimer = setTimeout(updateClock, 60_000 - date.getTime() % 60_000);
    }

    function clearAccessNotice() {
        accessToast?.destroy();
        accessToast = null;
    }

    function unlock({ external = false, restoreFocus = true } = {}) {
        clearAccessNotice();
        if (!dialog.open) return;
        clearTimeout(clockTimer);
        dialog.close();
        delete document.documentElement.dataset.sessionLocked;
        onChange(false, "manual", { external });
        const preferred = getFocusKey() === focusAtLock && returnFocus?.isConnected && returnFocus.getClientRects().length
            ? returnFocus : getResumeFocus(returnFocus);
        const target = preferred?.isConnected && preferred.getClientRects().length
            ? preferred : document.querySelector(".start-button");
        if (restoreFocus) target?.focus({ preventScroll: true });
        returnFocus = null;
    }

    dialog.addEventListener("cancel", event => event.preventDefault(), { signal: listeners.signal });
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") event.preventDefault();
        if (event.key !== "Tab") return;
        event.preventDefault();
        const controls = [...dialog.querySelectorAll("button")];
        const current = controls.indexOf(document.activeElement);
        controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    }, { signal: listeners.signal });
    for (const type of ["pointerdown", "click", "keydown", "keyup"]) {
        dialog.addEventListener(type, event => event.stopPropagation(), { signal: listeners.signal });
    }
    resume.addEventListener("click", () => unlock(), { signal: listeners.signal });
    dialog.querySelector(".session-lock-admin").addEventListener("click", () => {
        // Mount inside the native modal so the notice remains visible and accessible.
        accessToast ||= initToastNotifications({ container: dialog });
        accessToast.show("Administrator privileges are restricted. Your curiosity has been noted.", "error", {
            title: "ACCESS RESTRICTED"
        });
        onRestrictedAccess();
    }, { signal: listeners.signal });
    document.addEventListener("visibilitychange", updateClock, { signal: listeners.signal });
    window.addEventListener("pagehide", () => { clearTimeout(clockTimer); clearAccessNotice(); }, { signal: listeners.signal });
    window.addEventListener("pageshow", updateClock, { signal: listeners.signal });
    return {
        get isLocked() { return dialog.open; },
        lock(reason = "manual", { external = false } = {}) {
            if (destroyed || dialog.open || !canLock()) return false;
            const profile = normalizeUserProfile(getProfile());
            dialog.querySelector("[data-session-name]").textContent = profile.displayName;
            dialog.querySelector("[data-session-avatar]").src = PROFILE_AVATARS.find(avatar => avatar.id === profile.avatar).src;
            clearAccessNotice();
            returnFocus = document.activeElement;
            focusAtLock = getFocusKey();
            beforeLock();
            dialog.showModal();
            document.documentElement.dataset.sessionLocked = "true";
            resume.focus({ preventScroll: true });
            updateClock();
            onChange(true, reason, { external });
            return true;
        },
        unlock,
        destroy() {
            destroyed = true;
            unlock({ external: true, restoreFocus: false }); clearTimeout(clockTimer); listeners.abort(); dialog.remove();
        }
    };
}
