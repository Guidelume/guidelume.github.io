export function initSetupFlow({ memory, saveMemory, clearSavedGuidelumeState, experienceKey, getWindowMemory, closeWindow, openWindow, resetToReaderMode, updateSettingsAvailability, completeOnboarding, closeStartMenu, isOnboardingInProgress }) {
    /*
     * Reset
     */
    document
        .querySelectorAll('[data-action="reset"]')
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    closeStartMenu();
                    openWindow("reset-confirmation");
                }
            );
        });

    document.querySelectorAll('[data-confirm-reset="no"]').forEach(button => {
        button.addEventListener("click", () => closeWindow("reset-confirmation"));
    });

    document.querySelectorAll('[data-confirm-reset="yes"]').forEach(button => {
        button.addEventListener("click", () => {
            clearSavedGuidelumeState();
            window.location.reload();
        });
    });

    /*
     * Experience selection
     */
    document
        .querySelectorAll("button[data-experience]")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const experience = button.dataset.experience;
                    if (!experience) {
                        return;
                    }
                    if (experience === "reader") {
                        if (isOnboardingInProgress()) {
                            getWindowMemory("setup").open = false;
                            completeOnboarding("reader");
                            closeWindow("setup");
                        } else {
                            resetToReaderMode();
                        }
                        return;
                    }
                    memory.settings.experience = "interactive";
                    document.documentElement.dataset.experience = "interactive";
                    localStorage.setItem(experienceKey, "interactive");
                    saveMemory();
                    updateSettingsAvailability();
                    if (isOnboardingInProgress()) {
                        document.documentElement.dataset.onboardingStage = "appearance";
                    }
                    closeWindow("setup");
                    openWindow("appearance");
                }
            );
        });


}
