const inputLimit = 160;
const failureLimit = 5;
const lockdownDuration = 10_000;
const serviceQueryLimit = 5;
const serviceQueryWindow = 3_000;
const protectedAccessLimit = 3;
const protectedAccessWindow = 10_000;

// Deliberately transient: Blackwall never writes incidents or locks to storage.
export function initBlackwall({ onLockChange = () => {}, notify = () => {}, brandingElement, protectedFileElement } = {}) {
    const dialog = document.createElement("dialog");
    dialog.className = "blackwall-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "blackwall-title");
    dialog.setAttribute("aria-describedby", "blackwall-summary blackwall-status");
    dialog.setAttribute("closedby", "none");
    dialog.innerHTML = `
        <header class="blackwall-header">
            <svg class="blackwall-shield" viewBox="0 0 48 52" fill="none" aria-hidden="true">
                <path d="M24 3 44 11v15c0 11-12 19-20 23C16 45 4 37 4 26V11Z"/>
                <path d="M24 15v14m0 7v2"/>
            </svg>
            <div>
                <p class="blackwall-eyebrow" data-blackwall-scope>GUIDELUME // TERMINAL PROTECTION</p>
                <h2 id="blackwall-title" tabindex="-1">BLACKWALL SECURITY SYSTEM</h2>
            </div>
        </header>
        <p class="blackwall-alert">SECURITY INCIDENT DETECTED</p>
        <div id="blackwall-summary" class="blackwall-summary">
            <p data-blackwall-summary>Suspicious activity has been identified on this terminal.</p>
            <p data-blackwall-explanation>Blackwall has temporarily suspended terminal access in response to anomalous input patterns.</p>
        </div>
        <section class="blackwall-report" aria-labelledby="blackwall-report-title">
            <h3 id="blackwall-report-title">INCIDENT REPORT</h3>
            <dl>
                <dt>Classification</dt><dd data-blackwall-classification></dd>
                <dt>Reported behavior</dt><dd data-blackwall-behavior></dd>
                <dt data-blackwall-detail-label></dt><dd data-blackwall-detail></dd>
                <dt>Threshold</dt><dd data-blackwall-threshold></dd>
                <dt>Response</dt><dd data-blackwall-response>Temporary terminal lockdown</dd>
            </dl>
        </section>
        <div class="blackwall-lockdown">
            <p id="blackwall-status" class="blackwall-status" role="status" aria-live="polite"></p>
            <p class="blackwall-timer" role="timer" aria-live="off" aria-label="Time remaining in terminal lockdown">00:10</p>
            <button type="button" class="blackwall-dismiss" disabled>[ DISMISS — UNAVAILABLE ]</button>
        </div>
        <footer class="blackwall-footer">BLACKWALL // AUTOMATED INCIDENT RESPONSE</footer>
    `;
    (document.querySelector("#crt") || document.body).append(dialog);

    const title = dialog.querySelector("#blackwall-title");
    const status = dialog.querySelector("#blackwall-status");
    const timer = dialog.querySelector(".blackwall-timer");
    const dismissButton = dialog.querySelector(".blackwall-dismiss");
    const listeners = new AbortController();
    let locked = false;
    let consecutiveFailures = 0;
    let expiresAt = 0;
    let timeout = null;
    let returnFocus = null;
    const serviceQueries = [];
    const protectedAccesses = [];

    function countRecentAttempts(attempts, duration) {
        const now = performance.now();
        while (attempts.length && attempts[0] <= now - duration) attempts.shift();
        attempts.push(now);
        return attempts.length;
    }

    function stopCountdown() {
        window.clearTimeout(timeout);
        timeout = null;
        document.removeEventListener("visibilitychange", updateCountdown);
        window.removeEventListener("focus", updateCountdown);
    }

    function updateCountdown() {
        if (!locked) return;
        window.clearTimeout(timeout);
        // Recompute from a monotonic deadline; delayed callbacks never extend a lock.
        const seconds = Math.max(0, Math.ceil((expiresAt - performance.now()) / 1000));
        timer.textContent = `00:${String(seconds).padStart(2, "0")}`;
        if (seconds === 0) {
            stopCountdown();
            if (dismissButton.disabled) {
                status.textContent = "LOCKDOWN EXPIRED — DISMISS TO RESTORE ACCESS";
                dismissButton.disabled = false;
                dismissButton.textContent = "[ DISMISS ]";
            }
        } else {
            timeout = window.setTimeout(updateCountdown, 200);
        }
    }

    function activate({ classification, behavior, detailLabel, detail, threshold, scope = "terminal" }) {
        if (locked) return;
        const workspaceIncident = scope === "workspace";
        dialog.querySelector("[data-blackwall-scope]").textContent = workspaceIncident
            ? "GUIDELUME // SYSTEM PROTECTION" : "GUIDELUME // TERMINAL PROTECTION";
        dialog.querySelector("[data-blackwall-summary]").textContent = workspaceIncident
            ? "Suspicious activity has been identified in this workspace."
            : "Suspicious activity has been identified on this terminal.";
        dialog.querySelector("[data-blackwall-explanation]").textContent = workspaceIncident
            ? "Blackwall has temporarily suspended workspace access in response to unauthorized interaction with a protected system resource."
            : "Blackwall has temporarily suspended terminal access in response to anomalous input patterns.";
        dialog.querySelector("[data-blackwall-response]").textContent = `Temporary ${scope} lockdown`;
        dialog.querySelector("[data-blackwall-classification]").textContent = classification;
        dialog.querySelector("[data-blackwall-behavior]").textContent = behavior;
        dialog.querySelector("[data-blackwall-detail-label]").textContent = detailLabel;
        dialog.querySelector("[data-blackwall-detail]").textContent = detail;
        dialog.querySelector("[data-blackwall-threshold]").textContent = threshold;
        status.textContent = workspaceIncident ? "WORKSPACE LOCKDOWN" : "TERMINAL LOCKDOWN";
        timer.setAttribute("aria-label", `Time remaining in ${scope} lockdown`);
        dismissButton.disabled = true;
        dismissButton.textContent = "[ DISMISS — UNAVAILABLE ]";
        returnFocus = document.activeElement;
        expiresAt = performance.now() + lockdownDuration;
        locked = true;
        onLockChange(true);
        dialog.showModal();
        title.focus({ preventScroll: true });
        document.addEventListener("visibilitychange", updateCountdown);
        window.addEventListener("focus", updateCountdown);
        updateCountdown();
    }

    function dismiss() {
        if (!locked || performance.now() < expiresAt) return;
        stopCountdown();
        consecutiveFailures = 0;
        serviceQueries.length = 0;
        protectedAccesses.length = 0;
        locked = false;
        onLockChange(false);
        dialog.close();
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
    }

    dialog.addEventListener("cancel", event => event.preventDefault(), { signal: listeners.signal });
    // Keep desktop-level pointer handlers from acting on the obscured workspace.
    dialog.addEventListener("pointerdown", event => event.stopPropagation(), { signal: listeners.signal });
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === "Tab") {
            event.preventDefault();
            (dismissButton.disabled ? title : dismissButton).focus();
        }
    }, { signal: listeners.signal });
    dismissButton.addEventListener("click", dismiss, { signal: listeners.signal });

    brandingElement?.addEventListener("click", () => {
        if (locked) return;
        const attempts = countRecentAttempts(serviceQueries, serviceQueryWindow);
        if (attempts < serviceQueryLimit) return;
        activate({
            classification: "Security service interference",
            behavior: "Security service interrogation detected",
            detailLabel: "Service queries",
            detail: `${attempts} activations within 3 seconds`,
            threshold: `${serviceQueryLimit} activations within 3 seconds`,
            scope: "workspace"
        });
    }, { signal: listeners.signal });

    protectedFileElement?.addEventListener("click", () => {
        if (locked) return;
        const attempts = countRecentAttempts(protectedAccesses, protectedAccessWindow);
        if (attempts < protectedAccessLimit) {
            notify(attempts === 1
                ? "Access denied: blackwall.sys is a protected system resource."
                : "Access denied: blackwall.sys. Repeated access attempts will initiate containment.", "error");
            return;
        }
        activate({
            classification: "Access control violation",
            behavior: "Protected system resource access violation",
            detailLabel: "Access attempts",
            detail: `${attempts} attempts on System/blackwall.sys`,
            threshold: `${protectedAccessLimit} attempts within 10 seconds`,
            scope: "workspace"
        });
    }, { signal: listeners.signal });

    return {
        get isLocked() { return locked; },
        checkSubmission(rawCommand) {
            if (locked) return false;
            if (rawCommand.length <= inputLimit) return true;
            activate({
                classification: "Input integrity violation",
                behavior: "Excessive input length detected",
                detailLabel: "Input length",
                detail: `${rawCommand.length} characters`,
                threshold: `More than ${inputLimit} characters`
            });
            return false;
        },
        recordCommandResult(recognized) {
            if (locked || typeof recognized !== "boolean") return;
            consecutiveFailures = recognized ? 0 : consecutiveFailures + 1;
            if (consecutiveFailures < failureLimit) return;
            activate({
                classification: "Command validation failure",
                behavior: "Repeated invalid command execution",
                detailLabel: "Failed attempts",
                detail: String(consecutiveFailures),
                threshold: `${failureLimit} consecutive failed attempts`
            });
        },
        destroy() {
            stopCountdown();
            listeners.abort();
            if (locked) {
                locked = false;
                onLockChange(false);
            }
            if (dialog.open) dialog.close();
            dialog.remove();
            returnFocus = null;
        }
    };
}
