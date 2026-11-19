// Probe / targeted acknowledgement only: no heartbeats or stale storage records.
export function initDuplicateSession({ enabled = () => true, notify, createChannel = name => new BroadcastChannel(name) }) {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let channel;
    let warned = false;
    let destroyed = false;
    const listeners = new AbortController();
    function connect(probe = false) {
        if (destroyed || channel) return;
        try {
            channel = createChannel("guidelume-workspace-sessions-v1");
            channel.addEventListener("message", event => {
                const message = event.data;
                if (message?.type === "probe" && typeof message.id === "string" && message.id !== id) {
                    try { channel.postMessage({ type: "present", target: message.id, id }); } catch { /* Closing tab. */ }
                } else if (message?.type === "present" && message.target === id && message.id !== id && !warned) {
                    warned = true;
                    if (enabled()) notify();
                }
            });
            if (probe) channel.postMessage({ type: "probe", id });
        } catch {
            channel?.close(); channel = null;
            // BroadcastChannel may be unavailable or denied. Multiple tabs still work.
        }
    }
    function disconnect() { channel?.close(); channel = null; }
    window.addEventListener("pagehide", disconnect, { signal: listeners.signal });
    window.addEventListener("pageshow", () => connect(), { signal: listeners.signal });
    connect(true);
    return { destroy() { destroyed = true; listeners.abort(); disconnect(); } };
}
