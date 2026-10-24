const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(Math.max(minimum, maximum), value));

export function getDesktopBounds() {
    const bounds = { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const taskbar = document.querySelector(".taskbar");
    if (taskbar && !taskbar.classList.contains("taskbar-hidden")) {
        const rect = taskbar.getBoundingClientRect();
        if (rect.width && rect.height) {
            if (taskbar.classList.contains("taskbar-top")) bounds.top = Math.max(bounds.top, rect.bottom + 8);
            else bounds.bottom = Math.min(bounds.bottom, rect.top - 8);
        }
    }
    bounds.right = Math.max(bounds.left, bounds.right);
    bounds.bottom = Math.max(bounds.top, bounds.bottom);
    return bounds;
}

export function clampIconPosition(rect, bounds) {
    return {
        left: clamp(rect.left, bounds.left, bounds.right - rect.width),
        top: clamp(rect.top, bounds.top, bounds.bottom - rect.height)
    };
}

export function iconsOverlap(rect, other) {
    const overlapX = Math.max(0, Math.min(rect.left + rect.width, other.left + other.width) - Math.max(rect.left, other.left));
    const overlapY = Math.max(0, Math.min(rect.top + rect.height, other.top + other.height) - Math.max(rect.top, other.top));
    return overlapX > Math.min(rect.width, other.width) * 0.25 && overlapY > Math.min(rect.height, other.height) * 0.25;
}

export function findAvailableIconPosition(rect, bounds, occupied) {
    const position = clampIconPosition(rect, bounds);
    const available = candidate => !occupied.some(other => iconsOverlap({ ...candidate, width: rect.width, height: rect.height }, other));
    if (available(position)) return position;

    const maxX = Math.max(bounds.left, bounds.right - rect.width);
    const maxY = Math.max(bounds.top, bounds.bottom - rect.height);
    const xs = [maxX];
    const ys = [maxY];
    for (let x = bounds.left; x <= maxX; x += rect.width + 8) xs.push(x);
    for (let y = bounds.top; y <= maxY; y += rect.height + 8) ys.push(y);
    let closest = position;
    let distance = Infinity;
    for (const left of xs) {
        for (const top of ys) {
            const candidateDistance = (left - position.left) ** 2 + (top - position.top) ** 2;
            if (candidateDistance < distance && available({ left, top })) {
                closest = { left, top };
                distance = candidateDistance;
            }
        }
    }
    return closest;
}

export function clampWindowPosition(rect, bounds, titlebarHeight) {
    // Allow horizontal overflow while retaining a usable part of the drag handle.
    // The window body may extend below the desktop; its titlebar must stay reachable.
    const visibleWidth = Math.min(72, rect.width, bounds.right - bounds.left);
    return {
        left: clamp(rect.left, bounds.left + visibleWidth - rect.width, bounds.right - visibleWidth),
        top: clamp(rect.top, bounds.top, bounds.bottom - titlebarHeight)
    };
}
