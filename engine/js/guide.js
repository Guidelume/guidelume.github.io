/* Milky Way Bar Crawl: Guide JS */

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
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
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

/* ===========================
	PAGE SEQUENCE (Prev/Next)
	========================== */
function resolveHrefToBasename(href) {
	try {
		const url = new URL(href, window.location.href);
		return basename(url.pathname);
	} catch {
		const cleaned = (href || '').split(/[?#]/)[0];
		return basename(cleaned);
	}
}

function buildLeftNavSequence() {
	const seq = [];
	const nav = $('#leftPanel');
	if (!nav) return seq;

	const anchors = $$('a[href]', nav);
	const seen = new Set();

	anchors.forEach(a => {
		const hrefRaw = a.getAttribute('href') || '';
		const base = resolveHrefToBasename(hrefRaw);

		if (!base) return;
		if (seen.has(base)) return;

		seen.add(base);

		seq.push({
			href: hrefRaw,
			base,
			label: (a.innerText || '').trim()
		});
	});

	return seq;
}

let _leftNavSequence = null;
function getLeftNavSequence() {
	if (!_leftNavSequence) {
		_leftNavSequence = buildLeftNavSequence();
	}
	return _leftNavSequence;
}
function invalidateLeftNavSequence() {
	_leftNavSequence = null;
}

function findCurrentNavIndex(seq) {
	const currentPathBasename = basename(window.location.pathname || '') || '';
	const currentFull = window.location.href;

	let idx = seq.findIndex(item => item.base === currentPathBasename);
	if (idx !== -1) return idx;

	idx = seq.findIndex(item => {
		try {
			const resolved = new URL(item.href, window.location.href).pathname;
			return currentFull.endsWith(resolved) || window.location.pathname.endsWith(resolved);
		} catch {
			return false;
		}
	});
	if (idx !== -1) return idx;

	idx = seq.findIndex(item => {
		try {
			const r = new URL(item.href, window.location.href);
			const curr = new URL(window.location.href);
			return r.pathname === curr.pathname;
		} catch {
			return false;
		}
	});
	if (idx !== -1) return idx;

	// fallback by label containing filename
	const curFile = currentPathBasename.toLowerCase();
	idx = seq.findIndex(item => (item.label || '').toLowerCase().includes(curFile));
	return idx;
}

function updatePageNavStates() {
	const seq = getLeftNavSequence();
	const cur = clamp(findCurrentNavIndex(seq), -1, seq.length - 1);
	const hasPrev = cur > 0;
	const hasNext = cur >= 0 && cur < seq.length - 1;
	if (prevPageBtn) {
		prevPageBtn.disabled = !hasPrev;
		prevPageBtn.classList.toggle('disabled', !hasPrev);
	}
	if (nextPageBtn) {
		nextPageBtn.disabled = !hasNext;
		nextPageBtn.classList.toggle('disabled', !hasNext);
	}
}

prevPageBtn && prevPageBtn.addEventListener('click', (e) => {
	e.preventDefault();
	const seq = getLeftNavSequence();
	let cur = findCurrentNavIndex(seq);
	if (cur === -1) cur = seq.length ? 0 : -1;
	if (cur > 0 && seq[cur - 1] && seq[cur - 1].href) {
		window.location.href = seq[cur - 1].href;
	}
});

nextPageBtn && nextPageBtn.addEventListener('click', (e) => {
	e.preventDefault();
	const seq = getLeftNavSequence();
	let cur = findCurrentNavIndex(seq);
	if (cur === -1) cur = seq.length ? 0 : -1;
	if (cur >= 0 && cur < seq.length - 1 && seq[cur + 1] && seq[cur + 1].href) {
		window.location.href = seq[cur + 1].href;
	}
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
	if (header) {
		header.setAttribute('aria-expanded', open ? 'true' : 'false');
	}
	if (caret) {
		caret.textContent = open ? '▾' : '▸';
	}
}

function openPanel(index, opts = { closeOthers: false, scrollOnOpen: true, behavior: 'smooth' }, cb = null) {
	panels = getPanels();
	if (index < 0 || index >= panels.length) return;
	const target = panels[index];

	if (opts.closeOthers) {
		panels.forEach(p => {
			if (p !== target && p.classList.contains('open')) {
				p.classList.remove('open');
				setPanelCaret(p);
			}
		});
	}

	if (!target.classList.contains('open')) {
		target.classList.add('open');
		setPanelCaret(target);
	}
	if (opts.scrollOnOpen) {
		navigateToElement(target, 0, opts.behavior || 'smooth');
	}

	updateActivePanel(index);
	updateActiveLinks();
	if (typeof cb === 'function') cb();
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
		const openIdx = getPanels().findIndex(p => p.classList.contains('open'));
		updateActivePanel(openIdx >= 0 ? openIdx : 0);
		updateActiveLinks();
	} else {
		openPanel(idx, { closeOthers: false, scrollOnOpen: false, behavior: 'smooth' });
	}
});

/* ---------- Right contents builder ---------- */
function buildContents() {
	panels = getPanels();
	if (!contentsList) return;
	contentsList.innerHTML = '';
	panels.forEach((p, i) => {
		p.dataset.index = i;
		const heading = $('.panel-header h3', p);
		const title = heading ? heading.innerText.trim() : `Panel ${i + 1}`;

		const li = document.createElement('li');
		const a = document.createElement('a');
		a.href = `#${p.id}`;
		a.textContent = `${i + 1}. ${title}`;
		a.dataset.index = i;
		a.addEventListener('click', (e) => {
			e.preventDefault();
			const targetHash = `#${p.id}`;
			if (location.hash !== targetHash) {
				history.pushState(null, '', targetHash);
			}
			openPanel(i, { closeOthers: false, scrollOnOpen: true, behavior: 'smooth' });
		});
		li.appendChild(a);

		const children = $$('.anchor[data-parent]', p);
		if (children.length) {
			const sub = document.createElement('ul');
			sub.className = 'contents-sublist';
			children.forEach(child => {
				const chi = document.createElement('li');
				const ca = document.createElement('a');
				ca.href = `#${child.id}`;
				ca.textContent = child.querySelector('h4') ? child.querySelector('h4').innerText.trim() : child.id;
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
					behavior: 'smooth'
				}, () => {
					const headerH = $('.panel-header', panels[i])?.offsetHeight || 0;
					navigateToElement(child, headerH, 'smooth');

					// Let the smooth scroll finish before normal scroll detection takes over
					setTimeout(() => {
						programmaticScroll = false;
					}, 1000); //I can only estimate but this feels mostly right
				});
			});
				chi.appendChild(ca);
				sub.appendChild(chi);
			});
			li.appendChild(sub);
		}
		contentsList.appendChild(li);
	});
}

/* ---------- Scrolling helpers ---------- */
function getActiveScrollRoot() {
	if (contentBox && contentBox.scrollHeight > contentBox.clientHeight) return contentBox;
	return document.scrollingElement || document.documentElement;
}
function getScrollTop() {
	const root = getActiveScrollRoot();
	if (root === document.scrollingElement || root === document.documentElement) {
		return window.scrollY || document.documentElement.scrollTop || 0;
	}
	return root.scrollTop || 0;
}
function navigateToElement(el, headerOffset = 0, behavior = 'smooth') {
	if (!el) return;
	const root = getActiveScrollRoot();
	const rootIsPage = (root === document.scrollingElement || root === document.documentElement);
	const rootRect = rootIsPage ? { top: 0 } : root.getBoundingClientRect();
	const elRect = el.getBoundingClientRect();
	const offsetWithin = elRect.top - rootRect.top;
	const currentScroll = getScrollTop();
	const target = Math.max(0, Math.round(currentScroll + offsetWithin - headerOffset - 4));
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
	if (!link) return;

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
			behavior: 'smooth'
		});
	} else if (linkRect.bottom > navRect.bottom - PAD) {
		nav.scrollTo({
			top: nav.scrollTop + (linkRect.bottom - navRect.bottom) + PAD,
			behavior: 'smooth'
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
	$$('.active', contentsList).forEach(a => a.classList.remove('active'));
	
	// An explicit anchor jump takes precedence until the user scrolls again.
	if (forcedActiveAnchor) {
		const forcedLink = contentsList.querySelector(
			`a[href="#${forcedActiveAnchor}"]`
		);

		if (forcedLink) {
			forcedLink.classList.add('active');
			debouncedEnsureNavVisible(forcedLink);
			return;
		}

		forcedActiveAnchor = null;
	}
	
	panels = getPanels();
	if (!panels.length) return;

	const st = getScrollTop();
	const root = getActiveScrollRoot();
	const rootRect = (root === document.scrollingElement || root === document.documentElement) ? { top: 0 } : root.getBoundingClientRect();

	const allAnchors = $$('.anchor', contentBox);
	const visibleAnchors = allAnchors.filter(a => {
		const panel = a.closest('.panel');
		if (!panel) return false;
		if (!panel.classList.contains('open')) return false;
		return a.offsetParent !== null;
	});

	const currentPanel = panels[currentPanelIndex];
	const headerH = currentPanel ? ($('.panel-header', currentPanel)?.offsetHeight || 0) : 0;
	const offset = Math.max(60, headerH + 12);

	let currentAnchor = null;
	for (let i = 0; i < visibleAnchors.length; i++) {
		const a = visibleAnchors[i];
		const aRect = a.getBoundingClientRect();
		const anchorTopRel = (aRect.top - rootRect.top) + st;
		if (anchorTopRel - offset <= st) {
			currentAnchor = a;
		} else {
			break;
		}
	}

	if (currentAnchor) {
		const subLink = contentsList.querySelector(`a[href="#${currentAnchor.id}"]`);
		if (subLink) {
			subLink.classList.add('active');
			debouncedEnsureNavVisible(subLink);
			return;
		}
	}

	const panel = panels[currentPanelIndex];
	if (panel) {
		const panelLink = contentsList.querySelector(`a[href="#${panel.id}"]`);
		if (panelLink) {
			panelLink.classList.add('active');
			debouncedEnsureNavVisible(panelLink);
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

	const maxScroll = contentBox.scrollHeight - contentBox.clientHeight;

	if (maxScroll <= 0) {
		progressBar.style.width = '0%';
		return;
	}

	const progress = (contentBox.scrollTop / maxScroll) * 100;
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
	buildContents();
	panels.forEach(setPanelCaret);
	if (!panels.some(p => p.classList.contains('open')) && panels[0]) {
		panels[0].classList.add('open');
	}
	currentPanelIndex = panels.findIndex(p => p.classList.contains('open'));
	if (currentPanelIndex === -1) currentPanelIndex = 0;
	updateActivePanel(currentPanelIndex);
	updatePageNavStates();
	updateActiveLinks();
}
const debouncedRebuildAll = debounce(rebuildAll, 140);
rebuildAll();

/* ========================================================================
	LEFT NAV
	- Current page highlighting
	- Collapsible navigation sections
	- Automatically opens the section containing the current page
	======================================================================= */

document.addEventListener('DOMContentLoaded', () => {
	const currentFile = (basename(window.location.pathname) || '').toLowerCase();

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

			/*
			 If this is an LE page, also mark the Modding
			 trail up to the current game.
			 */
			const lePages = ['me1.html', 'me2.html', 'me3.html'];
			const leIndex = lePages.indexOf(currentFile);

			if (leIndex >= 0) {
				const moddingItem = a.closest('.chap-item');

				if (moddingItem) {
					moddingItem.classList.add('active');

					const subLinks = $$('a', moddingItem);
					subLinks.forEach((subLink, i) => {
						if (i < leIndex) {
							subLink.setAttribute('aria-current', 'step');
						}
					});
				}
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
		setTimeout(() => {
			window.dispatchEvent(new Event('hashchange'));
		}, 60);
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
}
function closeAllPanels() {
	const panels = getPanels();
	panels.forEach(p => {
		p.classList.remove('open');
		setPanelCaret(p);
	});
	updateActivePanel(0);
	updateActiveLinks();
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
	openPanel: (i) => openPanel(i, { closeOthers: true, scrollOnOpen: true, behavior: 'smooth' }),
	goToPanel: (i) => openPanel(i, { closeOthers: true, scrollOnOpen: true, behavior: 'smooth' }),
	rebuildAll,
	setBackground,
	expandAllPanels,
	closeAllPanels,
	updateActiveLinks,
	buildLeftNavSequence,
	invalidateLeftNavSequence,
	findCurrentNavIndex: () => findCurrentNavIndex(getLeftNavSequence())
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
		if (!window._mwbc_carousel_click_interceptor_added) {
			window._mwbc_carousel_click_interceptor_added = true;
			document.addEventListener('click', (ev) => {
				const a = ev.target.closest && ev.target.closest('.informational-carousel a.glightbox');
				if (!a) return;
				const carousel = a.closest('.informational-carousel');
				if (!carousel) return;

				const anchors = Array.from(carousel.querySelectorAll('a.glightbox'));
				const i = anchors.indexOf(a);
				if (i === -1) return;

				const lb = carousel._mwbc_lb;
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
						carousel._mwbc_lb = tempLb;
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
			const galleryName = `mwbc-carousel-${cIndex}`;

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
				b._mwbc_click = handler;
				b.addEventListener('click', handler);
				dotsWrap.appendChild(b);
			});

			// bind arrows once
			function bindArrow(btn, dir) {
				if (!btn) return;
				if (btn._mwbc_bound) return;
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
				btn._mwbc_bound = true;
				btn._mwbc_fn = fn;
				// blur helpers
				btn.addEventListener('pointerup', () => setTimeout(() => btn.blur(), 10));
				btn.addEventListener('pointercancel', () => btn.blur());
			}
			bindArrow(prev, 'prev');
			bindArrow(next, 'next');

			// keyboard nav for viewport. IGNORE when lightbox is open
			if (viewport && !viewport._mwbc_kbd) {
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
				viewport._mwbc_kbd = true;
			}

			// touch swipe
			if (viewport && !viewport._mwbc_touch) {
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
				viewport._mwbc_touch = true;
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
						carousel._mwbc_lb = lightboxInstance;
					} catch (e) { }

					// attach click handlers (explicit openAt) and remove old if present
					anchors.forEach((a, i) => {
						if (a._mwbc_click) a.removeEventListener('click', a._mwbc_click);
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
						a._mwbc_click = handler;
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
				if (lightboxInstance._mwbc_bound) return;
				lightboxInstance._mwbc_bound = true;
				try {
					carousel._mwbc_lb = lightboxInstance;
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
