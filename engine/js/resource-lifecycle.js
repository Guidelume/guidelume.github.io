const validStates = new Set(["active", "suspended", "unloaded"]);
const resumedMedia = new Set();

function getParentResourceState() {
    try {
        const frame = window.frameElement;
        const state = frame?.dataset.resourceState;
        return validStates.has(state) ? state : "active";
    } catch {
        return "active";
    }
}

let parentResourceState = getParentResourceState();
let currentResourceState = "";

function forwardResourceState(state) {
    document.querySelectorAll("iframe").forEach(frame => {
        if (!frame.contentWindow) return;
        const isVisible = frame.getClientRects().length > 0
            && getComputedStyle(frame).visibility !== "hidden";
        const childState = state === "unloaded"
            ? "unloaded"
            : state === "active" && isVisible ? "active" : "suspended";
        try {
            frame.contentWindow.postMessage({
                type: "guidelume-resource-state",
                state: childState
            }, window.location.origin);
        } catch {
            // A child may be cross-origin or navigating.
        }
    });
}

function applyResourceState(state) {
    if (!validStates.has(state) || currentResourceState === state) return;
    currentResourceState = state;
    document.documentElement.dataset.resourceState = state;

    document.querySelectorAll("audio, video").forEach(media => {
        if (state === "active") {
            if (!resumedMedia.delete(media)) return;
            const playback = media.play();
            playback?.catch?.(() => {});
        } else if (!media.paused) {
            resumedMedia.add(media);
            media.pause();
        }
    });
    forwardResourceState(state);
}

function refreshResourceState() {
    applyResourceState(document.hidden ? "suspended" : parentResourceState);
}

window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== window.location.origin) return;
    if (event.data?.type !== "guidelume-resource-state" || !validStates.has(event.data.state)) return;
    parentResourceState = event.data.state;
    refreshResourceState();
});

document.addEventListener("pointerdown", () => {
    if (window.parent === window) return;
    try {
        window.parent.postMessage({ type: "guidelume-window-activate" }, window.location.origin);
    } catch {
        // Standalone and cross-origin previews do not need to activate an outer window.
    }
}, { capture: true });

document.addEventListener("visibilitychange", refreshResourceState);
window.addEventListener("pageshow", () => {
    parentResourceState = getParentResourceState();
    refreshResourceState();
});
document.querySelectorAll("iframe").forEach(frame => {
    frame.addEventListener("load", () => forwardResourceState(
        document.hidden ? "suspended" : currentResourceState || parentResourceState
    ));
});

const lifecycleStyle = document.createElement("style");
lifecycleStyle.dataset.resourceLifecycle = "true";
lifecycleStyle.textContent = `
    html[data-resource-state="suspended"] *,
    html[data-resource-state="suspended"] *::before,
    html[data-resource-state="suspended"] *::after {
        animation-play-state: paused !important;
    }
`;
document.head.append(lifecycleStyle);

const frameVisibilityObserver = new MutationObserver(() => {
    if (currentResourceState === "active") forwardResourceState(currentResourceState);
});
document.querySelectorAll("iframe").forEach(frame => {
    for (let ancestor = frame; ancestor; ancestor = ancestor.parentElement) {
        frameVisibilityObserver.observe(ancestor, {
            attributes: true,
            attributeFilter: ["class", "hidden", "style"]
        });
    }
});

window.addEventListener("pagehide", () => {
    parentResourceState = "unloaded";
    applyResourceState("unloaded");
});

refreshResourceState();
