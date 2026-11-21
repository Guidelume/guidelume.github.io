// Reading caches are data, including when they arrive inside an imported backup.
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const positions = new Set(["contentScrollTop", "pageScrollX", "pageScrollTop", "contentsScrollTop", "chaptersScrollTop", "windowScrollX", "windowScrollY"]);
const idLists = new Set(["openContentsSectionIds", "openPanelIds"]);
const ids = new Set(["activeAnchorId", "currentPanelId"]);
const keys = new Set(["href", "scrollPositions", ...positions, ...idLists, ...ids]);
const offset = value => Number.isFinite(value) && value >= 0 && value <= 100_000_000;
const identifier = value => typeof value === "string" && value.length <= 512;

export function validReadingState(value) {
    if (!object(value) || typeof value.href !== "string" || value.href.length > 8192 || Object.keys(value).some(key => !keys.has(key))) return false;
    for (const [key, child] of Object.entries(value)) {
        if (positions.has(key) && !offset(child)) return false;
        if (idLists.has(key) && (!Array.isArray(child) || child.length > 1024 || !child.every(identifier))) return false;
        if (ids.has(key) && child !== null && !identifier(child)) return false;
        if (key === "scrollPositions" && !validScrollPositions(child)) return false;
    }
    return true;
}
export function validScrollPositions(value) {
    return Array.isArray(value) && value.length <= 1024 && value.every(position => object(position)
        && Object.keys(position).every(key => ["selector", "top", "left"].includes(key))
        && typeof position.selector === "string" && position.selector.length > 0 && position.selector.length <= 2048
        && offset(position.top) && offset(position.left));
}
