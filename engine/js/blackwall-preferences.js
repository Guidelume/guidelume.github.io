export const lockTimeouts = Object.freeze([5, 10, 15, 30, 60]);

export const defaultBlackwallPreferences = Object.freeze({
    autoLock: false,
    lockAfterMinutes: 15,
    warnBeforeLock: true,
    lockWhileReading: false,
    duplicateWarnings: true
});

export function normalizeBlackwallPreferences(value) {
    return Object.fromEntries(Object.entries(defaultBlackwallPreferences).map(([key, fallback]) => [
        key, key === "lockAfterMinutes"
            ? (lockTimeouts.includes(value?.[key]) ? value[key] : fallback)
            : (typeof value?.[key] === "boolean" ? value[key] : fallback)
    ]));
}
