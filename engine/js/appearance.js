import {
    backgroundName,
    backgroundPalettes,
    isSupportedBackground,
    isSupportedTheme,
    themePalettes,
    themeName,
    updateAppearanceChoiceState
} from "./appearance-palettes.js";

export function initAppearance({ memory, queueSave, elements }) {
    const { taskbar, themeButtons, backgroundButtons, taskbarButtons } = elements;
    const themeSummary = document.querySelector("[data-current-theme]");
    const backgroundSummary = document.querySelector("[data-current-background]");
    const themeSummarySwatch = document.querySelector("[data-current-theme-swatch]");
    const backgroundSummarySwatch = document.querySelector("[data-current-background-swatch]");

    function syncChoices() {
        const themePalette = themePalettes.find(palette => palette.id === memory.settings.theme) || themePalettes[0];
        const backgroundPalette = backgroundPalettes.find(palette => palette.id === memory.settings.background) || backgroundPalettes[0];
        updateAppearanceChoiceState(document, memory.settings.theme, memory.settings.background);
        if (themeSummary) themeSummary.textContent = themeName(memory.settings.theme);
        if (backgroundSummary) backgroundSummary.textContent = backgroundName(memory.settings.background);
        if (themeSummarySwatch) themeSummarySwatch.style.backgroundColor = `var(--palette-${themePalette.id}-strong)`;
        if (backgroundSummarySwatch) backgroundSummarySwatch.style.backgroundColor = `var(--background-${backgroundPalette.id}-swatch)`;
    }

    function applyTheme(theme) {
        const selectedTheme = isSupportedTheme(theme) ? theme : "amber";
        memory.settings.theme = selectedTheme;
        document.documentElement.dataset.theme = selectedTheme;
        syncChoices();
        queueSave();
    }

    function applyTaskbarPosition(position) {
        if (!taskbar || !["top", "bottom"].includes(position)) return;
        memory.settings.taskbar = position;
        taskbar.classList.remove("taskbar-top", "taskbar-bottom");
        taskbar.classList.add(`taskbar-${position}`);
        taskbarButtons.forEach(button => {
            const selected = button.dataset.taskbar === position;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        queueSave();
    }

    function applyBackground(background) {
        const selectedBackground = isSupportedBackground(background) ? background : "midnight";
        memory.settings.background = selectedBackground;
        document.documentElement.dataset.background = selectedBackground;
        syncChoices();
        queueSave();
    }

    applyTheme(memory.settings.theme);
    applyTaskbarPosition(memory.settings.taskbar);
    applyBackground(memory.settings.background);
    themeButtons.forEach(button => button.addEventListener("click", () => applyTheme(button.dataset.color)));
    backgroundButtons.forEach(button => button.addEventListener("click", () => applyBackground(button.dataset.background)));
    taskbarButtons.forEach(button => button.addEventListener("click", () => applyTaskbarPosition(button.dataset.taskbar)));

    return {
        applyRestoredSettings(settings) {
            if (settings.theme !== undefined) applyTheme(settings.theme);
            if (settings.background !== undefined) applyBackground(settings.background);
            if (settings.taskbar !== undefined) applyTaskbarPosition(settings.taskbar);
        }
    };
}
