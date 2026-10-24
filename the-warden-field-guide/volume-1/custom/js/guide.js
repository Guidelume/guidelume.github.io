void import(new URL("../../../../engine/js/resource-lifecycle.js", document.currentScript.src).href).catch(() => {});

/* The Warden's Field Guide: Guide JS */

document.addEventListener('DOMContentLoaded', () => {
    if (typeof GLightbox === 'function') GLightbox({ touchNavigation: true, loop: false, zoomable: true, autoplayVideos: false });
});

/* ---------- Background helper ---------- */
let bgLayer = document.getElementById('bgLayer');
function setBackground(src) {
    if (!bgLayer) {
        bgLayer = document.getElementById('bgLayer');
    }
    if (!bgLayer) return;
    bgLayer.style.backgroundImage = `url('${src}')`;
}

/* ---------- Utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function preferredScrollBehavior() {
    const reducedMotion = document.documentElement.dataset.reducedMotion === 'true'
        || matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reducedMotion ? 'auto' : 'smooth';
}
function basename(path) { return (path || '').split('/').pop(); }
function debounce(fn, wait = 120) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

/* ---------- Core DOM refs ---------- */
const contentBox = $('#contentBox');
const contentsList = $('#contentsList');
const expandAllBtn = $('#expandAllBtn');
const closeAllBtn = $('#closeAllBtn');
const prevPageBtn = $('#prevPageBtn');
const nextPageBtn = $('#nextPageBtn');
const chapList = $('#leftPanel');
let anchorsByPanel = new Map();
let activeContentsLink = null;
let restoredGuideState = null;
try {
    const rawState = window.frameElement?.dataset.resourceRestore;
    if (rawState) restoredGuideState = JSON.parse(rawState);
} catch {
    // Ignore invalid state supplied by an older desktop session.
}
const standaloneGuideStateKey = `twfg-guide-state:${location.pathname}${location.search}`;
if (!restoredGuideState && window.parent === window) {
    try {
        const rawState = sessionStorage.getItem(standaloneGuideStateKey);
        if (rawState) restoredGuideState = JSON.parse(rawState);
    } catch {
        // Storage can be unavailable in private browsing or restricted contexts.
    }
}
if (restoredGuideState?.href && restoredGuideState.href !== window.location.href) {
    restoredGuideState = null;
}

/* Explicit routes keep alternative installation methods out of the linear pager. */
function getPageRoute() {
    return window.TWFG.route(basename(location.pathname));
}
function updatePageNavStates() {
    const route = getPageRoute();
    const current = basename(location.pathname);
    for (const [button, target, direction] of [[prevPageBtn, route.previous, 'Previous'], [nextPageBtn, route.next, 'Next']]) {
        if (!button) continue;
        const label = target ? window.TWFG.pages[target].label : null;
        button.disabled = !target;
        button.classList.toggle('disabled', !target);
        button.textContent = label ? direction + ': ' + label : direction + ' page';
        button.setAttribute('aria-label', label ? direction + ' page: ' + label : 'No ' + direction.toLowerCase() + ' page');
        if (!target && direction === 'Next' && current === 'paths.html') button.textContent = 'Choose a path above';
        if (!target && direction === 'Next' && current === 'finish.html') button.textContent = 'Core guide complete';
    }
}
prevPageBtn?.addEventListener('click', () => {
    const target = getPageRoute().previous;
    if (target) location.href = target;
});
nextPageBtn?.addEventListener('click', () => {
    const target = getPageRoute().next;
    if (target) location.href = target;
});

/* PANELS & RIGHT CONTENTS */
let forcedActiveAnchor = null;
let programmaticScroll = false;

function getPanels() {
    return contentBox ? $$('.panel', contentBox) : [];
}
let panels = getPanels();
let currentPanelIndex = panels.findIndex(p => p.classList.contains('open'));
if (currentPanelIndex === -1) currentPanelIndex = 0;

function setPanelCaret(panel) {
    const header = $('.panel-header', panel);
    const caret = header && $('.caret', header);
    const open = panel.classList.contains('open');
    const body = $('.panel-body', panel);
    if (body) body.inert = !open;
    if (header && body) header.setAttribute('aria-controls', body.id);
    if (header) {
        header.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (caret) {
        caret.textContent = open ? '▾' : '▸';
    }
}

function getPanelTransitionMs(panel) {
    const body = $('.panel-body', panel);
    if (!body) return 0;
    const style = getComputedStyle(body);
    const parseTime = value => {
        const amount = Number.parseFloat(value) || 0;
        return value.trim().endsWith('ms') ? amount : amount * 1000;
    };
    const durations = style.transitionDuration.split(',').map(parseTime);
    const delays = style.transitionDelay.split(',').map(parseTime);
    return Math.max(0, ...durations.map((duration, index) => duration + (delays[index % delays.length] || 0)));
}

function afterPanelTransitions(changedPanels, callback) {
    const waitMs = Math.max(0, ...changedPanels.map(getPanelTransitionMs));
    setTimeout(() => requestAnimationFrame(callback), waitMs + (waitMs ? 24 : 0));
}

function openPanel(index, opts = { closeOthers: false, scrollOnOpen: true, behavior: preferredScrollBehavior() }, cb = null) {
    panels = getPanels();
    if (index < 0 || index >= panels.length) return;
    const target = panels[index];
    const changedPanels = [];

    if (opts.closeOthers) {
        panels.forEach(p => {
            if (p !== target && p.classList.contains('open')) {
                p.classList.remove('open');
                setPanelCaret(p);
                changedPanels.push(p);
            }
        });
    }

    if (!target.classList.contains('open')) {
        target.classList.add('open');
        setPanelCaret(target);
        changedPanels.push(target);
    }

    updateActivePanel(index);
    updateActiveLinks();
    schedulePersistGuideState();
    afterPanelTransitions(changedPanels, () => {
        if (opts.scrollOnOpen) navigateToElement(target, 0, opts.behavior || preferredScrollBehavior());
        if (typeof cb === 'function') cb();
    });
}

contentBox && contentBox.addEventListener('click', (e) => {
    const header = e.target.closest('.panel-header');
    if (!header) return;
    const panel = header.closest('.panel');
    if (!panel) return;
    const idx = Number(panel.dataset.index) || 0;
    const wasOpen = panel.classList.contains('open');
    if (wasOpen) {
        panel.classList.remove('open');
        setPanelCaret(panel);
        const navLink = contentsList?.querySelector(`a[href="#${panel.id}"]`);
        setContentsSectionState(navLink?.closest('.contents-section'), false);
        if (forcedActiveAnchor && document.getElementById(forcedActiveAnchor)?.closest('.panel') === panel) {
            forcedActiveAnchor = null;
        }
        const openIdx = getPanels().findIndex(p => p.classList.contains('open'));
        updateActivePanel(openIdx >= 0 ? openIdx : 0);
        updateActiveLinks();
    } else {
        openPanel(idx, { closeOthers: false, scrollOnOpen: false, behavior: preferredScrollBehavior() });
    }
    schedulePersistGuideState();
});

contentBox && contentBox.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const header = e.target.closest('.panel-header[role="button"]');
    if (!header) return;
    e.preventDefault();
    if (e.key === 'Enter' && !e.repeat) header.click();
});

contentBox && contentBox.addEventListener('keyup', (e) => {
    if (e.key !== ' ') return;
    const header = e.target.closest('.panel-header[role="button"]');
    if (!header) return;
    e.preventDefault();
    header.click();
});

/* ---------- Right contents builder ---------- */
function buildContents() {
    panels = getPanels();
    if (!contentsList) return;
    activeContentsLink = null;
    contentsList.innerHTML = '';
    let hashId = location.hash.slice(1);
    try { hashId = decodeURIComponent(hashId); } catch {}
    const hashTarget = hashId ? document.getElementById(hashId) : null;
    const hashPanel = hashTarget?.closest('.panel') || null;
    panels.forEach((p, i) => {
        p.dataset.index = i;
        const heading = $('.panel-header h2', p);
        const title = heading ? heading.innerText.trim() : `Panel ${i + 1}`;

        const li = document.createElement('li');
        li.className = 'contents-section';
        const row = document.createElement('div');
        row.className = 'contents-section-row';
        const a = document.createElement('a');
        a.href = `#${p.id}`;
        a.textContent = `${i + 1}. ${title}`;
        a.className = 'contents-link';
        a.dataset.index = i;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            setContentsSectionState(li, true);
            const targetHash = `#${p.id}`;
            if (location.hash !== targetHash) {
                history.pushState(null, '', targetHash);
            }
            openPanel(i, { closeOthers: false, scrollOnOpen: true, behavior: preferredScrollBehavior() });
            schedulePersistGuideState();
        });
        row.appendChild(a);

        const children = $$('.anchor[data-parent]', p);
        if (children.length) {
            const sub = document.createElement('ul');
            sub.className = 'contents-sublist';
            sub.id = `contents-${p.id}-sublist`;
            children.forEach(child => {
                const chi = document.createElement('li');
                const ca = document.createElement('a');
                ca.href = `#${child.id}`;
                ca.textContent = child.querySelector('h3') ? child.querySelector('h3').innerText.trim() : child.id;
                ca.dataset.index = i;
                ca.dataset.anchorId = child.id;
                ca.addEventListener('click', (ev) => {
                ev.preventDefault();

                const targetHash = `#${child.id}`;

                if (location.hash !== targetHash) {
                    history.pushState(null, '', targetHash);
                }
                
                programmaticScroll = true;
                forcedActiveAnchor = child.id;

                openPanel(i, {
                    closeOthers: true,
                    scrollOnOpen: false,
                    behavior: preferredScrollBehavior()
                }, () => {
                    const headerH = $('.panel-header', panels[i])?.offsetHeight || 0;
                    navigateToElement(child, headerH, preferredScrollBehavior());

                    // Let the smooth scroll finish before normal scroll detection takes over
                    setTimeout(() => {
                        programmaticScroll = false;
                    }, 1000); //I can only estimate but this feels mostly right
                    schedulePersistGuideState();
                });
            });
                chi.appendChild(ca);
                sub.appendChild(chi);
            });

            const initiallyOpen = p.classList.contains('open') || hashPanel === p;
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'contents-toggle';
            toggle.setAttribute('aria-controls', sub.id);
            row.appendChild(toggle);
            li.appendChild(row);
            li.appendChild(sub);
            setContentsSectionState(li, initiallyOpen);
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setContentsSectionState(li, !li.classList.contains('open'));
                schedulePersistGuideState();
            });
        } else {
            li.appendChild(row);
        }
        contentsList.appendChild(li);
    });
}

function setContentsSectionState(section, open) {
    if (!section) return;
    section.classList.toggle('open', open);
    const toggle = $('.contents-toggle', section);
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} headings in ${$('.contents-link', section)?.textContent || 'chapter'}`);
    toggle.textContent = open ? '▾' : '▸';
}

/* ---------- Scrolling helpers ---------- */
function getActiveScrollRoot() {
    if (contentBox && contentBox.scrollHeight > contentBox.clientHeight) return contentBox;
    return document.scrollingElement || document.documentElement;
}

function rebuildAnchorIndex() {
    anchorsByPanel = new Map(panels.map(panel => [panel, []]));
    $$('.anchor', contentBox || document).forEach(anchor => {
        const panel = anchor.closest('.panel');
        if (panel && anchorsByPanel.has(panel)) anchorsByPanel.get(panel).push(anchor);
    });
}

function getScrollTop() {
    const root = getActiveScrollRoot();
    if (root === document.scrollingElement || root === document.documentElement) {
        return window.scrollY || document.documentElement.scrollTop || 0;
    }
    return root.scrollTop || 0;
}
function navigateToElement(el, headerOffset = 0, behavior = preferredScrollBehavior()) {
    if (!el) return;
    const root = getActiveScrollRoot();
    const rootIsPage = (root === document.scrollingElement || root === document.documentElement);
    const rootRect = rootIsPage ? { top: 0 } : root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetWithin = elRect.top - rootRect.top;
    const currentScroll = getScrollTop();
    const compactLayout = window.matchMedia('(max-width: 700px)').matches;
    const stickyChapterOffset = compactLayout && chapList ? chapList.getBoundingClientRect().height + 8 : 0;
    const target = Math.max(0, Math.round(currentScroll + offsetWithin - headerOffset - stickyChapterOffset - 4));
    try {
        if (rootIsPage) {
            window.scrollTo({ top: target, behavior });
        } else {
            root.scrollTo({ top: target, behavior });
        }
    } catch {
        if (rootIsPage) {
            window.scrollTo(0, target);
        } else {
            root.scrollTop = target;
        }
    }
}

function navigateToCurrentHash(behavior = 'auto') {
    let hashId = location.hash.slice(1);
    try { hashId = decodeURIComponent(hashId); } catch {}
    const target = hashId ? document.getElementById(hashId) : null;
    if (!target) return;
    const panel = target.closest('.panel');
    if (panel) {
        const index = getPanels().indexOf(panel);
        if (index >= 0) {
            panel.classList.add('open');
            setPanelCaret(panel);
            updateActivePanel(index);
        }
    }
    forcedActiveAnchor = target.classList.contains('anchor') ? target.id : null;
    programmaticScroll = true;
    afterPanelTransitions(panel ? [panel] : [], () => {
        const headerHeight = panel ? ($('.panel-header', panel)?.offsetHeight || 0) : 0;
        navigateToElement(target, headerHeight, behavior);
        updateActiveLinks();
        setTimeout(() => { programmaticScroll = false; }, 250);
    });
}
window.addEventListener('popstate', () => navigateToCurrentHash());
window.addEventListener('hashchange', () => navigateToCurrentHash());

/* ---------- Scroll state -> active links ---------- */
let scrollRaf = null;
function scrollHandler() {
    if (scrollRaf) return;

    scrollRaf = requestAnimationFrame(() => {
        if (!programmaticScroll) {
            forcedActiveAnchor = null;
        }

        handleContentScroll();
        updateContentProgress();
        schedulePersistGuideState();

        scrollRaf = null;
    });
}
window.addEventListener('scroll', scrollHandler, { passive: true });
contentBox && contentBox.addEventListener('scroll', scrollHandler, { passive: true });

function handleContentScroll() {
    panels = getPanels();

    const openPanels = panels.filter(p => p.classList.contains('open'));
    if (!openPanels.length) return;

    const st = getScrollTop();
    const root = getActiveScrollRoot();
    const rootRect =
        (root === document.scrollingElement || root === document.documentElement)
            ? { top: 0 }
            : root.getBoundingClientRect();

    let activePanel = openPanels[0];

    for (const panel of openPanels) {
        const rect = panel.getBoundingClientRect();
        const panelTop = st + (rect.top - rootRect.top);

        if (st + 10 >= panelTop - 2) {
            activePanel = panel;
        } else {
            break;
        }
    }

    const idx = panels.indexOf(activePanel);

    currentPanelIndex = idx >= 0 ? idx : 0;

    updateActivePanel(currentPanelIndex);
    updateActiveLinks();
}

const debouncedEnsureNavVisible = debounce((link) => {
    if (!link || link.offsetParent === null) return;

    const nav = contentsList?.closest('.contents-panel');
    if (!nav) return;

    const linkRect = link.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const PAD = 12;

    // Already comfortably visible
    if (
        linkRect.top >= navRect.top + PAD &&
        linkRect.bottom <= navRect.bottom - PAD
    ) {
        return;
    }

    // Only scroll when the active link actually leaves the viewport.
    if (linkRect.top < navRect.top + PAD) {
        nav.scrollTo({
            top: nav.scrollTop + (linkRect.top - navRect.top) - PAD,
            behavior: preferredScrollBehavior()
        });
    } else if (linkRect.bottom > navRect.bottom - PAD) {
        nav.scrollTo({
            top: nav.scrollTop + (linkRect.bottom - navRect.bottom) + PAD,
            behavior: preferredScrollBehavior()
        });
    }
}, 150);

function findVerticalScrollParent(el) {
    if (!el) return document.scrollingElement || document.documentElement;
    let cur = el.parentElement;
    while (cur && cur !== document.documentElement) {
        const style = getComputedStyle(cur);
        const overflowY = style.overflowY;
        const isScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && cur.scrollHeight > cur.clientHeight + 2;
        if (isScrollable) return cur;
        cur = cur.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

function updateActiveLinks() {
    if (!contentsList) return;
    const activateLink = link => {
        const activeSection = link.closest('.contents-section');
        $$('.contents-section.open', contentsList).forEach(section => {
            if (section !== activeSection) setContentsSectionState(section, false);
        });
        if (activeContentsLink !== link) {
            activeContentsLink?.classList.remove('active');
            link.classList.add('active');
            activeContentsLink = link;
        }
        setContentsSectionState(activeSection, true);
        debouncedEnsureNavVisible(link);
    };
    
    // An explicit anchor jump takes precedence until the user scrolls again.
    if (forcedActiveAnchor) {
        const target = document.getElementById(forcedActiveAnchor);
        if (!target?.closest('.panel')?.classList.contains('open')) forcedActiveAnchor = null;
    }
    if (forcedActiveAnchor) {
        const forcedLink = contentsList.querySelector(
            `a[href="#${forcedActiveAnchor}"]`
        );

        if (forcedLink) {
            activateLink(forcedLink);
            return;
        }

        forcedActiveAnchor = null;
    }
    
    panels = getPanels();
    if (!panels.length) return;
    if (!panels.some(panel => panel.classList.contains('open'))) {
        activeContentsLink?.classList.remove('active');
        activeContentsLink = null;
        $$('.contents-section.open', contentsList).forEach(section => setContentsSectionState(section, false));
        return;
    }

    // handleContentScroll has already selected the panel containing the viewport.
    // Search only that panel's cached anchors, then binary-search their positions.
    const panel = panels[currentPanelIndex];
    if (!panel?.classList.contains('open')) return;
    const visibleAnchors = anchorsByPanel.get(panel) || [];
    const root = getActiveScrollRoot();
    const rootRect = (root === document.scrollingElement || root === document.documentElement) ? { top: 0 } : root.getBoundingClientRect();
    const headerH = $('.panel-header', panel)?.offsetHeight || 0;
    const offset = Math.max(60, headerH + 12);
    let currentAnchor = null;
    let low = 0;
    let high = visibleAnchors.length - 1;
    const activationLine = rootRect.top + offset;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (visibleAnchors[middle].getBoundingClientRect().top <= activationLine) {
            currentAnchor = visibleAnchors[middle];
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    if (currentAnchor) {
        const subLink = contentsList.querySelector(`a[href="#${currentAnchor.id}"]`);
        if (subLink) {
            activateLink(subLink);
            return;
        }
    }

    if (panel?.classList.contains('open')) {
        const panelLink = contentsList.querySelector(`a[href="#${panel.id}"]`);
        if (panelLink) {
            activateLink(panelLink);
        }
    }
}

function updateActivePanel(index) {
    panels = getPanels();
    currentPanelIndex = (typeof index === 'number' && index >= 0 && index < panels.length) ? index : currentPanelIndex;
    updatePageNavStates();
}

/* Scrolling Progress bar */
const progressBar = $('.content-progress-bar');

function updateContentProgress() {
    if (!contentBox || !progressBar) return;

    const root = getActiveScrollRoot();
    const isPageScroll = root === document.scrollingElement || root === document.documentElement;
    const maxScroll = root.scrollHeight - root.clientHeight;

    if (maxScroll <= 0) {
        progressBar.style.width = '0%';
        return;
    }

    const scrollTop = isPageScroll ? (window.scrollY || document.documentElement.scrollTop || 0) : root.scrollTop;
    const progress = (scrollTop / maxScroll) * 100;
    progressBar.style.width = `${progress}%`;
}

/* =========================================
    REBUILD (once, and on very few triggers)
    ======================================== */
function rebuildAll() {
    panels = getPanels();
    panels.forEach((p, i) => {
        p.dataset.index = i;
    });
    let hashId = location.hash.slice(1);
    try { hashId = decodeURIComponent(hashId); } catch {}
    const hashPanel = document.getElementById(hashId)?.closest('.panel');
    if (hashPanel) hashPanel.classList.add('open');
    buildContents();
    rebuildAnchorIndex();
    panels.forEach(setPanelCaret);
    if (!restoredGuideState && !panels.some(p => p.classList.contains('open')) && panels[0]) {
        panels[0].classList.add('open');
    }
    currentPanelIndex = panels.findIndex(p => p.classList.contains('open'));
    if (currentPanelIndex === -1) currentPanelIndex = 0;
    updateActivePanel(currentPanelIndex);
    updatePageNavStates();
    updateActiveLinks();
}
rebuildAll();

function getGuideResourceState() {
    return {
    href: window.location.href,
    contentScrollTop: contentBox?.scrollTop || 0,
    pageScrollX: window.scrollX || 0,
    pageScrollTop: window.scrollY || document.documentElement.scrollTop || 0,
    contentsScrollTop: $('.contents-panel')?.scrollTop || 0,
    chaptersScrollTop: chapList?.scrollTop || 0,
    openContentsSectionIds: $$('.contents-section.open', contentsList || document).map(section => section.querySelector('.contents-link')?.getAttribute('href')?.slice(1)).filter(Boolean),
    activeAnchorId: activeContentsLink?.getAttribute('href')?.slice(1) || null,
    openPanelIds: getPanels().filter(panel => panel.classList.contains('open')).map(panel => panel.id),
    currentPanelId: panels[currentPanelIndex]?.id || null
    };
}

function applyGuideResourceState(state) {
    if (!state || !Array.isArray(state.openPanelIds)) return false;
    panels = getPanels();
    const savedIds = new Set(state.openPanelIds.filter(id => typeof id === 'string'));
    const changedPanels = [];
    panels.forEach(panel => {
        const shouldOpen = savedIds.has(panel.id);
        if (panel.classList.contains('open') !== shouldOpen) changedPanels.push(panel);
        panel.classList.toggle('open', shouldOpen);
        setPanelCaret(panel);
    });
    const savedCurrentIndex = panels.findIndex(panel => panel.id === state.currentPanelId);
    currentPanelIndex = savedCurrentIndex >= 0
        ? savedCurrentIndex
        : panels.findIndex(panel => panel.classList.contains('open'));
    if (currentPanelIndex < 0) currentPanelIndex = 0;
    updateActivePanel(currentPanelIndex);
    afterPanelTransitions(changedPanels, () => {
        const savedContentsSections = new Set((state.openContentsSectionIds || []).filter(id => typeof id === 'string'));
        $$('.contents-section', contentsList || document).forEach(section => {
            const id = section.querySelector('.contents-link')?.getAttribute('href')?.slice(1);
            setContentsSectionState(section, savedContentsSections.has(id));
        });
        const contentsPanel = $('.contents-panel');
        if (contentsPanel) contentsPanel.scrollTop = Math.max(0, Number(state.contentsScrollTop) || 0);
        if (chapList) chapList.scrollTop = Math.max(0, Number(state.chaptersScrollTop) || 0);
        // The page can switch between contentBox scrolling and document scrolling as
        // its layout changes (for example, when panels are restored). Restore both
        // independently so the saved position survives either scroll-root choice.
        const savedContentScrollTop = Math.max(0, Number(state.contentScrollTop) || 0);
        const savedPageScrollTop = Math.max(0, Number(state.pageScrollTop) || 0);
        if (contentBox) contentBox.scrollTop = savedContentScrollTop;
        window.scrollTo(Math.max(0, Number(state.pageScrollX) || 0), savedPageScrollTop);
        let hashId = location.hash.slice(1);
        try { hashId = decodeURIComponent(hashId); } catch {}
        const savedAnchorId = typeof state.activeAnchorId === 'string' ? state.activeAnchorId : hashId;
        const hashTarget = savedAnchorId ? document.getElementById(savedAnchorId) : null;
        forcedActiveAnchor = hashTarget?.classList.contains('anchor') ? savedAnchorId : null;
        const activeRoot = getActiveScrollRoot();
        const activeRootIsPage = activeRoot === document.scrollingElement || activeRoot === document.documentElement;
        const savedOffsetForActiveRoot = activeRootIsPage ? savedPageScrollTop : savedContentScrollTop;
        // If this layout has no saved offset for its active scroll root, use the
        // saved chapter link to recover position.
        if (hashTarget && savedOffsetForActiveRoot === 0) {
            const targetPanel = hashTarget.closest('.panel');
            navigateToElement(hashTarget, targetPanel ? ($('.panel-header', targetPanel)?.offsetHeight || 0) : 0, 'auto');
        }
        updateActiveLinks();
        handleContentScroll();
        try { if (window.frameElement) delete window.frameElement.dataset.resourceRestore; } catch {}
        restoredGuideState = null;
    });
    return true;
}

window.guidelumeGetResourceState = getGuideResourceState;
window.guidelumeRestoreResourceState = state => {
    if (state?.href && state.href !== window.location.href) return false;
    requestAnimationFrame(() => requestAnimationFrame(() => applyGuideResourceState(state)));
    return true;
};

let persistGuideStateTimer = null;
function schedulePersistGuideState() {
    if (window.parent !== window) return;
    clearTimeout(persistGuideStateTimer);
    persistGuideStateTimer = setTimeout(saveStandaloneGuideState, 180);
}
function saveStandaloneGuideState() {
    if (window.parent !== window) return;
    try { sessionStorage.setItem(standaloneGuideStateKey, JSON.stringify(getGuideResourceState())); } catch {}
}
window.addEventListener('pagehide', saveStandaloneGuideState);

/* ========================================================================
    LEFT NAV
    - Current page highlighting
    - Collapsible navigation sections
    - Automatically opens the section containing the current page
    ======================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    const currentFile = (basename(window.location.pathname) || '').toLowerCase();
    const contentsPanel = $('.contents-panel');
    const rightPanel = $('.right-panel');
    if (contentsPanel && rightPanel) {
        const compactLayout = window.matchMedia('(max-width: 700px)');
        let disclosure = null;
        const syncContentsDisclosure = () => {
            if (compactLayout.matches && !contentsPanel.parentElement?.matches('.mobile-contents-disclosure')) {
                disclosure = document.createElement('details');
                disclosure.className = 'mobile-contents-disclosure';
                const summary = document.createElement('summary');
                summary.setAttribute('aria-label', 'Show table of contents');
                const icon = document.createElement('span');
                icon.className = 'mobile-contents-icon';
                icon.setAttribute('aria-hidden', 'true');
                summary.append(icon);
                disclosure.append(summary, contentsPanel);
                rightPanel.insertBefore(disclosure, rightPanel.firstChild);
                disclosure.open = false;
                disclosure.addEventListener('toggle', () => {
                    summary.setAttribute('aria-label', `${disclosure.open ? 'Hide' : 'Show'} table of contents`);
                });
            } else if (!compactLayout.matches && contentsPanel.parentElement?.matches('.mobile-contents-disclosure')) {
                contentsPanel.parentElement.replaceWith(contentsPanel);
                disclosure = null;
            }
        };
        syncContentsDisclosure();
        compactLayout.addEventListener('change', syncContentsDisclosure);
    }

    const sections = $$('.nav-section');

    /* ---------- Current page ---------- */

    $$('.chap-list a').forEach(a => {
        const hrefBase = (basename(a.getAttribute('href') || '') || '').toLowerCase();

        if (hrefBase === currentFile) {
            a.classList.add('disabled');
            a.setAttribute('aria-current', 'page');

            if (!a._guide_disabled_handler_added) {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                });
                a._guide_disabled_handler_added = true;
            }

            const parentLi = a.closest('.chap-item');
            if (parentLi) {
                parentLi.classList.add('active');
            }

            if (window.TWFG.pages[currentFile]?.branch) {
                document.querySelector('[data-href="paths.html"]')?.classList.add('branch-parent');
            }
        }
    });

    /* ---------- Section toggles ---------- */

    function setSectionState(section, open) {
        const header = $('.nav-section-header', section);
        const caret = $('.nav-section-caret', section);

        section.classList.toggle('open', open);

        if (header) {
            header.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        if (caret) {
            caret.textContent = open ? '▾' : '▸';
        }
    }

    sections.forEach(section => {
        const header = $('.nav-section-header', section);
        if (!header) return;

        const initiallyOpen = section.classList.contains('open');
        setSectionState(section, initiallyOpen);

        header.addEventListener('click', () => {
            const isOpen = section.classList.contains('open');
            setSectionState(section, !isOpen);
        });
    });

    /* ---------- Automatically open current section (and only the current section) ---------- */
    
    let currentSection = null;
    
    sections.forEach(section => {
        const containsCurrentPage = $$('a', section).some(a => {
            const hrefBase =
                (basename(a.getAttribute('href') || '') || '').toLowerCase();

            return hrefBase === currentFile;
        });

        if (containsCurrentPage) {
            currentSection = section;
        }
    });
    
    sections.forEach(section => {
        setSectionState(section, section === currentSection);
    });
    
    updatePageNavStates();
    handleContentScroll();
    
    if (location.hash) {
        if (!restoredGuideState) setTimeout(() => navigateToCurrentHash('auto'), 60);
    }

    if (restoredGuideState && Array.isArray(restoredGuideState.openPanelIds)) {
        window.guidelumeRestoreResourceState(restoredGuideState);
    } else if (!restoredGuideState && window.parent === window) {
        const hashId = location.hash.slice(1);
        if (hashId) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                handleContentScroll();
                updateActiveLinks();
            }));
        }
    }
});

/* ===================
    EXPAND/CLOSE ALL
    ================== */
function expandAllPanels() {
    const panels = getPanels();
    panels.forEach(p => {
        if (!p.classList.contains('open')) {
            p.classList.add('open');
            setPanelCaret(p);
        }
    });
    const firstOpen = panels.findIndex(p => p.classList.contains('open'));
    updateActivePanel(firstOpen >= 0 ? firstOpen : 0);
    updateActiveLinks();
    schedulePersistGuideState();
}
function closeAllPanels() {
    const panels = getPanels();
    panels.forEach(p => {
        p.classList.remove('open');
        setPanelCaret(p);
    });
    updateActivePanel(0);
    updateActiveLinks();
    schedulePersistGuideState();
}
expandAllBtn && expandAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    expandAllPanels();
});
closeAllBtn && closeAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeAllPanels();
});

/* ========================================================================
    ACCESSIBLE TOGGLES (Show Details / Hide Details)
    - Backward-compatible with IDs: toggleTextureImgBtn, toggleTextureImgBtn2...
    - Each button controls #textureImgWrap + suffix
    ======================================================================= */
(function initShowHideToggles() {
    const buttons = $$('[id^="toggleTextureImgBtn"]');
    buttons.forEach(btn => {
        const suffix = btn.id.replace('toggleTextureImgBtn', '');
        const wrap = document.getElementById(`textureImgWrap${suffix}`);
        if (!wrap) return;

        const wrapId = wrap.id || `wrap-${Math.random().toString(36).slice(2)}`;
        wrap.id = wrapId;

        const initiallyOpen = wrap.classList.contains('open') || wrap.getAttribute('aria-hidden') === 'false';
        const labelOpen = btn.dataset.labelOpen || 'Hide Details';
        const labelClosed = btn.dataset.labelClosed || 'Show Details';

        wrap.setAttribute('aria-hidden', initiallyOpen ? 'false' : 'true');
        btn.setAttribute('type', 'button');
        btn.setAttribute('aria-controls', wrapId);
        btn.setAttribute('aria-expanded', initiallyOpen ? 'true' : 'false');
        btn.textContent = initiallyOpen ? labelOpen : labelClosed;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const open = wrap.classList.toggle('open');
            wrap.setAttribute('aria-hidden', open ? 'false' : 'true');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.textContent = open ? labelOpen : labelClosed;
        });
    });
})();

/* =======================================
    DEBUG HELPERS (unchanged API surface)
    ====================================== */
window.__STEP = {
    getPanels,
    openPanel: (i) => openPanel(i, { closeOthers: true, scrollOnOpen: true, behavior: preferredScrollBehavior() }),
    goToPanel: (i) => openPanel(i, { closeOthers: true, scrollOnOpen: true, behavior: preferredScrollBehavior() }),
    rebuildAll,
    setBackground,
    expandAllPanels,
    closeAllPanels,
    updateActiveLinks,
    getPageRoute
};

/* =================
    CAROUSEL BLOCK
    ================ */
// -------------------- Informational carousel (stable live-sync, race-hardened) --------------------
(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const CAROUSEL_SELECTOR = '.informational-carousel';
        const carousels = Array.from(document.querySelectorAll(CAROUSEL_SELECTOR));
        if (!carousels.length) return;

        // one capture-phase interceptor to ensure per-carousel LB handles clicks first
        if (!window._twfg_carousel_click_interceptor_added) {
            window._twfg_carousel_click_interceptor_added = true;
            document.addEventListener('click', (ev) => {
                const a = ev.target.closest && ev.target.closest('.informational-carousel a.glightbox');
                if (!a) return;
                const carousel = a.closest('.informational-carousel');
                if (!carousel) return;

                const anchors = Array.from(carousel.querySelectorAll('a.glightbox'));
                const i = anchors.indexOf(a);
                if (i === -1) return;

                const lb = carousel._twfg_lb;
                if (lb && typeof lb.openAt === 'function') {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    try {
                        lb.openAt(i);
                    } catch (err) {
                        try {
                            lb.open();
                            setTimeout(() => lb.goTo && lb.goTo(i), 40);
                        } catch (e) { }
                    }
                    return;
                }

                // if no stored instance, build a temporary GLightbox from DOM order and open it
                if (typeof GLightbox === 'function') {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    try {
                        const elements = anchors.map(a2 => ({
                            href: a2.href,
                            type: 'image',
                            title: a2.dataset.title || '',
                            description: a2.dataset.description || ''
                        }));
                        const tempLb = GLightbox({ elements, touchNavigation: true, loop: false, zoomable: true });
                        carousel._twfg_lb = tempLb;
                        // bind slide -> update track (minimal)
                        try {
                            tempLb.on && tempLb.on('slide_after_load', (payload) => {
                                const si = (payload && typeof payload.slideIndex === 'number') ? payload.slideIndex :
                                    (typeof tempLb.getActiveSlideIndex === 'function' ? tempLb.getActiveSlideIndex() : null);
                                if (si !== null && typeof si === 'number') {
                                    const track = carousel.querySelector('.infc-track');
                                    if (track) track.style.transform = `translateX(-${si * 100}%)`;
                                }
                            });
                        } catch (e) { }
                        tempLb.openAt(i);
                    } catch (err) {
                        // give up quietly and allow default behavior if GLightbox not present
                    }
                }
            }, true); // capture
        }

        carousels.forEach((carousel, cIndex) => {
            const track = carousel.querySelector('.infc-track');
            const slides = Array.from(carousel.querySelectorAll('.infc-item'));
            if (!track || slides.length === 0) return;

            // controls / DOM refs
            let prev = carousel.querySelector('.infc-prev');
            let next = carousel.querySelector('.infc-next');
            let viewport = carousel.querySelector('.infc-viewport');
            let dotsWrap = carousel.querySelector('.infc-dots');

            // create missing nodes defensively
            if (!dotsWrap) {
                dotsWrap = document.createElement('div');
                dotsWrap.className = 'infc-dots';
            }
            if (!prev) {
                prev = document.createElement('button');
                prev.className = 'infc-arrow infc-prev';
                prev.type = 'button';
                prev.innerHTML = '‹';
                carousel.prepend(prev);
            }
            if (!next) {
                next = document.createElement('button');
                next.className = 'infc-arrow infc-next';
                next.type = 'button';
                next.innerHTML = '›';
                carousel.appendChild(next);
            }

            // ensure controls row
            let controls = carousel.querySelector('.infc-controls');
            if (!controls) {
                controls = document.createElement('div');
                controls.className = 'infc-controls';
                if (viewport && viewport.parentNode) {
                    viewport.parentNode.insertBefore(controls, viewport.nextSibling);
                } else {
                    carousel.appendChild(controls);
                }
            }
            // move into controls idempotently
            if (controls !== prev.parentNode) controls.appendChild(prev);
            if (controls !== dotsWrap.parentNode) controls.appendChild(dotsWrap);
            if (controls !== next.parentNode) controls.appendChild(next);

            // state
            let idx = 0;
            let lightboxInstance = null;
            let lightboxOpen = false;
            let lastRequestedOpenIndex = null; // set when to call openAt/open programmatically
            let isSyncingFromLightbox = false; // guard to avoid feedback loop
            const anchors = Array.from(carousel.querySelectorAll('a.glightbox'));
            const galleryName = `twfg-carousel-${cIndex}`;

            // normalize anchors (ensures ordered elements if GLightbox uses elements later)
            anchors.forEach(a => a.setAttribute('data-gallery', galleryName));

            // build dots fresh
            dotsWrap.innerHTML = '';
            slides.forEach((_, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.dataset.index = i;
                b.setAttribute('aria-label', `Go to step ${i + 1}`);
                if (i === 0) b.setAttribute('aria-current', 'true');
                // handler
                const handler = () => {
                    idx = i;
                    update();
                };
                b._twfg_click = handler;
                b.addEventListener('click', handler);
                dotsWrap.appendChild(b);
            });

            // bind arrows once
            function bindArrow(btn, dir) {
                if (!btn) return;
                if (btn._twfg_bound) return;
                const fn = () => {
                    if (dir === 'prev' && idx > 0) {
                        idx -= 1;
                        update();
                    } else if (dir === 'next' && idx < slides.length - 1) {
                        idx += 1;
                        update();
                    }
                };
                btn.addEventListener('click', fn);
                btn._twfg_bound = true;
                btn._twfg_fn = fn;
                // blur helpers
                btn.addEventListener('pointerup', () => setTimeout(() => btn.blur(), 10));
                btn.addEventListener('pointercancel', () => btn.blur());
            }
            bindArrow(prev, 'prev');
            bindArrow(next, 'next');

            // keyboard nav for viewport. IGNORE when lightbox is open
            if (viewport && !viewport._twfg_kbd) {
                viewport.addEventListener('keydown', (ev) => {
                    if (lightboxOpen) return; // prevent double handling when modal has focus
                    if (ev.key === 'ArrowLeft') {
                        ev.preventDefault();
                        prev.click();
                    }
                    if (ev.key === 'ArrowRight') {
                        ev.preventDefault();
                        next.click();
                    }
                });
                viewport._twfg_kbd = true;
            }

            // touch swipe
            if (viewport && !viewport._twfg_touch) {
                let startX = null;
                let isTouch = false;
                viewport.addEventListener('touchstart', (e) => {
                    startX = e.touches[0].clientX;
                    isTouch = true;
                }, { passive: true });
                viewport.addEventListener('touchmove', (e) => {
                    if (!isTouch) return;
                    const dx = e.touches[0].clientX - startX;
                    track.style.transition = 'none';
                    track.style.transform = `translateX(calc(-${idx * 100}% + ${dx}px))`;
                }, { passive: true });
                viewport.addEventListener('touchend', (e) => {
                    isTouch = false;
                    const dx = e.changedTouches[0].clientX - startX;
                    if (Math.abs(dx) > 60) {
                        if (dx < 0 && idx < slides.length - 1) next.click();
                        else if (dx > 0 && idx > 0) prev.click();
                    } else {
                        update();
                    }
                    startX = null;
                });
                viewport._twfg_touch = true;
            }

            // visual update
            function update(animate = true) {
                track.style.transition = animate ? 'transform 420ms cubic-bezier(.2,.9,.2,1)' : 'none';
                track.style.transform = `translateX(-${idx * 100}%)`;

                Array.from(dotsWrap.children).forEach((d, i) => {
                    if (i === idx) d.setAttribute('aria-current', 'true');
                    else d.removeAttribute('aria-current');
                });

                // arrows enable/disable
                if (idx <= 0) {
                    prev.setAttribute('disabled', '');
                    prev.classList.add('infc-disabled');
                    prev.setAttribute('aria-disabled', 'true');
                } else {
                    prev.removeAttribute('disabled');
                    prev.classList.remove('infc-disabled');
                    prev.removeAttribute('aria-disabled');
                }
                if (idx >= slides.length - 1) {
                    next.setAttribute('disabled', '');
                    next.classList.add('infc-disabled');
                    next.setAttribute('aria-disabled', 'true');
                } else {
                    next.removeAttribute('disabled');
                    next.classList.remove('infc-disabled');
                    next.removeAttribute('aria-disabled');
                }

                if (viewport) {
                    viewport.setAttribute('aria-label', `Step ${idx + 1} of ${slides.length}`);
                }

                // push to lightbox if open and not currently syncing from it
                if (!isSyncingFromLightbox) safeLightboxGoTo(idx);
            }

            // safe push to LB
            function safeLightboxGoTo(n) {
                if (!lightboxOpen || !lightboxInstance) return;
                // avoid pushing if I just requested this open (debounce)
                if (lastRequestedOpenIndex !== null && lastRequestedOpenIndex === n) return;
                try {
                    if (typeof lightboxInstance.getActiveSlideIndex === 'function') {
                        const active = lightboxInstance.getActiveSlideIndex();
                        if (typeof active === 'number' && active === n) return;
                    }
                    if (typeof lightboxInstance.goToSlide === 'function') {
                        lightboxInstance.goToSlide(n);
                    } else if (typeof lightboxInstance.goTo === 'function') {
                        lightboxInstance.goTo(n);
                    } else if (typeof lightboxInstance.openAt === 'function') {
                        lightboxInstance.openAt(n);
                    }
                } catch (err) {
                    /* ignore timing errors */
                }
            }

            // GLightbox init + robust binding
            function tryInitLightbox() {
                try {
                    if (typeof GLightbox !== 'function') throw new Error('GLightbox missing');

                    const elements = anchors.map(a => ({
                        href: a.href,
                        type: 'image',
                        title: a.dataset.title || '',
                        description: a.dataset.description || ''
                    }));

                    lightboxInstance = GLightbox({ elements, touchNavigation: true, loop: false, zoomable: true });
                    try {
                        carousel._twfg_lb = lightboxInstance;
                    } catch (e) { }

                    // attach click handlers (explicit openAt) and remove old if present
                    anchors.forEach((a, i) => {
                        if (a._twfg_click) a.removeEventListener('click', a._twfg_click);
                        const handler = (ev) => {
                            ev.preventDefault();
                            // explicitly requested this open so avoid pushing the same index back
                            lastRequestedOpenIndex = i;
                            setTimeout(() => {
                                lastRequestedOpenIndex = null;
                            }, 500); // short window to cover init
                            try {
                                if (lightboxInstance && typeof lightboxInstance.openAt === 'function') {
                                    lightboxInstance.openAt(i);
                                } else if (lightboxInstance && typeof lightboxInstance.goTo === 'function') {
                                    lightboxInstance.goTo(i);
                                } else {
                                    lightboxInstance.open && lightboxInstance.open();
                                    setTimeout(() => lightboxInstance.goTo && lightboxInstance.goTo(i), 50);
                                }
                            } catch (err) {
                                console.error('[guide.js] lightbox open error', err);
                            }
                        };
                        a.addEventListener('click', handler);
                        a._twfg_click = handler;
                    });

                    bindLightboxSync();
                } catch (err) {
                    // retry shortly if GLightbox isn't present yet
                    setTimeout(() => {
                        try {
                            if (typeof GLightbox === 'function') tryInitLightbox();
                        } catch (e) { }
                    }, 250);
                }
            }

            function bindLightboxSync() {
                if (!lightboxInstance || typeof lightboxInstance.on !== 'function') return;
                if (lightboxInstance._twfg_bound) return;
                lightboxInstance._twfg_bound = true;
                try {
                    carousel._twfg_lb = lightboxInstance;
                } catch (e) { }

                // helper to extract index from different payload shapes
                const extractIndex = (payload) => {
                    if (payload === null || payload === undefined) return null;
                    if (typeof payload === 'number') return payload;
                    if (typeof payload === 'object') {
                        if (typeof payload.slideIndex === 'number') return payload.slideIndex;
                        if (typeof payload.index === 'number') return payload.index;
                        if (payload.current && typeof payload.current.index === 'number') return payload.current.index;
                    }
                    try {
                        if (typeof lightboxInstance.getActiveSlideIndex === 'function') {
                            const gi = lightboxInstance.getActiveSlideIndex();
                            if (typeof gi === 'number') return gi;
                        }
                    } catch (e) { }
                    return null;
                };

                // mark open/close state (do NOT force openAt here!! it caused races)
                // took me like two hours to figure out. There has to be an easier way to do this right????
                lightboxInstance.on('open', () => {
                    lightboxOpen = true; /* don't call openAt here */
                });

                // slide event -> update page (guarded)
                const onSlide = (payload) => {
                    const si = extractIndex(payload);
                    if (si === null) return;
                    if (si !== idx) {
                        isSyncingFromLightbox = true;
                        idx = si;
                        update();
                        // small debounce before allowing page -> LB pushes again
                        setTimeout(() => {
                            isSyncingFromLightbox = false;
                        }, 80);
                    }
                };

                // try several event names to be compatible
                try {
                    lightboxInstance.on('slide_after_load', onSlide);
                } catch (e) { }
                try {
                    lightboxInstance.on('slide_changed', onSlide);
                } catch (e) { }
                try {
                    lightboxInstance.on('slide_before_change', onSlide);
                } catch (e) { }

                lightboxInstance.on('close', () => {
                    lightboxOpen = false;
                    lastRequestedOpenIndex = null;
                    isSyncingFromLightbox = false;
                    try {
                        if (viewport) viewport.focus();
                    } catch (e) { }
                });
            }

            tryInitLightbox();
            // initial render
            update(false);
        }); // end per-carousel foreach
    }); // end DOMContentLoaded
})(); // end everything if this doesn't work
