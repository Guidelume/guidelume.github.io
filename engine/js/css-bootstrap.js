import { createCSSManager } from "./css-manager.js";
import { createFontManager } from "./font-manager.js";

export const cssManager = createCSSManager();
export const fontManager = createFontManager();
window.guidelumeFonts = fontManager;
window.addEventListener("pagehide", () => fontManager.cancelTransitions());

// This head module starts essential requests without waiting for the rest of the
// desktop's module graph. global.js awaits the same promise before initialization.
export const desktopStylesReady = (async () => {
    const root = document.documentElement;
    const bootState = document.getElementById("bootState");
    while (true) {
        try {
            window.guidelumeStartup?.progress();
            await cssManager.loadGroup("desktop");
            if (!window.guidelumeStartup?.isRecovering()) {
                root.dataset.stylesState = "ready";
                if (bootState) bootState.textContent = "Restoring your workspace…";
            }
            return;
        } catch (error) {
            console.error("Guidelume desktop styles could not load.", error);
            if (window.guidelumeStartup?.hasFailed()) throw error;
            root.dataset.stylesState = "error";
            window.guidelumeStartup?.waiting();
            const retry = document.createElement("button");
            retry.type = "button";
            retry.textContent = "Retry loading";
            bootState.setAttribute("role", "alert");
            bootState.replaceChildren("Guidelume could not load its styles. Check your connection and try again. ", retry);
            await new Promise(resolve => retry.addEventListener("click", resolve, { once: true }));
            bootState.setAttribute("role", "status");
            root.dataset.stylesState = "loading";
        }
    }
})();
