// These names match fonts.css. CSS variables publish a face only after its bytes
// are ready; a timed-out face stays on its fallback until an intentional retry.
const families = {
    Quicksand: { variable: "--font-quicksand", fallback: "sans-serif" },
    Lexend: { variable: "--font-lexend", fallback: "sans-serif" },
    "Libre Baskerville": { variable: "--font-baskerville", fallback: "serif" },
    "Mochiy Pop One": { variable: "--font-mochiy", fallback: "sans-serif" },
    "Cormorant Garamond": { variable: "--font-cormorant", fallback: "Georgia, serif" },
    "Berkshire Swash": { variable: "--font-berkshire", fallback: "cursive" },
    "Poiret One": { variable: "--font-poiret", fallback: "sans-serif" }
};

export function createFontManager({ document = globalThis.document, timeoutMs = 3000 } = {}) {
    const root = document.documentElement;
    const operations = new Map();
    const published = new Set();
    const revisions = new Map();

    function activeFamilies(overrides = {}) {
        const state = { ...root.dataset, ...overrides };
        const enabled = value => value === true || value === "true";
        if (enabled(state.easterEggFont)) return ["Mochiy Pop One", ...(enabled(state.accessibleFonts) ? ["Lexend", "Libre Baskerville"] : [])];
        if (enabled(state.accessibleFonts)) return ["Lexend", "Libre Baskerville"];
        const seasonal = { halloween: "Cormorant Garamond", christmas: "Berkshire Swash", "new-years": "Poiret One" }[state.seasonalTheme];
        return typeof seasonal === "string" ? ["Quicksand", seasonal] : ["Quicksand"];
    }

    function loadFamily(name, retry) {
        const existing = operations.get(name);
        if (existing && !(retry && existing.settled && !existing.ready)) return existing.promise;
        const operation = { settled: false, ready: false, promise: null };
        operation.promise = new Promise(resolve => {
            let finished = false;
            const finish = ready => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                operation.settled = true;
                operation.ready = ready;
                resolve({ name, ready });
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            if (!document.fonts?.load) { finish(false); return; }
            Promise.resolve().then(() => Promise.all([400, 700].map(weight =>
                document.fonts.load(`${weight} 16px "${name}"`)
            ))).then(matches => finish(matches.every(faces => faces.length > 0)), () => finish(false));
        });
        operations.set(name, operation);
        return operation.promise;
    }

    function publish(results) {
        for (const { name, ready } of results) {
            const definition = families[name];
            root.style.setProperty(definition.variable, ready ? `"${name}"` : definition.fallback);
            published.add(name);
        }
    }

    function prepare(overrides = {}, { retry = false } = {}) {
        return Promise.all(activeFamilies(overrides).map(name => loadFamily(name, retry))).then(publish);
    }

    function isPrepared(overrides = {}) {
        return activeFamilies(overrides).every(name => published.has(name));
    }

    function transition(channel, overrides, apply) {
        const revision = (revisions.get(channel) || 0) + 1;
        revisions.set(channel, revision);
        const names = activeFamilies(overrides);
        // Keep already-ready settings changes synchronous, as existing callers
        // expect. Failed faces get another bounded attempt on an explicit change.
        if (names.every(name => published.has(name) && operations.get(name)?.ready)) {
            // A previously cancelled retry may have finished downloading without
            // publishing its face. This explicit selection can safely adopt it.
            publish(names.map(name => ({ name, ready: true })));
            apply();
            return Promise.resolve(true);
        }
        return Promise.all(names.map(name => loadFamily(name, true))).then(results => {
            if (revisions.get(channel) !== revision) return false;
            publish(results);
            apply();
            return true;
        });
    }

    function cancelTransitions(channel) {
        for (const key of channel ? [channel] : revisions.keys()) revisions.set(key, (revisions.get(key) || 0) + 1);
    }

    return { prepare, isPrepared, transition, cancelTransitions };
}
