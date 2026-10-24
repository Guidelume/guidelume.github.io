import {
    decryptEncryptedFile,
    EncryptedContentError,
    MAX_ENCRYPTED_PAYLOAD_BYTES
} from "./encrypted-content.js";

const DEFAULT_REGISTRY_URL = "./engine/encrypted/registry.json";
const REGISTRY_FORMAT = "guidelume-encrypted-content-registry";
const REGISTRY_VERSION = 1;
const MAX_REGISTRY_BYTES = 64 * 1024;
const MAX_REGISTRY_ENTRIES = 32;
const MAX_CACHED_PAYLOAD_TEXT_BYTES = 64 * 1024 * 1024;
const registryDecoder = new TextDecoder("utf-8", { fatal: true });

export class EncryptedRegistryError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "EncryptedRegistryError";
        this.code = code;
    }
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePayloadPath(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 512
        && !value.startsWith("/") && !value.includes("\\") && !/[?#\0]/.test(value)
        && !/^[a-z][a-z0-9+.-]*:/i.test(value)
        && value.split("/").every(segment => segment && segment !== "." && segment !== "..");
}

function resolveRegistryUrl(registryUrl) {
    try {
        return globalThis.location?.href
            ? new URL(registryUrl, globalThis.location.href)
            : new URL(registryUrl);
    } catch {
        throw new EncryptedRegistryError("invalid-registry", "A relative encrypted content registry requires a page URL.");
    }
}

export function validateEncryptedContentRegistry(value, registryUrl = DEFAULT_REGISTRY_URL) {
    if (!isRecord(value) || Object.keys(value).length !== 3
        || value.format !== REGISTRY_FORMAT || value.version !== REGISTRY_VERSION
        || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > MAX_REGISTRY_ENTRIES) {
        throw new EncryptedRegistryError("invalid-registry", "Encrypted content registry is invalid.");
    }
    const base = new URL("./", resolveRegistryUrl(registryUrl));
    const ids = new Set();
    const entries = [];
    for (const entry of value.entries) {
        if (!isRecord(entry) || Object.keys(entry).length !== 3
            || typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.id)
            || !safeRelativePayloadPath(entry.payload)
            || !["auto", "document", "folder"].includes(entry.presentation)
            || ids.has(entry.id)) continue;
        let payloadUrl;
        try { payloadUrl = new URL(entry.payload, base); }
        catch { continue; }
        if (payloadUrl.origin !== base.origin || !payloadUrl.pathname.startsWith(base.pathname)) {
            continue;
        }
        ids.add(entry.id);
        entries.push(Object.freeze({ id: entry.id, payload: payloadUrl.href, presentation: entry.presentation }));
    }
    if (entries.length === 0) {
        throw new EncryptedRegistryError("invalid-registry", "Encrypted content registry has no valid entries.");
    }
    return Object.freeze(entries);
}

async function readLimitedText(response, maxBytes) {
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        try { await response.body?.cancel?.(); } catch { /* The size limit is still the useful error. */ }
        throw new EncryptedRegistryError("invalid-payload", "Encrypted content exceeds the supported size limit.");
    }

    if (!response.body?.getReader) {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (buffer.byteLength > maxBytes) {
            bytes.fill(0);
            throw new EncryptedRegistryError("invalid-payload", "Encrypted content exceeds the supported size limit.");
        }
        try { return registryDecoder.decode(bytes); }
        catch { throw new EncryptedRegistryError("invalid-payload", "Encrypted content is not valid UTF-8."); }
        finally { bytes.fill(0); }
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    let combined;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                try { await reader.cancel(); } catch { /* Preserve the size-limit error. */ }
                throw new EncryptedRegistryError("invalid-payload", "Encrypted content exceeds the supported size limit.");
            }
            chunks.push(value);
        }
        combined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.byteLength;
        }
        try { return registryDecoder.decode(combined); }
        catch { throw new EncryptedRegistryError("invalid-payload", "Encrypted content is not valid UTF-8."); }
    } finally {
        combined?.fill(0);
        chunks.forEach(chunk => chunk.fill(0));
        reader.releaseLock?.();
    }
}

function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function classifyDecryptFailure(error) {
    if (error instanceof EncryptedContentError) {
        if (error.code === "authentication-failed") return "authentication-failed";
        if (error.code === "crypto-unavailable") return "crypto-unavailable";
        return "invalid";
    }
    return "authentication-failed";
}

export function createEncryptedContentUnlocker({
    registryUrl = DEFAULT_REGISTRY_URL,
    fetcher = (...args) => fetch(...args)
} = {}) {
    let registryPromise = null;
    const payloadCache = new Map();
    let cachedPayloadTextBytes = 0;

    function cachePayload(id, serialized) {
        // JSON payloads are mostly ASCII, but count two bytes per character to
        // budget conservatively for their retained JavaScript string storage.
        const estimatedBytes = serialized.length * 2;
        const existing = payloadCache.get(id);
        if (existing) {
            cachedPayloadTextBytes -= existing.estimatedBytes;
            payloadCache.delete(id);
        }
        if (estimatedBytes > MAX_CACHED_PAYLOAD_TEXT_BYTES) return;

        while (cachedPayloadTextBytes + estimatedBytes > MAX_CACHED_PAYLOAD_TEXT_BYTES) {
            const oldest = payloadCache.entries().next().value;
            if (!oldest) break;
            const [oldestId, cached] = oldest;
            payloadCache.delete(oldestId);
            cachedPayloadTextBytes -= cached.estimatedBytes;
        }

        // Keep only serialized JSON in the cache. Parsed object graphs can be
        // several times larger than their source text and are hard to budget.
        payloadCache.set(id, { serialized, estimatedBytes });
        cachedPayloadTextBytes += estimatedBytes;
    }

    async function getRegistry(signal) {
        if (!registryPromise) {
            const resolvedRegistryUrl = resolveRegistryUrl(registryUrl);
            registryPromise = (async () => {
                let response;
                try {
                    response = await fetcher(resolvedRegistryUrl.href, {
                        cache: "no-store", credentials: "same-origin", signal
                    });
                } catch (error) {
                    if (error?.name === "AbortError") throw error;
                    throw new EncryptedRegistryError("registry-unavailable", error.message || "Encrypted content registry is unavailable.");
                }
                if (!response.ok) throw new EncryptedRegistryError("registry-unavailable", "Encrypted content registry is unavailable.");
                const serialized = await readLimitedText(response, MAX_REGISTRY_BYTES);
                let parsed;
                try { parsed = JSON.parse(serialized); }
                catch { throw new EncryptedRegistryError("invalid-registry", "Encrypted content registry is invalid."); }
                return validateEncryptedContentRegistry(parsed, resolvedRegistryUrl.href);
            })();
        }
        try { return await registryPromise; }
        catch (error) {
            registryPromise = null;
            throw error;
        }
    }

    async function getPayload(entry, signal) {
        const cached = payloadCache.get(entry.id);
        if (cached) {
            // Refresh the entry's position so recently used payloads stay cached.
            payloadCache.delete(entry.id);
            payloadCache.set(entry.id, cached);
            try { return JSON.parse(cached.serialized); }
            catch {
                cachedPayloadTextBytes -= cached.estimatedBytes;
                payloadCache.delete(entry.id);
            }
        }
        let response;
        try {
            response = await fetcher(entry.payload, {
                cache: "no-store", credentials: "same-origin", signal
            });
        } catch (error) {
            throw new EncryptedRegistryError("payload-unavailable", error.message || "Encrypted payload is unavailable.");
        }
        if (!response.ok) throw new EncryptedRegistryError("payload-unavailable", "Encrypted payload is unavailable.");
        const serialized = await readLimitedText(response, MAX_ENCRYPTED_PAYLOAD_BYTES);
        let payload;
        try { payload = JSON.parse(serialized); }
        catch { throw new EncryptedRegistryError("invalid-payload", "Encrypted payload is malformed."); }
        cachePayload(entry.id, serialized);
        return payload;
    }

    async function unlock(password, { signal, onProgress } = {}) {
        const entries = await getRegistry(signal);
        const matches = [];
        const diagnostics = [];
        const report = update => {
            try { onProgress?.(update); } catch { /* A status callback must not interrupt unlocking. */ }
        };

        for (let index = 0; index < entries.length; index += 1) {
            if (signal?.aborted) break;
            const entry = entries[index];
            report({ index: index + 1, total: entries.length, id: entry.id, state: "checking" });
            await yieldToBrowser();
            if (signal?.aborted) break;

            try {
                const payload = await getPayload(entry, signal);
                const file = await decryptEncryptedFile(payload, password);
                matches.push({ id: entry.id, presentation: entry.presentation, file });
                diagnostics.push({ id: entry.id, state: "matched" });
            } catch (error) {
                if (signal?.aborted || error?.name === "AbortError") break;
                const state = error instanceof EncryptedRegistryError
                    ? error.code
                    : classifyDecryptFailure(error);
                diagnostics.push({ id: entry.id, state });
            }
            report({ index: index + 1, total: entries.length, id: entry.id, state: diagnostics.at(-1).state });
        }
        return { matches, diagnostics, aborted: signal?.aborted === true };
    }

    return Object.freeze({ unlock, clearCache() {
        payloadCache.clear();
        cachedPayloadTextBytes = 0;
        registryPromise = null;
    } });
}
