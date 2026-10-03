export function initAppearance({ memory, queueSave, saveMemory, elements, experienceKey, getWindowMemory, closeWindow, openWindow, completeOnboarding, isOnboardingInProgress }) {
    const { taskbar, themeButtons, backgroundButtons, taskbarButtons, finishButton } = elements;
    /*
     * Appearance system
     */
    let selectedTheme = memory.settings.theme;
    let selectedBackground = memory.settings.background || "midnight";
    let selectedTaskbar = memory.settings.taskbar;

    function applyTheme(theme) {
        if (!theme) {
            return;
        }
        selectedTheme = theme;
        memory.settings.theme = theme;
        document.documentElement.dataset.theme = theme;
        themeButtons.forEach(button => {
            button.classList.toggle(
                "selected",
                button.dataset.color === theme
            );
        });
        queueSave();
    }

    function applyTaskbarPosition(position) {
        if (!taskbar || !position) {
            return;
        }
        selectedTaskbar = position;
        memory.settings.taskbar = position;
        taskbar.classList.remove("taskbar-top", "taskbar-bottom");
        taskbar.classList.add(`taskbar-${position}`);
        taskbarButtons.forEach(button => {
            button.classList.toggle(
                "selected",
                button.dataset.taskbar === position
            );
        });
        queueSave();
    }

    function applyBackground(background) {
        const availableBackgrounds = ["midnight", "slate", "plum", "forest"];
        if (!availableBackgrounds.includes(background)) {
            background = "midnight";
        }
        selectedBackground = background;
        memory.settings.background = background;
        document.documentElement.dataset.background = background;
        backgroundButtons.forEach(button => {
            button.classList.toggle("selected", button.dataset.background === background);
        });
        queueSave();
    }

    /*
     * Restore saved appearance
     */
    applyTheme(selectedTheme);
    applyTaskbarPosition(selectedTaskbar);
    applyBackground(selectedBackground);

    /*
     * Theme buttons
     */
    themeButtons.forEach(button => {
        button.addEventListener(
            "click",
            () => {
                applyTheme(button.dataset.color);
            }
        );
    });

    backgroundButtons.forEach(button => {
        button.addEventListener("click", () => applyBackground(button.dataset.background));
    });

    /*
     * Taskbar buttons
     */
    taskbarButtons.forEach(button => {
        button.addEventListener(
            "click",
            () => {
                applyTaskbarPosition(button.dataset.taskbar);
            }
        );
    });

    /*
     * Enable setup completion
     */
    if (finishButton) {
        finishButton.disabled = false;
    }

    /*
     * Finish setup
     */
    if (finishButton) {
        finishButton.addEventListener(
            "click",
            () => {
                if (!selectedTheme) {
                    return;
                }
                memory.settings.experience = "interactive";
                localStorage.setItem(experienceKey, "interactive");
                saveMemory();
                if (isOnboardingInProgress()) {
                    document.documentElement.dataset.onboardingStage = "tutorial";
                }
                closeWindow("appearance");
                openWindow("onboarding");
            }
        );
    }

    document.getElementById("finishOnboarding")?.addEventListener("click", () => {
        getWindowMemory("onboarding").open = false;
        completeOnboarding("interactive");
        closeWindow("onboarding");
    });
}
