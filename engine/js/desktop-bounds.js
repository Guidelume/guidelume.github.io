const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(Math.max(minimum, maximum), value));

export function getDesktopBounds(surface = null) {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const bounds = { left: left + 8, top: top + 8,
        right: Math.min(window.innerWidth, left + (viewport?.width || window.innerWidth)) - 8,
        bottom: Math.min(window.innerHeight, top + (viewport?.height || window.innerHeight)) - 8 };
    if (surface) {
        const rect = surface.getBoundingClientRect();
        bounds.left = Math.max(bounds.left, rect.left + 8);
        bounds.top = Math.max(bounds.top, rect.top + 8);
        bounds.right = Math.min(bounds.right, rect.right - 8);
        bounds.bottom = Math.min(bounds.bottom, rect.bottom - 8);
    }
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

export function findAvailableIconPosition(rect, bounds, occupied, { gap = 0 } = {}) {
    const position = clampIconPosition(rect, bounds);
    const available = candidate => !occupied.some(other => gap > 0
        ? candidate.left < other.left + other.width + gap && candidate.left + rect.width + gap > other.left
            && candidate.top < other.top + other.height + gap && candidate.top + rect.height + gap > other.top
        : iconsOverlap({ ...candidate, width: rect.width, height: rect.height }, other));
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

export function clampWindowPosition(rect, bounds, titlebarHeight = 32) {
    // Let the sides overhang a little and the body extend below the taskbar.
    // Keep the titlebar reachable even when the pointer leaves this monitor.
    const sideOverflow = Math.min(160, rect.width / 4);
    const visibleTitlebar = Math.min(titlebarHeight, rect.height, bounds.bottom - bounds.top);
    return {
        left: clamp(rect.left, bounds.left - sideOverflow, bounds.right - rect.width + sideOverflow),
        top: clamp(rect.top, bounds.top, bounds.bottom - visibleTitlebar)
    };
}
