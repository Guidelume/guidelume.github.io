import { createDesktopState } from "./desktop-state.js";
import { initAccessibility } from "./accessibility.js";
import { initTaskbarUtilities } from "./taskbar-utilities.js";
import { initAppearance } from "./appearance.js";
import { initWindowManager } from "./windows.js";
import { initWindowInteractions } from "./window-interactions.js";
import { initDesktopIcons } from "./desktop-icons.js";
import { initSetupFlow } from "./setup-flow.js";
import { initEnvironmentalControls } from "./environmental-controls.js";
import { createEnvironmentEffectManager } from "./environment-effect-manager.js";

document.addEventListener("DOMContentLoaded", () => {

    /*
     * Global.js V4 - Clean House Update. Separated things into ES modules
	 * This should hopefully make future features easier to implement
     */

    const desktopState = createDesktopState();
    const {
        memory, experienceKey, defaultMemory, queueSave, saveMemory,
        clearSavedGuidelumeState, nexusGuideRequested, firstNexusGuideVisit
    } = desktopState;
    let onboardingInProgress = desktopState.onboardingInProgress;

    const ui = {
        windows: Array.from(document.querySelectorAll(".setup-window")),
        taskbarWindows: document.querySelector(".taskbar-windows"),
        taskbar: document.querySelector(".taskbar"),
        startButton: document.querySelector(".start-button"),
        startMenu: document.querySelector(".start-menu"),
        desktop: document.querySelector(".setup-page"),
        desktopIcons: Array.from(document.querySelectorAll(".desktop-icon")),
        crtToggle: document.getElementById("crtToggle"),
        crtShell: document.getElementById("crt"),
        accessibilitySizeButtons: Array.from(document.querySelectorAll(".accessibility-size")),
        reducedMotionToggle: document.getElementById("reducedMotionToggle"),
        taskbarClock: document.querySelector(".taskbar-clock"),
        taskbarTime: document.querySelector(".taskbar-time"),
        taskbarDate: document.querySelector(".taskbar-date"),
        themeButtons: Array.from(document.querySelectorAll("[data-color]")),
        backgroundButtons: Array.from(document.querySelectorAll(".background-grid [data-background]")),
        taskbarButtons: Array.from(document.querySelectorAll(".taskbar-option")),
        finishButton: document.getElementById("finishSetup"),
        settingsNote: document.getElementById("settingsUnavailableNote"),
        settingsButtons: Array.from(document.querySelectorAll("[data-window='settings'] .settings-content button")),
        environmentSectionToggles: Array.from(document.querySelectorAll("[data-environment-section]")),
        environmentPresetSelect: document.getElementById("environmentPreset"),
        environmentAmbientAnimationToggle: document.getElementById("environmentAmbientAnimation"),
        environmentWeatherToggles: Array.from(document.querySelectorAll("[data-weather-effect]")),
        environmentDecorationToggles: Array.from(document.querySelectorAll("[data-decoration]")),
        environmentThemeToggles: Array.from(document.querySelectorAll("[data-seasonal-theme]")),
        applyEnvironmentButton: document.getElementById("applyEnvironment"),
        environmentIntensityRadios: Array.from(document.querySelectorAll("[name='environmentIntensity']")),
        environmentRotationToggle: document.getElementById("environmentRotation"),
        environmentRotationInterval: document.getElementById("environmentRotationInterval"),
        environmentLayer: document.querySelector(".environment-effects")
    };
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
        taskbarButtons,
        finishButton
    } = ui;
    const windowManager = initWindowManager({
        memory,
        saveMemory,
        elements: { windows, taskbarWindows, taskbar }
    });
    const {
        getWindowMemory, getWindow, openWindow, openMilkyWayBarCrawl,
        setMaximized, closeWindow, minimizeWindow, focusWindow, updateTaskbar
    } = windowManager;

    function updateSettingsAvailability() {
        const settingsAvailable = memory.settings.experience === "interactive";
        if (ui.settingsNote) ui.settingsNote.hidden = settingsAvailable;
        ui.settingsButtons.forEach(button => {
            button.disabled = !settingsAvailable;
        });
    }

    function setWindowControlsLocked(locked) {
        windows.forEach(windowEl => {
            windowEl.querySelectorAll(".window-controls button, .window-close").forEach(button => {
                button.disabled = locked;
            });
        });
        updateSettingsAvailability();
    }

    function completeOnboarding(experience) {
        onboardingInProgress = false;
        memory.settings.onboardingComplete = true;
        memory.settings.experience = experience;
        document.documentElement.dataset.experience = experience;
        document.documentElement.dataset.onboardingStage = "complete";
        setWindowControlsLocked(false);
        localStorage.setItem(experienceKey, experience);
        saveMemory();
    }

    function resetToReaderMode() {
        clearSavedGuidelumeState();
        Object.assign(memory, {
            ...defaultMemory,
            icons: {},
            windows: {},
            settings: {
                ...defaultMemory.settings,
                environment: {
                    ...defaultMemory.settings.environment,
                    presets: [],
                    sections: { weather: false, presets: false, decorations: false, themes: false },
                    effects: { ...defaultMemory.settings.environment.effects },
                    weather: [],
                    suppressedWeather: [],
                    decorations: [],
                    themes: [],
                    rotation: { ...defaultMemory.settings.environment.rotation }
                },
                experience: "reader",
                onboardingComplete: true
            }
        });
        saveMemory();
        localStorage.setItem(experienceKey, memory.settings.experience);
        window.location.reload();
    }

    if (onboardingInProgress) {
        windows.forEach(windowEl => {
            const id = windowEl.dataset.window;
            const state = getWindowMemory(id);
            state.open = id === "setup";
            state.minimized = false;
            state.maximized = false;
            if (id === "setup") {
                state.x = 0.5;
                state.y = 0.5;
                delete state.width;
                delete state.height;
            }
        });
    }
    setWindowControlsLocked(onboardingInProgress);

    if (nexusGuideRequested && !onboardingInProgress) {
        const mwbcState = getWindowMemory("mwbc");
        mwbcState.open = false;
        mwbcState.minimized = false;
        if (firstNexusGuideVisit) {
            const readmeState = getWindowMemory("readme");
            readmeState.open = false;
            readmeState.minimized = false;
        }
        saveMemory();
    }

    windows.forEach(windowEl => {
        const id = windowEl.dataset.window;
        const saved = getWindowMemory(id);
        if (saved.open && saved.minimized) {
            windowEl.hidden = true;
            updateTaskbar();
        } else if (saved.open) {
            openWindow(id);
        }
    });

    if (nexusGuideRequested && !onboardingInProgress) {
        if (firstNexusGuideVisit) {
            openWindow("readme");
        }
        // Open the guide last so it sits above the Readme on first visits.
        openMilkyWayBarCrawl();
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

    initAccessibility({ memory, queueSave, elements: { crtToggle, crtShell, accessibilitySizeButtons, reducedMotionToggle } });
    const environmentEffects = createEnvironmentEffectManager({ container: ui.environmentLayer });
    initEnvironmentalControls({
        memory,
        queueSave,
        effectManager: environmentEffects,
        elements: {
            sectionToggles: ui.environmentSectionToggles,
            presetSelect: ui.environmentPresetSelect,
            ambientAnimationToggle: ui.environmentAmbientAnimationToggle,
            weatherToggles: ui.environmentWeatherToggles,
            decorationToggles: ui.environmentDecorationToggles,
            themeToggles: ui.environmentThemeToggles,
            intensityRadios: ui.environmentIntensityRadios,
            rotationToggle: ui.environmentRotationToggle,
            rotationInterval: ui.environmentRotationInterval,
            applyButton: ui.applyEnvironmentButton
        }
    });
    const closeStartMenu = initTaskbarUtilities({ elements: { taskbar, startButton, startMenu, taskbarClock, taskbarTime, taskbarDate } });

    initWindowInteractions({ windows, memory, queueSave, closeStartMenu, windowManager });
    initDesktopIcons({ desktop, desktopIcons, memory, queueSave, openWindow });
    initSetupFlow({ memory, saveMemory, clearSavedGuidelumeState, experienceKey, getWindowMemory, closeWindow, openWindow, resetToReaderMode, updateSettingsAvailability, completeOnboarding, closeStartMenu, isOnboardingInProgress: () => onboardingInProgress });

    initAppearance({ memory, queueSave, saveMemory, elements: { taskbar, themeButtons, backgroundButtons, taskbarButtons, finishButton }, experienceKey, getWindowMemory, closeWindow, openWindow, completeOnboarding, isOnboardingInProgress: () => onboardingInProgress });

});
