import { normalizeEnvironmentSettings } from "./environment-presets.js";
import { createDefaultWidgetState, normalizeWidgetState } from "./widgets-data.js";
import { DEFAULT_PROFILE, normalizeUserProfile } from "./profile-data.js";
import { normalizeDocumentOverrides } from "./document-registry.js";
import { normalizeLookingGlassState } from "./looking-glass-data.js";
import { normalizeBlackwallPreferences } from "./blackwall-preferences.js";
import { blackwallViewKey } from "./blackwall-view.js";
import { createDesktopDatabase } from "./desktop-database.js";
import { createDesktopSync, TAB_DESKTOP_KEY } from "./desktop-sync.js";
import { desktopFromRecords, sharedDesktop } from "./desktop-records.js";
import { normalizeDesktopShortcuts, normalizeDesktopContextMenus } from "./desktop-shortcuts-data.js";

export function readStoredValue(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
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
    const shortcuts = normalizeDesktopShortcuts(memory.shortcuts);
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
        shortcuts,
        icons: {},
        windows: {},
        widgets,
        windowOrder: [],
        taskbarOrder: [],
        pinnedTaskbar: [],
        focusedWindow: null,
        sessionLocked: false,
        settings: {
            ...defaultMemory.settings,
            blackwall: normalizeBlackwallPreferences(),
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
    const hiddenWindows = new Set(["developer-vault", "easter-eggs", "easter-eggs-password"]);
    for (const id of hiddenWindows) if (memory.windows?.[id]) Object.assign(memory.windows[id], {
        open: false, minimized: false, maximized: false, hideTaskbar: false
    });
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
    let freshVisitor = readStoredValue(memoryKey) === null && !legacyCompletion;
    const defaultMemory = {
        icons: {},
        windows: {},
        documents: {},
        shortcuts: {},
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
            blackwall: normalizeBlackwallPreferences(),
            crtEffects: true,
            brandingVisible: true,
            textSize: "default",
            iconSize: "default",
            independentSizes: false,
            easterEggsUnlocked: false,
            developerVaultDiscovered: false,
            reducedMotion: false,
            accessibleFonts: false,
            desktopContextMenus: "guidelume"
        }
    };

    function loadMemory(saved, legacy = true) {
        if (saved === undefined) {
            try { saved = JSON.parse(readStoredValue(memoryKey)); }
            catch { saved = null; }
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
        const sharedAccessibleFonts = legacy ? readStoredValue("accessibleFonts") : null;
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
            shortcuts: normalizeDesktopShortcuts(migrated.shortcuts),
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
                desktopContextMenus: normalizeDesktopContextMenus(migrated.settings.desktopContextMenus),
                blackwall: normalizeBlackwallPreferences(migrated.settings.blackwall),
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
    delete memory.windows["developer-vault"];
    memory.windowOrder = memory.windowOrder.filter(id => id !== "developer-vault");
    memory.taskbarOrder = memory.taskbarOrder.filter(id => id !== "developer-vault");
    memory.pinnedTaskbar = memory.pinnedTaskbar.filter(id => id !== "developer-vault");
    document.documentElement.dataset.onboardingComplete = String(memory.onboarding.completed);

    let synchronizer = null;

    function reportStorageError(reason) {
        window.dispatchEvent(new CustomEvent("guidelume:storage-status", { detail: { reason } }));
    }

    async function initializePersistence(options = {}) {
        const database = createDesktopDatabase({ ...options, onStatus: reason => {
            if (reason !== "ready") reportStorageError(reason);
        } });
        try {
            let local;
            try { local = JSON.parse(sessionStorage.getItem(TAB_DESKTOP_KEY)); } catch { /* New tab. */ }
            const initial = await database.initialize(sharedDesktop(createPersistableDesktopMemory(memory)), { privateSeed: local });
            // Import the legacy workspace once, then keep open windows and scroll
            // positions private. A reset's epoch invalidates old reload caches.
            const privateState = local?.epoch === initial.meta.epoch ? local.state
                : local ? {} : { windows: memory.windows, windowOrder: memory.windowOrder,
                    taskbarOrder: memory.taskbarOrder, sidebarOpen: memory.lookingGlass.sidebarOpen };
            const restored = loadMemory(desktopFromRecords(initial.records, privateState), false);
            for (const key of Object.keys(memory)) delete memory[key];
            Object.assign(memory, restored);
            freshVisitor = memory.onboarding.completed !== true;
            synchronizer = createDesktopSync({ memory, database, initial,
                normalize: value => loadMemory(value, false), onError: reportStorageError });
            document.documentElement.dataset.onboardingComplete = String(memory.onboarding.completed === true);
            // Keep the original legacy snapshot untouched as a migration recovery
            // copy. It is never a write target or authority after initialization.
            if (legacyExperience !== null) removeStoredValue("guidelume_experience");
            return true;
        } catch (error) {
            database.close();
            reportStorageError(error?.name === "VersionError" ? "versionchange" : "unavailable");
            return false;
        }
    }

    function queueSave() {
        if (window.guidelumeFullResetInProgress === true) return;
        synchronizer?.queue();
    }

    function saveMemory() {
        if (window.guidelumeFullResetInProgress === true) return Promise.resolve(false);
        if (synchronizer) return synchronizer.save();
        return Promise.resolve(false);
    }

    function clearSavedGuidelumeState() {
        removeStoredValue(memoryKey);
        removeStoredValue("guidelume_experience");
        try { sessionStorage.removeItem(blackwallViewKey); } catch { /* Storage may be unavailable. */ }
        try { sessionStorage.removeItem(TAB_DESKTOP_KEY); } catch { /* Storage may be unavailable. */ }
    }

    window.addEventListener("pagehide", () => {
        if (window.guidelumeFullResetInProgress === true) return;
        if (synchronizer) synchronizer.pause();
    });
    window.addEventListener("pageshow", event => { if (event.persisted) void synchronizer?.resume(); });

    if (nexusGuideRequested) {
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

    return { memory, defaultMemory, queueSave, saveMemory, clearSavedGuidelumeState, nexusGuideId, nexusGuideRequested,
        initializePersistence,
        startSynchronization: options => synchronizer?.start(options),
        reconcile: () => synchronizer?.reconcile(),
        replaceSavedState: (transform, options) => synchronizer?.replace(transform, options) || Promise.resolve(false),
        get conflicts() { return synchronizer?.conflicts || []; },
        get resetGeneration() { return synchronizer?.resetGeneration || "initial"; },
        resolveConflict: (key, keepMine) => synchronizer?.resolve(key, keepMine),
        get firstNexusGuideVisit() { return nexusGuideRequested && memory.onboarding.completed !== true; },
        get onboardingInProgress() { return memory.onboarding.completed !== true; },
        get freshVisitor() { return freshVisitor; }
    };
}
