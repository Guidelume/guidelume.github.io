export function initDesktopIcons({ desktop, desktopIcons, memory, queueSave, openWindow }) {
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
        let previousPosition = null;
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
                previousPosition = {
                    left: icon.style.left,
                    top: icon.style.top,
                    right: icon.style.right,
                    bottom: icon.style.bottom
                };

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
                const didMove = dragging && moved && memory.settings.experience !== "reader";
                dragging = false;

                if (didMove) {
                    const desktopRect = desktop.getBoundingClientRect();
                    const rect = icon.getBoundingClientRect();
                    const overlapsAnotherIcon = desktopIcons.some(other => {
                        if (other === icon || other.hidden || getComputedStyle(other).visibility === "hidden") {
                            return false;
                        }
                        const otherRect = other.getBoundingClientRect();
                        const overlapX = Math.max(0, Math.min(rect.right, otherRect.right) - Math.max(rect.left, otherRect.left));
                        const overlapY = Math.max(0, Math.min(rect.bottom, otherRect.bottom) - Math.max(rect.top, otherRect.top));
                        const minimumWidth = Math.min(rect.width, otherRect.width);
                        const minimumHeight = Math.min(rect.height, otherRect.height);

                        // Allow slight edge contact, but reject a placement where
                        // the icons would substantially occupy the same space.
                        return overlapX > minimumWidth * 0.25 && overlapY > minimumHeight * 0.25;
                    });

                    if (overlapsAnotherIcon && previousPosition) {
                        icon.style.left = previousPosition.left;
                        icon.style.top = previousPosition.top;
                        icon.style.right = previousPosition.right;
                        icon.style.bottom = previousPosition.bottom;
                    } else {
                        const rect = icon.getBoundingClientRect();
                        const id = icon.dataset.icon;
                        memory.icons[id] = {
                            x: (rect.left - desktopRect.left) / desktopRect.width,
                            y: (rect.top - desktopRect.top) / desktopRect.height
                        };
                        queueSave();
                    }
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


}
