export function initWindowInteractions({ windows, memory, queueSave, closeStartMenu, windowManager }) {
    const { getWindowMemory, getWindow, openWindow, closeWindow, minimizeWindow, setMaximized, focusWindow, applyWindowSize, restoreWindowPosition, updateTaskbar } = windowManager;
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
                if (!dragging) return;

                dragging = false;
                document.body.style.userSelect = "";

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
        );
    });


}
