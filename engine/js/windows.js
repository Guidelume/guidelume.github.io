import { clampWindowPosition, getDesktopBounds } from "./desktop-bounds.js";

export function initWindowManager({ memory, saveMemory, elements, canCloseWindow = () => true, confirmOpenWindow = () => true,
    prepareWindowOpen = () => {}, onWindowOpenError = error => console.error(error) }) {
    const { windows, taskbarWindows, taskbar } = elements;
    const defaultWindowSize = { width: "760px", height: "560px" };
    let zIndex = 110;
    let focusedWindow = null;
    let activationRevision = 0;
    let overflowButton = null;
    let overflowMenu = null;
    let taskbarContextMenu = null;
    let contextMenuTarget = null;
    let scrollSaveTimer = null;
    const temporaryTaskbarHiddenWindows = new Set();
    const closeAnimationHandlers = new WeakMap();
    const trackedFrames = new WeakSet();
    const pendingWindowOpens = new Map();

    function getRestorableFrameUrl(frame) {
        try {
            const url = new URL(frame.contentWindow.location.href);
            return url.origin === window.location.origin && ["http:", "https:"].includes(url.protocol)
                ? url.href
                : null;
        } catch {
            // A frame can briefly be on about:blank or a cross-origin page.
            return null;
        }
    }

    function rememberFrameUrl(windowEl, frame) {
        if (!frame) return;
        const url = getRestorableFrameUrl(frame);
        if (!url) return;
        const state = getWindowMemory(windowEl.dataset.window);
        if (state.iframeUrl === url) return;
        state.iframeUrl = url;
        saveMemory();
    }

    function rememberFrameState(windowEl, frame) {
        if (!frame) return;
        try {
            const currentUrl = getRestorableFrameUrl(frame);
            if (!currentUrl) return;
            const snapshot = frame.contentWindow?.guidelumeGetResourceState?.()
                || captureGenericFrameState(frame);
            if (snapshot?.href && snapshot.href !== currentUrl) return;
            const state = getWindowMemory(windowEl.dataset.window);
            if (!snapshot || typeof snapshot !== "object") {
                if (state.iframePageState) {
                    delete state.iframePageState;
                    saveMemory();
                }
                return;
            }
            state.iframePageState = snapshot;
            saveMemory();
        } catch {
            // A cross-origin or navigating frame cannot provide an in-page snapshot.
        }
    }

    function getElementPath(element, doc) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const parts = [];
        for (let current = element; current && current !== doc.body; current = current.parentElement) {
            const sameTag = Array.from(current.parentElement?.children || [])
                .filter(sibling => sibling.tagName === current.tagName);
            parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${sameTag.indexOf(current) + 1})`);
        }
        return `body > ${parts.join(" > ")}`;
    }

    function captureGenericFrameState(frame) {
        try {
            const child = frame.contentWindow;
            const doc = child.document;
            const scrollPositions = [];
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
            for (let element = walker.nextNode(); element; element = walker.nextNode()) {
                if (element.scrollHeight <= element.clientHeight + 2) continue;
                const style = child.getComputedStyle(element);
                if (!/^(auto|scroll|overlay)$/.test(style.overflowY)) continue;
                scrollPositions.push({
                    selector: getElementPath(element, doc),
                    top: element.scrollTop,
                    left: element.scrollLeft
                });
            }
            return {
                href: child.location.href,
                windowScrollX: child.scrollX || 0,
                windowScrollY: child.scrollY || doc.documentElement.scrollTop || 0,
                scrollPositions
            };
        } catch {
            return null;
        }
    }

    function restoreFrameState(windowEl, frame) {
        if (!frame?.hasAttribute("src")) return;
        const state = getWindowMemory(windowEl.dataset.window).iframePageState;
        if (!state || typeof state !== "object") return;
        try {
            const child = frame.contentWindow;
            if (child.location.href !== state.href) return;
            if (typeof child.guidelumeRestoreResourceState === "function"
                && child.guidelumeRestoreResourceState(state) === true) return;

            child.requestAnimationFrame(() => child.requestAnimationFrame(() => {
                if (child.location.href !== state.href) return;
                (state.scrollPositions || []).forEach(position => {
                    if (typeof position.selector !== "string") return;
                    try {
                        const element = child.document.querySelector(position.selector);
                        if (!element) return;
                        element.scrollTop = Math.max(0, Number(position.top) || 0);
                        element.scrollLeft = Math.max(0, Number(position.left) || 0);
                    } catch {}
                });
                child.scrollTo(
                    Math.max(0, Number(state.windowScrollX) || 0),
                    Math.max(0, Number(state.windowScrollY) || 0)
                );
            }));
        } catch {
            // Cross-origin or navigating frames cannot be restored from the parent.
        }
    }

    function trackFrameNavigation(windowEl, frame) {
        if (!frame || trackedFrames.has(frame)) return;
        trackedFrames.add(frame);
        frame.addEventListener("load", () => {
            rememberFrameUrl(windowEl, frame);
            restoreFrameState(windowEl, frame);
            updateWindowResourceState(windowEl, true);
        });
        window.addEventListener("message", event => {
            if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
            if (event.data?.type !== "guidelume-window-activate") return;
            const state = getWindowMemory(windowEl.dataset.window);
            if (state.open && !state.minimized && !windowEl.hidden) focusWindow(windowEl);
        });
        // Captures same-document history changes and the latest URL on a parent reload.
        window.addEventListener("pagehide", () => {
            if (!frame.hasAttribute("src")) return;
            rememberFrameUrl(windowEl, frame);
            rememberFrameState(windowEl, frame);
        });
    }

    function updateWindowResourceState(windowEl, force = false) {
        const frame = windowEl.querySelector("iframe");
        if (frame?.dataset.resourceLifecycle === "external") return;
        if (!frame?.contentWindow || !frame.hasAttribute("src")) return;

        const state = getWindowMemory(windowEl.dataset.window);
        const closing = windowEl.classList.contains("window-closing");
        const isActive = !document.hidden
            && state.open
            && !state.minimized
            && !windowEl.hidden
            && !closing
            && focusedWindow === windowEl;
        const resourceState = isActive ? "active" : "suspended";
        if (!force && frame.dataset.resourceState === resourceState) return;
        frame.dataset.resourceState = resourceState;
        try {
            frame.contentWindow.postMessage({
                type: "guidelume-resource-state",
                state: resourceState
            }, window.location.origin);
        } catch {
            // File URLs and a child during navigation may not accept a target origin.
        }
    }

    function updateWindowResourceStates() {
        windows.forEach(windowEl => updateWindowResourceState(windowEl));
    }

    function unloadWindowFrame(windowEl) {
        const frame = windowEl.querySelector("iframe");
        if (!frame) return;
        // Capture the current same-origin URL before releasing the child browsing context.
        rememberFrameUrl(windowEl, frame);
        rememberFrameState(windowEl, frame);
        frame.dataset.resourceState = "unloaded";
        frame.removeAttribute("src");
    }

    function resetZIndexes() {
        const visibleWindows = windows
            .filter(windowEl => !windowEl.hidden)
            .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0));

        visibleWindows.forEach((windowEl, index) => {
            windowEl.style.zIndex = String(111 + index);
        });
        zIndex = 110 + visibleWindows.length;
    }

    function nextZIndex() {
        if (zIndex >= 179) resetZIndexes();
        zIndex += 1;
        return zIndex;
    }

    function getWindowMemory(id) {
        const saved = memory.windows[id];
        const state = saved !== null && typeof saved === "object" && !Array.isArray(saved)
            ? saved
            : {};
        state.open = state.open === true;
        state.minimized = state.minimized === true;
        state.maximized = state.maximized === true;
        state.hideTaskbar = state.hideTaskbar === true;
        if (typeof state.x !== "number" || !Number.isFinite(state.x)) state.x = 0.5;
        if (typeof state.y !== "number" || !Number.isFinite(state.y)) state.y = 0.5;
        memory.windows[id] = state;
        return state;
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
            const previousDefaults = {
                "user-profile": { width: "520px", height: "470px" },
                setup: { height: "560px" },
                settings: { width: "780px" }
            };
            const previousDefault = previousDefaults[windowEl.dataset.window]?.[dimension];
            if (previousDefault && normalizeWindowDimension(state[dimension], fallback) === previousDefault) {
                // Advance saved defaults while keeping other remembered sizes.
                state[dimension] = fallback;
            }
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
        constrainWindowPosition(windowEl);
    }

    function constrainWindowPosition(windowEl) {
        if (windowEl.hidden || windowEl.classList.contains("is-maximized")) return;
        const rect = windowEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const titlebarHeight = windowEl.querySelector(".setup-titlebar")?.offsetHeight || 32;
        const position = clampWindowPosition(rect, getDesktopBounds(), titlebarHeight);
        if (Math.abs(position.left - rect.left) < 0.5 && Math.abs(position.top - rect.top) < 0.5) return;
        windowEl.style.left = `${position.left}px`;
        windowEl.style.top = `${position.top}px`;
        windowEl.style.translate = "none";
    }

    function getWindowTitle(windowEl) {
        return windowEl.querySelector(".titlebar-left span")?.textContent.trim() || windowEl.dataset.window;
    }

    function positionOverflowMenu() {
        if (!overflowButton || !overflowMenu || overflowMenu.hidden) return;
        const rect = overflowButton.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 16);
        overflowMenu.style.width = `${width}px`;
        overflowMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
        overflowMenu.style.right = "auto";
        if (taskbar.classList.contains("taskbar-top")) {
            overflowMenu.style.top = `${rect.bottom + 8}px`;
            overflowMenu.style.bottom = "auto";
        } else {
            overflowMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
            overflowMenu.style.top = "auto";
        }
    }

    function ensureOverflowControls() {
        if (overflowButton) return;
        overflowButton = document.createElement("button");
        overflowButton.type = "button";
        overflowButton.className = "taskbar-overflow-button";
        overflowButton.textContent = "[…]";
        overflowButton.setAttribute("aria-label", "More taskbar items");
        overflowButton.setAttribute("aria-expanded", "false");
        overflowMenu = document.createElement("div");
        overflowMenu.className = "taskbar-overflow-menu";
        overflowMenu.hidden = true;
        document.body.append(overflowMenu);
        overflowButton.addEventListener("click", () => {
            const opening = overflowMenu.hidden;
            overflowMenu.hidden = !opening;
            overflowButton.setAttribute("aria-expanded", String(opening));
            positionOverflowMenu();
        });
        document.addEventListener("pointerdown", event => {
            if (!overflowMenu.hidden && !overflowMenu.contains(event.target) && !overflowButton.contains(event.target)) {
                overflowMenu.hidden = true;
                overflowButton.setAttribute("aria-expanded", "false");
            }
        });
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !overflowMenu.hidden) {
                overflowMenu.hidden = true;
                overflowButton.setAttribute("aria-expanded", "false");
                overflowButton.focus();
            }
        });
        window.addEventListener("resize", positionOverflowMenu, { passive: true });
    }

    function closeTaskbarContextMenu({ restoreFocus = false } = {}) {
        if (!taskbarContextMenu || taskbarContextMenu.hidden) return;
        taskbarContextMenu.hidden = true;
        if (restoreFocus && contextMenuTarget?.isConnected) contextMenuTarget.focus();
        contextMenuTarget = null;
    }

    function positionTaskbarContextMenu(x, y) {
        if (!taskbarContextMenu) return;
        const margin = 8;
        const rect = taskbarContextMenu.getBoundingClientRect();
        taskbarContextMenu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))}px`;
        taskbarContextMenu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))}px`;
    }

    function ensureTaskbarContextMenu() {
        if (taskbarContextMenu) return;
        taskbarContextMenu = document.createElement("div");
        taskbarContextMenu.className = "taskbar-context-menu";
        taskbarContextMenu.setAttribute("role", "menu");
        taskbarContextMenu.hidden = true;
        document.body.append(taskbarContextMenu);
        document.addEventListener("pointerdown", event => {
            if (!taskbarContextMenu.hidden && !taskbarContextMenu.contains(event.target)) {
                closeTaskbarContextMenu();
            }
        });
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !taskbarContextMenu.hidden) {
                event.preventDefault();
                closeTaskbarContextMenu({ restoreFocus: true });
            }
        });
        taskbarContextMenu.addEventListener("keydown", event => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            const items = Array.from(taskbarContextMenu.querySelectorAll(".taskbar-context-menu-item:not(:disabled)"));
            if (!items.length) return;
            event.preventDefault();
            const currentIndex = items.indexOf(document.activeElement);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            const nextIndex = currentIndex < 0
                ? 0
                : (currentIndex + direction + items.length) % items.length;
            items[nextIndex].focus();
        });
        window.addEventListener("resize", () => closeTaskbarContextMenu(), { passive: true });
    }

    function toggleTaskbarPin(id) {
        const isPinned = memory.pinnedTaskbar.includes(id);
        memory.pinnedTaskbar = isPinned
            ? memory.pinnedTaskbar.filter(pinnedId => pinnedId !== id)
            : [...memory.pinnedTaskbar, id];
        if (isPinned && !getWindowMemory(id).open) {
            memory.taskbarOrder = memory.taskbarOrder.filter(windowId => windowId !== id);
        } else if (!isPinned && !memory.taskbarOrder.includes(id)) {
            memory.taskbarOrder.push(id);
        }
        saveMemory();
        updateTaskbar();
    }

    function ensureWindowPinButton(windowEl) {
        const controls = windowEl.querySelector(".window-controls");
        const minimizeButton = controls?.querySelector("[data-minimize-window]");
        if (!controls || !minimizeButton) return null;
        let button = controls.querySelector("[data-pin-window]");
        if (!button) {
            const id = windowEl.dataset.window;
            button = document.createElement("button");
            button.type = "button";
            button.className = "window-pin";
            button.dataset.pinWindow = id;
            button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 12V4l1-1V2H7v1l1 1v8l-2 2v1h5.5v6h1v-6H18v-1z"/></svg>';
            button.addEventListener("click", () => toggleTaskbarPin(id));
            controls.insertBefore(button, minimizeButton);
        }
        const isPinned = memory.pinnedTaskbar.includes(windowEl.dataset.window);
        button.setAttribute("aria-label", isPinned ? "Unpin from taskbar" : "Pin to taskbar");
        button.setAttribute("aria-pressed", String(isPinned));
        button.title = isPinned ? "Unpin from taskbar" : "Pin to taskbar";
        return button;
    }

    function renderTaskbarContextMenu(id) {
        taskbarContextMenu.replaceChildren();
        const isPinned = memory.pinnedTaskbar.includes(id);
        const state = getWindowMemory(id);
        const addItem = (label, onClick, { disabled = false } = {}) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "taskbar-context-menu-item";
            item.setAttribute("role", "menuitem");
            item.textContent = label;
            item.disabled = disabled;
            item.addEventListener("click", onClick);
            taskbarContextMenu.append(item);
            return item;
        };
        const addSeparator = () => {
            const separator = document.createElement("div");
            separator.className = "taskbar-context-menu-separator";
            separator.setAttribute("role", "separator");
            taskbarContextMenu.append(separator);
        };

        addItem(isPinned ? "Unpin from taskbar" : "Pin to taskbar", () => {
            closeTaskbarContextMenu();
            toggleTaskbarPin(id);
        });

        if (isPinned) {
            const pinIndex = memory.pinnedTaskbar.indexOf(id);
            addSeparator();
            addItem("Move left", () => {
                const pins = memory.pinnedTaskbar;
                [pins[pinIndex - 1], pins[pinIndex]] = [pins[pinIndex], pins[pinIndex - 1]];
                saveMemory();
                closeTaskbarContextMenu();
                updateTaskbar();
            }, { disabled: pinIndex === 0 });
            addItem("Move right", () => {
                const pins = memory.pinnedTaskbar;
                [pins[pinIndex], pins[pinIndex + 1]] = [pins[pinIndex + 1], pins[pinIndex]];
                saveMemory();
                closeTaskbarContextMenu();
                updateTaskbar();
            }, { disabled: pinIndex === memory.pinnedTaskbar.length - 1 });
        }

        if (state.open) {
            addSeparator();
            addItem("Close window", () => {
                closeTaskbarContextMenu();
                closeWindow(id);
            });
        }
    }

    function openTaskbarContextMenu(button, event) {
        ensureTaskbarContextMenu();
        contextMenuTarget = button;
        const id = button.dataset.taskbarWindow;
        renderTaskbarContextMenu(id);
        taskbarContextMenu.hidden = false;
        let { clientX: x, clientY: y } = event;
        if (!x && !y) {
            const rect = button.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom;
        }
        positionTaskbarContextMenu(x, y);
        taskbarContextMenu.querySelector(".taskbar-context-menu-item:not(:disabled)")?.focus();
    }

    function attachTaskbarItemContextMenu(button) {
        let holdTimer = null;
        let activePointerId = null;
        let pressOrigin = null;
        let longPressOpened = false;
        let suppressClick = false;

        const clearHoldTimer = () => {
            if (holdTimer !== null) window.clearTimeout(holdTimer);
            holdTimer = null;
        };
        const markTouchMenuOpened = () => {
            longPressOpened = true;
            suppressClick = true;
        };

        button.addEventListener("pointerdown", event => {
            longPressOpened = false;
            suppressClick = false;
            if (event.pointerType !== "touch" || event.button !== 0) return;
            activePointerId = event.pointerId;
            pressOrigin = { x: event.clientX, y: event.clientY };
            holdTimer = window.setTimeout(() => {
                holdTimer = null;
                if (activePointerId !== event.pointerId) return;
                markTouchMenuOpened();
                openTaskbarContextMenu(button, {
                    clientX: pressOrigin.x,
                    clientY: pressOrigin.y
                });
            }, 650);
        });
        button.addEventListener("pointermove", event => {
            if (event.pointerId !== activePointerId || !pressOrigin) return;
            if (Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 12) {
                clearHoldTimer();
                activePointerId = null;
                pressOrigin = null;
            }
        });
        const releasePointer = event => {
            if (event.pointerId !== activePointerId) return;
            clearHoldTimer();
            activePointerId = null;
            pressOrigin = null;
        };
        button.addEventListener("pointerup", releasePointer);
        button.addEventListener("pointercancel", releasePointer);
        button.addEventListener("contextmenu", event => {
            event.preventDefault();
            const touchContext = event.pointerType === "touch" || activePointerId !== null;
            if (longPressOpened && taskbarContextMenu && !taskbarContextMenu.hidden) return;
            clearHoldTimer();
            if (touchContext) markTouchMenuOpened();
            openTaskbarContextMenu(button, event);
        });
        button.addEventListener("click", event => {
            if (!suppressClick) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            suppressClick = false;
            longPressOpened = false;
        }, true);
    }

    function updateTaskbar() {
        memory.pinnedTaskbar ??= [];
        windows.forEach(windowEl => {
            const id = windowEl.dataset.window;
            const state = getWindowMemory(id);
            const pinned = memory.pinnedTaskbar.includes(id);
            ensureWindowPinButton(windowEl);
            if ((state.open || pinned) && !memory.taskbarOrder.includes(id)) {
                memory.taskbarOrder.push(id);
            }
            const toggle = ensureTaskbarToggle(windowEl);
            const toggleVisible = state.open && !state.minimized && state.maximized
                && !windowEl.hidden && !windowEl.classList.contains("window-closing");
            if (toggle) {
                toggle.hidden = !toggleVisible;
                toggle.querySelector("input").checked = state.hideTaskbar
                    || temporaryTaskbarHiddenWindows.has(id);
            }
            let button = taskbarWindows.querySelector(`[data-taskbar-window="${id}"]`);

            if (!state.open && !pinned && button) {
                button.remove();
                button = null;
            }

            if ((state.open || pinned) && !button) {
                button = document.createElement("button");
                button.type = "button";
                button.className = "taskbar-window";
                button.dataset.taskbarWindow = id;
                button.setAttribute("aria-label", getWindowTitle(windowEl));

                const icon = document.createElement("img");
                const titleIcon = windowEl.querySelector(".title-icon");
                icon.src = titleIcon?.src || "";
                if (titleIcon?.dataset.seasonalIcon) {
                    icon.dataset.seasonalIcon = titleIcon.dataset.seasonalIcon;
                    icon.dataset.seasonalBaseSrc = titleIcon.dataset.seasonalBaseSrc
                        || titleIcon.getAttribute("src")
                        || "";
                }
                icon.alt = "";
                icon.setAttribute("aria-hidden", "true");
                const pinBadge = document.createElement("span");
                pinBadge.className = "taskbar-pin-badge";
                pinBadge.setAttribute("aria-hidden", "true");
                pinBadge.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M16 12V4l1-1V2H7v1l1 1v8l-2 2v1h5.5v6h1v-6H18v-1z"/></svg>';
                const label = document.createElement("span");
                label.className = "taskbar-window-label";
                label.textContent = getWindowTitle(windowEl);
                button.append(icon, label, pinBadge);
                attachTaskbarItemContextMenu(button);
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
                button.hidden = !state.open && !pinned;
                button.dataset.pinned = String(pinned);
                button.setAttribute("aria-label", pinned
                    ? `${getWindowTitle(windowEl)}, pinned to taskbar`
                    : getWindowTitle(windowEl));
                button.title = pinned
                    ? "Pinned to taskbar. Right-click or press and hold for options."
                    : "Right-click or press and hold for taskbar options.";
                button.classList.toggle(
                    "is-open",
                    state.open && !state.minimized && !windowEl.classList.contains("window-closing")
                );
                button.classList.toggle("is-focused", focusedWindow === windowEl && !state.minimized);
            }
        });

        ensureOverflowControls();
        const buttonsById = new Map(
            Array.from(taskbarWindows.querySelectorAll(".taskbar-window"))
                .map(button => [button.dataset.taskbarWindow, button])
        );
        const taskbarItemOrder = [
            ...memory.pinnedTaskbar,
            ...memory.taskbarOrder.filter(id => !memory.pinnedTaskbar.includes(id)
                && getWindowMemory(id).open)
        ];
        taskbarItemOrder.forEach(id => {
            const button = buttonsById.get(id);
            if (button && (getWindowMemory(id).open || memory.pinnedTaskbar.includes(id))) {
                taskbarWindows.append(button);
            }
        });
        const taskbarButtons = Array.from(taskbarWindows.querySelectorAll(".taskbar-window"))
            .filter(button => {
                const id = button.dataset.taskbarWindow;
                return getWindowMemory(id).open || memory.pinnedTaskbar.includes(id);
            });
        const firstOpenOnlyButton = taskbarButtons.find(button =>
            !memory.pinnedTaskbar.includes(button.dataset.taskbarWindow));
        taskbarButtons.forEach(button => {
            button.classList.toggle(
                "has-pinned-divider",
                memory.pinnedTaskbar.length > 0 && button === firstOpenOnlyButton
            );
        });
        taskbarButtons.forEach(button => { button.hidden = false; });
        taskbarWindows.append(overflowButton);
        overflowMenu.replaceChildren();

        const hasMaximizedWindow = windows.some(windowEl => {
            const state = getWindowMemory(windowEl.dataset.window);
            return state.open && !state.minimized && state.maximized;
        });
        const hidingTaskbar = windows.some(windowEl => {
            const state = getWindowMemory(windowEl.dataset.window);
            return state.open && !state.minimized && state.maximized
                && (state.hideTaskbar || temporaryTaskbarHiddenWindows.has(windowEl.dataset.window))
                && !windowEl.hidden;
        });
        taskbar.classList.toggle("taskbar-docked", hasMaximizedWindow);
        taskbar.classList.toggle("taskbar-hidden", hidingTaskbar);
        windows.forEach(windowEl => windowEl.classList.toggle(
            "taskbar-hidden-window",
            hidingTaskbar && getWindowMemory(windowEl.dataset.window).open
                && !getWindowMemory(windowEl.dataset.window).minimized
                && getWindowMemory(windowEl.dataset.window).maximized
        ));
        if (hidingTaskbar && overflowMenu) {
            overflowMenu.hidden = true;
            overflowButton.setAttribute("aria-expanded", "false");
        }

        const availableWidth = hidingTaskbar ? 0 : taskbarWindows.clientWidth;
        const gap = Number.parseFloat(getComputedStyle(taskbarWindows).columnGap) || 0;
        const overflowWidth = overflowButton.getBoundingClientRect().width || 56;
        let visibleCount = 0;
        let usedWidth = 0;
        const buttonWidths = taskbarButtons.map(button => {
            const style = getComputedStyle(button);
            const maxWidth = Number.parseFloat(style.maxWidth);
            const borderWidth = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
            const naturalWidth = button.scrollWidth + borderWidth;
            const dividerSpacing = button.classList.contains("has-pinned-divider") ? 10 : 0;
            return Math.min(naturalWidth, Number.isFinite(maxWidth) ? maxWidth : naturalWidth)
                + dividerSpacing;
        });
        for (let index = 0; index < taskbarButtons.length; index += 1) {
            const withGap = buttonWidths[index] + (visibleCount ? gap : 0);
            if (usedWidth + withGap <= availableWidth) {
                usedWidth += withGap;
                visibleCount += 1;
            } else {
                break;
            }
        }
        const needsOverflow = !hidingTaskbar && visibleCount < taskbarButtons.length;
        if (needsOverflow) {
            while (visibleCount > 0 && usedWidth + gap + overflowWidth > availableWidth) {
                usedWidth -= buttonWidths[visibleCount - 1];
                if (visibleCount > 1) usedWidth -= gap;
                visibleCount -= 1;
            }
        }
        let overflowDividerAdded = false;
        taskbarButtons.forEach((button, index) => {
            const inOverflow = index >= visibleCount;
            button.hidden = inOverflow;
            if (!inOverflow) return;
            const id = button.dataset.taskbarWindow;
            const windowEl = getWindow(id);
            if (!memory.pinnedTaskbar.includes(id) && memory.pinnedTaskbar.length > 0
                && !overflowDividerAdded) {
                const separator = document.createElement("div");
                separator.className = "taskbar-overflow-separator";
                separator.setAttribute("role", "separator");
                overflowMenu.append(separator);
                overflowDividerAdded = true;
            }
            const entry = document.createElement("button");
            entry.type = "button";
            entry.className = "taskbar-overflow-entry";
            entry.dataset.taskbarWindow = id;
            attachTaskbarItemContextMenu(entry);
            const icon = button.querySelector("img")?.cloneNode();
            if (icon) entry.append(icon);
            entry.append(document.createTextNode(getWindowTitle(windowEl)));
            if (memory.pinnedTaskbar.includes(id)) {
                entry.setAttribute("aria-label", `${getWindowTitle(windowEl)}, pinned to taskbar`);
            }
            entry.title = memory.pinnedTaskbar.includes(id)
                ? "Pinned to taskbar. Right-click or press and hold for options."
                : "Right-click or press and hold for taskbar options.";
            entry.addEventListener("click", () => {
                const state = getWindowMemory(id);
                if (!state.open || state.minimized || windowEl.hidden) openWindow(id);
                else focusWindow(windowEl);
                overflowMenu.hidden = true;
                overflowButton.setAttribute("aria-expanded", "false");
            });
            overflowMenu.append(entry);
        });
        overflowButton.hidden = !needsOverflow;
        if (!needsOverflow) {
            overflowMenu.hidden = true;
            overflowButton.setAttribute("aria-expanded", "false");
        } else if (!hidingTaskbar) {
            positionOverflowMenu();
        }
    }

    function focusWindow(windowEl) {
        if (!windowEl || windowEl.hidden) return;
        activationRevision += 1;
        const alreadyFocused = focusedWindow === windowEl && windowEl.classList.contains("is-focused");
        focusedWindow = windowEl;
        const id = windowEl.dataset.window;
        const currentOrder = Array.isArray(memory.windowOrder) ? memory.windowOrder : [];
        const orderChanged = currentOrder.at(-1) !== id;
        if (orderChanged) {
            memory.windowOrder = currentOrder.filter(windowId => windowId !== id);
            memory.windowOrder.push(id);
        }
        windowEl.dispatchEvent(new CustomEvent("windowfocus"));
        // Keep activation hooks (profile, setup, vault) without rebuilding the
        // taskbar or consuming another stacking layer for an ordinary content click.
        if (alreadyFocused && !orderChanged) return;
        windows.forEach(candidate => {
            const focused = candidate === windowEl;
            candidate.classList.toggle("is-focused", focused);
            if (focused) {
                candidate.style.zIndex = nextZIndex();
            }
        });
        if (orderChanged) saveMemory();
        updateTaskbar();
        updateWindowResourceStates();
    }

    function restoreFocusedWindow() {
        const visible = windows.filter(windowEl => {
            const state = getWindowMemory(windowEl.dataset.window);
            return state.open && !state.minimized && !windowEl.hidden;
        });
        const order = Array.isArray(memory.windowOrder) ? memory.windowOrder : [];
        const candidate = [...order].reverse()
            .map(id => visible.find(windowEl => windowEl.dataset.window === id))
            .find(Boolean) || visible.at(-1);
        if (candidate) focusWindow(candidate);
        else updateTaskbar();
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
        let frameSource = null;
        if (lazyFrame && !lazyFrame.hasAttribute("src")) {
            lazyFrame.dataset.resourceState = "suspended";
            const state = getWindowMemory(windowEl.dataset.window);
            const savedUrl = state.iframeUrl;
            try {
                if (state.iframePageState && state.iframePageState.href === savedUrl) {
                    lazyFrame.dataset.resourceRestore = JSON.stringify(state.iframePageState);
                } else {
                    delete lazyFrame.dataset.resourceRestore;
                }
            } catch {
                delete lazyFrame.dataset.resourceRestore;
            }
            let source = lazyFrame.dataset.src;
            if (typeof savedUrl === "string") {
                try {
                    const candidate = new URL(savedUrl, window.location.href);
                    if (candidate.origin === window.location.origin
                        && ["http:", "https:"].includes(candidate.protocol)) {
                        source = candidate.href;
                    }
                } catch {
                    // Ignore malformed saved URLs and use the window's default page.
                }
            }
            frameSource = source;
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
        windowEl.style.zIndex = String(nextZIndex());
        if (!getWindowMemory(windowEl.dataset.window).maximized) constrainWindowPosition(windowEl);
        const content = windowEl.querySelector(".setup-content");
        const scrollTop = getWindowMemory(windowEl.dataset.window).scrollTop;
        if (content) {
            window.requestAnimationFrame(() => {
                content.scrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
            });
        }
        if (lazyFrame && frameSource) {
            // Let the window become visible and paint before starting iframe
            // navigation; parsing a large embedded page can otherwise compete
            // with the open interaction on the same frame.
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                const state = getWindowMemory(windowEl.dataset.window);
                if (!state.open || state.minimized || windowEl.hidden
                    || windowEl.classList.contains("window-closing")
                    || lazyFrame.hasAttribute("src")) return;
                lazyFrame.setAttribute("src", frameSource);
            }));
        }
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

    function ensureTaskbarToggle(windowEl) {
        let label = windowEl.querySelector("[data-hide-taskbar]")?.closest("label");
        const titlebar = windowEl.querySelector(".setup-titlebar");
        if (!titlebar) return null;
        if (!label) {
            label = document.createElement("label");
            label.className = "maximize-taskbar-toggle";
            label.setAttribute("data-no-window-drag", "true");
            label.hidden = true;
            label.innerHTML = '<input type="checkbox" data-hide-taskbar><span>Hide taskbar</span>';
            titlebar.append(label);
            const input = label.querySelector("input");
            const id = windowEl.dataset.window;
            input.checked = getWindowMemory(id).hideTaskbar;
            input.addEventListener("change", () => {
                temporaryTaskbarHiddenWindows.delete(id);
                getWindowMemory(id).hideTaskbar = input.checked;
                saveMemory();
                updateTaskbar();
            });
        }

        if (windowEl.dataset.fixedMaximized === "true" && windowEl.dataset.iframeNavigation !== "false" && windowEl.querySelector("iframe")) {
            let controls = titlebar.querySelector(".iframe-window-controls");
            if (!controls) {
                windowEl.classList.add("has-iframe-navigation");
                controls = document.createElement("div");
                controls.className = "iframe-window-controls";
                controls.setAttribute("data-no-window-drag", "true");
                controls.hidden = true;
                titlebar.append(controls);
                controls.append(label);

                const navigation = document.createElement("div");
                navigation.className = "iframe-navigation-controls";
                navigation.setAttribute("role", "group");
                navigation.setAttribute("aria-label", "Page navigation");
                const frame = windowEl.querySelector("iframe");
                trackFrameNavigation(windowEl, frame);
                const actions = [
                    { action: "home", label: "Home", icon: "<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z\"/>" },
                    { action: "back", label: "Back", icon: "<path d=\"m14 5-7 7 7 7\"/><path d=\"M7 12h13\"/>" },
                    { action: "forward", label: "Next", icon: "<path d=\"m10 5 7 7-7 7\"/><path d=\"M4 12h13\"/>" }
                ];
                actions.forEach(({ action, label: actionLabel, icon }) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "iframe-navigation-button";
                    button.dataset.iframeNavigation = action;
                    button.setAttribute("aria-label", actionLabel);
                    button.title = actionLabel;
                    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon}</svg>`;
                    button.addEventListener("click", () => {
                        if (action === "home") {
                            if (frame?.dataset.src) frame.src = frame.dataset.src;
                            return;
                        }
                        try {
                            if (action === "back") frame?.contentWindow?.history.back();
                            else frame?.contentWindow?.history.forward();
                        } catch {
                            // Frame navigation is unavailable until the embedded page finishes loading.
                        }
                    });
                    navigation.append(button);
                });
                controls.append(navigation);
            }
        }
        return label;
    }

    function applyMaximizedStyles(windowEl, maximized) {
        windowEl.classList.toggle("is-maximized", maximized);
        windowEl.querySelector("[data-maximize-window]")?.setAttribute("aria-pressed", String(maximized));
        const hideTaskbar = ensureTaskbarToggle(windowEl);
        if (hideTaskbar) {
            hideTaskbar.hidden = !maximized;
            const navigationControls = hideTaskbar.closest(".iframe-window-controls");
            if (navigationControls) navigationControls.hidden = !maximized;
            const state = getWindowMemory(windowEl.dataset.window);
            if (!maximized) state.hideTaskbar = false;
            hideTaskbar.querySelector("input").checked = maximized
                && (state.hideTaskbar || temporaryTaskbarHiddenWindows.has(windowEl.dataset.window));
        }
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

    function canOpenWindow(id) {
        return (id !== "developer-vault" || memory.settings.developerVaultDiscovered === true)
            && (id !== "easter-eggs" || memory.settings.easterEggsUnlocked === true);
    }

    function cancelPendingWindowOpen(id) {
        const request = pendingWindowOpens.get(id);
        if (request) request.cancelled = true;
        pendingWindowOpens.delete(id);
    }

    function openWindow(id, size = {}, { focus = true } = {}) {
        if (!canOpenWindow(id)) return;
        const windowEl = getWindow(id);
        if (!windowEl) return;
        if (pendingWindowOpens.has(id)) {
            const pending = pendingWindowOpens.get(id);
            if (focus) {
                pending.focusRequested = true;
                pending.activation = ++activationRevision;
            }
            return pending.promise;
        }
        const windowMemory = getWindowMemory(id);
        const request = { cancelled: false, promise: null, focusRequested: focus,
            activation: focus ? ++activationRevision : activationRevision };
        const complete = focusContent => {
            // A close, minimize or discovery reset may happen while CSS is loading.
            if (request.cancelled || !canOpenWindow(id)) return false;
            const shouldFocus = request.focusRequested && request.activation === activationRevision;
            completeWindowOpen(windowEl, size, shouldFocus, request.focusRequested && !shouldFocus);
            if (shouldFocus && focusContent) {
                const target = windowEl.querySelector("iframe") || windowEl.querySelector("button, input, [tabindex]");
                target?.focus({ preventScroll: true });
            }
            return true;
        };
        const prepare = focusContent => {
            if (request.cancelled || !canOpenWindow(id)) return false;
            const ready = prepareWindowOpen(id);
            return ready && typeof ready.then === "function"
                ? ready.then(() => complete(focusContent))
                : complete(focusContent);
        };
        try {
            // Saved windows restore quietly; deliberate fresh launches can ask first.
            const confirmation = !windowMemory.open && focus ? confirmOpenWindow(id) : true;
            const result = confirmation && typeof confirmation.then === "function"
                ? confirmation.then(accepted => accepted ? prepare(true) : false)
                : confirmation === false ? false : prepare(false);
            if (!result || typeof result.then !== "function") return result;
            request.promise = result.catch(error => {
                if (!request.cancelled) onWindowOpenError(error, id);
                return false;
            }).finally(() => {
                if (pendingWindowOpens.get(id) === request) pendingWindowOpens.delete(id);
            });
            pendingWindowOpens.set(id, request);
            return request.promise;
        } catch (error) {
            onWindowOpenError(error, id);
            return false;
        }
    }

    async function restoreWindows(ids, beforeOpen = Promise.resolve()) {
        // Start every eligible request together, then commit windows in saved order.
        const [prepared] = await Promise.all([Promise.all(ids.map(async id => {
            if (!canOpenWindow(id) || !getWindow(id)) return false;
            try { await prepareWindowOpen(id); return true; }
            catch (error) { onWindowOpenError(error, id); return false; }
        })), beforeOpen]);
        for (let index = 0; index < ids.length; index++) {
            if (prepared[index]) await openWindow(ids[index], {}, { focus: false });
        }
    }

    function placeBehindFocusedWindow(windowEl) {
        if (!focusedWindow || focusedWindow === windowEl || focusedWindow.hidden) return;
        const ordered = windows.filter(candidate => !candidate.hidden && candidate !== windowEl)
            .sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
        ordered.splice(ordered.indexOf(focusedWindow), 0, windowEl);
        ordered.forEach((candidate, index) => { candidate.style.zIndex = String(111 + index); });
        zIndex = 110 + ordered.length;
        const order = (memory.windowOrder || []).filter(id => id !== windowEl.dataset.window);
        const index = order.indexOf(focusedWindow.dataset.window);
        order.splice(Math.max(0, index), 0, windowEl.dataset.window);
        memory.windowOrder = order;
        saveMemory();
    }

    function completeWindowOpen(windowEl, size, focus, background = false) {
        const id = windowEl.dataset.window;
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
            if (focus) focusWindow(windowEl);
            return;
        }
        prepareWindow(windowEl, size);
        animateWindowOpen(windowEl);
        windowMemory.open = true;
        windowMemory.minimized = false;
        if (!memory.taskbarOrder.includes(id)) memory.taskbarOrder.push(id);
        saveMemory();
        applyMaximizedStyles(windowEl, windowMemory.maximized);
        if (background) placeBehindFocusedWindow(windowEl);
        if (focus) focusWindow(windowEl);
        else updateTaskbar();
        if (id === "looking-glass") windowEl.dispatchEvent(new CustomEvent("windowopened"));
    }

    function openMilkyWayBarCrawl() {
        openWindow("mwbc");
    }

    function setTemporaryTaskbarHidden(id, enabled) {
        const windowEl = getWindow(id);
        if (!windowEl) return;
        const label = ensureTaskbarToggle(windowEl);
        const input = label?.querySelector("[data-hide-taskbar]");
        if (enabled) temporaryTaskbarHiddenWindows.add(id);
        else temporaryTaskbarHiddenWindows.delete(id);
        if (input) input.checked = enabled || getWindowMemory(id).hideTaskbar === true;
        updateTaskbar();
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
        unloadWindowFrame(windowEl);
        if (restoreSize) {
            windowEl.classList.remove("is-maximized");
            applyWindowSize(windowEl);
            restoreWindowPosition(windowEl);
        }
        saveMemory();
        updateTaskbar();
        updateWindowResourceStates();
    }

    function minimizeWindow(id) {
        cancelPendingWindowOpen(id);
        const windowEl = getWindow(id);
        if (!windowEl || windowEl.classList.contains("window-closing")) {
            return;
        }

        const state = getWindowMemory(id);
        const wasMaximized = state.maximized;
        const hideTaskbar = windowEl.querySelector("[data-hide-taskbar]");
        if (hideTaskbar) {
            hideTaskbar.closest("label").hidden = true;
        }
        state.minimized = true;
        if (focusedWindow === windowEl) {
            focusedWindow = null;
            windowEl.classList.remove("is-focused");
            focusMostRecentWindow(windowEl);
        }
        saveMemory();
        updateTaskbar();

        animateWindowClose(windowEl, () => {
            updateWindowResourceStates();
            if (wasMaximized) {
                windowEl.classList.remove("is-maximized");
                applyWindowSize(windowEl);
                restoreWindowPosition(windowEl);
            }
        });
        updateWindowResourceStates();
    }

    function closeWindow(id) {
        const windowEl = getWindow(id);
        if (!windowEl || windowEl.classList.contains("window-closing")) {
            return;
        }
        if (!canCloseWindow(id)) return;
        cancelPendingWindowOpen(id);
        windowEl.dispatchEvent(new CustomEvent("windowclosing"));
        const state = getWindowMemory(id);
        const wasMaximized = state.maximized;
        const hideTaskbar = windowEl.querySelector("[data-hide-taskbar]");
        if (hideTaskbar) {
            temporaryTaskbarHiddenWindows.delete(id);
            hideTaskbar.checked = state.hideTaskbar === true;
            hideTaskbar.closest("label").hidden = true;
        }
        state.maximized = false;
        state.minimized = false;
        state.open = false;
        if (!memory.pinnedTaskbar?.includes(id)) {
            memory.taskbarOrder = memory.taskbarOrder.filter(windowId => windowId !== id);
        }
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
        updateWindowResourceStates();
    }

    windows.forEach(windowEl => {
        ensureTaskbarToggle(windowEl);
        const content = windowEl.querySelector(".setup-content");
        if (!content) return;
        content.addEventListener("scroll", () => {
            getWindowMemory(windowEl.dataset.window).scrollTop = content.scrollTop;
            window.clearTimeout(scrollSaveTimer);
            scrollSaveTimer = window.setTimeout(() => {
                scrollSaveTimer = null;
                saveMemory();
            }, 200);
        }, { passive: true });
    });

    window.addEventListener("pagehide", () => {
        if (scrollSaveTimer === null) return;
        window.clearTimeout(scrollSaveTimer);
        scrollSaveTimer = null;
        saveMemory();
    });

    let boundsFrame = 0;
    let restorePreferredPositions = false;
    function refreshWindowBounds(restorePositions = false) {
        restorePreferredPositions ||= restorePositions;
        if (boundsFrame) return;
        boundsFrame = window.requestAnimationFrame(() => {
            boundsFrame = 0;
            windows.forEach(windowEl => {
                if (windowEl.hidden || windowEl.classList.contains("is-maximized") || windowEl.dataset.windowDragging) return;
                if (restorePreferredPositions) restoreWindowPosition(windowEl);
                else constrainWindowPosition(windowEl);
            });
            restorePreferredPositions = false;
        });
    }
    window.addEventListener("resize", () => {
        updateTaskbar();
        refreshWindowBounds(true);
    }, { passive: true });
    const taskbarBoundsObserver = new MutationObserver(() => refreshWindowBounds());
    taskbarBoundsObserver.observe(taskbar, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", updateWindowResourceStates);

    windows.forEach(windowEl => {
        const frame = windowEl.querySelector("iframe");
        if (frame) trackFrameNavigation(windowEl, frame);
    });
    updateWindowResourceStates();


    return {
        getWindowMemory, getWindow, openWindow, restoreWindows, openMilkyWayBarCrawl, setTemporaryTaskbarHidden, setMaximized, restoreFocusedWindow,
        closeWindow, minimizeWindow, focusWindow, updateTaskbar, applyWindowSize, restoreWindowPosition, constrainWindowPosition,
        refreshRestoredLayout() {
            windows.forEach(windowEl => {
                applyWindowSize(windowEl, {});
                restoreWindowPosition(windowEl);
                if (windowEl.classList.contains("is-maximized")) {
                    applyMaximizedStyles(windowEl, true);
                }
            });
            updateTaskbar();
        }
    };
}
