export function initSetupFlow({ closeWindow, restoreDefaults, resetDiscoveries, closeStartMenu, isOnboardingInProgress, saveSetupProfile, completeOnboarding }) {
    document.querySelectorAll('[data-action="restore-defaults"]').forEach(button => {
        button.addEventListener("click", () => {
            closeStartMenu();
            restoreDefaults();
        });
    });
    document.querySelectorAll('[data-action="reset-discoveries"]').forEach(button => {
        button.addEventListener("click", () => {
            closeStartMenu();
            resetDiscoveries();
        });
    });

    const setupWindow = document.querySelector('[data-window="setup"]');
    const finishButton = setupWindow?.querySelector("[data-finish-setup]");
    const incompleteContent = setupWindow?.querySelector("[data-setup-incomplete]");
    const completeContent = setupWindow?.querySelector("[data-setup-complete]");
    const appearanceWindow = document.querySelector('[data-window="appearance"]');
    const appearanceContent = appearanceWindow?.querySelector(".setup-content");
    const appearanceDoneButton = appearanceWindow?.querySelector("[data-setup-appearance-done]");
    const appearanceHint = appearanceWindow?.querySelector("[data-appearance-setup-hint]");
    const appearanceRequirement = setupWindow?.querySelector("[data-setup-appearance-requirement]");
    let appearanceVisited = false;
    let appearanceReachedBottom = false;
    let appearanceStepComplete = false;

    function isAtBottom() {
        if (!appearanceContent) return false;
        if (appearanceContent.scrollHeight <= appearanceContent.clientHeight + 2) return true;
        return appearanceContent.scrollTop + appearanceContent.clientHeight >= appearanceContent.scrollHeight - 2;
    }

    function updateAppearanceStep() {
        const incomplete = isOnboardingInProgress();
        if (!incomplete) {
            if (appearanceDoneButton) appearanceDoneButton.disabled = false;
            if (appearanceHint) appearanceHint.hidden = true;
            if (finishButton) finishButton.disabled = false;
            return;
        }

        if (appearanceDoneButton) appearanceDoneButton.disabled = !appearanceVisited || !appearanceReachedBottom;
        if (finishButton) finishButton.disabled = !appearanceStepComplete;
        if (appearanceRequirement) {
            appearanceRequirement.dataset.complete = String(appearanceStepComplete);
            appearanceRequirement.textContent = appearanceStepComplete
                ? "All set. You can finish Setup."
                : "Take a look through Appearance, then click Done to finish Setup.";
        }
        if (appearanceHint) {
            const appearanceOpen = appearanceWindow && !appearanceWindow.hidden && !appearanceWindow.classList.contains("window-closing");
            appearanceHint.hidden = !appearanceOpen;
            if (appearanceOpen) {
                appearanceHint.textContent = appearanceStepComplete
                    ? "You’re all set. Click Done to close."
                    : appearanceReachedBottom
                    ? "That’s everything. Click Done when you’re ready."
                    : "Have a look through the options.";
            }
        }
    }

    function updateSetupContent() {
        const incomplete = isOnboardingInProgress();
        if (incompleteContent) incompleteContent.hidden = !incomplete;
        if (completeContent) completeContent.hidden = incomplete;
        updateAppearanceStep();
    }

    appearanceWindow?.addEventListener("windowfocus", () => {
        if (!isOnboardingInProgress()) return;
        appearanceVisited = true;
        if (appearanceContent && appearanceContent.scrollHeight <= appearanceContent.clientHeight + 2) {
            appearanceReachedBottom = true;
        }
        updateAppearanceStep();
    });
    appearanceContent?.addEventListener("scroll", () => {
        if (!isOnboardingInProgress() || !appearanceVisited) return;
        if (isAtBottom()) appearanceReachedBottom = true;
        updateAppearanceStep();
    }, { passive: true });
    appearanceDoneButton?.addEventListener("click", () => {
        if (!isOnboardingInProgress() || !appearanceVisited || !appearanceReachedBottom) return;
        appearanceStepComplete = true;
        updateAppearanceStep();
    }, true);

    if (isOnboardingInProgress() && appearanceWindow && !appearanceWindow.hidden) {
        appearanceVisited = true;
        window.requestAnimationFrame(() => {
            if (!appearanceWindow.hidden && appearanceContent) appearanceContent.scrollTop = 0;
        });
    }

    finishButton?.addEventListener("click", () => {
        if (!isOnboardingInProgress()) return;
        if (!appearanceStepComplete) return;
        if (!saveSetupProfile()) return;
        if (!completeOnboarding()) {
            const status = setupWindow?.querySelector("[data-setup-profile-status]");
            if (status) status.textContent = "Setup could not be saved in this browser. You can keep using Guidelume and try again later.";
            return;
        }
        updateSetupContent();
        closeWindow("setup");
    });

    setupWindow?.addEventListener("windowfocus", updateSetupContent);
    updateSetupContent();
}
