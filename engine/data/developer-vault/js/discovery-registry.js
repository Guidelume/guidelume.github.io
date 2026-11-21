// Discovery codes are accepted by Terminal's reusable unlock window.
export const discoveryRegistry = Object.freeze([
    Object.freeze({
        id: "developer-vault", flag: "developerVaultDiscovered", label: "Developer Vault",
        code: "GUIDELUME-VAULT-1:WHEN-THE-LANTERN-WAKES"
    }),
    Object.freeze({
        id: "looking-glass", flag: "lookingGlassDiscovered", label: "Looking Glass",
        code: "SELF-INDULGENT-FEATURE-01"
    })
]);

export function findDiscovery(value) {
    return typeof value === "string" ? discoveryRegistry.find(entry => entry.code === value) : undefined;
}

export function discoveryFlagForIcon(id) {
    return id === "easter-eggs" ? "easterEggsUnlocked"
        : discoveryRegistry.find(entry => entry.id === id)?.flag;
}
