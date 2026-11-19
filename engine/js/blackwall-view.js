export const blackwallViewKey = "guidelume_blackwall_view";
export const blackwallTabIds = Object.freeze(["blackwall-home", "blackwall-sessions", "blackwall-events"]);

export function normalizeBlackwallView(value) {
    return {
        activeTab: blackwallTabIds.includes(value?.activeTab) ? value.activeTab : blackwallTabIds[0],
        scrollPositions: Object.fromEntries(blackwallTabIds.map(id => [id,
            Number.isFinite(value?.scrollPositions?.[id]) ? Math.max(0, Math.min(100_000, value.scrollPositions[id])) : 0
        ]))
    };
}
