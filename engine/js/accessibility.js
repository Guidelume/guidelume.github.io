export function initAccessibility({ memory, queueSave, elements, initialCrtOff = false }) {
    const {
        crtToggle, crtShell, brandingToggle, accessibilitySizeButtons, accessibilityIconSizeButtons = [],
        accessibilityGeneralSizeButtons = [], independentSizeToggle, independentSizeOptions,
        reducedMotionToggle
    } = elements;
    const availableSizes = ["small", "default", "large", "extra-large"];

    function setCrtEffects(enabled) {
        memory.settings.crtEffects = enabled;
        if (crtToggle) crtToggle.checked = enabled;
        if (crtShell) crtShell.dataset.crtEffects = enabled ? "on" : "off";
        queueSave();
    }

    if (initialCrtOff) {
        if (crtToggle) crtToggle.checked = false;
        if (crtShell) crtShell.dataset.crtEffects = "off";
    } else {
        setCrtEffects(memory.settings.crtEffects !== false);
    }
    crtToggle?.addEventListener("change", () => setCrtEffects(crtToggle.checked));

    function setBrandingVisible(visible) {
        memory.settings.brandingVisible = visible;
        if (brandingToggle) brandingToggle.checked = visible;
        document.documentElement.dataset.branding = visible ? "visible" : "hidden";
        queueSave();
    }

    setBrandingVisible(memory.settings.brandingVisible !== false);
    brandingToggle?.addEventListener("change", () => setBrandingVisible(brandingToggle.checked));

    function normalizeSize(size) {
        return availableSizes.includes(size) ? size : "default";
    }

    function updateTextSizeButtons(size) {
        accessibilitySizeButtons.forEach(button => {
            const selected = button.dataset.textSize === size;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    }

    function updateIconSizeButtons(size) {
        accessibilityIconSizeButtons.forEach(button => {
            const selected = button.dataset.iconSize === size;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    }

    function updateGeneralSizeButtons(size) {
        accessibilityGeneralSizeButtons.forEach(button => {
            const selected = button.dataset.generalSize === size;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    }

    function setTextSize(size) {
        memory.settings.textSize = normalizeSize(size);
        document.documentElement.dataset.textSize = memory.settings.textSize;
        updateTextSizeButtons(memory.settings.textSize);
    }

    function setIconSize(size) {
        memory.settings.iconSize = normalizeSize(size);
        document.documentElement.dataset.iconSize = memory.settings.iconSize;
        updateIconSizeButtons(memory.settings.iconSize);
    }

    function setGeneralSize(size) {
        size = normalizeSize(size);
        setTextSize(size);
        setIconSize(size);
        updateGeneralSizeButtons(size);
        queueSave();
    }

    function setIndependentSizes(enabled, { initialize = false } = {}) {
        memory.settings.independentSizes = enabled;
        if (independentSizeToggle) independentSizeToggle.checked = enabled;
        if (independentSizeOptions) {
            independentSizeOptions.classList.toggle("is-disabled", !enabled);
            independentSizeOptions.querySelectorAll("button").forEach(button => { button.disabled = !enabled; });
        }
        accessibilityGeneralSizeButtons.forEach(button => { button.disabled = enabled; });
        if (!enabled) {
            const combinedSize = normalizeSize(memory.settings.textSize);
            setTextSize(combinedSize);
            setIconSize(combinedSize);
            updateGeneralSizeButtons(combinedSize);
        } else {
            updateTextSizeButtons(memory.settings.textSize);
            updateIconSizeButtons(memory.settings.iconSize);
        }
        if (!initialize) queueSave();
    }

    setTextSize(memory.settings.textSize);
    setIconSize(memory.settings.iconSize);
    const independentSizes = memory.settings.independentSizes === true;
    setIndependentSizes(independentSizes, { initialize: true });
    if (independentSizes) {
        const combinedSize = memory.settings.textSize === memory.settings.iconSize
            ? memory.settings.textSize
            : "default";
        updateGeneralSizeButtons(combinedSize);
    }

    accessibilityGeneralSizeButtons.forEach(button => {
        button.addEventListener("click", () => setGeneralSize(button.dataset.generalSize));
    });
    accessibilitySizeButtons.forEach(button => {
        button.addEventListener("click", () => {
            setTextSize(button.dataset.textSize);
            queueSave();
        });
    });
    accessibilityIconSizeButtons.forEach(button => {
        button.addEventListener("click", () => {
            setIconSize(button.dataset.iconSize);
            queueSave();
        });
    });
    independentSizeToggle?.addEventListener("change", () => {
        setIndependentSizes(independentSizeToggle.checked);
    });

    function applyReducedMotion(enabled) {
        memory.settings.reducedMotion = enabled;
        if (reducedMotionToggle) reducedMotionToggle.checked = enabled;
        document.documentElement.dataset.reducedMotion = enabled ? "true" : "false";
        queueSave();
    }

    applyReducedMotion(memory.settings.reducedMotion === true);
    reducedMotionToggle?.addEventListener("change", () => applyReducedMotion(reducedMotionToggle.checked));

    return {
        applyRestoredSettings(settings) {
            if (settings.crtEffects !== undefined) setCrtEffects(settings.crtEffects);
            if (settings.brandingVisible !== undefined) setBrandingVisible(settings.brandingVisible);
            if (settings.independentSizes !== undefined) setIndependentSizes(settings.independentSizes);
            if (settings.independentSizes === false) {
                const size = settings.textSize ?? settings.iconSize;
                if (size !== undefined) {
                    setTextSize(size);
                    setIconSize(size);
                }
            } else {
                if (settings.textSize !== undefined) setTextSize(settings.textSize);
                if (settings.iconSize !== undefined) setIconSize(settings.iconSize);
            }
            if (settings.reducedMotion !== undefined) applyReducedMotion(settings.reducedMotion);
            queueSave();
        }
    };
}
