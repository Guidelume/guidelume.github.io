import { createDesktopState, removeStoredValue, resetDiscoveryFlags, restoreDesktopDefaults } from "./desktop-state.js";
import { initAccessibility } from "./accessibility.js";
import { initTaskbarUtilities } from "./taskbar-utilities.js";
import { initAppearance } from "./appearance.js";
import { initWindowManager } from "./windows.js";
import { initWindowInteractions } from "./window-interactions.js";
import { initDesktopIcons } from "./desktop-icons.js";
import { initWidgets } from "./widgets.js";
import { initSetupFlow } from "./setup-flow.js";
import { initEnvironmentalControls } from "./environmental-controls.js";
import { createEnvironmentEffectManager } from "./environment-effect-manager.js";
import { initTerminal } from "./terminal.js";
import { initBlackwall } from "./blackwall.js";
import { initEasterEggs } from "./easter-eggs.js";
import { initConfigurationBackup } from "./configuration-backup-ui.js";
import { initNotepad } from "./notepad.js";
import { initDeveloperVault } from "./developer-vault.js";
import { initUserProfile } from "./user-profile.js";
import { initTabs } from "./tabs.js";
import { initLookingGlass } from "./looking-glass.js";
import { renderAppearanceChoices } from "./appearance-palettes.js";
import { initConfirmationDialog } from "./confirmation-dialog.js";
import { initToastNotifications } from "./toast-notifications.js";
import { cssManager, desktopStylesReady, fontManager } from "./css-bootstrap.js";
import { windowStyleGroups } from "./stylesheet-registry.js";
import { composeEnvironment } from "./environment-presets.js";

document.addEventListener("DOMContentLoaded", async () => {
    await desktopStylesReady;
    window.guidelumeStartup?.progress(true);

    const tabsController = initTabs(document);
    renderAppearanceChoices(document);
    const confirmAction = initConfirmationDialog();
    const toast = initToastNotifications();
    const resetNoticeKey = "guidelume_reset_notice";
    const resetNoticeMessages = {
        defaults: "Defaults restored.",
        entireSite: "Guidelume has been reset. Setup is ready."
    };
    let pendingResetNotice = null;
    try {
        pendingResetNotice = sessionStorage.getItem(resetNoticeKey);
        sessionStorage.removeItem(resetNoticeKey);
    } catch {
        // The desktop remains usable if browser session storage is unavailable.
    }
    function reloadWithResetNotice(kind) {
        const message = resetNoticeMessages[kind];
        try {
            sessionStorage.setItem(resetNoticeKey, kind);
            window.location.reload();
        } catch {
            if (message) toast.show(message);
            window.setTimeout(() => window.location.reload(), 1800);
        }
    }

    /*
      Global.js V8 - We'll Take Everything
     */

    const desktopState = createDesktopState();
    const {
        memory, defaultMemory, queueSave, saveMemory,
        clearSavedGuidelumeState, nexusGuideId, nexusGuideRequested, firstNexusGuideVisit, freshVisitor
    } = desktopState;
    let onboardingInProgress = desktopState.onboardingInProgress;
    window.addEventListener("guidelume:accessible-fonts-changed", event => {
        memory.settings.accessibleFonts = event.detail?.enabled === true;
        queueSave();
    });
    window.dispatchEvent(new CustomEvent("guidelume:apply-accessible-fonts", {
        detail: { enabled: memory.settings.accessibleFonts === true }
    }));
    const initialSeasonalTheme = composeEnvironment(memory.settings.environment).seasonalTheme;
    if (initialSeasonalTheme) document.documentElement.dataset.seasonalTheme = initialSeasonalTheme;
    const initialFontsReady = fontManager.prepare({ seasonalTheme: initialSeasonalTheme });
	
	/* 
	  const ui = {element: everything everywhere all at once}
	*/
	
    const ui = {
        windows: Array.from(document.querySelectorAll(".setup-window")),
        taskbarWindows: document.querySelector(".taskbar-windows"),
        taskbar: document.querySelector(".taskbar"),
        startButton: document.querySelector(".start-button"),
        startMenu: document.querySelector(".start-menu"),
        desktop: document.querySelector(".setup-page"),
        desktopIcons: Array.from(document.querySelectorAll(".desktop-icon")),
        easterEggIcon: document.querySelector("[data-easter-eggs-icon]"),
        developerVaultIcon: document.querySelector("[data-developer-vault-icon]"),
        crtToggle: document.getElementById("crtToggle"),
        brandingToggle: document.getElementById("brandingToggle"),
        crtShell: document.getElementById("crt"),
        accessibilitySizeButtons: Array.from(document.querySelectorAll(".accessibility-size")),
        accessibilityIconSizeButtons: Array.from(document.querySelectorAll(".accessibility-icon-size")),
        accessibilityGeneralSizeButtons: Array.from(document.querySelectorAll(".accessibility-general-size")),
        independentSizeToggle: document.getElementById("independentSizeToggle"),
        independentSizeOptions: document.getElementById("independentSizeOptions"),
        reducedMotionToggle: document.getElementById("reducedMotionToggle"),
        taskbarClock: document.querySelector(".taskbar-clock"),
        taskbarTime: document.querySelector(".taskbar-time"),
        taskbarDate: document.querySelector(".taskbar-date"),
        fullscreenButton: document.querySelector(".fullscreen-button"),
        themeButtons: Array.from(document.querySelectorAll("[data-color]")),
        backgroundButtons: Array.from(document.querySelectorAll(".background-grid [data-background]")),
        taskbarButtons: Array.from(document.querySelectorAll(".taskbar-option")),
        settingsNotes: Array.from(document.querySelectorAll("[data-settings-unavailable-note]")),
        settingsButtons: Array.from(document.querySelectorAll("[data-window='settings'] .settings-content button:not(.window-tab):not([data-backup-control]):not([data-reset-entire-site]):not([data-settings-reset-action])")),
        environmentSectionToggles: Array.from(document.querySelectorAll("[data-environment-section]")),
        environmentPresetToggles: Array.from(document.querySelectorAll("[data-environment-preset]")),
        environmentAmbientAnimationToggle: document.getElementById("environmentAmbientAnimation"),
        environmentWeatherToggles: Array.from(document.querySelectorAll("[data-weather-effect]")),
        environmentDecorationToggles: Array.from(document.querySelectorAll("[data-decoration]")),
        environmentThemeToggles: Array.from(document.querySelectorAll("[data-seasonal-theme]")),
        applyEnvironmentButton: document.getElementById("applyEnvironment"),
        environmentApplyStatus: document.getElementById("environmentApplyStatus"),
        environmentWeatherSection: document.querySelector("[aria-labelledby='environment-weather-title']"),
        environmentDecorationSection: document.querySelector("[aria-labelledby='seasonal-decorations-title']"),
        environmentWeatherIntensityRadios: Array.from(document.querySelectorAll("[data-weather-intensity]")),
        environmentWeatherModeRadios: Array.from(document.querySelectorAll("[data-weather-mode]")),
        environmentRotationClearToggle: document.getElementById("environmentRotationClear"),
        environmentRotationInterval: document.getElementById("environmentRotationInterval"),
        environmentLayer: document.querySelector(".environment-effects")
    };
    if (ui.easterEggIcon) ui.easterEggIcon.hidden = memory.settings.easterEggsUnlocked !== true;
    if (ui.developerVaultIcon) ui.developerVaultIcon.hidden = memory.settings.developerVaultDiscovered !== true;
    const {
        windows,
        taskbarWindows,
        taskbar,
        startButton,
        startMenu,
        desktop,
        desktopIcons,
        crtToggle,
        crtShell,
        accessibilitySizeButtons,
        reducedMotionToggle,
        taskbarClock,
        taskbarTime,
        taskbarDate,
        themeButtons,
        backgroundButtons,
        taskbarButtons
    } = ui;
    const notepadController = initNotepad({ memory, saveMemory });
    const lookingGlassController = initLookingGlass({
        memory, saveMemory, windowElement: document.querySelector('[data-window="looking-glass"]')
    });
    const windowManager = initWindowManager({
        memory,
        saveMemory,
        elements: { windows, taskbarWindows, taskbar },
        canCloseWindow: notepadController.canCloseWindow,
        prepareWindowOpen: id => {
            const group = windowStyleGroups[id];
            const prepareFonts = () => {
                if (document.documentElement.dataset.restorationState === "ready" && !fontManager.isPrepared()) return fontManager.prepare();
            };
            if (group && !cssManager.isGroupLoaded(group)) return cssManager.loadGroup(group).then(prepareFonts);
            return prepareFonts();
        },
        onWindowOpenError: (error, id) => {
            console.error(`Guidelume could not prepare window "${id}".`, error);
            const title = document.querySelector(`[data-window="${id}"] .titlebar-left span`)?.textContent.trim() || "Application";
            toast.show(`${title} could not load its styles. Try opening it again.`, "error");
        },
        confirmOpenWindow: id => id !== "twfg" || confirmAction({
            title: "An early peek?",
            message: "The Warden’s Field Guide is an early prototype. There isn’t much here yet, and plenty of the website is still unfinished.\n\nYou’re welcome to take a peek - just don’t expect a complete guide yet.",
            confirmLabel: "I understand - let me peek",
            cancelLabel: "Oops, I’d better not peek then",
            danger: false,
            restoreFocusOnConfirm: false
        })
    });
    const easterEggs = initEasterEggs({
        memory,
        saveMemory,
        openWindow: windowManager.openWindow,
        closeWindow: windowManager.closeWindow,
        icon: ui.easterEggIcon
    });
    const terminalWindow = document.querySelector('[data-window="terminal"]');
    const blackwall = initBlackwall({
        brandingElement: document.querySelector("[data-blackwall-branding]"),
        protectedFileElement: document.querySelector("[data-blackwall-protected-file]"),
        notify: toast.show,
        onLockChange: locked => {
            const input = terminalWindow?.querySelector(".terminal-input");
            if (input) input.disabled = locked;
        }
    });
    initTerminal({
        windowElement: terminalWindow,
        blackwall,
        requestEasterEggUnlock: easterEggs.requestUnlock,
        isEasterEggsUnlocked: () => memory.settings.easterEggsUnlocked === true,
        getProfileName: () => memory.profile?.displayName
    });
    const {
        getWindowMemory, getWindow, openWindow, restoreFocusedWindow,
        setMaximized, closeWindow, minimizeWindow, focusWindow, updateTaskbar
    } = windowManager;
    let profileController = null;

    const developerVaultController = initDeveloperVault({
        windowElement: document.querySelector('[data-window="developer-vault"]')
    });

    function updateSettingsAvailability() {
        const seasonalThemeActive = Boolean(document.documentElement.dataset.seasonalTheme);
        const settingsAvailable = !seasonalThemeActive;
        ui.settingsNotes.forEach(note => {
            note.hidden = settingsAvailable;
            note.textContent = "These options are overridden by the active seasonal theme. Disable the seasonal theme in Environmental Controls to change them.";
        });
        ui.settingsButtons.forEach(button => {
            button.disabled = !settingsAvailable;
        });
    }

    function completeOnboarding() {
        if (memory.onboarding.completed === true) return true;
        onboardingInProgress = false;
        memory.onboarding.completed = true;
        document.documentElement.dataset.onboardingComplete = "true";
        if (saveMemory() !== true) {
            memory.onboarding.completed = false;
            onboardingInProgress = true;
            document.documentElement.dataset.onboardingComplete = "false";
            profileController?.refreshStartMenu();
            return false;
        }
        profileController?.refreshStartMenu();
        return true;
    }

    function resetToDefaults(options = {}) {
        fontManager.cancelTransitions?.();
        notepadController.setResetInProgress(true);
        clearSavedGuidelumeState();
        removeStoredValue("accessibleFonts");
        removeStoredValue("easterEggFont");
        restoreDesktopDefaults(memory, defaultMemory, options);
        if (saveMemory() === true) reloadWithResetNotice("defaults");
        else {
            toast.show("Defaults could not be saved. The desktop will reload with the available state.", "error");
            window.setTimeout(() => window.location.reload(), 1800);
        }
    }

    async function resetEntireSite() {
        if (!await confirmAction({
            title: "Reset Guidelume completely?",
            message: "This removes your profile, notes, discoveries, desktop setup, preferences, and saved guide position from this browser. First-run Setup will open after reload. This cannot be undone."
                + (notepadController.hasUnsavedChanges() ? "\n\nYour unsaved document edits will also be discarded." : ""),
            confirmLabel: "Reset everything"
        })) return;

        window.guidelumeFullResetInProgress = true;
        fontManager.cancelTransitions?.();
        notepadController.setResetInProgress(true);
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch {
            window.guidelumeFullResetInProgress = false;
            notepadController.setResetInProgress(false);
            toast.show("Guidelume could not clear all saved browser data. Check browser storage settings and try again.", "error");
            return;
        }

        // Stop a queued desktop save from restoring data while the page reloads.
        clearSavedGuidelumeState();
        memory.onboarding.completed = false;
        document.documentElement.dataset.onboardingComplete = "false";
        reloadWithResetNotice("entireSite");
    }

    if (freshVisitor && !nexusGuideRequested) {
        const setupState = getWindowMemory("setup");
        setupState.open = true;
        setupState.minimized = false;
    }
    if (nexusGuideRequested) {
        const setupState = getWindowMemory("setup");
        setupState.open = false;
        setupState.minimized = false;
        const guideState = getWindowMemory(nexusGuideId);
        guideState.open = false;
        guideState.minimized = false;
        if (firstNexusGuideVisit) {
            const readmeState = getWindowMemory("readme");
            readmeState.open = false;
            readmeState.minimized = false;
        }
        saveMemory();
    }

    const savedPinnedTaskbar = Array.isArray(memory.pinnedTaskbar) ? memory.pinnedTaskbar : [];
    const knownTaskbarIds = new Set(windows.map(windowEl => windowEl.dataset.window));
    const restoredPinnedTaskbar = savedPinnedTaskbar.filter((id, index) =>
        knownTaskbarIds.has(id) && savedPinnedTaskbar.indexOf(id) === index);
    const pinnedTaskbarChanged = restoredPinnedTaskbar.length !== savedPinnedTaskbar.length
        || restoredPinnedTaskbar.some((id, index) => id !== savedPinnedTaskbar[index]);
    memory.pinnedTaskbar = restoredPinnedTaskbar;
    if (pinnedTaskbarChanged) saveMemory();

    const savedTaskbarOrder = Array.isArray(memory.taskbarOrder) ? memory.taskbarOrder : [];
    const retainedTaskbarIds = windows
        .filter(windowEl => getWindowMemory(windowEl.dataset.window).open)
        .map(windowEl => windowEl.dataset.window);
    memory.pinnedTaskbar.forEach(id => {
        if (!retainedTaskbarIds.includes(id)) {
            retainedTaskbarIds.push(id);
        }
    });
    const restoredTaskbarOrder = [
        ...savedTaskbarOrder.filter((id, index) => retainedTaskbarIds.includes(id)
            && savedTaskbarOrder.indexOf(id) === index),
        ...retainedTaskbarIds.filter(id => !savedTaskbarOrder.includes(id))
    ];
    const taskbarOrderChanged = restoredTaskbarOrder.length !== savedTaskbarOrder.length
        || restoredTaskbarOrder.some((id, index) => id !== savedTaskbarOrder[index]);
    memory.taskbarOrder = restoredTaskbarOrder;
    if (taskbarOrderChanged) saveMemory();

    const restoredWindows = [];
    windows.forEach(windowEl => {
        const id = windowEl.dataset.window;
        const saved = getWindowMemory(id);
        if (saved.open && saved.minimized) {
            windowEl.hidden = true;
            updateTaskbar();
        } else if (saved.open) {
            restoredWindows.push(id);
        }
    });
    const savedWindowOrder = Array.isArray(memory.windowOrder) ? memory.windowOrder : [];
    const restoreOrder = [
        ...savedWindowOrder.filter(id => restoredWindows.includes(id)),
        ...restoredWindows.filter(id => !savedWindowOrder.includes(id))
    ];
    await windowManager.restoreWindows(restoreOrder, initialFontsReady);
    window.guidelumeStartup?.progress();
    restoreFocusedWindow();

    if (nexusGuideRequested) {
        if (firstNexusGuideVisit) {
            await openWindow("readme");
            windowManager.setTemporaryTaskbarHidden(nexusGuideId, true);
        }
        // Open the guide last so it sits above the Readme on first visits.
        openWindow(nexusGuideId);
    }

    document.querySelectorAll("[data-minimize-window]").forEach(button => {
        button.addEventListener("click", () => minimizeWindow(button.dataset.minimizeWindow));
    });

    document.querySelectorAll("[data-maximize-window]").forEach(button => {
        button.addEventListener("click", () => {
            const windowEl = getWindow(button.dataset.maximizeWindow);
            if (windowEl) {
                setMaximized(windowEl, !windowEl.classList.contains("is-maximized"));
                focusWindow(windowEl);
            }
        });
    });

    windows.forEach(windowEl => {
        windowEl.addEventListener("mousedown", () => focusWindow(windowEl));
    });

    const accessibilityController = initAccessibility({ memory, queueSave, initialCrtOff: firstNexusGuideVisit, elements: {
        crtToggle, crtShell, brandingToggle: ui.brandingToggle, accessibilitySizeButtons,
        accessibilityIconSizeButtons: ui.accessibilityIconSizeButtons,
        accessibilityGeneralSizeButtons: ui.accessibilityGeneralSizeButtons,
        independentSizeToggle: ui.independentSizeToggle,
        independentSizeOptions: ui.independentSizeOptions,
        reducedMotionToggle
    } });
    const environmentEffects = createEnvironmentEffectManager({ container: ui.environmentLayer, fontManager });
    const environmentController = initEnvironmentalControls({
        memory,
        queueSave,
        effectManager: environmentEffects,
        elements: {
            sectionToggles: ui.environmentSectionToggles,
            presetToggles: ui.environmentPresetToggles,
            ambientAnimationToggle: ui.environmentAmbientAnimationToggle,
            weatherToggles: ui.environmentWeatherToggles,
            decorationToggles: ui.environmentDecorationToggles,
            themeToggles: ui.environmentThemeToggles,
            weatherIntensityRadios: ui.environmentWeatherIntensityRadios,
            weatherModeRadios: ui.environmentWeatherModeRadios,
            rotationClearToggle: ui.environmentRotationClearToggle,
            rotationInterval: ui.environmentRotationInterval,
            applyButton: ui.applyEnvironmentButton,
            applyStatus: ui.environmentApplyStatus,
            weatherSection: ui.environmentWeatherSection,
            decorationSection: ui.environmentDecorationSection
        }
    });
    const seasonalSettingsObserver = new MutationObserver(updateSettingsAvailability);
    seasonalSettingsObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-seasonal-theme"]
    });
    updateSettingsAvailability();
    const closeStartMenu = initTaskbarUtilities({ elements: { taskbar, startButton, startMenu, taskbarClock, taskbarTime, taskbarDate, fullscreenButton: ui.fullscreenButton } });

    profileController = initUserProfile({
        memory,
        saveMemory,
        openWindow,
        closeStartMenu,
        isOnboardingInProgress: () => onboardingInProgress
    });

    initWindowInteractions({ windows, queueSave, closeStartMenu, windowManager });
    const desktopIconController = initDesktopIcons({ desktop, desktopIcons, memory, queueSave, openWindow });
    const widgetsController = initWidgets({ memory, queueSave, saveMemory, openWindow, activateTab: tabsController.activateTab });
    async function restoreDefaults() {
        if (!await confirmAction({
            title: "Restore default settings?",
            message: "This restores appearance, environmental preferences, accessibility, desktop layout, taskbar, and widgets. Sticky Notes and their text are removed. Your profile, discoveries, and personal Looking Glass bookmarks stay."
                + (notepadController.hasUnsavedChanges() ? "\n\nYour unsaved document edits will also be discarded; saved document edits stay." : ""),
            confirmLabel: "Restore defaults"
        })) return;
        resetToDefaults();
    }
    async function resetDiscoveries() {
        if (!await confirmAction({
            title: "Reset discoveries?",
            message: "This hides the Developer Vault and Easter Eggs until they are discovered again. Their desktop positions and your other settings stay.",
            confirmLabel: "Reset discoveries"
        })) return;
        resetDiscoveryFlags(memory);
        if (ui.easterEggIcon) ui.easterEggIcon.hidden = true;
        if (ui.developerVaultIcon) ui.developerVaultIcon.hidden = true;
        developerVaultController.lock();
        closeWindow("developer-vault");
        closeWindow("easter-eggs");
        closeWindow("easter-eggs-password");
        if (saveMemory() !== true) {
            toast.show("The discovery reset could not be saved. Reloading to restore the saved state.", "error");
            window.setTimeout(() => window.location.reload(), 1800);
            return;
        }
        backupController?.refreshCategories();
        toast.show("Discoveries reset.");
    }
    document.querySelector("[data-reset-entire-site]")?.addEventListener("click", () => { void resetEntireSite(); });
    initSetupFlow({ closeWindow, restoreDefaults, resetDiscoveries, closeStartMenu, isOnboardingInProgress: () => onboardingInProgress, saveSetupProfile: profileController.saveSetupProfile, completeOnboarding });

    const appearanceController = initAppearance({ memory, queueSave, elements: { taskbar, themeButtons, backgroundButtons, taskbarButtons } });

    const knownIcons = Array.from(document.querySelectorAll(".desktop-icon[data-icon]"))
        .map(icon => ({
            id: icon.dataset.icon,
            exportable: true,
            x: Number(icon.dataset.x),
            y: Number(icon.dataset.y),
            width: icon.getBoundingClientRect().width || 140,
            height: icon.getBoundingClientRect().height || 100
        }));
    const knownWindows = windows.map(windowEl => windowEl.dataset.window)
        .filter(id => !["setup", "easter-eggs-password", "developer-vault"].includes(id));
    const backupController = initConfigurationBackup({ memory, saveMemory, knownIcons, knownWindows, applyLiveConfiguration(selected) {
        if (selected.includes("appearance")) appearanceController.applyRestoredSettings(memory.settings);
        if (selected.includes("accessibility")) {
            window.dispatchEvent(new CustomEvent("guidelume:apply-accessible-fonts", {
                detail: { enabled: memory.settings.accessibleFonts === true }
            }));
            accessibilityController.applyRestoredSettings(memory.settings);
        }
        if (selected.includes("environment")) environmentController.applyRestoredSettings(memory.settings.environment);
        if (selected.includes("desktopLayout")) desktopIconController.refreshRestoredPositions();
        if (selected.includes("windowLayout")) windowManager.refreshRestoredLayout();
        if (selected.includes("taskbar")) {
            appearanceController.applyRestoredSettings({ taskbar: memory.settings.taskbar });
            windowManager.updateTaskbar();
        }
        if (selected.includes("widgets")) widgetsController?.applyRestoredState();
        if (selected.includes("profile")) profileController?.refreshStartMenu();
        if (selected.includes("lookingGlass")) lookingGlassController?.applyRestoredState();
        updateSettingsAvailability();
    } });

    await fontManager.prepare();
    if (window.guidelumeStartup) window.guidelumeStartup.complete();
    else {
        document.documentElement.dataset.restorationState = "ready";
        document.getElementById("bootState")?.setAttribute("hidden", "");
    }
    if (resetNoticeMessages[pendingResetNotice]) toast.show(resetNoticeMessages[pendingResetNotice]);

});
