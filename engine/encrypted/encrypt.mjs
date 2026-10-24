import { readdir, readFile, mkdir, open, unlink, lstat, stat, rename } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { encryptFileBytes, MAX_FILE_BYTES, MAX_FOLDER_BUNDLE_BYTES } from "../js/encrypted-content.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stagingPath = resolve(root, "engine/encrypted/staging");
const outputPath = resolve(root, "engine/encrypted/output");
const bundleFormat = "guidelume-vault-folder";
const bundleMimeType = "application/vnd.guidelume.folder+json";
const contentTypes = {
    ".md": "text/markdown", ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json",
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".xml": "application/xml",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".ogg": "audio/ogg", ".oga": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac",
    ".pdf": "application/pdf", ".zip": "application/zip"
};

function readTerminalLine(prompt, { hidden = true } = {}) {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") throw new Error("Run this tool in an interactive terminal so the passphrase stays hidden.");
    return new Promise((resolveSecret, rejectSecret) => {
        let value = "";
        const finish = error => {
            input.off("data", onData);
            input.setRawMode(false);
            input.pause();
            process.stdout.write("\n");
            if (error) rejectSecret(error);
            else resolveSecret(value);
        };
        const onData = chunk => {
            for (const character of chunk.toString("utf8")) {
                if (character === "\u0003") return finish(new Error("Cancelled."));
                if (character === "\r" || character === "\n") return finish();
                if (character === "\u0008" || character === "\u007f") {
                    value = Array.from(value).slice(0, -1).join("");
                    if (!hidden) process.stdout.write("\b \b");
                } else if (character >= " ") {
                    value += character;
                    if (!hidden) process.stdout.write(character);
                }
            }
        };
        process.stdout.write(prompt);
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
    });
}

function readSecret(prompt) {
    return readTerminalLine(prompt);
}

async function confirmOverwrite(paths) {
    if (paths.length === 0) return new Set();
    process.stdout.write(`Existing encrypted output will be replaced:\n${paths.map(path => `  ${path}`).join("\n")}\n`);
    const answer = await readTerminalLine("Continue and overwrite these files? [y/N] ", { hidden: false });
    if (!/^y(?:es)?$/i.test(answer.trim())) throw new Error("Cancelled; existing output was left unchanged.");
    return new Set(paths);
}

function shouldWarnAboutPassword(password) {
    const normalized = password.trim().toLowerCase();
    return password.length < 16
        || /^(.)\1+$/.test(normalized)
        || /^(?:password|letmein|qwerty|welcome|admin|123456|123456789|abc123)(?:\d+)?$/.test(normalized);
}

async function collectTopLevelFiles() {
    await mkdir(stagingPath, { recursive: true });
    const entries = await readdir(stagingPath, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
    if (!files.length) throw new Error("Place one or more files directly in engine/encrypted/staging/ first.");
    for (const name of files) {
        const info = await lstat(resolve(stagingPath, name));
        if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error(`${name} is not a regular file or exceeds the 8 MiB per-file limit.`);
    }
    return files;
}

async function collectFolderBundle() {
    await mkdir(stagingPath, { recursive: true });
    const limits = { sourceBytes: 0, files: 0, entries: 0 };
    async function readDirectory(directory, depth = 0) {
        if (depth > 12) throw new Error("The folder bundle exceeds the 12-level nesting limit.");
        const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        const contents = [];
        for (const entry of entries) {
            if (entry.name.length > 255 || entry.name === "." || entry.name === ".." || /[\\/\0]/.test(entry.name)) {
                throw new Error("A folder entry has an unsupported name.");
            }
            const source = resolve(directory, entry.name);
            if (entry.isDirectory()) {
                limits.entries += 1;
                if (limits.entries > 512) throw new Error("The folder bundle exceeds the 512-entry limit.");
                contents.push({ type: "folder", name: entry.name, entries: await readDirectory(source, depth + 1) });
            } else if (entry.isFile()) {
                limits.entries += 1;
                if (limits.entries > 512) throw new Error("The folder bundle exceeds the 512-entry limit.");
                const info = await lstat(source);
                if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error(`${entry.name} is not a regular file or exceeds the 8 MiB per-file limit.`);
                limits.sourceBytes += info.size;
                limits.files += 1;
                if (limits.sourceBytes > MAX_FOLDER_BUNDLE_BYTES) throw new Error("The combined staged files exceed the 16 MiB folder-bundle limit.");
                const bytes = new Uint8Array(await readFile(source));
                try {
                    contents.push({
                        type: "file",
                        name: entry.name,
                        contentType: contentTypes[extname(entry.name).toLowerCase()] || "application/octet-stream",
                        data: Buffer.from(bytes).toString("base64")
                    });
                } finally {
                    bytes.fill(0);
                }
            }
        }
        return contents;
    }
    const entries = await readDirectory(stagingPath);
    if (limits.files === 0) throw new Error("Place one or more files in engine/encrypted/staging/ first.");
    return { format: bundleFormat, version: 1, name: "Developer Vault", entries };
}

async function existingOutputs(paths) {
    const found = [];
    for (const path of paths) {
        try {
            const info = await stat(path);
            if (!info.isFile()) throw new Error(`Output path is not a file: ${path}`);
            found.push(path);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
    return found;
}

async function writeOutput(path, contents, overwriteAllowed) {
    if (!overwriteAllowed) {
        let handle;
        let created = false;
        let complete = false;
        try {
            handle = await open(path, "wx", 0o600);
            created = true;
            await handle.writeFile(contents, "utf8");
            await handle.sync();
            complete = true;
        } finally {
            await handle?.close().catch(() => {});
            if (created && !complete) await unlink(path).catch(() => {});
        }
        return;
    }

    const temporaryPath = `${path}.tmp-${randomUUID()}`;
    let handle;
    try {
        handle = await open(temporaryPath, "wx", 0o600);
        await handle.writeFile(contents, "utf8");
        await handle.sync();
        await handle.close();
        handle = null;
        await rename(temporaryPath, path);
    } finally {
        await handle?.close().catch(() => {});
        await unlink(temporaryPath).catch(() => {});
    }
}

async function main() {
    const args = process.argv.slice(2);
    const bundleMode = args.length === 1 && args[0] === "--bundle";
    if (args.length > 0 && !bundleMode) throw new Error("Usage: node engine/encrypted/encrypt.mjs [--bundle]");

    let stagedFiles = null;
    let bundle = null;
    if (bundleMode) bundle = await collectFolderBundle();
    else stagedFiles = await collectTopLevelFiles();

    await mkdir(outputPath, { recursive: true });
    const targets = bundleMode
        ? [resolve(outputPath, "developer-vault.bundle.enc.json")]
        : stagedFiles.map(name => resolve(outputPath, `${name}.enc.json`));
    const overwriteTargets = await confirmOverwrite(await existingOutputs(targets));

    let passphrase = "";
    let confirmation = "";
    try {
        passphrase = await readSecret("Passphrase (hidden): ");
        confirmation = await readSecret("Confirm passphrase (hidden): ");
        if (passphrase !== confirmation) throw new Error("Passphrases did not match; no files were written.");
        if (shouldWarnAboutPassword(passphrase)) {
            process.stdout.write("Warning: this passphrase may be short or easy to guess offline. Continuing as requested.\n");
        }

        if (bundleMode) {
            const bytes = new TextEncoder().encode(JSON.stringify(bundle));
            try {
                const payload = await encryptFileBytes({
                    fileName: "developer-vault.bundle.json",
                    contentType: bundleMimeType,
                    bytes
                }, passphrase);
                const target = targets[0];
                await writeOutput(target, `${JSON.stringify(payload, null, 2)}\n`, overwriteTargets.has(target));
                process.stdout.write(`Encrypted folder bundle → ${target}\n`);
            } finally {
                bytes.fill(0);
            }
        } else {
            for (let index = 0; index < stagedFiles.length; index += 1) {
                const fileName = stagedFiles[index];
                const source = resolve(stagingPath, fileName);
                const bytes = new Uint8Array(await readFile(source));
                try {
                    const payload = await encryptFileBytes({
                        fileName,
                        contentType: contentTypes[extname(fileName).toLowerCase()] || "application/octet-stream",
                        bytes
                    }, passphrase);
                    const target = targets[index];
                    await writeOutput(target, `${JSON.stringify(payload, null, 2)}\n`, overwriteTargets.has(target));
                    process.stdout.write(`Encrypted ${fileName} → ${target}\n`);
                } finally {
                    bytes.fill(0);
                }
            }
        }
        process.stdout.write("Move only the intended encrypted outputs into their feature folders. Staged originals remain in the ignored staging folder.\n");
    } finally {
        passphrase = "";
        confirmation = "";
        bundle = null;
        stagedFiles = null;
    }
}

main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
});
