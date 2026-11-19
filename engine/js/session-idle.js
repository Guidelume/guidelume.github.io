import { normalizeBlackwallPreferences } from "./blackwall-preferences.js";

// Timestamp-based policy, independent of the DOM and of throttled timer delivery.
export function createIdlePolicy({ getPreferences, isHidden, now = () => Date.now(), schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = timer => clearTimeout(timer), canLock = () => true, onLock, onWarning = () => {}, dismissWarning = () => {} }) {
    let lastActivity = now();
    let hiddenSince = isHidden() ? lastActivity : null;
    let timer;
    let warned = false;
    let stopped = false;

    function clearWarning() {
        if (warned) dismissWarning();
        warned = false;
    }

    function check() {
        cancel(timer);
        if (stopped) return;
        const preferences = normalizeBlackwallPreferences(getPreferences());
        const since = preferences.lockWhileReading ? lastActivity : hiddenSince;
        if (!preferences.autoLock || since === null) { clearWarning(); return; }
        const remaining = since + preferences.lockAfterMinutes * 60_000 - now();
        if (remaining <= 0 && canLock()) {
            clearWarning();
            onLock();
            return;
        }
        if (!preferences.warnBeforeLock) clearWarning();
        if (remaining > 0 && remaining <= 120_000 && preferences.warnBeforeLock && !warned && canLock()) {
            warned = true;
            onWarning(Math.max(1, Math.ceil(remaining / 60_000)));
        }
        const next = preferences.warnBeforeLock && !warned && remaining > 120_000
            ? remaining - 120_000 : remaining;
        timer = schedule(check, Math.max(1000, next));
    }

    function activity() {
        if (stopped || isHidden()) return;
        lastActivity = now();
        hiddenSince = null;
        clearWarning();
        check();
    }

    function visibilityChanged() {
        if (isHidden()) {
            if (hiddenSince === null) hiddenSince = now();
            check();
        } else {
            // Evaluate the background deadline before returning activity resets it.
            check();
            activity();
        }
    }

    check();
    return {
        activity, visibilityChanged,
        refresh() {
            lastActivity = now();
            hiddenSince = isHidden() ? lastActivity : null;
            clearWarning();
            check();
        },
        suspend() { cancel(timer); },
        destroy() { stopped = true; cancel(timer); clearWarning(); }
    };
}

export function initSessionIdle(options) {
    const listeners = new AbortController();
    const policy = createIdlePolicy({ ...options, isHidden: () => document.hidden });
    const events = ["pointerdown", "pointermove", "keydown", "input", "wheel", "touchstart"];
    const frames = new Map();
    let lastObservedActivity = 0;
    function activity(event) {
        // Mouse movement needs no more than one reset per second.
        const time = Date.now();
        if (event.type === "pointermove" && time - lastObservedActivity < 1000) return;
        lastObservedActivity = time;
        policy.activity();
    }
    function listen(target, signal) {
        events.forEach(type => target.addEventListener(type, activity, { capture: true, passive: true, signal }));
    }
    listen(document, listeners.signal);
    function attachFrame(frame) {
        frames.get(frame)?.abort();
        frames.delete(frame);
        try {
            if (!frame.contentDocument) return;
            const controller = new AbortController();
            listen(frame.contentDocument, controller.signal);
            frames.set(frame, controller);
        } catch { /* Cross-origin media cannot supply activity; foreground locking is opt-in. */ }
    }
    const observer = new MutationObserver(() => {
        for (const [frame, controller] of frames) {
            if (!frame.isConnected) { controller.abort(); frames.delete(frame); }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll("iframe").forEach(attachFrame);
    document.addEventListener("load", event => {
        if (event.target.tagName === "IFRAME") attachFrame(event.target);
    }, { capture: true, signal: listeners.signal });
    document.addEventListener("visibilitychange", policy.visibilityChanged, { signal: listeners.signal });
    window.addEventListener("focus", policy.visibilityChanged, { signal: listeners.signal });
    window.addEventListener("pagehide", policy.suspend, { signal: listeners.signal });
    window.addEventListener("pageshow", policy.visibilityChanged, { signal: listeners.signal });
    return {
        refresh: policy.refresh,
        destroy() {
            listeners.abort(); observer.disconnect();
            frames.forEach(controller => controller.abort()); frames.clear();
            policy.destroy();
        }
    };
}
