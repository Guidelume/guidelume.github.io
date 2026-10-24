export function initTabs(root = document) {
    const controllers = [];

    root.querySelectorAll("[data-tabbed-window]").forEach(group => {
        const tablist = group.querySelector('[role="tablist"]');
        if (!tablist) return;

        const panels = Array.from(group.querySelectorAll('[role="tabpanel"][data-tab-panel]'));
        const panelsById = new Map(panels.map(panel => [panel.id, panel]));
        const tabs = Array.from(tablist.querySelectorAll('[role="tab"][data-tab-id]'))
            .filter(tab => panelsById.has(tab.getAttribute("aria-controls")));
        if (!tabs.length) return;

        function selectTab(tab, { focus = false } = {}) {
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
            group.dispatchEvent(new CustomEvent("tabchange", {
                detail: { tabId: tab.dataset.tabId, panelId: panel.id }
            }));
        }

        const initiallySelected = tabs.find(tab =>
            tab.getAttribute("aria-selected") === "true"
        ) || tabs[0];
        selectTab(initiallySelected);

        tablist.addEventListener("click", event => {
            const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
            if (tabs.includes(tab)) selectTab(tab);
        });

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
        });

        controllers.push({ group, tabs, selectTab });
    });

    function activateTab(tabId) {
        for (const controller of controllers) {
            const tab = controller.tabs.find(candidate => candidate.dataset.tabId === tabId);
            if (tab) {
                controller.selectTab(tab);
                return true;
            }
        }
        return false;
    }

    return { activateTab };
}
