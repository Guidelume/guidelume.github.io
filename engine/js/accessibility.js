export function initAccessibility({ memory, queueSave, elements }) {
    const { crtToggle, crtShell, accessibilitySizeButtons, reducedMotionToggle } = elements;
    function setCrtEffects(enabled) {
        memory.settings.crtEffects = enabled;
        if (crtToggle) crtToggle.checked = enabled;
        if (crtShell) crtShell.dataset.crtEffects = enabled ? "on" : "off";
        queueSave();
    }

    setCrtEffects(memory.settings.crtEffects !== false);

    crtToggle?.addEventListener("change", () => {
        setCrtEffects(crtToggle.checked);
    });

    function applyTextSize(size) {
        const availableSizes = ["small", "default", "large", "extra-large"];
        if (!availableSizes.includes(size)) size = "default";
        memory.settings.textSize = size;
        document.documentElement.dataset.textSize = size;
        accessibilitySizeButtons.forEach(button => {
            const selected = button.dataset.textSize === size;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        queueSave();
    }

    function applyReducedMotion(enabled) {
        memory.settings.reducedMotion = enabled;
        if (reducedMotionToggle) reducedMotionToggle.checked = enabled;
        document.documentElement.dataset.reducedMotion = enabled ? "true" : "false";
        queueSave();
    }

    applyTextSize(memory.settings.textSize);
    applyReducedMotion(memory.settings.reducedMotion === true);

    accessibilitySizeButtons.forEach(button => {
        button.addEventListener("click", () => applyTextSize(button.dataset.textSize));
    });

    reducedMotionToggle?.addEventListener("change", () => {
        applyReducedMotion(reducedMotionToggle.checked);
    });


}
