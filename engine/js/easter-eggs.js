export function initEasterEggs({ memory, saveMemory, openWindow, closeWindow, icon }) {
    const passwordWindow = document.querySelector('[data-window="easter-eggs-password"]');
    const form = passwordWindow?.querySelector("[data-easter-password-form]");
    const input = passwordWindow?.querySelector("[data-easter-password-input]");
    let pendingResponse = null;

    const savedPromptState = memory.windows["easter-eggs-password"];
    if (savedPromptState?.open) {
        savedPromptState.open = false;
        savedPromptState.minimized = false;
        savedPromptState.maximized = false;
        savedPromptState.hideTaskbar = false;
        saveMemory();
    }

    if (icon) icon.hidden = memory.settings.easterEggsUnlocked !== true;

    function cancelPendingUnlock() {
        const respond = pendingResponse;
        pendingResponse = null;
        respond?.("Cancelled.");
    }

    passwordWindow?.querySelector('[data-close-window="easter-eggs-password"]')
        ?.addEventListener("click", cancelPendingUnlock);
    passwordWindow?.addEventListener("windowclosing", cancelPendingUnlock);

    passwordWindow?.addEventListener("windowfocus", () => {
        input?.focus({ preventScroll: true });
    });

    form?.addEventListener("submit", event => {
        event.preventDefault();
        const accepted = input?.value === "12345";
        if (accepted) {
            memory.settings.easterEggsUnlocked = true;
            if (icon) icon.hidden = false;
            saveMemory();
        }
        if (input) input.value = "";
        const respond = pendingResponse;
        pendingResponse = null;
        closeWindow("easter-eggs-password");
        respond?.(accepted ? "Accepted. Easter Eggs unlocked." : "Wrong password.");
    });

    return {
        requestUnlock(onResponse) {
            pendingResponse = onResponse;
            openWindow("easter-eggs-password");
        }
    };
}
