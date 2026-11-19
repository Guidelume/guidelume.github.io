// Shares the incident presentation without triggering an incident or timed lockdown.
export function initBlackwallSessionNotice({ onProceed = () => {}, synchronization = false, canShow = () => true, getReturnFocus = () => null } = {}) {
    const dialog = document.createElement("dialog");
    dialog.className = "blackwall-session-notice";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "blackwall-session-notice-title");
    dialog.setAttribute("aria-describedby", "blackwall-session-notice-summary blackwall-session-notice-status");
    dialog.setAttribute("closedby", "none");
    dialog.innerHTML = `
        <header class="blackwall-header">
            <svg class="blackwall-shield" viewBox="0 0 48 52" fill="none" aria-hidden="true">
                <path d="M24 3 44 11v15c0 11-12 19-20 23C16 45 4 37 4 26V11Z"/>
                <path d="M24 15v14m0 7v2"/>
            </svg>
            <div>
                <p class="blackwall-eyebrow">GUIDELUME // SESSION SUPERVISION</p>
                <h2 id="blackwall-session-notice-title">BLACKWALL SECURITY SYSTEM</h2>
            </div>
        </header>
        <p class="blackwall-alert">DUPLICATE SESSION DETECTED</p>
        <div id="blackwall-session-notice-summary" class="blackwall-summary">
            <p><em>Slow clap.</em></p>
            <p>Well done. You've opened the same website twice.</p>
            <p>Are you quite certain one wasn't enough?</p>
        </div>
        <section class="blackwall-report" aria-labelledby="blackwall-session-report-title">
            <h3 id="blackwall-session-report-title">SESSION REPORT</h3>
            <dl>
                <dt>Classification</dt><dd>Duplicate workspace session</dd>
                <dt>Reported behavior</dt><dd>Another Guidelume terminal is already operational.</dd>
                <dt>Response</dt><dd>User acknowledgement requested. Additional terminals remain permitted.</dd>
            </dl>
        </section>
        <div class="blackwall-lockdown">
            <p id="blackwall-session-notice-status" class="blackwall-status">AWAITING ACKNOWLEDGEMENT</p>
            <button type="button" class="blackwall-dismiss" data-blackwall-proceed autofocus>Proceed Anyway</button>
        </div>
        <footer class="blackwall-footer">BLACKWALL // SESSION SUPERVISION</footer>`;
    // Both presentations use this same modal, focus handling and incident style.
    // Distinct IDs allow a duplicate notice and a queued sync notice to coexist.
    if (synchronization) {
        for (const element of dialog.querySelectorAll("[id]")) element.id = element.id.replace("session", "sync");
        dialog.setAttribute("aria-labelledby", "blackwall-sync-notice-title");
        dialog.setAttribute("aria-describedby", "blackwall-sync-notice-summary blackwall-sync-notice-status");
        dialog.querySelector(".blackwall-report").remove();
        dialog.querySelector("h2").textContent = "BLACKWALL";
        dialog.querySelector(".blackwall-alert").textContent = "DESYNCHRONIZATION DETECTED";
        dialog.querySelector(".blackwall-summary").replaceChildren();
        const message = document.createElement("p");
        message.textContent = "Changes to your environment have been detected in another session.";
        dialog.querySelector(".blackwall-summary").append(message);
        dialog.dataset.synchronizationNotice = "true";
    }
    (document.querySelector("#crt") || document.body).append(dialog);

    const proceed = dialog.querySelector("[data-blackwall-proceed]");
    const listeners = new AbortController();
    let pending = false;
    let destroyed = false;
    let returnFocus;
    const observer = new MutationObserver(tryShow);
    const status = dialog.querySelector(".blackwall-status");
    let complete = !synchronization;
    if (synchronization) { proceed.textContent = "Return to Desktop"; proceed.disabled = true; status.textContent = "Synchronizing desktop..."; }

    function tryShow() {
        // Let an existing incident, confirmation or OS lock finish first.
        if (!pending || destroyed || document.hidden || !canShow() || document.querySelector("dialog[open]")) return;
        observer.disconnect();
        pending = false;
        returnFocus = document.activeElement;
        dialog.showModal();
        (proceed.disabled ? dialog : proceed).focus({ preventScroll: true });
    }

    function hide() {
        pending = false;
        observer.disconnect();
        if (!dialog.open) return;
        dialog.close();
        const preferred = getReturnFocus(returnFocus);
        const target = preferred?.isConnected && preferred.getClientRects().length ? preferred
            : returnFocus?.isConnected && !returnFocus.matches("body, html") && returnFocus.getClientRects().length
            ? returnFocus : document.querySelector(".start-button");
        target?.focus({ preventScroll: true });
        returnFocus = null;
    }

    dialog.addEventListener("cancel", event => event.preventDefault(), { signal: listeners.signal });
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") event.preventDefault();
        if (event.key === "Tab") {
            event.preventDefault();
            (proceed.disabled ? dialog : proceed).focus({ preventScroll: true });
        }
    }, { signal: listeners.signal });
    for (const type of ["pointerdown", "click", "keydown", "keyup"]) {
        dialog.addEventListener(type, event => event.stopPropagation(), { signal: listeners.signal });
    }
    proceed.addEventListener("click", () => { hide(); onProceed(); }, { signal: listeners.signal });
    window.addEventListener("guidelume:interaction-ended", tryShow, { signal: listeners.signal });
    document.addEventListener("visibilitychange", tryShow, { signal: listeners.signal });

    return {
        show() {
            if (destroyed || pending || dialog.open) return;
            pending = true;
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["open"] });
            tryShow();
        },
        hide,
        update(state) {
            if (!synchronization) return;
            complete = state === "complete";
            proceed.disabled = !complete;
            status.textContent = complete ? "Synchronization complete." : state === "unavailable"
                ? "Synchronization paused. Your desktop remains available." : "Synchronizing desktop...";
            // An unavailable database must not strand someone behind theater.
            if (state === "unavailable") { hide(); return; }
            this.show();
            if (dialog.open && complete) proceed.focus({ preventScroll: true });
        },
        destroy() { destroyed = true; hide(); listeners.abort(); dialog.remove(); }
    };
}
