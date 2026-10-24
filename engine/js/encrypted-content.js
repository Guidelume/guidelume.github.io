import { decodeBase64, isBase64 } from "./base64.js";

const PAYLOAD_FORMAT = "guidelume-encrypted-file";
const PAYLOAD_VERSION = 1;
const CONTENT_FORMAT = "guidelume-file-content";
const CONTENT_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BITS = 128;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FOLDER_BUNDLE_BYTES = 16 * 1024 * 1024;
export const MAX_FOLDER_MANIFEST_BYTES = 23 * 1024 * 1024;
export const MAX_CIPHERTEXT_BYTES = 32 * 1024 * 1024;
export const MAX_ENCRYPTED_PAYLOAD_BYTES = 44 * 1024 * 1024;
const MAX_CIPHERTEXT_BASE64_LENGTH = Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4;
const FOLDER_BUNDLE_CONTENT_TYPE = "application/vnd.guidelume.folder+json";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class EncryptedContentError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "EncryptedContentError";
        this.code = code;
    }
}

function cryptoApi() {
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
        throw new EncryptedContentError("crypto-unavailable", "Web Crypto is unavailable. Open Guidelume from HTTPS or localhost.");
    }
    return globalThis.crypto;
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
    return isRecord(value) && Object.keys(value).length === expected.length
        && expected.every(key => Object.hasOwn(value, key));
}

function toBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(value, expectedLength) {
    if (typeof value !== "string" || value.length > MAX_CIPHERTEXT_BASE64_LENGTH
        || !isBase64(value)) {
        throw new EncryptedContentError("invalid-payload", "Invalid encrypted payload.");
    }
    let bytes;
    try { bytes = decodeBase64(value); } catch { throw new EncryptedContentError("invalid-payload", "Invalid encrypted payload."); }
    if (expectedLength !== undefined && bytes.length !== expectedLength) throw new EncryptedContentError("invalid-payload", "Invalid encrypted payload.");
    return bytes;
}

function validatePassword(password) {
    if (typeof password !== "string" || password.length < 1 || password.length > 1024) {
        throw new Error("Enter a passphrase of 1 to 1024 characters.");
    }
}

function validateFileMetadata(fileName, contentType, bytes) {
    const byteLimit = contentType === FOLDER_BUNDLE_CONTENT_TYPE ? MAX_FOLDER_MANIFEST_BYTES : MAX_FILE_BYTES;
    if (typeof fileName !== "string" || fileName.length < 1 || fileName.length > 255
        || fileName === "." || fileName === ".." || /[\\/\0]/.test(fileName)
        || typeof contentType !== "string" || contentType.length < 1 || contentType.length > 127
        || !/^[\w.+-]+\/[\w.+-]+(?:;[\w=.+-]+)*$/.test(contentType)
        || !(bytes instanceof Uint8Array) || bytes.byteLength > byteLimit) {
        const limit = contentType === FOLDER_BUNDLE_CONTENT_TYPE ? "23 MiB folder manifest" : "8 MiB file";
        throw new EncryptedContentError("invalid-content", `Invalid file metadata or content exceeds the ${limit} limit.`);
    }
}

function deriveAesKey(password, salt, usages) {
    const api = cryptoApi();
    const passwordBytes = encoder.encode(password);
    return api.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"])
        .then(material => api.subtle.deriveKey(
            { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
            material, { name: "AES-GCM", length: 256 }, false, usages
        ))
        .finally(() => passwordBytes.fill(0));
}

export async function encryptFileBytes({ fileName, contentType, bytes }, password) {
    validatePassword(password);
    validateFileMetadata(fileName, contentType, bytes);
    const api = cryptoApi();
    const salt = api.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = api.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveAesKey(password, salt, ["encrypt"]);
    const content = encoder.encode(JSON.stringify({
        format: CONTENT_FORMAT,
        version: CONTENT_VERSION,
        fileName,
        contentType,
        data: toBase64(bytes)
    }));
    let encrypted;
    try {
        if (content.byteLength + TAG_BITS / 8 > MAX_CIPHERTEXT_BYTES) throw new EncryptedContentError("invalid-content", "Encrypted content exceeds the payload size limit.");
        encrypted = await api.subtle.encrypt({ name: "AES-GCM", iv, tagLength: TAG_BITS }, key, content);
    } finally {
        content.fill(0);
    }
    return {
        format: PAYLOAD_FORMAT,
        version: PAYLOAD_VERSION,
        kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
        cipher: { name: "AES-GCM", iv: toBase64(iv), tagLength: TAG_BITS },
        ciphertext: toBase64(new Uint8Array(encrypted))
    };
}

export async function decryptEncryptedFile(payload, password) {
    validatePassword(password);
    if (!isRecord(payload) || !exactKeys(payload, ["format", "version", "kdf", "cipher", "ciphertext"])
        || payload.format !== PAYLOAD_FORMAT || payload.version !== PAYLOAD_VERSION
        || !exactKeys(payload.kdf, ["name", "hash", "iterations", "salt"])
        || payload.kdf.name !== "PBKDF2" || payload.kdf.hash !== "SHA-256"
        || payload.kdf.iterations !== PBKDF2_ITERATIONS
        || !exactKeys(payload.cipher, ["name", "iv", "tagLength"])
        || payload.cipher.name !== "AES-GCM" || payload.cipher.tagLength !== TAG_BITS
        || typeof payload.ciphertext !== "string" || payload.ciphertext.length > MAX_CIPHERTEXT_BASE64_LENGTH) {
        throw new EncryptedContentError("invalid-payload", "Unsupported or invalid encrypted payload.");
    }
    const salt = fromBase64(payload.kdf.salt, SALT_BYTES);
    const iv = fromBase64(payload.cipher.iv, IV_BYTES);
    const ciphertext = fromBase64(payload.ciphertext);
    if (ciphertext.byteLength < 17 || ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) throw new EncryptedContentError("invalid-payload", "Invalid encrypted payload.");
    const key = await deriveAesKey(password, salt, ["decrypt"]);
    let plaintext;
    try {
        plaintext = await cryptoApi().subtle.decrypt({ name: "AES-GCM", iv, tagLength: TAG_BITS }, key, ciphertext);
    } catch {
        throw new EncryptedContentError("authentication-failed", "Encrypted payload could not be authenticated.");
    }
    if (plaintext.byteLength > MAX_CIPHERTEXT_BYTES) throw new EncryptedContentError("invalid-content", "Invalid encrypted content.");
    let content;
    try { content = JSON.parse(decoder.decode(plaintext)); } catch { throw new EncryptedContentError("invalid-content", "Invalid encrypted content."); }
    finally { new Uint8Array(plaintext).fill(0); }
    if (!exactKeys(content, ["format", "version", "fileName", "contentType", "data"])
        || content.format !== CONTENT_FORMAT || content.version !== CONTENT_VERSION
        || typeof content.fileName !== "string" || typeof content.contentType !== "string") {
        throw new EncryptedContentError("invalid-content", "Invalid encrypted file metadata.");
    }
    const bytes = fromBase64(content.data);
    validateFileMetadata(content.fileName, content.contentType, bytes);
    return { fileName: content.fileName, contentType: content.contentType, bytes };
}

export const encryptedContentInfo = Object.freeze({
    payloadFormat: PAYLOAD_FORMAT,
    payloadVersion: PAYLOAD_VERSION,
    pbkdf2Iterations: PBKDF2_ITERATIONS,
    maxFileBytes: MAX_FILE_BYTES,
    maxFolderBundleBytes: MAX_FOLDER_BUNDLE_BYTES,
    maxEncryptedPayloadBytes: MAX_ENCRYPTED_PAYLOAD_BYTES
});
