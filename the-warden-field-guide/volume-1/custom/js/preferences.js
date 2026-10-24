// Standalone accessibility belongs to TWFG; an embedded guide follows Guidelume.
(() => {
    const keys = {
        accessible: "twfg:volume-1:accessible-fonts",
        size: "twfg:volume-1:text-size",
        theme: "twfg:volume-1:reading-theme"
    };
    const root = document.documentElement;
    const standalone = window.parent === window;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let host = null;

    try {
        // Guidelume already publishes these settings as root data attributes.
        // Reading the same-origin host avoids a second preference protocol.
        const parentDocument = window.parent.document;
        if (!standalone && parentDocument.querySelector(".setup-page")) {
            host = { window: window.parent, root: parentDocument.documentElement };
        }
    } catch {
        // An unrelated or cross-origin frame cannot supply Guidelume preferences.
    }

    function read(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function save(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch {
            // The controls still work for this page when storage is unavailable.
        }
    }

    const state = {};

    function readLocalPreferences() {
        state.accessible = read(keys.accessible) === "true";
        const size = Number(read(keys.size));
        state.size = [90, 100, 115, 130].includes(size) ? size : 100;
        state.theme = read(keys.theme) === "slate" ? "slate" : "hearth";
    }

    function apply() {
        const accessible = host
            ? host.root.dataset.accessibleFonts === "true"
            : standalone && state.accessible;
        const hostScale = host
            ? Number.parseFloat(host.window.getComputedStyle(host.root).getPropertyValue("--text-size-scale"))
            : 1;
        const scale = standalone ? state.size / 100 : (hostScale || 1);
        const reducedMotion = motionPreference.matches || host?.root.dataset.reducedMotion === "true";

        root.dataset.preferenceSource = host ? "guidelume" : standalone ? "standalone" : "embedded";
        root.dataset.accessibleFonts = String(accessible);
        root.dataset.reducedMotion = String(reducedMotion);
        root.dataset.readingTheme = state.theme;
        root.style.setProperty("--reading-scale", scale);

        document.querySelectorAll("[data-standalone-preferences], [data-accessible-font-toggle]").forEach(control => {
            control.hidden = !standalone;
        });
        document.querySelectorAll("[data-accessible-font-toggle]").forEach(button => {
            button.setAttribute("aria-pressed", String(accessible));
            button.title = `Readable fonts: ${accessible ? "on" : "off"}`;
        });
        document.querySelectorAll("[data-text-size]").forEach(select => {
            select.value = String(state.size);
        });
        document.querySelectorAll("[data-reading-theme]").forEach(select => {
            select.value = state.theme;
        });
        document.querySelectorAll("[data-host-preferences-note]").forEach(note => {
            note.hidden = standalone;
            note.textContent = host
                ? "Fonts, text size, and motion follow Guidelume’s accessibility settings."
                : "Accessibility is managed by the embedding website. Open the guide separately for local controls.";
        });
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }

    readLocalPreferences();
    apply();

    document.addEventListener("DOMContentLoaded", () => {
        apply();
        document.querySelectorAll("[data-accessible-font-toggle]").forEach(button => button.addEventListener("click", () => {
            if (!standalone) return;
            state.accessible = !state.accessible;
            save(keys.accessible, state.accessible);
            apply();
        }));
        document.querySelectorAll("[data-text-size]").forEach(select => select.addEventListener("change", () => {
            if (!standalone) return;
            state.size = Number(select.value) || 100;
            save(keys.size, state.size);
            apply();
        }));
        document.querySelectorAll("[data-reading-theme]").forEach(select => select.addEventListener("change", () => {
            state.theme = select.value === "slate" ? "slate" : "hearth";
            save(keys.theme, state.theme);
            apply();
        }));
    });

    window.addEventListener("storage", event => {
        if (!Object.values(keys).includes(event.key) && event.key !== null) return;
        readLocalPreferences();
        apply();
    });
    motionPreference.addEventListener("change", apply);

    if (host) {
        const observer = new MutationObserver(apply);
        const observeHost = () => {
            observer.observe(host.root, {
                attributes: true,
                attributeFilter: ["data-accessible-fonts", "data-text-size", "data-reduced-motion"]
            });
            apply();
        };
        observeHost();
        window.addEventListener("pageshow", observeHost);
        window.addEventListener("pagehide", () => observer.disconnect());
    }
})();
