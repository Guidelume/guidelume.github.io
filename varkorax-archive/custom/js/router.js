// Only known reader types may load code. Build their DOM before downloading it.
(() => {
    const routes = {
        entry: { parameter: "id", label: "entry", script: "entry.js" },
        stories: { parameter: "story", label: "story", script: "stories.js" }
    };
    const params = new URLSearchParams(location.search);
    const type = params.get("type");
    const scriptBase = document.currentScript.src;
    const main = document.getElementById("reader-main");
    const controls = document.querySelectorAll(".side-controls");

    function setState(state) {
        document.body.dataset.readerState = state;
        main.setAttribute("aria-busy", String(state === "loading"));
        controls.forEach(control => { control.inert = state !== "ready"; });
    }

    function showError(message, retry) {
        setState("error");
        main.innerHTML = `<article id="reader" class="frame theme-default reader-error" aria-labelledby="reader-error-title">
            <header class="chapter-header"><h1 id="reader-error-title">Unable to open reader</h1></header>
            <div class="content" tabindex="0">
                <p role="alert"></p>
                <div class="reader-error-actions"><a class="control-btn" href="../landing_collections.html">Back to Collections</a></div>
            </div>
        </article>`;
        main.querySelector('[role="alert"]').textContent = message;
        if (retry) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "control-btn";
            button.textContent = "Retry loading reader";
            button.addEventListener("click", retry, { once: true });
            main.querySelector(".reader-error-actions").append(button);
        }
    }

    if (!Object.hasOwn(routes, type)) {
        showError("Choose an entry or story from Collections to start reading.");
        return;
    }
    const route = routes[type];
    if (!params.get(route.parameter)?.trim()) {
        showError(`This link is missing its ${route.label}. Choose one from Collections.`);
        return;
    }

    function loadReader() {
        setState("loading");
        const entry = type === "entry";
        const title = entry ? "entry-title" : "chapter-title";
        main.innerHTML = `<article id="reader" class="frame theme-default" aria-labelledby="${title}">
            <header class="chapter-header"><h1 id="${title}">Loading…</h1></header>
            <div id="${entry ? "entry-content" : "chapter-content"}" class="content" tabindex="0" aria-label="${entry ? "Entry" : "Chapter"} content">
                ${entry ? '<section id="entry-meta"></section><section id="entry-body" class="prose"></section>' : ""}
            </div>
            <div class="progress" aria-hidden="true"><div id="progress-bar" class="progress-bar" role="progressbar" aria-hidden="true"></div></div>
        </article>`;
        const script = document.createElement("script");
        script.src = new URL(route.script, scriptBase).href;
        script.onload = () => {
            setState("ready");
            window.dispatchEvent(new CustomEvent("archive:reader-ready"));
        };
        script.onerror = () => {
            script.remove();
            showError("The reader could not be downloaded. Check your connection and try again.", loadReader);
        };
        document.head.append(script);
    }
    loadReader();
})();
