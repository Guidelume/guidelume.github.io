(() => {
    const preferenceKey = "accessibleFonts";
    const toggles = document.querySelectorAll("[data-accessible-font-toggle], #fontToggle");

    function readPreference() {
        try {
            return localStorage.getItem(preferenceKey) === "true";
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
        applyPreference(enabled);
        try {
            localStorage.setItem(preferenceKey, String(enabled));
        } catch {
            // Keep the preference active in this document if storage is unavailable.
        }
    }

    applyPreference(readPreference());

    toggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
            savePreference(document.documentElement.dataset.accessibleFonts !== "true");
        });
    });

    window.addEventListener("storage", event => {
        if (event.key === preferenceKey) {
            applyPreference(event.newValue === "true");
        }
    });
})();
