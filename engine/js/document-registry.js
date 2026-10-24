export const MAX_DOCUMENT_BYTES = 64 * 1024;

export const DOCUMENT_REGISTRY = Object.freeze([
    Object.freeze({
        id: "readme",
        title: "README",
        source: "./engine/readme.md",
        editable: false,
        format: "markdown",
        windowId: "readme"
    }),
    Object.freeze({
        id: "changelog",
        title: "CHANGELOG",
        source: "./engine/changelog.md",
        editable: false,
        format: "markdown",
        windowId: "changelog"
    }),
    Object.freeze({
        id: "progress-report-1",
        title: "Progress-Report-01",
        source: "./engine/progress-report-01.md",
        editable: true,
        format: "text",
        windowId: "progress-report-01"
    })
]);

const documentsById = new Map(DOCUMENT_REGISTRY.map(documentInfo => [documentInfo.id, documentInfo]));

function isRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function getDocumentTextError(value) {
    if (typeof value !== "string") return "Document content must be text.";
    if (value.length > MAX_DOCUMENT_BYTES) {
        return `Document content exceeds the ${MAX_DOCUMENT_BYTES / 1024} KiB saved-size limit.`;
    }
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
            const next = value.charCodeAt(index + 1);
            if (!(next >= 0xDC00 && next <= 0xDFFF)) return "Document content contains malformed text.";
            index += 1;
        } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
            return "Document content contains malformed text.";
        }
    }
    if (new TextEncoder().encode(value).length > MAX_DOCUMENT_BYTES) {
        return `Document content exceeds the ${MAX_DOCUMENT_BYTES / 1024} KiB saved-size limit.`;
    }
    return null;
}

export function normalizeDocumentOverrides(value) {
    if (!isRecord(value)) return {};
    const overrides = {};
    Object.entries(value).forEach(([id, override]) => {
        const documentInfo = documentsById.get(id);
        if (!documentInfo?.editable || !isRecord(override) || !Object.hasOwn(override, "content")) return;
        if (getDocumentTextError(override.content)) return;
        overrides[id] = { content: override.content };
    });
    return overrides;
}

export function validateDocumentOverrides(value) {
    if (!isRecord(value)) throw new Error("Documents must be an object of saved text overrides.");
    const overrides = {};
    Object.entries(value).forEach(([id, override]) => {
        const documentInfo = documentsById.get(id);
        if (!documentInfo?.editable) throw new Error("Documents contains an unknown or read-only document.");
        if (!isRecord(override) || Object.keys(override).some(key => key !== "content") || !Object.hasOwn(override, "content")) {
            throw new Error("A saved document entry is malformed.");
        }
        const contentError = getDocumentTextError(override.content);
        if (contentError) throw new Error(contentError);
        overrides[id] = { content: override.content };
    });
    return overrides;
}
