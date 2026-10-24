// Discovery codes share the existing Backup & Restore code entry point.
export const discoveryRegistry = Object.freeze([
    Object.freeze({
        id: "developer-vault", flag: "developerVaultDiscovered",
        code: "GUIDELUME-VAULT-1:WHEN-THE-LANTERN-WAKES"
    })
]);

export function findDiscovery(value) {
    return typeof value === "string" ? discoveryRegistry.find(entry => entry.code === value) : undefined;
}

export function discoveryFlagForIcon(id) {
    return id === "easter-eggs" ? "easterEggsUnlocked"
        : discoveryRegistry.find(entry => entry.id === id)?.flag;
}
