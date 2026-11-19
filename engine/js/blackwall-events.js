export const blackwallEventsKey = "guidelume_blackwall_events";
export const securityEventLimit = 8;

export function normalizeSecurityEvents(value) {
    if (!Array.isArray(value)) return [];
    const unique = new Map();
    for (const event of value.slice(0, securityEventLimit * 2)) {
        if (!event || typeof event.id !== "string" || !event.id.length || event.id.length > 100
            || !Number.isFinite(event.time) || event.time < 0 || event.time > 8.64e15
            || typeof event.message !== "string" || !event.message.length || event.message.length > 300) continue;
        if (!unique.has(event.id)) unique.set(event.id, { id: event.id, time: event.time, message: event.message });
    }
    return [...unique.values()].sort((left, right) => right.time - left.time
        || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0)).slice(0, securityEventLimit);
}

// A bounded per-tab cache survives reload; peer histories merge without replaying events.
export function initSecurityEventLog({ onChange = () => {}, createChannel = name => new BroadcastChannel(name),
    getGeneration = () => "initial",
    readCache = () => JSON.parse(sessionStorage.getItem(blackwallEventsKey)),
    writeCache = (entries, generation) => {
        if (window.guidelumeFullResetInProgress !== true) sessionStorage.setItem(blackwallEventsKey, JSON.stringify({ generation, events: entries }));
    },
    now = () => Date.now() } = {}) {
    const instance = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const listeners = new AbortController();
    let sequence = 0;
    let events = [];
    let channel;
    let destroyed = false;
    let generation = getGeneration();
    try {
        const cached = readCache();
        // Legacy array caches belong to the original, pre-reset generation.
        if ((cached?.generation || "initial") === generation) events = normalizeSecurityEvents(Array.isArray(cached) ? cached : cached?.events);
    } catch { /* Storage may be unavailable. */ }

    function snapshot() { return events.map(event => ({ ...event })); }
    function cache() {
        try { writeCache(snapshot(), generation); } catch { /* Live synchronization still works without storage. */ }
    }
    function refreshGeneration() {
        const current = getGeneration();
        if (current === generation) return false;
        generation = current;
        events = [];
        cache(); onChange(snapshot());
        return true;
    }
    function merge(incoming) {
        const next = normalizeSecurityEvents([...events, ...normalizeSecurityEvents(incoming)]);
        if (JSON.stringify(next) === JSON.stringify(events)) return;
        events = next;
        cache();
        onChange(snapshot());
    }
    function send(message) {
        try { channel?.postMessage({ ...message, sender: instance, generation }); } catch { /* Closing or unavailable channel. */ }
    }
    function connect() {
        if (destroyed || channel) return;
        refreshGeneration();
        try {
            channel = createChannel("guidelume-security-events-v1");
            channel.addEventListener("message", event => {
                const message = event.data;
                if (destroyed || !message || message.sender === instance || typeof message.sender !== "string") return;
                refreshGeneration();
                if ((message.generation || "initial") !== generation) return;
                if (message.type === "history-request") {
                    merge(message.events);
                    send({ type: "events", events: snapshot() });
                }
                else if (message.type === "events") merge(message.events);
            });
            send({ type: "history-request", events: snapshot() });
        } catch { channel?.close(); channel = null; }
    }
    function disconnect() { channel?.close(); channel = null; }
    window.addEventListener("pagehide", disconnect, { signal: listeners.signal });
    window.addEventListener("pageshow", connect, { signal: listeners.signal });
    const reconcile = () => {
        if (destroyed) return;
        refreshGeneration();
        send({ type: "history-request", events: snapshot() });
    };
    window.addEventListener("focus", reconcile, { signal: listeners.signal });
    cache();
    onChange(snapshot());
    connect();
    return {
        record(message) {
            if (destroyed) return;
            refreshGeneration();
            const event = { id: `${instance}:${String(++sequence).padStart(10, "0")}`, time: now(), message };
            const valid = normalizeSecurityEvents([event]);
            if (!valid.length) return;
            merge(valid);
            send({ type: "events", events: valid });
        },
        refreshGeneration() { refreshGeneration(); reconcile(); },
        destroy() { destroyed = true; listeners.abort(); disconnect(); }
    };
}
