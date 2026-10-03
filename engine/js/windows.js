export function initWindowManager({ memory, saveMemory, elements }) {
    const { windows, taskbarWindows, taskbar } = elements;
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
        return windows.find(windowEl => windowEl.dataset.window === id) || null;
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



    return {
        getWindowMemory, getWindow, openWindow, openMilkyWayBarCrawl, setMaximized,
        closeWindow, minimizeWindow, focusWindow, updateTaskbar, applyWindowSize, restoreWindowPosition
    };
}
