document.addEventListener("DOMContentLoaded", () => {

    /*
     * Global.js V3.6 - Rewrote a good chunk to fit in better with the new CSS
     */

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
                ...(migrated.settings || {})
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
        || memory.settings.reducedMotion !== defaultMemory.settings.reducedMotion;
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
        settingsButtons: Array.from(document.querySelectorAll("[data-window='settings'] .settings-content button"))
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
    const defaultWindowSize = { width: "760px", height: "560px" };
    let zIndex = 10;
    let focusedWindow = null;
    const closeAnimationHandlers = new WeakMap();

    function resetZIndexes() {
        const visibleWindows = windows
            .filter(windowEl => !windowEl.hidden)
            .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0));

        visibleWindows.forEach((windowEl, index) => {
            windowEl.style.zIndex = String(11 + index);
        });
        zIndex = 10 + visibleWindows.length;
    }

    function nextZIndex() {
        if (zIndex >= 10000) resetZIndexes();
        zIndex += 1;
        return zIndex;
    }

    function getWindowMemory(id) {
        if (!memory.windows[id]) {
            memory.windows[id] = {
                open: false,
                minimized: false,
                maximized: false,
                x: 0.5,
                y: 0.5
            };
        }
        memory.windows[id].minimized ??= false;
        memory.windows[id].maximized ??= false;
        return memory.windows[id];
    }

    function getWindow(id) {
        return ui.windows.find(windowEl => windowEl.dataset.window === id) || null;
    }

    function normalizeWindowDimension(value, fallback) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return `${value}px`;
        }
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        return fallback;
    }

    function applyWindowSize(windowEl, requestedSize = {}) {
        const state = getWindowMemory(windowEl.dataset.window);
        ["width", "height"].forEach(dimension => {
            const datasetKey = `window${dimension[0].toUpperCase()}${dimension.slice(1)}`;
            const fallback = normalizeWindowDimension(windowEl.dataset[datasetKey], defaultWindowSize[dimension]);
            state[dimension] = requestedSize[dimension] !== undefined
                ? normalizeWindowDimension(requestedSize[dimension], fallback)
                : normalizeWindowDimension(state[dimension], fallback);
            windowEl.style[dimension] = state[dimension];
        });
    }

    function restoreWindowPosition(windowEl) {
        const id = windowEl.dataset.window;
        const saved = memory.windows[id];
        if (!saved) {
            return;
        }
        if (typeof saved.x !== "number" || typeof saved.y !== "number") {
            return;
        }
        windowEl.style.left = `${saved.x * 100}vw`;
        windowEl.style.top = `${saved.y * 100}vh`;
        windowEl.style.translate = "-50% -50%";
    }

    function getWindowTitle(windowEl) {
        return windowEl.querySelector(".titlebar-left span")?.textContent.trim() || windowEl.dataset.window;
    }

    function updateTaskbar() {
        windows.forEach(windowEl => {
            const id = windowEl.dataset.window;
            const state = getWindowMemory(id);
            let button = taskbarWindows.querySelector(`[data-taskbar-window="${id}"]`);

            if (state.open && !button) {
                button = document.createElement("button");
                button.type = "button";
                button.className = "taskbar-window";
                button.dataset.taskbarWindow = id;
                button.setAttribute("aria-label", getWindowTitle(windowEl));

                const icon = document.createElement("img");
                icon.src = windowEl.querySelector(".title-icon")?.src || "";
                icon.alt = "";
                icon.setAttribute("aria-hidden", "true");
                button.append(icon, document.createTextNode(getWindowTitle(windowEl)));
                button.addEventListener("click", () => {
                    const currentState = getWindowMemory(id);
                    if (
                        currentState.minimized
                        || windowEl.hidden
                        || windowEl.classList.contains("window-closing")
                    ) {
                        openWindow(id);
                    } else if (focusedWindow === windowEl) {
                        minimizeWindow(id);
                    } else {
                        focusWindow(windowEl);
                    }
                });
                taskbarWindows.append(button);
            }

            if (button) {
                button.hidden = !state.open;
                button.classList.toggle(
                    "is-open",
                    state.open && !state.minimized && !windowEl.classList.contains("window-closing")
                );
                button.classList.toggle("is-focused", focusedWindow === windowEl && !state.minimized);
            }
        });

        const hasMaximizedWindow = windows.some(windowEl => {
            const state = getWindowMemory(windowEl.dataset.window);
            return state.open && !state.minimized && state.maximized;
        });
        taskbar.classList.toggle("taskbar-docked", hasMaximizedWindow);
    }

    function focusWindow(windowEl) {
        focusedWindow = windowEl;
        windows.forEach(candidate => {
            const focused = candidate === windowEl;
            candidate.classList.toggle("is-focused", focused);
            if (focused) {
                candidate.style.zIndex = nextZIndex();
            }
        });
        updateTaskbar();
    }

    function focusMostRecentWindow(excludedWindow) {
        const candidate = windows
            .filter(windowEl => {
                const state = getWindowMemory(windowEl.dataset.window);
                return windowEl !== excludedWindow
                    && !windowEl.hidden
                    && !state.minimized
                    && !windowEl.classList.contains("window-closing");
            })
            .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];

        if (candidate) {
            focusWindow(candidate);
        }
    }

    function prepareWindow(windowEl, size) {
        const lazyFrame = windowEl.querySelector("iframe[data-src]");
        if (lazyFrame && !lazyFrame.hasAttribute("src")) {
            lazyFrame.setAttribute("src", lazyFrame.dataset.src);
        }

        const pendingClose = closeAnimationHandlers.get(windowEl);
        if (pendingClose) {
            windowEl.removeEventListener("animationend", pendingClose);
            closeAnimationHandlers.delete(windowEl);
        }

        applyWindowSize(windowEl, size);
        restoreWindowPosition(windowEl);
        windowEl.hidden = false;
        windowEl.classList.remove("window-opening", "window-closing");
    }

    function animateWindowOpen(windowEl) {
        if (memory.settings.reducedMotion) return;

        void windowEl.offsetWidth;
        windowEl.classList.add("window-opening");
        windowEl.addEventListener("animationend", function onWindowOpen(event) {
            if (event.target !== windowEl || event.animationName !== "windowOpen") return;
            windowEl.classList.remove("window-opening");
            windowEl.removeEventListener("animationend", onWindowOpen);
        });
    }

    function applyMaximizedStyles(windowEl, maximized) {
        windowEl.classList.toggle("is-maximized", maximized);
        windowEl.querySelector("[data-maximize-window]")?.setAttribute("aria-pressed", String(maximized));
        if (!maximized) return;

        windowEl.style.width = "";
        windowEl.style.height = "";
        windowEl.style.left = "";
        windowEl.style.top = "";
        windowEl.style.right = "";
        windowEl.style.bottom = "";
        windowEl.style.translate = "";
    }

    function setMaximized(windowEl, maximized) {
        const state = getWindowMemory(windowEl.dataset.window);
        state.maximized = maximized;
        applyMaximizedStyles(windowEl, maximized);
        if (!maximized) {
            applyWindowSize(windowEl);
            restoreWindowPosition(windowEl);
        }

        updateTaskbar();
        saveMemory();
    }

    function openWindow(id, size = {}) {
        const windowEl = getWindow(id);
        if (!windowEl) {
            return;
        }
        const windowMemory = getWindowMemory(id);
        if (windowEl.dataset.fixedMaximized === "true") {
            windowMemory.maximized = true;
        }
        if (
            windowMemory.open
            && !windowMemory.minimized
            && !windowEl.hidden
            && !windowEl.classList.contains("window-closing")
        ) {
            focusWindow(windowEl);
            return;
        }
        prepareWindow(windowEl, size);
        animateWindowOpen(windowEl);
        windowMemory.open = true;
        windowMemory.minimized = false;
        saveMemory();
        applyMaximizedStyles(windowEl, windowMemory.maximized);
        focusWindow(windowEl);
    }

    function openMilkyWayBarCrawl() {
        openWindow("mwbc");
    }

    function finishWindowAnimation(windowEl, callback) {
        if (memory.settings.reducedMotion) {
            windowEl.hidden = true;
            windowEl.classList.remove("window-opening", "window-closing");
            callback();
            return;
        }
        const previousHandler = closeAnimationHandlers.get(windowEl);
        if (previousHandler) {
            windowEl.removeEventListener("animationend", previousHandler);
        }
        const onAnimationEnd = event => {
            if (event.target !== windowEl || event.animationName !== "windowClose") {
                return;
            }
            windowEl.removeEventListener("animationend", onAnimationEnd);
            closeAnimationHandlers.delete(windowEl);
            windowEl.hidden = true;
            windowEl.classList.remove("window-closing");
            callback();
        };
        closeAnimationHandlers.set(windowEl, onAnimationEnd);
        windowEl.addEventListener("animationend", onAnimationEnd);
    }

    function animateWindowClose(windowEl, callback) {
        windowEl.classList.remove("window-opening");
        void windowEl.offsetWidth;
        windowEl.classList.add("window-closing");
        finishWindowAnimation(windowEl, callback);
    }

    function completeWindowClose(windowEl, state, restoreSize) {
        state.open = false;
        if (restoreSize) {
            windowEl.classList.remove("is-maximized");
            applyWindowSize(windowEl);
            restoreWindowPosition(windowEl);
        }
        saveMemory();
        updateTaskbar();
    }

    function minimizeWindow(id) {
        const windowEl = getWindow(id);
        if (!windowEl || windowEl.classList.contains("window-closing")) {
            return;
        }

        const state = getWindowMemory(id);
        const wasMaximized = state.maximized;
        state.minimized = true;
        if (focusedWindow === windowEl) {
            focusedWindow = null;
            windowEl.classList.remove("is-focused");
            focusMostRecentWindow(windowEl);
        }
        saveMemory();
        updateTaskbar();

        animateWindowClose(windowEl, () => {
            if (wasMaximized) {
                windowEl.classList.remove("is-maximized");
                applyWindowSize(windowEl);
                restoreWindowPosition(windowEl);
            }
        });
    }

    function closeWindow(id) {
        const windowEl = getWindow(id);
        if (!windowEl || windowEl.classList.contains("window-closing")) {
            return;
        }
        const state = getWindowMemory(id);
        const wasMaximized = state.maximized;
        state.maximized = false;
        state.minimized = false;
        state.open = false;
        saveMemory();
        windowEl.classList.remove("window-opening");
        if (!wasMaximized) {
            windowEl.classList.remove("is-maximized");
        }
        windowEl.querySelector("[data-maximize-window]")?.setAttribute("aria-pressed", "false");
        if (!wasMaximized) {
            restoreWindowPosition(windowEl);
        }
        if (focusedWindow === windowEl) {
            focusedWindow = null;
            windowEl.classList.remove("is-focused");
            focusMostRecentWindow(windowEl);
        }
        updateTaskbar();
        if (windowEl.hidden) {
            completeWindowClose(windowEl, state, true);
            return;
        }
        updateTaskbar();
        animateWindowClose(windowEl, () => {
            completeWindowClose(windowEl, state, wasMaximized);
        });
    }

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
        memory = {
            ...defaultMemory,
            icons: {},
            windows: {},
            settings: {
                ...defaultMemory.settings,
                experience: "reader",
                onboardingComplete: true
            }
        };
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

    function setCrtEffects(enabled) {
        memory.settings.crtEffects = enabled;
        if (crtToggle) crtToggle.checked = enabled;
        if (crtShell) crtShell.dataset.crtEffects = enabled ? "on" : "off";
        queueSave();
    }

    setCrtEffects(memory.settings.crtEffects !== false);

    crtToggle?.addEventListener("change", () => {
        setCrtEffects(crtToggle.checked);
    });

    function applyTextSize(size) {
        const availableSizes = ["small", "default", "large", "extra-large"];
        if (!availableSizes.includes(size)) size = "default";
        memory.settings.textSize = size;
        document.documentElement.dataset.textSize = size;
        accessibilitySizeButtons.forEach(button => {
            const selected = button.dataset.textSize === size;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        queueSave();
    }

    function applyReducedMotion(enabled) {
        memory.settings.reducedMotion = enabled;
        if (reducedMotionToggle) reducedMotionToggle.checked = enabled;
        document.documentElement.dataset.reducedMotion = enabled ? "true" : "false";
        queueSave();
    }

    applyTextSize(memory.settings.textSize);
    applyReducedMotion(memory.settings.reducedMotion === true);

    accessibilitySizeButtons.forEach(button => {
        button.addEventListener("click", () => applyTextSize(button.dataset.textSize));
    });

    reducedMotionToggle?.addEventListener("change", () => {
        applyReducedMotion(reducedMotionToggle.checked);
    });

    function positionStartMenu() {
        const rect = taskbar.getBoundingClientRect();
        startMenu.style.left = `${Math.max(8, rect.left)}px`;
        startMenu.style.maxHeight = `${Math.max(180, window.innerHeight - 32)}px`;
        if (taskbar.classList.contains("taskbar-top")) {
            startMenu.style.top = `${rect.bottom + 8}px`;
            startMenu.style.bottom = "auto";
        } else {
            startMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
            startMenu.style.top = "auto";
        }
    }

    function openStartMenu() {
        positionStartMenu();
        startMenu.hidden = false;
        startMenu.classList.remove("is-closing");
        startButton.setAttribute("aria-expanded", "true");
        startButton.classList.add("is-active");
        void startMenu.offsetWidth;
        startMenu.classList.add("is-open");
    }

    function closeStartMenu() {
        if (startMenu.hidden) {
            return;
        }
        startMenu.classList.remove("is-open");
        startMenu.classList.add("is-closing");
        startButton.setAttribute("aria-expanded", "false");
        startButton.classList.remove("is-active");
    }

    startMenu.addEventListener("animationend", event => {
        if (event.target === startMenu && event.animationName === "startMenuClose") {
            startMenu.hidden = true;
            startMenu.classList.remove("is-closing");
        }
    });

    startButton.addEventListener("click", () => {
        if (startMenu.hidden || startMenu.classList.contains("is-closing")) {
            openStartMenu();
        } else {
            closeStartMenu();
        }
    });

    document.addEventListener("pointerdown", event => {
        if (!startMenu.hidden && !startMenu.contains(event.target) && !startButton.contains(event.target)) {
            closeStartMenu();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeStartMenu();
        }
    });

    const timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit"
    });
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium"
    });
    const updateClock = () => {
        const now = new Date();
        taskbarClock.dateTime = now.toISOString();
        taskbarTime.textContent = timeFormatter.format(now);
        taskbarDate.textContent = dateFormatter.format(now);
    };
    updateClock();
    window.setTimeout(() => {
        updateClock();
        window.setInterval(updateClock, 60_000);
    }, 60_000 - (Date.now() % 60_000));

    window.addEventListener("resize", () => {
        if (!startMenu.hidden) {
            positionStartMenu();
        }
    });

    /*
     * Open / close buttons
     */
    document
        .querySelectorAll("button[data-open-window]")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const closeCurrent = button.dataset.closeCurrent;
                    if (closeCurrent) closeWindow(closeCurrent);
                    const targetWindow = getWindow(button.dataset.openWindow);
                    openWindow(button.dataset.openWindow, {
                        width: button.dataset.windowWidth,
                        height: button.dataset.windowHeight
                    });
                    if (button.dataset.scrollTop === "true" && targetWindow) {
                        targetWindow.querySelector(".setup-content")?.scrollTo({ top: 0 });
                    }
                    if (button.dataset.closeStartMenu === "true") {
                        closeStartMenu();
                    }
                }
            );
        });
    document
        .querySelectorAll("[data-close-window]")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    closeWindow(button.dataset.closeWindow);
                }
            );
        });

    /*
     * Window dragging
     */
    windows.forEach(windowEl => {
        const titlebar = windowEl.querySelector(".window-drag-handle");
        if (!titlebar) {
            return;
        }
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;
        titlebar.addEventListener(
            "mousedown",
            event => {
                if (event.button !== 0 || event.target.closest("button")) {
                    return;
                }
                if (memory.settings.experience === "reader") {
                    return;
                }
                const rect = windowEl.getBoundingClientRect();

                if (windowEl.classList.contains("is-maximized")) {
                    const state = getWindowMemory(windowEl.dataset.window);
                    const dragRatio = (event.clientX - rect.left) / rect.width;
                    state.maximized = false;
                    windowEl.classList.remove("is-maximized");
                    applyWindowSize(windowEl);
                    windowEl.querySelector("[data-maximize-window]")?.setAttribute("aria-pressed", "false");
                    restoreWindowPosition(windowEl);
                    const restoredRect = windowEl.getBoundingClientRect();
                    offsetX = restoredRect.width * dragRatio;
                    offsetY = event.clientY - rect.top;
                    windowEl.style.left = `${event.clientX - offsetX}px`;
                    windowEl.style.top = `${event.clientY - offsetY}px`;
                    windowEl.style.translate = "none";
                    updateTaskbar();
                } else {
                    windowEl.style.left = `${rect.left}px`;
                    windowEl.style.top = `${rect.top}px`;
                    windowEl.style.translate = "none";
                    offsetX = event.clientX - rect.left;
                    offsetY = event.clientY - rect.top;
                }

                /*
                 * Convert centered window
                 * into normal positioned window
                 */
                dragging = true;
                document.body.style.userSelect = "none";
                event.preventDefault();
            }
        );
        window.addEventListener(
            "mousemove",
            event => {
                if (!dragging) return;
                windowEl.style.left = `${event.clientX - offsetX}px`;
                windowEl.style.top = `${event.clientY - offsetY}px`;
            }
        );
        window.addEventListener(
            "mouseup",
            () => {
                if (dragging) {
                    const rect = windowEl.getBoundingClientRect();
                    const id = windowEl.dataset.window;
                    const windowMemory = getWindowMemory(id);
                    windowMemory.x =
                        (rect.left + rect.width / 2) / window.innerWidth;
                    windowMemory.y =
                        (rect.top + rect.height / 2) / window.innerHeight;
                    queueSave();
                    updateTaskbar();
                }
                dragging = false;
                document.body.style.userSelect = "";
            }
        );
    });

    /*
     * Desktop icon dragging
     */
    document
        .querySelectorAll(".desktop-icon img")
        .forEach(img => {
            img.addEventListener(
                "dragstart",
                event => {
                    event.preventDefault();
                }
            );
        });
    function loadIconPosition(icon) {
        const id = icon.dataset.icon;
        const saved = memory.icons[id];
        const x = saved?.x ?? Number(icon.dataset.x);
        const y = saved?.y ?? Number(icon.dataset.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            icon.style.left = `${x * 100}%`;
            icon.style.top = `${y * 100}%`;
        }
    }
    desktopIcons.forEach(icon => {
        loadIconPosition(icon);
        icon.setAttribute(
            "draggable",
            "false"
        );
        let dragging = false;
        let moved = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;
        icon.addEventListener(
            "mousedown",
            event => {
                if (event.button !== 0) {
                    return;
                }
                if (memory.settings.experience === "reader") {
                    dragging = true;
                    moved = false;
                    startX = event.clientX;
                    startY = event.clientY;
                    event.preventDefault();
                    return;
                }
                const rect = icon.getBoundingClientRect();
                const desktopRect = desktop.getBoundingClientRect();

                /*
                 * Convert current position
                 * into desktop coordinates once
                 */
                icon.style.position = "absolute";
                icon.style.left = `${rect.left - desktopRect.left}px`;
                icon.style.top = `${rect.top - desktopRect.top}px`;
                icon.style.right = "auto";
                icon.style.bottom = "auto";
                offsetX = event.clientX - rect.left;
                offsetY = event.clientY - rect.top;
                startX = event.clientX;
                startY = event.clientY;
                dragging = true;
                moved = false;
                event.preventDefault();
            }
        );
        window.addEventListener(
            "mousemove",
            event => {
                if (!dragging) {
                    return;
                }
                const distance =
                    Math.abs(
                        event.clientX - startX
                    )
                    +
                    Math.abs(
                        event.clientY - startY
                    );
                if (distance > 5) {
                    moved = true;
                }
                if (memory.settings.experience === "reader" || !moved) {
                    return;
                }
                const desktopRect = desktop.getBoundingClientRect();
                icon.style.left = `${event.clientX - desktopRect.left - offsetX}px`;
                icon.style.top = `${event.clientY - desktopRect.top - offsetY}px`;
            }
        );
        window.addEventListener(
            "mouseup",
            () => {
                const shouldOpen = dragging && !moved;
                const didMove = dragging && moved;
                dragging = false;

                if (didMove) {
                    const desktopRect = desktop.getBoundingClientRect();
                    const rect = icon.getBoundingClientRect();
                    const id = icon.dataset.icon;
                    memory.icons[id] = {
                        x: (rect.left - desktopRect.left) / desktopRect.width,
                        y: (rect.top - desktopRect.top) / desktopRect.height
                    };
                    queueSave();
                }

                if (shouldOpen) {
                    const target = icon.dataset.openWindow;
                    if (target) openWindow(target);
                }
            }
        );
        icon.addEventListener("keydown", event => {
            if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                event.preventDefault();
                const target = icon.dataset.openWindow;
                if (target) openWindow(target);
            }
        });
    });

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
                        if (onboardingInProgress) {
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
                    if (onboardingInProgress) {
                        document.documentElement.dataset.onboardingStage = "appearance";
                    }
                    closeWindow("setup");
                    openWindow("appearance");
                }
            );
        });

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
                if (onboardingInProgress) {
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
});
