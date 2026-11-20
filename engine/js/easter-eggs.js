import { findDiscovery } from "../data/developer-vault/js/discovery-registry.js";

export function initEasterEggs({ memory, saveMemory, openWindow, closeWindow, icon, developerVaultIcon }) {
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

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        const code = input?.value.trim();
        const discovery = findDiscovery(code);
        const accepted = code === "12345" || Boolean(discovery);
        const respond = pendingResponse;
        pendingResponse = null;
        if (accepted) {
            memory.settings[discovery?.flag || "easterEggsUnlocked"] = true;
            const unlockedIcon = discovery ? developerVaultIcon : icon;
            if (unlockedIcon) unlockedIcon.hidden = false;
        }
        if (input) input.value = "";
        closeWindow("easter-eggs-password");
        if (!accepted) { respond?.("Wrong password."); return; }
        const message = discovery ? "Accepted. Developer Vault discovered." : "Accepted. Easter Eggs unlocked.";
        let saved = false;
        try { saved = await saveMemory(); } catch { /* The staged discovery remains available for retry. */ }
        respond?.(saved === false ? `${message} Saving is pending; try again if you reload.` : message);
    });

    return {
        requestUnlock(onResponse) {
            pendingResponse = onResponse;
            openWindow("easter-eggs-password");
        }
    };
}
