import { resolveLookingGlassUrl } from "./looking-glass-providers.js";
import {
    MAX_BOOKMARKS, MAX_BOOKMARK_TITLE, MAX_COLLECTION_NAME,
    normalizeLookingGlassState, parseBuiltInBookmarks
} from "./looking-glass-data.js";

export function initLookingGlass({ memory, saveMemory, windowElement: root }) {
    if (!root) return null;
    const find = name => root.querySelector(`[data-glass-${name}]`);
    const address = find("address");
    const player = find("player");
    const empty = find("empty");
    const sidebar = find("sidebar");
    const sidebarToggle = find("toggle");
    const status = find("status");
    const external = find("external");
    const unloadButton = find("unload");
    const bookmarkButton = find("bookmark");
    const editor = find("editor");
    const title = find("title");
    const collection = find("collection");
    let current = null;
    let builtIns = null;
    let libraryLoading = false;
    let editingId = null;
    let editingUrl = null;
    let statusTimer = null;
    memory.lookingGlass = normalizeLookingGlassState(memory.lookingGlass);

    function setStatus(message = "", error = false) {
        window.clearTimeout(statusTimer);
        statusTimer = null;
        status.textContent = message;
        status.dataset.state = error ? "error" : "";
        status.hidden = !message;
        if (message && !error) {
            statusTimer = window.setTimeout(() => {
                status.hidden = true;
                status.textContent = "";
                statusTimer = null;
            }, 5000);
        }
    }

    function persist(next) {
        const previous = memory.lookingGlass;
        memory.lookingGlass = next;
        if (saveMemory() === true) return true;
        memory.lookingGlass = previous;
        setStatus("Changes could not be saved. Check browser storage and try again.", true);
        return false;
    }

    function updateSidebar() {
        const open = memory.lookingGlass.sidebarOpen;
        sidebar.hidden = !open;
        sidebarToggle.setAttribute("aria-expanded", String(open));
        sidebarToggle.textContent = open ? "Hide library" : "Show library";
    }

    function cancelEditor({ focus = true } = {}) {
        editor.hidden = true;
        editingId = null;
        editingUrl = null;
        if (focus) bookmarkButton.focus();
    }

    function selectContent(url, { remember = true } = {}) {
        const content = resolveLookingGlassUrl(url);
        if (!content) {
            address.setAttribute("aria-invalid", "true");
            setStatus("Enter a YouTube watch, youtu.be, Shorts, or Live video URL with a valid video ID.", true);
            address.focus();
            return;
        }
        address.removeAttribute("aria-invalid");
        const changed = current?.externalUrl !== content.externalUrl;
        current = content;
        address.value = content.externalUrl;
        if (changed) cancelEditor({ focus: false });
        external.href = content.externalUrl;
        external.hidden = false;
        unloadButton.hidden = false;
        bookmarkButton.disabled = false;
        empty.hidden = true;
        find("stage").hidden = false;
        // Keep the same browsing context when the sidebar, title, or window changes.
        if (player.getAttribute("src") !== content.embedUrl) player.setAttribute("src", content.embedUrl);
        setStatus();
        if (remember && memory.lookingGlass.lastUrl !== content.externalUrl) {
            persist({ ...memory.lookingGlass, lastUrl: content.externalUrl });
        }
        updateSelection();
    }

    function updateSelection() {
        root.querySelectorAll("[data-glass-bookmark-url]").forEach(button => {
            const active = button.dataset.glassBookmarkUrl === current?.externalUrl;
            button.classList.toggle("is-selected", active);
            if (active) button.setAttribute("aria-current", "true");
            else button.removeAttribute("aria-current");
        });
    }

    function openEditor(bookmark = null) {
        if (!bookmark && !current) return;
        editingId = bookmark?.id || null;
        editingUrl = bookmark?.url || current.externalUrl;
        title.value = bookmark?.title || `YouTube · ${current.id}`;
        collection.value = bookmark?.collection || "My collection";
        find("editor-heading").textContent = bookmark ? "Edit bookmark" : "Save bookmark";
        title.maxLength = MAX_BOOKMARK_TITLE;
        collection.maxLength = MAX_COLLECTION_NAME;
        
		// Editing remains available even when the library has been collapsed.
        editor.hidden = false;
        title.focus();
        title.select();
    }

    function makeCollection(name, entries, personal) {
        const section = document.createElement("section");
        section.className = "glass-collection";
        const heading = document.createElement("h3");
        heading.textContent = name;
        section.append(heading);
        const list = document.createElement("ul");
        entries.forEach(bookmark => {
            const row = document.createElement("li");
            const load = document.createElement("button");
            load.type = "button";
            load.className = "glass-bookmark";
            load.textContent = bookmark.title;
            load.dataset.glassBookmarkUrl = bookmark.url;
            load.addEventListener("click", () => selectContent(bookmark.url));
            row.append(load);
            if (personal) {
                const actions = document.createElement("div");
                actions.className = "glass-bookmark-actions";
                const edit = document.createElement("button");
                edit.type = "button";
                edit.textContent = "Edit";
                edit.setAttribute("aria-label", `Edit ${bookmark.title}`);
                edit.addEventListener("click", () => openEditor(bookmark));
                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = "Remove";
                remove.setAttribute("aria-label", `Remove ${bookmark.title}`);
                remove.addEventListener("click", () => {
                    if (!persist({ ...memory.lookingGlass, bookmarks: memory.lookingGlass.bookmarks.filter(entry => entry.id !== bookmark.id) })) return;
                    if (editingId === bookmark.id) cancelEditor({ focus: false });
                    renderPersonal();
                    setStatus(`Removed “${bookmark.title}” from your bookmarks.`);
                    find("personal-heading").focus();
                });
                actions.append(edit, remove);
                row.append(actions);
            }
            list.append(row);
        });
        section.append(list);
        return section;
    }

    function renderPersonal() {
        const groups = new Map();
        memory.lookingGlass.bookmarks.forEach(bookmark => {
            if (!groups.has(bookmark.collection)) groups.set(bookmark.collection, []);
            groups.get(bookmark.collection).push(bookmark);
        });
        const personal = find("personal");
        personal.replaceChildren(...Array.from(groups, ([name, entries]) => makeCollection(name, entries, true)));
        if (!groups.size) {
            const hint = document.createElement("p");
            hint.className = "glass-hint";
            hint.textContent = "Save a video to start your own collection.";
            personal.append(hint);
        }
        find("collections").replaceChildren(...Array.from(groups.keys(), name => {
            const option = document.createElement("option");
            option.value = name;
            return option;
        }));
        updateSelection();
    }

    async function loadBuiltIns() {
        if (builtIns || libraryLoading) return;
        libraryLoading = true;
        const libraryStatus = find("library-status");
        libraryStatus.textContent = "Loading built-in library…";
        find("retry").hidden = true;
        try {
            const response = await fetch(new URL("../data/looking-glass-bookmarks.json", import.meta.url), { credentials: "same-origin" });
            if (!response.ok) throw new Error();
            builtIns = parseBuiltInBookmarks(await response.json());
            find("built-in").replaceChildren(...builtIns.map(group => makeCollection(group.title, group.entries, false)));
            libraryStatus.textContent = builtIns.length ? "Included with Guidelume · read-only" : "No built-in bookmarks yet.";
            updateSelection();
        } catch {
            libraryStatus.textContent = "The built-in library could not be loaded. Your personal bookmarks are still available.";
            find("retry").hidden = false;
        } finally {
            libraryLoading = false;
        }
    }

    function opened() {
        updateSidebar();
        renderPersonal();
        loadBuiltIns();
        const last = current?.externalUrl || memory.lookingGlass.lastUrl;
        if (last) selectContent(last, { remember: false });
    }

    find("address-form").addEventListener("submit", event => {
        event.preventDefault();
        selectContent(address.value);
    });
    sidebarToggle.addEventListener("click", () => {
        if (persist({ ...memory.lookingGlass, sidebarOpen: !memory.lookingGlass.sidebarOpen })) updateSidebar();
    });
    bookmarkButton.addEventListener("click", () => openEditor());
    unloadButton.addEventListener("click", () => {
        clearSelection();
        // Stop playback even if storage is unavailable, and keep this session cleared.
        memory.lookingGlass = { ...memory.lookingGlass, lastUrl: "" };
        if (saveMemory() !== true) {
            setStatus("Video unloaded, but the cleared selection could not be saved. The previous video may return after reloading.", true);
        }
        address.focus();
    });
    find("cancel").addEventListener("click", () => cancelEditor());
    find("retry").addEventListener("click", loadBuiltIns);
    editor.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelEditor();
        }
    });
    editor.addEventListener("submit", event => {
        event.preventDefault();
        if (!title.value.trim() || !collection.value.trim()) {
            setStatus("Enter a title and collection name for this bookmark.", true);
            (!title.value.trim() ? title : collection).focus();
            return;
        }
        const bookmarks = memory.lookingGlass.bookmarks;
        if (!editingId && bookmarks.length >= MAX_BOOKMARKS) {
            setStatus(`Your library can hold ${MAX_BOOKMARKS} personal bookmarks. Remove one before adding another.`, true);
            return;
        }
        const content = resolveLookingGlassUrl(editingUrl);
        if (!content) return;
        const id = editingId || `bookmark-${crypto.randomUUID()}`;
        const entry = { id, title: title.value.trim(), collection: collection.value.trim(), provider: content.provider, url: content.externalUrl };
        const next = editingId ? bookmarks.map(bookmark => bookmark.id === editingId ? entry : bookmark) : [...bookmarks, entry];
        if (!persist({ ...memory.lookingGlass, bookmarks: next })) return;
        renderPersonal();
        cancelEditor();
        setStatus(`Saved “${entry.title}” in ${entry.collection}.`);
    });
    player.addEventListener("error", () => setStatus("The player could not load. Use Open on YouTube to watch this video.", true));
    root.addEventListener("windowopened", opened);
    function releasePlayer() {
        // Release media immediately; minimize deliberately leaves the iframe mounted.
        player.removeAttribute("src");
        cancelEditor({ focus: false });
        setStatus();
    }
    function clearSelection() {
        current = null;
        releasePlayer();
        address.value = "";
        address.removeAttribute("aria-invalid");
        bookmarkButton.disabled = true;
        unloadButton.hidden = true;
        external.hidden = true;
        external.removeAttribute("href");
        empty.hidden = false;
        find("stage").hidden = true;
        updateSelection();
    }
    root.addEventListener("windowclosing", releasePlayer);
    updateSidebar();
    renderPersonal();

    return { applyRestoredState() {
        memory.lookingGlass = normalizeLookingGlassState(memory.lookingGlass);
        clearSelection();
        updateSidebar();
        renderPersonal();
        address.value = memory.lookingGlass.lastUrl;
        const state = memory.windows["looking-glass"];
        if (state?.open && !state.minimized && !root.hidden) opened();
    } };
}
