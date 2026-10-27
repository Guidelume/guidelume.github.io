export function initWindowInteractions({ windows, queueSave, closeStartMenu, windowManager }) {
    const { getWindowMemory, getWindow, openWindow, closeWindow, setMaximized, focusWindow, updateTaskbar, constrainWindowPosition } = windowManager;
    /*
     * Open / close buttons
     */
    document
        .querySelectorAll("button[data-open-window]")
        .forEach(button => {
            button.addEventListener(
                "click",
                async () => {
                    const closeCurrent = button.dataset.closeCurrent;
                    if (closeCurrent) closeWindow(closeCurrent);
                    const targetWindow = getWindow(button.dataset.openWindow);
                    const opened = openWindow(button.dataset.openWindow, {
                        width: button.dataset.windowWidth,
                        height: button.dataset.windowHeight
                    });
                    if (button.dataset.closeStartMenu === "true") closeStartMenu();
                    await opened;
                    if (button.dataset.scrollTop === "true" && targetWindow) {
                        window.requestAnimationFrame(() => {
                            const content = targetWindow.querySelector(".setup-content");
                            if (!targetWindow.hidden && content) content.scrollTop = 0;
                        });
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
    let activeDrag = null;
    windows.forEach(windowEl => {
        const titlebar = windowEl.querySelector(".window-drag-handle");
        if (!titlebar) {
            return;
        }
        titlebar.addEventListener(
            "pointerdown",
            event => {
                if (activeDrag || !event.isPrimary || event.button !== 0 || event.target.closest("button, input, label, [data-no-window-drag]")) {
                    return;
                }
                windowEl.dataset.windowDragging = "true";
                focusWindow(windowEl);
                const rect = windowEl.getBoundingClientRect();
                let offsetX = event.clientX - rect.left;
                let offsetY = event.clientY - rect.top;

                if (windowEl.classList.contains("is-maximized")) {
                    const dragRatio = (event.clientX - rect.left) / rect.width;
                    setMaximized(windowEl, false);
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
                }

                /*
                 * Convert centered window
                 * into normal positioned window
                 */
                activeDrag = {
                    windowEl,
                    pointerId: event.pointerId,
                    offsetX,
                    offsetY
                };
                titlebar.setPointerCapture?.(event.pointerId);
                document.body.style.userSelect = "none";
                event.preventDefault();
            }
        );
    });

    window.addEventListener("pointermove", event => {
        if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
        activeDrag.windowEl.style.left = `${event.clientX - activeDrag.offsetX}px`;
        activeDrag.windowEl.style.top = `${event.clientY - activeDrag.offsetY}px`;
    });

    const finishDragging = event => {
        if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
        const { windowEl } = activeDrag;
        activeDrag = null;
        delete windowEl.dataset.windowDragging;
        document.body.style.userSelect = "";

        constrainWindowPosition(windowEl);
        const rect = windowEl.getBoundingClientRect();
        const windowMemory = getWindowMemory(windowEl.dataset.window);
        windowMemory.x = (rect.left + rect.width / 2) / window.innerWidth;
        windowMemory.y = (rect.top + rect.height / 2) / window.innerHeight;
        queueSave();
        updateTaskbar();
    };
    window.addEventListener("pointerup", finishDragging);
    window.addEventListener("pointercancel", finishDragging);
    windows.forEach(windowEl => {
        windowEl.querySelector(".window-drag-handle")?.addEventListener("lostpointercapture", finishDragging);
    });


}
