import { clampIconPosition, findAvailableIconPosition, getDesktopBounds, iconsOverlap } from "./desktop-bounds.js";

export function initDesktopIcons({ desktop, desktopIcons, memory, queueSave, openWindow }) {
    const draggingIcons = new Set();

    function constrainIconPosition(icon, bounds = getDesktopBounds(), candidate = null) {
        if (icon.hidden || !icon.getClientRects().length) return;
        const rect = icon.getBoundingClientRect();
        const desktopRect = desktop.getBoundingClientRect();
        const position = candidate || clampIconPosition(rect, bounds);
        icon.style.left = `${position.left - desktopRect.left + desktop.scrollLeft}px`;
        icon.style.top = `${position.top - desktopRect.top + desktop.scrollTop}px`;
        icon.style.right = "auto";
        icon.style.bottom = "auto";
    }
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
            // Resolve the saved proportions against the final desktop size.
            // Percentage styles can shift other icons while temporary overflow
            // creates or removes a scrollbar during boundary recovery.
            const rect = desktop.getBoundingClientRect();
            icon.style.left = `${x * rect.width}px`;
            icon.style.top = `${y * rect.height}px`;
        }
    }
    desktopIcons.forEach(icon => {
        loadIconPosition(icon);
        icon.setAttribute(
            "draggable",
            "false"
        );
        let dragging = false;
        let draggingPointerId = null;
        let moved = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;
        let previousPosition = null;
        icon.addEventListener(
            "pointerdown",
            event => {
                if (!event.isPrimary || event.button !== 0) {
                    return;
                }
                previousPosition = null;
                draggingPointerId = event.pointerId;
                icon.setPointerCapture?.(event.pointerId);
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
                icon.style.left = `${rect.left - desktopRect.left + desktop.scrollLeft}px`;
                icon.style.top = `${rect.top - desktopRect.top + desktop.scrollTop}px`;
                icon.style.right = "auto";
                icon.style.bottom = "auto";
                offsetX = event.clientX - rect.left;
                offsetY = event.clientY - rect.top;
                startX = event.clientX;
                startY = event.clientY;
                dragging = true;
                draggingIcons.add(icon);
                moved = false;
                event.preventDefault();
            }
        );
        window.addEventListener(
            "pointermove",
            event => {
                if (!dragging || event.pointerId !== draggingPointerId) {
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
                if (!moved) {
                    return;
                }
                const desktopRect = desktop.getBoundingClientRect();
                icon.style.left = `${event.clientX - desktopRect.left + desktop.scrollLeft - offsetX}px`;
                icon.style.top = `${event.clientY - desktopRect.top + desktop.scrollTop - offsetY}px`;
            }
        );
        window.addEventListener(
            "pointerup",
            event => {
                if (event.pointerId !== draggingPointerId) return;
                const shouldOpen = dragging && !moved;
                const didMove = dragging && moved;
                dragging = false;
                draggingIcons.delete(icon);
                draggingPointerId = null;

                if (didMove) {
                    constrainIconPosition(icon);
                    const desktopRect = desktop.getBoundingClientRect();
                    const rect = icon.getBoundingClientRect();
                    const overlapsAnotherIcon = desktopIcons.some(other => {
                        if (other === icon || other.hidden || other.getClientRects().length === 0 || getComputedStyle(other).visibility === "hidden") {
                            return false;
                        }
                        // Allow slight edge contact, but reject a placement where
                        // the icons would substantially occupy the same space.
                        return iconsOverlap(rect, other.getBoundingClientRect());
                    });

                    if (overlapsAnotherIcon && previousPosition) {
                        icon.style.left = previousPosition.left;
                        icon.style.top = previousPosition.top;
                        icon.style.right = previousPosition.right;
                        icon.style.bottom = previousPosition.bottom;
                    } else {
                        const rect = icon.getBoundingClientRect();
                        const id = icon.dataset.icon;
                        const position = {
                            x: (rect.left - desktopRect.left + desktop.scrollLeft) / desktopRect.width,
                            y: (rect.top - desktopRect.top + desktop.scrollTop) / desktopRect.height
                        };
                        memory.icons[id] = position;
                        icon.style.left = `${position.x * desktopRect.width}px`;
                        icon.style.top = `${position.y * desktopRect.height}px`;
                        icon.style.right = "auto";
                        icon.style.bottom = "auto";
                        queueSave();
                    }
                } else if (previousPosition) {
                    icon.style.left = previousPosition.left;
                    icon.style.top = previousPosition.top;
                    icon.style.right = previousPosition.right;
                    icon.style.bottom = previousPosition.bottom;
                }
                previousPosition = null;

                if (shouldOpen) {
                    const target = icon.dataset.openWindow;
                    if (target) openWindow(target);
                }
            }
        );
        icon.addEventListener("pointercancel", event => {
            if (event.pointerId !== draggingPointerId) return;
            dragging = false;
            draggingIcons.delete(icon);
            draggingPointerId = null;
            if (previousPosition) {
                icon.style.left = previousPosition.left;
                icon.style.top = previousPosition.top;
                icon.style.right = previousPosition.right;
                icon.style.bottom = previousPosition.bottom;
            }
            previousPosition = null;
        });
        icon.addEventListener("keydown", event => {
            if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                event.preventDefault();
                const target = icon.dataset.openWindow;
                if (target) openWindow(target);
            }
        });
    });

    function refreshRestoredPositions() {
        const bounds = getDesktopBounds();
        desktopIcons.forEach(icon => {
            if (draggingIcons.has(icon)) return;
            loadIconPosition(icon);
        });
        const occupied = [];
        const displaced = [];
        desktopIcons.forEach(icon => {
            if (icon.hidden || !icon.getClientRects().length) return;
            const rect = icon.getBoundingClientRect();
            const position = clampIconPosition(rect, bounds);
            if (!draggingIcons.has(icon) && (Math.abs(position.left - rect.left) > 0.5 || Math.abs(position.top - rect.top) > 0.5)) {
                displaced.push({ icon, rect });
            } else occupied.push(rect);
        });
        // Recover clipped icons into free space when possible, without changing
        // the preferred arrangement saved for a larger viewport.
        displaced.forEach(({ icon, rect }) => {
            const position = findAvailableIconPosition(rect, bounds, occupied);
            constrainIconPosition(icon, bounds, position);
            occupied.push({ ...position, width: rect.width, height: rect.height });
        });
    }
    refreshRestoredPositions();
    let boundsFrame = 0;
    function queueBoundsRefresh() {
        if (boundsFrame) return;
        boundsFrame = window.requestAnimationFrame(() => {
            boundsFrame = 0;
            refreshRestoredPositions();
        });
    }
    window.addEventListener("resize", queueBoundsRefresh, { passive: true });
    const taskbar = document.querySelector(".taskbar");
    if (taskbar) {
        new MutationObserver(queueBoundsRefresh).observe(taskbar, { attributes: true, attributeFilter: ["class"] });
    }
    const sizeObserver = new ResizeObserver(queueBoundsRefresh);
    [desktop, ...desktopIcons].forEach(node => sizeObserver.observe(node));

    return { refreshRestoredPositions };
}
