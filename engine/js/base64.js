// Flat character validation avoids a repeating group exhausting the RegExp stack
// on otherwise valid multi-megabyte Vault files.
export function isBase64(value) {
    if (typeof value !== "string" || value.length % 4 !== 0) return false;
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    return !/[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding));
}

export function binaryStringToBytes(binary) {
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

export function decodeBase64(value) {
    return binaryStringToBytes(atob(value));
}
