// Recovery is loaded with a fresh URL only when startup cannot finish. It has
// no application imports and never reads or writes the saved workspace.
export async function refreshStartupFiles({ base = document.baseURI, fetch: request = globalThis.fetch, timeoutMs = 15000 } = {}) {
    const page = new URL(base), root = new URL(".", page);
    page.hash = "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const load = async (url, cache) => {
        const response = await request(url.href, { cache, credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error("A startup file could not be refreshed.");
        if (response.url && new URL(response.url).origin !== root.origin) throw new Error("A startup file redirected outside Guidelume.");
        // Read the complete response before the shared deadline and reloading.
        return await response.text();
    };
    try {
        const manifest = JSON.parse(await load(new URL("engine/startup-assets.json", root), "no-store"));
        if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 128) throw new Error("The startup file list could not be read.");
        const files = manifest.files.map(file => {
            if (typeof file !== "string" || !(file === "index.html" || /^engine\/[a-zA-Z0-9_./-]+\.(?:js|css)$/.test(file))) throw new Error("The startup file list is invalid.");
            const url = new URL(file, root);
            if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || file.split("/").includes("..")) throw new Error("A startup file is outside Guidelume.");
            return url;
        });
        const unique = [...new Map([page, ...files].map(url => [url.href, url])).values()];
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(6, unique.length) }, async () => {
            while (next < unique.length) await load(unique[next++], "reload");
        }));
    } finally { clearTimeout(timer); controller.abort(); }
}
