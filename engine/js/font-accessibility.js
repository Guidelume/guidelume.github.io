(() => {
    const preferenceKey = "accessibleFonts";
    const easterFontKey = "easterEggFont";
    const toggles = document.querySelectorAll("[data-accessible-font-toggle], #fontToggle");
    const easterFontToggle = document.querySelector("[data-easter-egg-font-toggle]");
    let wantedAccessible;

    function transitionFonts(channel, overrides, apply) {
        if (window.guidelumeFonts && document.documentElement.dataset.restorationState === "ready") {
            return window.guidelumeFonts.transition(channel, overrides, apply);
        }
        apply();
    }

    function readPreference() {
        try {
            const saved = localStorage.getItem(preferenceKey);
            if (saved !== null) return saved === "true";

            // Older Varkorax Archive pages used this key before joining the shared control.
            const legacy = localStorage.getItem("fontAccessible");
            if (legacy !== null) localStorage.setItem(preferenceKey, legacy);
            return legacy === "true";
        } catch {
            return false;
        }
    }

    function readEasterFontPreference() {
        try {
            return localStorage.getItem(easterFontKey) === "true";
        } catch {
            return false;
        }
    }

    function applyPreference(enabled) {
        document.documentElement.dataset.accessibleFonts = String(enabled);
        document.body?.classList.toggle("accessible-fonts", enabled);

        toggles.forEach(toggle => {
            toggle.setAttribute("aria-pressed", String(enabled));
            toggle.classList.toggle("is-enabled", enabled);
            if (toggle.hasAttribute("data-accessible-font-label")) {
                toggle.textContent = `Accessible Font: ${enabled ? "On" : "Off"}`;
            }
        });
    }

    function savePreference(enabled) {
        wantedAccessible = enabled;
        return transitionFonts("accessible-fonts", { accessibleFonts: enabled }, () => {
            applyPreference(enabled);
            try {
                localStorage.setItem(preferenceKey, String(enabled));
            } catch {
                // Keep the preference active in this document if storage is unavailable.
            }
            window.dispatchEvent(new CustomEvent("guidelume:accessible-fonts-changed", { detail: { enabled } }));
        });
    }

    wantedAccessible = readPreference();
    applyPreference(wantedAccessible);

    function applyEasterFontPreference(enabled) {
        document.documentElement.dataset.easterEggFont = String(enabled);
        if (easterFontToggle) easterFontToggle.checked = enabled;
    }

    function saveEasterFontPreference(enabled) {
        return transitionFonts("easter-font", { easterEggFont: enabled }, () => {
            applyEasterFontPreference(enabled);
            try {
                localStorage.setItem(easterFontKey, String(enabled));
            } catch {
                // Keep the preference active in this document if storage is unavailable.
            }
        });
    }

    applyEasterFontPreference(readEasterFontPreference());

    window.addEventListener("guidelume:apply-accessible-fonts", event => {
        savePreference(event.detail?.enabled === true);
    });

    toggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
            savePreference(!wantedAccessible);
        });
    });

    easterFontToggle?.addEventListener("change", () => {
        saveEasterFontPreference(easterFontToggle.checked);
    });

    window.addEventListener("storage", event => {
        if (event.key === preferenceKey) {
            const enabled = event.newValue === "true";
            wantedAccessible = enabled;
            transitionFonts("accessible-fonts", { accessibleFonts: enabled }, () => {
                applyPreference(enabled);
                // Update desktop backup state without writing back to the other page.
                window.dispatchEvent(new CustomEvent("guidelume:accessible-fonts-changed", { detail: { enabled } }));
            });
        }
        if (event.key === easterFontKey) {
            const enabled = event.newValue === "true";
            transitionFonts("easter-font", { easterEggFont: enabled }, () => applyEasterFontPreference(enabled));
        }
    });
})();
