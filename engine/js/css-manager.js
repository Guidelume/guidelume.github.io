import { stylesheets, stylesheetGroups } from "./stylesheet-registry.js";

export function createCSSManager({ document = globalThis.document, registry = stylesheets, groups = stylesheetGroups, timeoutMs = 15000 } = {}) {
    const definitions = new Map();
    const slots = new Map();
    const loaded = new Map();
    const loading = new Map();
    const urls = new Set();

    for (const entry of registry) {
        const href = new URL(entry.href, document.baseURI).href;
        if (definitions.has(entry.id) || urls.has(href)) throw new Error(`Duplicate stylesheet registration: ${entry.id}`);
        definitions.set(entry.id, { ...entry, href });
        urls.add(href);
    }

    // Fail clearly on registry mistakes, before making any network requests.
    function validate(id, visiting = new Set(), visited = new Set()) {
        const entry = definitions.get(id);
        if (!entry) throw new Error(`Unknown stylesheet: ${id}`);
        if (visiting.has(id)) throw new Error(`Circular stylesheet dependency: ${id}`);
        if (visited.has(id)) return;
        visiting.add(id);
        for (const dependency of entry.dependencies) validate(dependency, visiting, visited);
        visiting.delete(id);
        visited.add(id);
    }
    const visited = new Set();
    for (const id of definitions.keys()) validate(id, new Set(), visited);
    for (const members of Object.values(groups)) for (const id of members) validate(id);

    // Empty comment slots reserve cascade positions without fetching lazy CSS.
    // Inserts, concurrent loads, adoption and retries all use the same positions.
    for (const id of definitions.keys()) {
        const slot = document.createComment(` stylesheet: ${id} `);
        document.head.append(slot);
        slots.set(id, slot);
    }

    function load(id) {
        const entry = definitions.get(id);
        if (!entry) return Promise.reject(new Error(`Unknown stylesheet: ${id}`));
        if (loading.has(id)) return loading.get(id);
        if (loaded.has(id)) return Promise.resolve(loaded.get(id));

        const dependencies = entry.dependencies.map(load);
        let link = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .find(element => element.href === entry.href);
        const existing = Boolean(link);
        if (!link) {
            link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = entry.href;
        }
        link.dataset.stylesheet = id;

        let cleanupOwnLoad = () => {};
        const ownLoad = new Promise((resolve, reject) => {
            let timer;
            const cleanup = () => {
                clearTimeout(timer);
                link.removeEventListener("load", onLoad);
                link.removeEventListener("error", onError);
            };
            cleanupOwnLoad = cleanup;
            const onLoad = () => { cleanup(); resolve(link); };
            const onError = () => {
                cleanup();
                reject(new Error(`Could not load stylesheet "${id}": ${entry.href}`));
            };
            link.addEventListener("load", onLoad);
            link.addEventListener("error", onError);
            timer = setTimeout(onError, timeoutMs);
            const alreadyLoaded = existing && Boolean(link.sheet);
            document.head.insertBefore(link, slots.get(id));
            if (alreadyLoaded) onLoad();
        });
        const pending = Promise.all([...dependencies, ownLoad]).then(() => {
            loaded.set(id, link);
            return link;
        }).catch(error => {
            // Failed operations are evicted, so the next launch can retry.
            cleanupOwnLoad();
            link.remove();
            throw error;
        }).finally(() => loading.delete(id));
        loading.set(id, pending);
        return pending;
    }

    function loadGroup(name) {
        if (!Object.hasOwn(groups, name)) return Promise.reject(new Error(`Unknown stylesheet group: ${name}`));
        return Promise.all(groups[name].map(load));
    }

    function isGroupLoaded(name) {
        return Object.hasOwn(groups, name) && groups[name].every(id => loaded.has(id));
    }

    return { load, loadGroup, isGroupLoaded };
}
