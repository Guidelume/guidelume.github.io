import { normalizeEnvironmentSettings } from "./environment-presets.js";
import { createDefaultWidgetState, normalizeWidgetState } from "./widgets-data.js";
import { DEFAULT_PROFILE, normalizeUserProfile } from "./profile-data.js";
import { normalizeDocumentOverrides } from "./document-registry.js";
import { normalizeLookingGlassState } from "./looking-glass-data.js";

export function readStoredValue(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStoredValue(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeStoredValue(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // Keep the current session usable when browser storage is unavailable.
    }
}

export function createPersistableDesktopMemory(memory) {
    const snapshot = {
        ...memory,
        icons: { ...memory.icons },
        windows: { ...memory.windows },
        widgets: structuredClone(memory.widgets),
        documents: normalizeDocumentOverrides(memory.documents),
        lookingGlass: normalizeLookingGlassState(memory.lookingGlass),
        windowOrder: memory.windowOrder.filter(id => id !== "developer-vault"),
        taskbarOrder: memory.taskbarOrder.filter(id => id !== "developer-vault"),
        pinnedTaskbar: memory.pinnedTaskbar.filter(id => id !== "developer-vault")
    };
    delete snapshot.windows["developer-vault"];
    return snapshot;
}

export function restoreDesktopDefaults(memory, defaultMemory, options = {}) {
    const onboarding = { completed: memory.onboarding?.completed === true };
    const profile = normalizeUserProfile(memory.profile);
    const documents = normalizeDocumentOverrides(memory.documents);
    const easterEggsUnlocked = memory.settings.easterEggsUnlocked === true;
    const developerVaultDiscovered = memory.settings.developerVaultDiscovered === true;
    const lookingGlass = normalizeLookingGlassState(memory.lookingGlass);
    const widgets = options.preserveWidgets === true
        ? structuredClone(normalizeWidgetState(memory.widgets))
        : createDefaultWidgetState();
    const defaultEnvironment = defaultMemory.settings.environment;

    Object.assign(memory, {
        ...defaultMemory,
        onboarding,
        profile,
        documents,
        lookingGlass: { ...lookingGlass, sidebarOpen: true },
        icons: {},
        windows: {},
        widgets,
        windowOrder: [],
        taskbarOrder: [],
        pinnedTaskbar: [],
        settings: {
            ...defaultMemory.settings,
            environment: {
                ...defaultEnvironment,
                presets: [],
                sections: { weather: false, presets: false, decorations: false, themes: false },
                effects: { ...defaultEnvironment.effects },
                weather: [],
                suppressedWeather: [],
                decorations: [],
                themes: [],
                rotation: { ...defaultEnvironment.rotation }
            },
            easterEggsUnlocked,
            developerVaultDiscovered
        }
    });
}

export function resetDiscoveryFlags(memory) {
    memory.settings.easterEggsUnlocked = false;
    memory.settings.developerVaultDiscovered = false;
    const hiddenWindows = new Set(["developer-vault", "easter-eggs"]);
    memory.pinnedTaskbar = (memory.pinnedTaskbar || []).filter(id => !hiddenWindows.has(id));
    memory.taskbarOrder = (memory.taskbarOrder || []).filter(id => !hiddenWindows.has(id));
    memory.windowOrder = (memory.windowOrder || []).filter(id => !hiddenWindows.has(id));
}

export function createDesktopState() {
    /*
     * Memory / State
     */
    const memoryKey = "guidelume_desktop_memory";
    const legacyExperience = readStoredValue("guidelume_experience");
    const legacyCompletion = ["interactive", "reader", "basic"].includes(legacyExperience);
    const freshVisitor = readStoredValue(memoryKey) === null && !legacyCompletion;
    const defaultMemory = {
        icons: {},
        windows: {},
        documents: {},
        lookingGlass: normalizeLookingGlassState(),
        onboarding: { completed: false },
        profile: { ...DEFAULT_PROFILE },
        widgets: createDefaultWidgetState(),
        windowOrder: [],
        taskbarOrder: [],
        pinnedTaskbar: [],
        settings: {
            theme: "amber",
            taskbar: "bottom",
            background: "midnight",
            environment: normalizeEnvironmentSettings(),
            crtEffects: true,
            brandingVisible: true,
            textSize: "default",
            iconSize: "default",
            independentSizes: false,
            easterEggsUnlocked: false,
            developerVaultDiscovered: false,
            reducedMotion: false,
            accessibleFonts: false
        }
    };

    function loadMemory() {
        let saved = null;
        try {
            saved = JSON.parse(readStoredValue(memoryKey));
        } catch {
            // Ignore invalid saved state and start with defaults.
        }
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
            saved = {};
        }
        const migrated = {
            ...saved,
            settings: {
                ...(saved?.settings || {})
            }
        };

        /*
         * Migrate old theme storage. Now adding new things should not break existing settings
         */
        if (saved?.theme && !migrated.settings.theme) {
            migrated.settings.theme = saved.theme;
        }
        /*
         * Migrate old taskbar storage
         */
        if (saved?.taskbar?.position && !migrated.settings.taskbar) {
            migrated.settings.taskbar = saved.taskbar.position;
        }
        if (migrated.settings.taskbar !== "top" && migrated.settings.taskbar !== "bottom") {
            migrated.settings.taskbar = defaultMemory.settings.taskbar;
        }
        const environment = normalizeEnvironmentSettings(
            migrated.settings.environment,
            migrated.settings
        );
        const sharedAccessibleFonts = readStoredValue("accessibleFonts");
        const accessibleFonts = sharedAccessibleFonts !== null
            ? sharedAccessibleFonts === "true"
            : migrated.settings.accessibleFonts === true;
        const onboarding = {
            completed: typeof saved?.onboarding?.completed === "boolean"
                ? saved.onboarding.completed
                : migrated.settings.onboardingComplete === true || legacyCompletion
        };
        delete migrated.settings.experience;
        delete migrated.settings.onboardingComplete;
        delete migrated.settings.weather;
        delete migrated.settings.effectsIntensity;
        // These apps now live in System / Unfinished and no longer need discovery.
        delete migrated.settings.lookingGlassDiscovered;
        delete migrated.settings.twfgDiscovered;
        const memory = {
            ...defaultMemory,
            ...migrated,
            onboarding,
            profile: normalizeUserProfile(migrated.profile),
            widgets: normalizeWidgetState(migrated.widgets),
            documents: normalizeDocumentOverrides(migrated.documents),
            lookingGlass: normalizeLookingGlassState(migrated.lookingGlass),
            icons: {
                ...defaultMemory.icons,
                ...(migrated.icons || {})
            },
            windows: {
                ...defaultMemory.windows,
                ...(migrated.windows || {})
            },
            windowOrder: Array.isArray(migrated.windowOrder)
                ? migrated.windowOrder.filter(id => typeof id === "string")
                : [],
            taskbarOrder: Array.isArray(migrated.taskbarOrder)
                ? migrated.taskbarOrder.filter(id => typeof id === "string")
                : [],
            pinnedTaskbar: Array.isArray(migrated.pinnedTaskbar)
                ? migrated.pinnedTaskbar.filter(id => typeof id === "string")
                : [],
            settings: {
                ...defaultMemory.settings,
                ...(migrated.settings || {}),
                accessibleFonts,
                environment
            }
        };
        if (memory.settings.easterEggsUnlocked !== true) {
            const easterEggWindow = memory.windows["easter-eggs"];
            if (easterEggWindow && typeof easterEggWindow === "object") {
                easterEggWindow.open = false;
                easterEggWindow.minimized = false;
                easterEggWindow.maximized = false;
            }
            memory.pinnedTaskbar = memory.pinnedTaskbar.filter(id => id !== "easter-eggs");
            memory.taskbarOrder = memory.taskbarOrder.filter(id => id !== "easter-eggs");
            memory.windowOrder = memory.windowOrder.filter(id => id !== "easter-eggs");
        }
        return memory;
    }
    const launchQuery = new URLSearchParams(window.location.search);
    const requestedGuide = launchQuery.get("guide");
    const nexusGuideId = launchQuery.get("from") === "nexus" && ["mwbc", "twfg"].includes(requestedGuide)
        ? requestedGuide : null;
    const nexusGuideRequested = nexusGuideId !== null;
    let memory = loadMemory();
    if (legacyExperience !== null) removeStoredValue("guidelume_experience");
    delete memory.windows["developer-vault"];
    memory.windowOrder = memory.windowOrder.filter(id => id !== "developer-vault");
    memory.taskbarOrder = memory.taskbarOrder.filter(id => id !== "developer-vault");
    memory.pinnedTaskbar = memory.pinnedTaskbar.filter(id => id !== "developer-vault");
    const firstNexusGuideVisit = nexusGuideRequested && memory.onboarding.completed !== true;
    const onboardingInProgress = memory.onboarding.completed !== true;
    document.documentElement.dataset.onboardingComplete = String(memory.onboarding.completed);

    let saveTimeout = null;

    function persistMemory() {
        // Shutdown handlers in other modules may call saveMemory() during a reset reload.
        // Do not let those handlers repopulate storage after the full reset clears it.
        if (window.guidelumeFullResetInProgress === true) return false;
        return writeStoredValue(memoryKey, JSON.stringify(createPersistableDesktopMemory(memory)));
    }

    function queueSave() {
        if (window.guidelumeFullResetInProgress === true) return;
        window.clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => {
            saveTimeout = null;
            persistMemory();
        }, 200);
    }

    function flushQueuedSave() {
        if (saveTimeout === null) return;
        window.clearTimeout(saveTimeout);
        saveTimeout = null;
        persistMemory();
    }

    function saveMemory() {
        window.clearTimeout(saveTimeout);
        saveTimeout = null;
        return persistMemory();
    }

    function clearSavedGuidelumeState() {
        window.clearTimeout(saveTimeout);
        saveTimeout = null;
        removeStoredValue(memoryKey);
        removeStoredValue("guidelume_experience");
    }

    window.addEventListener("pagehide", flushQueuedSave);

    if (nexusGuideRequested) {
        saveMemory();

        // Consume this launch command once so later reloads do not reopen the guide. Yum.
        launchQuery.delete("from");
        launchQuery.delete("guide");
        const remainingQuery = launchQuery.toString();
        const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}${window.location.hash}`;
        window.history.replaceState(null, "", cleanUrl);
    }

    /*
     * Window system
     */

    return { memory, defaultMemory, queueSave, saveMemory, clearSavedGuidelumeState, nexusGuideId, nexusGuideRequested, firstNexusGuideVisit, onboardingInProgress, freshVisitor };
}
