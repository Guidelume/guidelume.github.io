import { normalizeEnvironmentSettings } from "./environment-presets.js";

export function createDesktopState() {
    /*
     * Memory / State
     */
    const memoryKey = "guidelume_desktop_memory";
    const experienceKey = "guidelume_experience";
    const defaultMemory = {
        icons: {},
        windows: {},
        settings: {
            theme: "amber",
            taskbar: "bottom",
            background: "midnight",
            environment: normalizeEnvironmentSettings(),
            crtEffects: true,
            textSize: "default",
            reducedMotion: false,
            experience: "reader",
            onboardingComplete: false
        }
    };

    function loadMemory() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(memoryKey));
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
        const environment = normalizeEnvironmentSettings(
            migrated.settings.environment,
            migrated.settings
        );
        delete migrated.settings.weather;
        delete migrated.settings.effectsIntensity;
        return {
            ...defaultMemory,
            ...migrated,
            icons: {
                ...defaultMemory.icons,
                ...(migrated.icons || {})
            },
            windows: {
                ...defaultMemory.windows,
                ...(migrated.windows || {})
            },
            settings: {
                ...defaultMemory.settings,
                ...(migrated.settings || {}),
                environment
            }
        };
    }
    const launchQuery = new URLSearchParams(window.location.search);
    const nexusGuideRequested =
        launchQuery.get("from") === "nexus" && launchQuery.get("guide") === "mwbc";
    let memory = loadMemory();
    const savedExperience = localStorage.getItem(experienceKey);
    if (
        localStorage.getItem(memoryKey) === null
        && ["interactive", "reader", "basic"].includes(savedExperience)
    ) {
        memory.settings.experience = savedExperience === "interactive" ? "interactive" : "reader";
        memory.settings.onboardingComplete = true;
    }
    const hasSavedPreferences =
        memory.settings.onboardingComplete === true
        || memory.settings.experience !== defaultMemory.settings.experience
        || memory.settings.theme !== defaultMemory.settings.theme
        || memory.settings.taskbar !== defaultMemory.settings.taskbar
        || memory.settings.background !== defaultMemory.settings.background
        || memory.settings.crtEffects !== defaultMemory.settings.crtEffects
        || memory.settings.textSize !== defaultMemory.settings.textSize
        || memory.settings.reducedMotion !== defaultMemory.settings.reducedMotion
        || memory.settings.environment.preset !== defaultMemory.settings.environment.preset
        || memory.settings.environment.weather.length > 0
        || memory.settings.environment.presets.length > 0
        || memory.settings.environment.themes.length > 0
        || memory.settings.environment.intensity !== defaultMemory.settings.environment.intensity
        || Object.values(memory.settings.environment.sections).some(Boolean)
        || memory.settings.environment.effects.ambientAnimation !== defaultMemory.settings.environment.effects.ambientAnimation
        || memory.settings.environment.decorations.length > 0
        || memory.settings.environment.rotation.enabled !== defaultMemory.settings.environment.rotation.enabled
        || memory.settings.environment.rotation.interval !== defaultMemory.settings.environment.rotation.interval;
    const firstNexusGuideVisit = nexusGuideRequested && !hasSavedPreferences;
    if (nexusGuideRequested) {
        if (firstNexusGuideVisit) memory.settings.experience = "reader";
        memory.settings.onboardingComplete = true;
    }
    if (firstNexusGuideVisit) {
        ["setup", "appearance", "onboarding"].forEach(id => {
            if (memory.windows[id]) {
                memory.windows[id].open = false;
                memory.windows[id].minimized = false;
            }
        });
    }
    let onboardingInProgress = memory.settings.onboardingComplete !== true;
    document.documentElement.dataset.onboardingStage = onboardingInProgress ? "intro" : "complete";
    document.documentElement.dataset.experience = memory.settings.experience;

    let saveTimeout = null;

    function persistMemory() {
        localStorage.setItem(memoryKey, JSON.stringify(memory));
    }

    function queueSave() {
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
        persistMemory();
    }

    function clearSavedGuidelumeState() {
        window.clearTimeout(saveTimeout);
        saveTimeout = null;
        localStorage.removeItem(memoryKey);
        localStorage.removeItem(experienceKey);
    }

    window.addEventListener("pagehide", flushQueuedSave);

    if (nexusGuideRequested) {
        localStorage.setItem(experienceKey, memory.settings.experience);
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

    return { memory, experienceKey, defaultMemory, queueSave, saveMemory, clearSavedGuidelumeState, nexusGuideRequested, firstNexusGuideVisit, onboardingInProgress };
}
