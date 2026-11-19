export function initTabs(root = document, state = {}) {
    const controllers = [];
    const listeners = new AbortController();

    root.querySelectorAll("[data-tabbed-window]").forEach(group => {
        const tablist = group.querySelector('[role="tablist"]');
        if (!tablist) return;

        const panels = Array.from(group.querySelectorAll('[role="tabpanel"][data-tab-panel]'));
        const panelsById = new Map(panels.map(panel => [panel.id, panel]));
        const tabs = Array.from(tablist.querySelectorAll('[role="tab"][data-tab-id]'))
            .filter(tab => panelsById.has(tab.getAttribute("aria-controls")));
        if (!tabs.length) return;

        const windowId = group.closest("[data-window]")?.dataset.window;
        function selectTab(tab, { focus = false, external = false } = {}) {
            const panel = panelsById.get(tab.getAttribute("aria-controls"));
            if (!panel) return;

            tabs.forEach(candidate => {
                const selected = candidate === tab;
                candidate.setAttribute("aria-selected", String(selected));
                candidate.tabIndex = selected ? 0 : -1;
                const candidatePanel = panelsById.get(candidate.getAttribute("aria-controls"));
                if (candidatePanel) candidatePanel.hidden = !selected;
            });

            if (focus) tab.focus();
            if (!external && state.memory && windowId) {
                state.memory.windows[windowId] ||= {};
                state.memory.windows[windowId].activeTab = tab.dataset.tabId;
                state.saveMemory?.();
            }
            group.dispatchEvent(new CustomEvent("tabchange", {
                detail: { tabId: tab.dataset.tabId, panelId: panel.id, external }
            }));
        }

        const initiallySelected = tabs.find(tab =>
            tab.getAttribute("aria-selected") === "true"
        ) || tabs[0];
        selectTab(initiallySelected, { external: true });

        tablist.addEventListener("click", event => {
            const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
            if (tabs.includes(tab)) selectTab(tab);
        }, { signal: listeners.signal });

        tablist.addEventListener("keydown", event => {
            const current = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
            const currentIndex = tabs.indexOf(current);
            if (currentIndex < 0) return;

            let nextIndex;
            if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
            else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = tabs.length - 1;
            else return;

            event.preventDefault();
            selectTab(tabs[nextIndex], { focus: true });
        }, { signal: listeners.signal });

        controllers.push({ group, windowId, tabs, selectTab, initiallySelected });
    });

    function activateTab(tabId, options) {
        for (const controller of controllers) {
            const tab = controller.tabs.find(candidate => candidate.dataset.tabId === tabId);
            if (tab) {
                controller.selectTab(tab, options);
                return true;
            }
        }
        return false;
    }

    function applySharedState(ids = null) {
        for (const controller of controllers) {
            if (ids && !ids.includes(controller.windowId)) continue;
            const selected = state.memory?.windows?.[controller.windowId]?.activeTab;
            const tab = controller.tabs.find(tab => tab.dataset.tabId === selected) || controller.initiallySelected;
            controller.selectTab(tab, { external: true });
        }
    }
    if (state.memory) applySharedState();
    return { activateTab, applySharedState, connectState(next) { state = next; applySharedState(); },
        destroy() { listeners.abort(); controllers.length = 0; } };
}
