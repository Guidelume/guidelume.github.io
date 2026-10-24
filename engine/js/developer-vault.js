import {
    MAX_FILE_BYTES,
    MAX_FOLDER_BUNDLE_BYTES
} from "./encrypted-content.js";
import { createEncryptedContentUnlocker } from "./encrypted-content-registry.js";
import { decodeBase64, isBase64 } from "./base64.js";

/*
 * Special thanks to some bullshit I found on Google and Stackoverflow to make this work.
 * I hope anyway.
 */

const VAULT_BUNDLE_FORMAT = "guidelume-vault-folder";
const VAULT_BUNDLE_VERSION = 1;
const VAULT_BUNDLE_CONTENT_TYPE = "application/vnd.guidelume.folder+json";
const SUPPORTED_TEXT_TYPES = new Set(["text/plain", "text/markdown"]);
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const SUPPORTED_AUDIO_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/aac"]);

function base64ByteLength(value) {
    if (!value.length) return 0;
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    return Math.floor(value.length * 3 / 4) - padding;
}

function isSafeName(name) {
    return typeof name === "string" && name.length > 0 && name.length <= 255
        && name !== "." && name !== ".." && !/[\\/\0]/.test(name);
}

export function parseDeveloperVaultBundle(serialized) {
    let bundle;
    try { bundle = JSON.parse(serialized); } catch { throw new Error("Invalid folder bundle."); }
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)
        || bundle.format !== VAULT_BUNDLE_FORMAT || bundle.version !== VAULT_BUNDLE_VERSION
        || !isSafeName(bundle.name) || !Array.isArray(bundle.entries)) {
        throw new Error("Invalid folder bundle.");
    }
    let entryCount = 0;
    let totalBytes = 0;
    function validateEntries(entries, depth) {
        if (depth > 12 || entries.length > 512) throw new Error("Folder bundle is too large to display.");
        for (const entry of entries) {
            entryCount += 1;
            if (entryCount > 512 || !entry || typeof entry !== "object" || Array.isArray(entry) || !isSafeName(entry.name)) {
                throw new Error("Invalid folder bundle entry.");
            }
            if (entry.type === "folder") {
                if (!Array.isArray(entry.entries)) throw new Error("Invalid folder bundle entry.");
                validateEntries(entry.entries, depth + 1);
            } else if (entry.type === "file") {
                if (typeof entry.contentType !== "string" || entry.contentType.length > 127
                    || !isBase64(entry.data)) {
                    throw new Error("Invalid folder bundle entry.");
                }
                const bytes = base64ByteLength(entry.data);
                if (bytes > MAX_FILE_BYTES) throw new Error("A folder item exceeds the 8 MiB per-file limit.");
                totalBytes += bytes;
                if (totalBytes > MAX_FOLDER_BUNDLE_BYTES) throw new Error("Folder contents exceed the 16 MiB bundle limit.");
            } else {
                throw new Error("Invalid folder bundle entry.");
            }
        }
    }
    validateEntries(bundle.entries, 0);
    return bundle;
}

function decodeTextBytes(bytes) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    finally { bytes.fill(0); }
}

function renderMarkdown(target, markdown) {
    target.replaceChildren();
    let paragraph = [];
    let list = null;
    let codeLines = null;

    const appendParagraph = () => {
        if (!paragraph.length) return;
        const element = document.createElement("p");
        element.textContent = paragraph.join(" ");
        target.append(element);
        paragraph = [];
    };
    const endList = () => { list = null; };

    markdown.replace(/\r\n?/g, "\n").split("\n").forEach(line => {
        if (line.trimStart().startsWith("```")) {
            appendParagraph();
            endList();
            if (codeLines) {
                const pre = document.createElement("pre");
                const code = document.createElement("code");
                code.textContent = codeLines.join("\n");
                pre.append(code);
                target.append(pre);
                codeLines = null;
            } else {
                codeLines = [];
            }
            return;
        }
        if (codeLines) {
            codeLines.push(line);
            return;
        }
        const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (heading) {
            appendParagraph();
            endList();
            const element = document.createElement(`h${heading[1].length}`);
            element.textContent = heading[2];
            target.append(element);
            return;
        }
        const item = line.match(/^\s*(?:[-*+]\s+|\d+\.\s+)(.+)$/);
        if (item) {
            appendParagraph();
            const ordered = /^\s*\d+\./.test(line);
            const tagName = ordered ? "OL" : "UL";
            if (!list || list.tagName !== tagName) {
                list = document.createElement(ordered ? "ol" : "ul");
                target.append(list);
            }
            const listItem = document.createElement("li");
            listItem.textContent = item[1];
            list.append(listItem);
            return;
        }
        if (!line.trim()) {
            appendParagraph();
            endList();
        } else {
            endList();
            paragraph.push(line.trim());
        }
    });
    if (codeLines) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = codeLines.join("\n");
        pre.append(code);
        target.append(pre);
    }
    appendParagraph();
}

function getContentKind(contentType) {
    if (SUPPORTED_TEXT_TYPES.has(contentType)) return "text";
    if (SUPPORTED_IMAGE_TYPES.has(contentType)) return "image";
    if (SUPPORTED_AUDIO_TYPES.has(contentType)) return "audio";
    return "unsupported";
}

function prepareMatch(match) {
    const { file, presentation } = match;
    if (file.contentType === VAULT_BUNDLE_CONTENT_TYPE) {
        if (presentation === "document") throw new Error("Registry presentation does not match the encrypted payload.");
        try {
            const bundleText = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
            return { id: match.id, kind: "folder", root: parseDeveloperVaultBundle(bundleText) };
        } finally {
            file.bytes.fill(0);
        }
    }
    if (presentation === "folder") {
        file.bytes.fill(0);
        throw new Error("Registry presentation does not match the encrypted payload.");
    }
    let text = null;
    if (SUPPORTED_TEXT_TYPES.has(file.contentType)) {
        text = decodeTextBytes(file.bytes);
        file.bytes = null;
    }
    const kind = getContentKind(file.contentType);
    if (kind === "unsupported") {
        file.bytes.fill(0);
        file.bytes = null;
    }
    return {
        id: match.id,
        kind,
        name: file.fileName,
        contentType: file.contentType,
        bytes: file.bytes,
        text
    };
}

function matchLabel(match) {
    if (match.kind === "folder") return { name: match.root.name, detail: "Folder" };
    const detail = match.kind === "text" ? "Document"
        : match.kind === "image" ? "Image"
            : match.kind === "audio" ? "Audio" : "Encrypted file";
    return { name: match.name, detail };
}

export function initDeveloperVault({ windowElement }) {
    if (!windowElement) return { lock() {}, clearCache() {} };
    const lockedView = windowElement.querySelector("[data-vault-locked-view]");
    const unlockedView = windowElement.querySelector("[data-vault-unlocked-view]");
    const form = windowElement.querySelector("[data-vault-unlock-form]");
    const passwordInput = windowElement.querySelector("[data-vault-password]");
    const unlockButton = windowElement.querySelector("[data-vault-unlock-button]");
    const additionalUnlockButton = windowElement.querySelector("[data-vault-add-unlock]");
    const additionalUnlockSlot = windowElement.querySelector("[data-vault-additional-unlock-slot]");
    const additionalUnlockCancel = windowElement.querySelector("[data-vault-cancel-additional]");
    const sessionStatus = windowElement.querySelector("[data-vault-session-status]");
    const lockButton = windowElement.querySelector("[data-vault-lock]");
    const status = windowElement.querySelector("[data-vault-status]");
    const destinationView = windowElement.querySelector("[data-vault-destination-view]");
    const destinations = windowElement.querySelector("[data-vault-destinations]");
    const folderView = windowElement.querySelector("[data-vault-folder-view]");
    const folderList = windowElement.querySelector("[data-vault-folder-list]");
    const folderPath = windowElement.querySelector("[data-vault-folder-path]");
    const folderStatus = windowElement.querySelector("[data-vault-folder-status]");
    const upButton = windowElement.querySelector("[data-vault-up]");
    const fileView = windowElement.querySelector("[data-vault-file-view]");
    const fileName = windowElement.querySelector("[data-vault-file-name]");
    const fileStatus = windowElement.querySelector("[data-vault-file-status]");
    const fileBackButton = windowElement.querySelector("[data-vault-file-back]");
    const documentView = windowElement.querySelector("[data-vault-document]");
    const mediaView = windowElement.querySelector("[data-vault-media]");
    if (!lockedView || !unlockedView || !form || !passwordInput || !unlockButton || !additionalUnlockButton
        || !additionalUnlockSlot || !additionalUnlockCancel || !sessionStatus || !status
        || !destinationView || !destinations || !folderView || !folderList || !folderPath || !folderStatus || !upButton
        || !fileView || !fileName || !fileStatus || !fileBackButton || !documentView || !mediaView) {
        return { lock() {}, clearCache() {} };
    }

    const formHome = form.parentNode;
    const formHomePlaceholder = document.createComment("Vault unlock form home");
    formHome.insertBefore(formHomePlaceholder, form);

    const unlocker = createEncryptedContentUnlocker();
    let attemptId = 0;
    let unlocking = false;
    let activeFetchController = null;
    let matches = [];
    let currentMatch = null;
    let currentItem = null;
    let currentPath = [];
    let returnToFolder = false;
    let activeObjectUrl = null;
    let activeAudio = null;

    function releaseMedia() {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.removeAttribute("src");
            activeAudio.load();
            activeAudio = null;
        }
        if (activeObjectUrl) {
            URL.revokeObjectURL(activeObjectUrl);
            activeObjectUrl = null;
        }
        mediaView.replaceChildren();
    }

    function clearFileView() {
        releaseMedia();
        documentView.replaceChildren();
        documentView.hidden = false;
        mediaView.hidden = true;
        fileName.textContent = "";
        fileStatus.textContent = "";
        fileBackButton.hidden = true;
        fileView.hidden = true;
        currentItem = null;
    }

    function clearVisibleContent() {
        destinations.replaceChildren();
        destinationView.hidden = true;
        folderList.replaceChildren();
        folderPath.textContent = "";
        folderStatus.textContent = "";
        folderView.hidden = true;
        clearFileView();
    }

    function closeAdditionalUnlock() {
        additionalUnlockSlot.hidden = true;
        additionalUnlockCancel.hidden = true;
        additionalUnlockButton.hidden = unlockedView.hidden;
        passwordInput.value = "";
        passwordInput.disabled = false;
        unlockButton.disabled = false;
        status.textContent = "";
        if (!unlockedView.hidden && matches.length > 0) {
            sessionStatus.textContent = `${matches.length} ${matches.length === 1 ? "destination" : "destinations"} unlocked.`;
        }
    }

    function openAdditionalUnlock() {
        if (unlocking || unlockedView.hidden) return;
        additionalUnlockSlot.hidden = false;
        additionalUnlockButton.hidden = true;
        additionalUnlockCancel.hidden = false;
        status.textContent = "Enter a passphrase to unlock another destination.";
        passwordInput.focus({ preventScroll: true });
    }

    function placeFormInAdditionalSlot() {
        additionalUnlockSlot.append(form);
        additionalUnlockSlot.hidden = true;
        additionalUnlockButton.hidden = false;
        additionalUnlockCancel.hidden = true;
    }

    function clearMatches() {
        for (const match of matches) {
            match.bytes?.fill(0);
            if (match.kind === "folder") match.root = null;
            match.text = null;
            match.bytes = null;
        }
        matches = [];
        currentMatch = null;
        currentPath = [];
        currentItem = null;
    }

    function resetSession(message = "Vault locked.") {
        attemptId += 1;
        activeFetchController?.abort();
        activeFetchController = null;
        unlocking = false;
        clearVisibleContent();
        clearMatches();
        unlocker.clearCache();
        lockedView.hidden = false;
        unlockedView.hidden = true;
        formHome.insertBefore(form, formHomePlaceholder);
        additionalUnlockSlot.hidden = true;
        additionalUnlockButton.hidden = true;
        additionalUnlockCancel.hidden = true;
        sessionStatus.hidden = true;
        sessionStatus.textContent = "";
        passwordInput.value = "";
        passwordInput.disabled = false;
        unlockButton.disabled = false;
        status.textContent = message;
    }

    function showDestinations() {
        releaseMedia();
        documentView.replaceChildren();
        documentView.hidden = false;
        mediaView.hidden = true;
        fileView.hidden = true;
        folderView.hidden = true;
        destinationView.hidden = false;
        destinations.replaceChildren();
        const fragment = document.createDocumentFragment();
        for (const match of matches) {
            const { name, detail } = matchLabel(match);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "virtual-folder-entry";
            button.draggable = false;
            const isFolder = match.kind === "folder";
            const image = document.createElement("img");
            image.src = isFolder ? "./engine/img/environment/doc_folder.svg" : "./engine/img/environment/doc_text.svg";
            image.dataset.seasonalIcon = isFolder ? "folder" : "text";
            image.alt = "";
            image.setAttribute("aria-hidden", "true");
            const label = document.createElement("span");
            label.textContent = name;
            const type = document.createElement("small");
            type.textContent = detail;
            button.append(image, label, type);
            button.addEventListener("click", () => showMatch(match));
            fragment.append(button);
        }
        destinations.append(fragment);
        destinations.querySelector("button")?.focus({ preventScroll: true });
    }

    function showFile(item, fromFolder) {
        releaseMedia();
        documentView.replaceChildren();
        folderView.hidden = true;
        destinationView.hidden = true;
        fileView.hidden = false;
        fileName.textContent = item.name;
        fileStatus.textContent = "";
        currentItem = item;
        returnToFolder = fromFolder;
        fileBackButton.hidden = !fromFolder && matches.length < 2;
        fileBackButton.textContent = fromFolder ? "← Back to folder" : "← Back to destinations";
        if (item.kind === "text") {
            mediaView.hidden = true;
            renderMarkdown(documentView, item.text);
            documentView.hidden = false;
            documentView.focus({ preventScroll: true });
        } else if (item.kind === "image" || item.kind === "audio") {
            documentView.hidden = true;
            mediaView.hidden = false;
            renderMedia(item);
        } else {
            documentView.hidden = true;
            mediaView.hidden = true;
            fileStatus.textContent = "This encrypted file type is not supported yet.";
        }
    }

    function renderMedia(item) {
        if (!currentItem || currentItem !== item || activeObjectUrl) return;
        const isBundleItem = typeof item.data === "string";
        const bytes = isBundleItem ? decodeBase64(item.data) : item.bytes;
        if (!(bytes instanceof Uint8Array)) {
            fileStatus.textContent = "This media item could not be opened.";
            return;
        }
        const blob = new Blob([bytes], { type: item.contentType });
        const objectUrl = URL.createObjectURL(blob);
        if (isBundleItem) bytes.fill(0);
        activeObjectUrl = objectUrl;
        if (item.kind === "image") {
            const image = document.createElement("img");
            image.className = "vault-media-image";
            image.src = objectUrl;
            image.alt = item.name;
            image.addEventListener("error", () => { fileStatus.textContent = "This image format could not be displayed."; }, { once: true });
            mediaView.append(image);
        } else {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "none";
            audio.src = objectUrl;
            audio.setAttribute("aria-label", `Play ${item.name}`);
            activeAudio = audio;
            audio.addEventListener("error", () => { fileStatus.textContent = "This audio format could not be played."; }, { once: true });
            mediaView.append(audio);
        }
    }

    function renderFolder() {
        if (!currentMatch || currentMatch.kind !== "folder") return;
        const folder = currentPath.at(-1) || currentMatch.root;
        destinationView.hidden = true;
        fileView.hidden = true;
        folderView.hidden = false;
        folderStatus.textContent = "";
        folderPath.textContent = [currentMatch.root.name, ...currentPath.map(item => item.name)].join(" / ");
        upButton.disabled = currentPath.length === 0;
        const fragment = document.createDocumentFragment();
        for (const entry of folder.entries) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "virtual-folder-entry";
            button.draggable = false;
            const isFolder = entry.type === "folder";
            const image = document.createElement("img");
            image.src = isFolder ? "./engine/img/environment/doc_folder.svg" : "./engine/img/environment/doc_text.svg";
            image.dataset.seasonalIcon = isFolder ? "folder" : "text";
            image.alt = "";
            image.setAttribute("aria-hidden", "true");
            const label = document.createElement("span");
            label.textContent = entry.name;
            button.append(image, label);
            const kind = getContentKind(entry.contentType);
            if (!isFolder && kind === "unsupported") {
                button.disabled = true;
                button.title = "This file type is not supported yet.";
                button.setAttribute("aria-label", `${entry.name}, file type not supported yet`);
            } else {
                button.addEventListener("click", () => {
                    if (isFolder) {
                        currentPath.push(entry);
                        renderFolder();
                        upButton.focus({ preventScroll: true });
                    } else if (kind === "text") {
                        const text = decodeTextBytes(decodeBase64(entry.data));
                        showFile({ name: entry.name, contentType: entry.contentType, kind, text }, true);
                    } else {
                        showFile({ name: entry.name, contentType: entry.contentType, kind, data: entry.data }, true);
                    }
                });
            }
            fragment.append(button);
        }
        folderList.replaceChildren(fragment);
    }

    function showMatch(match) {
        currentMatch = match;
        if (match.kind === "folder") {
            currentPath = [];
            renderFolder();
        } else {
            showFile(match, false);
        }
    }

    function returnFromFile() {
        const wasFolder = returnToFolder;
        releaseMedia();
        documentView.replaceChildren();
        documentView.hidden = false;
        fileView.hidden = true;
        currentItem = null;
        if (wasFolder) {
            renderFolder();
            folderList.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
        } else {
            showDestinations();
        }
    }

    function lock() {
        resetSession("Vault locked.");
    }

    upButton.addEventListener("click", () => {
        if (!currentPath.length) return;
        currentPath.pop();
        renderFolder();
    });
    fileBackButton.addEventListener("click", returnFromFile);
    additionalUnlockButton.addEventListener("click", openAdditionalUnlock);
    additionalUnlockCancel.addEventListener("click", closeAdditionalUnlock);
    windowElement.addEventListener("windowfocus", () => {
        if (unlockedView.hidden) {
            passwordInput.focus({ preventScroll: true });
        } else if (currentItem && (currentItem.kind === "image" || currentItem.kind === "audio") && !activeObjectUrl) {
            renderMedia(currentItem);
        }
    });
    windowElement.addEventListener("windowclosing", () => {
        const stoppedUnlocking = unlocking;
        if (unlocking) {
            attemptId += 1;
            activeFetchController?.abort();
            activeFetchController = null;
            unlocking = false;
            passwordInput.value = "";
            passwordInput.disabled = false;
            unlockButton.disabled = false;
            status.textContent = "Search stopped. Reopen the vault to try again.";
        }
        if (!unlockedView.hidden) {
            closeAdditionalUnlock();
            if (stoppedUnlocking) sessionStatus.textContent = "Search stopped. Existing destinations remain unlocked.";
        }
        if (unlockedView.hidden) unlocker.clearCache();
        releaseMedia();
    });
    window.addEventListener("pagehide", () => resetSession());

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (unlocking || !passwordInput.value) return;
        const password = passwordInput.value;
        const wasUnlocked = !unlockedView.hidden;
        const currentAttempt = ++attemptId;
        unlocking = true;
        activeFetchController = new AbortController();
        passwordInput.disabled = true;
        unlockButton.disabled = true;
        status.textContent = "Searching encrypted content…";
        if (wasUnlocked) sessionStatus.textContent = "Searching encrypted content…";
        let result;
        try {
            result = await unlocker.unlock(password, {
                signal: activeFetchController.signal,
                onProgress: ({ index, total }) => {
                    if (currentAttempt === attemptId) status.textContent = `Checking encrypted content ${index} of ${total}…`;
                }
            });
            if (currentAttempt !== attemptId || result.aborted) {
                result.matches.forEach(match => match.file.bytes.fill(0));
                return;
            }

            const prepared = [];
            const diagnostics = [...result.diagnostics];
            const existingIds = new Set(matches.map(match => match.id));
            let duplicateCount = 0;
            for (const match of result.matches) {
                if (existingIds.has(match.id)) {
                    match.file.bytes.fill(0);
                    duplicateCount += 1;
                    continue;
                }
                try { prepared.push(prepareMatch(match)); }
                catch {
                    match.file.bytes?.fill(0);
                    diagnostics.push({ id: match.id, state: "invalid-content" });
                }
            }
            if (prepared.length > 0) {
                matches.push(...prepared);
                unlocker.clearCache();
                if (!wasUnlocked) {
                    lockedView.hidden = true;
                    unlockedView.hidden = false;
                    placeFormInAdditionalSlot();
                    sessionStatus.hidden = false;
                } else {
                    closeAdditionalUnlock();
                }
                if (matches.length === 1) showMatch(matches[0]);
                else showDestinations();
                const countMessage = `${matches.length} ${matches.length === 1 ? "destination" : "destinations"} unlocked.`;
                sessionStatus.textContent = countMessage;
                status.textContent = countMessage;
                return;
            }
            if (wasUnlocked && duplicateCount > 0) {
                status.textContent = "Those destinations are already unlocked.";
                sessionStatus.textContent = "Those destinations are already unlocked. Your current destinations remain available.";
                return;
            }
            if (matches.length === 0) {
                if (result.matches.length > 0) unlocker.clearCache();
                const someUnavailable = diagnostics.some(item => !["authentication-failed", "matched"].includes(item.state));
                status.textContent = someUnavailable
                    ? "No content matched that passphrase. Some encrypted content could not be checked."
                    : "No encrypted content matched that passphrase.";
                if (wasUnlocked) {
                    sessionStatus.textContent = `${status.textContent} Previously unlocked destinations remain available.`;
                }
                return;
            }
            unlocker.clearCache();
            const someUnavailable = diagnostics.some(item => !["authentication-failed", "matched"].includes(item.state));
            status.textContent = someUnavailable
                ? "No new destination could be opened. Some encrypted content could not be checked."
                : "No new destination matched that passphrase.";
            sessionStatus.textContent = `${status.textContent} Previously unlocked destinations remain available.`;
        } catch {
            if (currentAttempt === attemptId) status.textContent = "Encrypted content could not be checked. Try again later.";
        } finally {
            if (result?.aborted) result.matches.forEach(match => match.file.bytes.fill(0));
            if (currentAttempt === attemptId) {
                unlocking = false;
                activeFetchController = null;
                passwordInput.value = "";
                passwordInput.disabled = false;
                unlockButton.disabled = false;
            }
        }
    });

    lockButton?.addEventListener("click", lock);
    resetSession("Enter your passphrase to search encrypted content.");
    return { lock, clearCache: unlocker.clearCache };
}
