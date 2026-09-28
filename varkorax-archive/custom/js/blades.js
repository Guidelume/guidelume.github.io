<script>
(function () {
	'use strict';

	/*
		blades.js — unified manager for corkboard + archive
		- Adjustment to new home file structure
		- Rebranding as Corkboard
	*/

	/* =========================
	   Config & derived paths
	========================= */
	const PREFETCH_PAGES = 2; // how many pages to prefetch in archive mode
	const DEFAULT_PAGE_SIZE = 10;
	const PAGE_SIZE_KEY = 'archive.pageSize';
	const UNIFIED_READ_PREFIX = 'blades.read.';
	const UNIFIED_EXPANDED_PREFIX = 'blades.expanded.';
	const LEGACY_PREFIXES = ['corkboard.read.', 'archive.read.']; // mirror writes for compatibility

	// Derive the base URL for pages/corkboard (works whether the HTML lives at /pages/corkboard.html or /pages/corkboard/archive.html)
	function findcorkboardBase() {
		try {
			const path = location.pathname || '';
			const m = path.match(/(\/pages\/corkboard)(\/|$)/);
			if (m && m[1]) return location.origin + m[1] + '/';
		} catch (e) {}
		// fallback
		return location.origin + '/pages/corkboard/';
	}
	const BASE_corkboard = findcorkboardBase(); // e.g. https://example.com/pages/corkboard/
	const DATA_URL = new URL('corkboard/data.json', BASE_corkboard).href; // .../pages/corkboard/data.json
	const ENTRIES_BASE = new URL('corkboard/entries/', BASE_corkboard).href; // .../pages/corkboard/entries/

	/* =========================
	   Shared utilities
	========================= */
	function el(tag, attrs) {
		const e = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach(k => {
				if (k === 'class') e.className = attrs[k];
				else if (k === 'html') e.innerHTML = attrs[k];
				else e.setAttribute(k, attrs[k]);
			});
		}
		return e;
	}
	function escapeHtml(s) {
		return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function mdToHtml(txt) {
		if (typeof txt !== 'string') return '';
		// strip YAML frontmatter
		if (txt.indexOf('---') === 0) {
			const fmEnd = txt.indexOf('\n---', 3);
			if (fmEnd !== -1) {
				const nextLine = txt.indexOf('\n', fmEnd + 4);
				txt = nextLine !== -1 ? txt.slice(nextLine + 1) : txt.slice(fmEnd + 4);
			}
		}
		if (window.marked) {
			try { return (typeof window.marked.parse === 'function') ? window.marked.parse(txt) : window.marked(txt); } catch (e) { /* fallthrough */ }
		}
		return '<p>' + escapeHtml(txt).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
	}
	function safeSetTimeout(track, fn, ms) {
		const id = setTimeout(() => {
			try { fn(); } catch (e) { console.error(e); }
			track.delete(id);
		}, ms);
		track.add(id);
		return id;
	}
	function stableIdForItem(item) {
		if (!item) return 'item-' + Math.random().toString(36).slice(2, 9);
		if (item.id) return String(item.id);
		if (item.md) {
			const p = String(item.md).split('/').pop();
			return 'md-' + p.replace(/\W+/g, '_');
		}
		return 'item-' + (item.date ? item.date.replace(/\W+/g, '_') : Math.random().toString(36).slice(2, 9));
	}
	function parseDateTimestamp(item) {
		if (item && item.date) {
			const t = Date.parse(item.date);
			if (!isNaN(t)) return t;
		}
		return null;
	}
	function parseNumericFromIdOrFile(item) {
		if (!item) return null;
		if (typeof item.id !== 'undefined' && item.id !== null) {
			const n = Number(item.id);
			if (!isNaN(n)) return n;
			const m = String(item.id).match(/(\d+)/);
			if (m) return Number(m[1]);
		}
		if (item.md && typeof item.md === 'string') {
			let m2 = item.md.match(/(\d+)(?=\.[a-zA-Z0-9_\-]+$)/);
			if (m2 && m2[1]) return Number(m2[1]);
			m2 = item.md.match(/(\d+)/);
			if (m2 && m2[1]) return Number(m2[1]);
		}
		return null;
	}
	function itemComparator(a, b) {
		const da = parseDateTimestamp(a), db = parseDateTimestamp(b);
		if (da !== null && db !== null) return db - da;
		if (da !== null && db === null) return -1;
		if (db !== null && da === null) return 1;
		const na = parseNumericFromIdOrFile(a), nb = parseNumericFromIdOrFile(b);
		if (na !== null && nb !== null) return nb - na;
		if (na !== null && nb === null) return -1;
		if (nb !== null && na === null) return 1;
		return 0;
	}
	function categoryMatches(itemCategory, listCategory) {
		if (!itemCategory || !listCategory) return false;
		const ic = String(itemCategory).toLowerCase(), lc = String(listCategory).toLowerCase();
		if (ic === lc) return true;
		if (ic === lc + 's' || lc === ic + 's') return true;
		if (ic.indexOf(lc) === 0 || lc.indexOf(ic) === 0) return true;
		return false;
	}
	function formatFriendlyDate(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (isNaN(d)) return iso;
		const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
		function getOrdinal(n) { const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
		return monthNames[d.getUTCMonth()] + ' ' + getOrdinal(d.getUTCDate()) + ', ' + d.getUTCFullYear();
	}

	/* =========================
	   MD candidate & fetch helpers
	========================= */
	function buildMdCandidates(md) {
		if (!md) return [];
		const cands = [];
		// absolute or protocol-relative
		if (/^https?:\/\//i.test(md) || md.indexOf('//') === 0) { cands.push(md); return cands; }
		// root-relative
		if (md.indexOf('/') === 0) { cands.push(location.origin + md); return cands; }

		// candidate 1: resolved against current page
		try { cands.push(new URL(md, location.href).href); } catch (e) { cands.push(md); }

		// candidate 2: resolve against pages/corkboard/ base (common)
		try { cands.push(new URL(md, BASE_corkboard).href); } catch (e) {}

		// candidate 3: entries base + filename
		try {
			const fname = String(md).split('/').pop();
			cands.push(new URL(fname, ENTRIES_BASE).href);
			cands.push(new URL('entries/' + fname, BASE_corkboard).href);
		} catch (e) {}

		// candidate 4: prefixed with ./ relative to base
		try { cands.push(new URL('./' + md, BASE_corkboard).href); } catch (e) {}

		// dedupe preserving order
		const seen = new Set();
		return cands.filter(u => { if (!u) return false; if (seen.has(u)) return false; seen.add(u); return true; });
	}
	function fetchMdResolved(md) {
		const cands = buildMdCandidates(md);
		if (!cands.length) return Promise.reject(new Error('No md path'));
		let i = 0;
		function next() {
			if (i >= cands.length) return Promise.reject(new Error('All candidates failed for ' + md));
			const p = cands[i++];
			return fetch(p).then(r => { if (!r.ok) return next(); return r.text(); }).catch(() => next());
		}
		return next();
	}

	/* =========================
	   Storage helpers (unified)
	========================= */
	function readKey(id) { return UNIFIED_READ_PREFIX + id; }
	function expKey(id) { return UNIFIED_EXPANDED_PREFIX + id; }
	function getRead(id) {
		try {
			if (localStorage.getItem(readKey(id)) === '1') return true;
			for (let i = 0; i < LEGACY_PREFIXES.length; i++) { if (localStorage.getItem(LEGACY_PREFIXES[i] + id) === '1') return true; }
		} catch (e) {}
		return false;
	}
	function setRead(id, val) {
		try {
			localStorage.setItem(readKey(id), val ? '1' : '0');
			LEGACY_PREFIXES.forEach(p => { try { localStorage.setItem(p + id, val ? '1' : '0'); } catch (e) {} });
		} catch (e) {}
	}
	function getExpanded(id) { try { return localStorage.getItem(expKey(id)) === '1'; } catch (e) { return false; } }
	function setExpanded(id, val) { try { localStorage.setItem(expKey(id), val ? '1' : '0'); } catch (e) {} }

	/* =========================
	   Manager state & tracking
	========================= */
	let MASTER = []; // shared across pages
	const timeouts = new Set();
	const boundHandlers = [];
	let topbarObserver = null;
	let pageSize = DEFAULT_PAGE_SIZE;
	let currentPage = 1;
	let totalPages = 1;

	/* =========================
	   Render helpers (single blade)
	========================= */
	function renderBlade(item) {
		const id = stableIdForItem(item);
		const wrapper = el('article', { 'class': 'blade ' + (item.category || '') });
		wrapper.dataset.id = id;
		if (item.id) wrapper.setAttribute('data-archive-id', item.id);
		if (item.md) wrapper.setAttribute('data-archive-md', item.md);

		// meta
		const meta = el('div', { 'class': 'meta' });
		const timeEl = el('time');
		timeEl.dateTime = item.date || '';
		timeEl.textContent = item.date ? formatFriendlyDate(item.date) : (item.id ? ('#' + item.id) : (item.md ? item.md.split('/').pop() : ''));
		meta.appendChild(timeEl);
		if (item.id) { const idEl = el('span'); idEl.textContent = '#' + item.id; idEl.style.opacity = '0.9'; meta.appendChild(idEl); }
		if (item.category) { const cat = el('span'); cat.textContent = item.category; cat.className = 'archive-tag'; cat.style.opacity = '0.85'; meta.appendChild(cat); }
		if (item.source) { const src = el('span'); src.textContent = item.source; src.style.opacity = '0.7'; meta.appendChild(src); }

		wrapper.appendChild(meta);

		// content (preview or placeholder)
		const content = el('div', { 'class': 'blade-content' });
		const text = el('div', { 'class': 'blade-text' });
		if (item._html) text.innerHTML = item._html;
		else if (item.content) text.innerHTML = mdToHtml(item.content);
		else text.innerHTML = '<p><em>Content will load when expanded</em></p>';
		content.appendChild(text);

		// expand / load button
		const expandBtn = el('button', { 'class': 'expand-btn' });
		expandBtn.type = 'button';
		expandBtn.textContent = item._html ? 'Expand' : 'Load';
		content.appendChild(expandBtn);

		wrapper.appendChild(content);

		// read/expanded state flags
		try {
			if (!getRead(id)) wrapper.classList.add('unread'); else wrapper.classList.add('read');
			if (getExpanded(id)) wrapper.dataset.restoreExpanded = '1';
		} catch (e) {}

		return wrapper;
	}

	function openBladeNode(wrapper, restore) {
		const textEl = wrapper.querySelector('.blade-text');
		const btn = wrapper.querySelector('.expand-btn');
		if (!textEl || !btn) return;
		textEl.style.display = 'block';
		textEl.style.webkitLineClamp = 'unset';
		textEl.style.maxHeight = textEl.scrollHeight + 'px';
		wrapper.classList.add('expanded');
		wrapper.classList.remove('unread');
		wrapper.classList.add('read');
		btn.textContent = 'Collapse';
		const id = wrapper.dataset.id;
		setRead(id, true);
		setExpanded(id, true);
		safeSetTimeout(timeouts, () => { try { textEl.style.maxHeight = 'none'; } catch (e) {} }, restore ? 220 : 420);
	}

	function collapseBladeNode(wrapper) {
		const textEl = wrapper.querySelector('.blade-text');
		const btn = wrapper.querySelector('.expand-btn');
		if (!textEl || !btn) return;
		const full = textEl.scrollHeight;
		textEl.style.maxHeight = full + 'px';
		safeSetTimeout(timeouts, () => {
			try {
				const lineH = parseFloat(getComputedStyle(textEl).lineHeight || 18);
				textEl.style.maxHeight = (lineH * 3 + 6) + 'px';
				textEl.style.webkitLineClamp = '3';
			} catch (e) {}
		}, 20);
		wrapper.classList.remove('expanded');
		btn.textContent = 'Expand';
		try { setExpanded(wrapper.dataset.id, false); } catch (e) {}
	}

	/* =========================
	   Load content for item (lazy)
	========================= */
	function loadContentForItem(item) {
		// returns Promise<void>
		return new Promise((resolve) => {
			if (!item) return resolve();
			if (item._html) return resolve();
			if (item.content) {
				try { item._html = mdToHtml(item.content); } catch (e) { item._html = escapeHtml(item.content || ''); }
				return resolve();
			}
			if (item.md) {
				// try resolved candidates
				fetchMdResolved(item.md).then(txt => {
					try { item._html = mdToHtml(txt); } catch (e) { item._html = escapeHtml(txt); }
					resolve();
				}).catch(() => {
					// fallback to ENTRIES_BASE filename
					try {
						const fname = String(item.md).split('/').pop();
						fetch(new URL(fname, ENTRIES_BASE).href).then(r => {
							if (!r.ok) throw new Error('no');
							return r.text();
						}).then(txt => {
							item._html = mdToHtml(txt);
							resolve();
						}).catch(() => { item._html = '<p><em>Content unavailable</em></p>'; resolve(); });
					} catch (e) { item._html = '<p><em>Content unavailable</em></p>'; resolve(); }
				});
				return;
			}
			item._html = '<p><em>No content</em></p>';
			resolve();
		});
	}

	/* =========================
	   Counters & mark-read
	========================= */
	function computeUnreadCounts() {
		const counts = { total: 0, thought: 0, bookmark: 0, update: 0 };
		try {
			MASTER.forEach(it => {
				const id = stableIdForItem(it);
				if (!getRead(id)) {
					counts.total++;
					const cat = (it.category || '').toLowerCase();
					if (cat.indexOf('thought') === 0 || cat === 'thought') counts.thought++;
					else if (cat.indexOf('bookmark') === 0 || cat === 'bookmark') counts.bookmark++;
					else if (cat.indexOf('update') === 0 || cat === 'update') counts.update++;
				}
			});
		} catch (e) {}
		return counts;
	}
	function updateCounters(containerSelector) {
		const counts = computeUnreadCounts();
		const catEls = document.querySelectorAll((containerSelector || '') + ' .cat-counter');
		if (!catEls.length) {
			// fallback: global elements
			document.querySelectorAll('.cat-counter').forEach(el => {
				const c = el.getAttribute('data-category');
				const n = counts[c] || 0;
				el.textContent = n + ' unread';
				el.setAttribute('aria-label', n + ' unread items in ' + c);
			});
		} else {
			catEls.forEach(el => {
				const c = el.getAttribute('data-category');
				const n = counts[c] || 0;
				el.textContent = n + ' unread';
				el.setAttribute('aria-label', n + ' unread items in ' + c);
			});
		}
		const totalEl = document.querySelector((containerSelector || '') + ' #soundboard-unread') || document.getElementById('soundboard-unread');
		if (totalEl) { totalEl.textContent = counts.total + ' unread'; totalEl.setAttribute('aria-label', counts.total + ' unread items total'); }
	}

	function markAllVisibleRead(containerSelector) {
		const container = document.querySelector(containerSelector || '') || document;
		const blades = container.querySelectorAll('.blade.unread');
		blades.forEach(b => {
			const id = b.dataset.id;
			try { setRead(id, true); } catch (e) {}
			b.classList.remove('unread'); b.classList.add('read');
		});
		updateCounters(containerSelector);
	}

	function markAllArchiveRead() {
		MASTER.forEach(it => { try { setRead(stableIdForItem(it), true); } catch (e) {} });
		// Visual update and aggressive cleanup
		cleanupPageNodes();
		renderActiveViews(); // re-render to reflect 'read' state
	}

	/* =========================
	   Rendering pipelines (corkboard / archive)
	========================= */
	function placeCategoryLists(containerSelector) {
		const container = document.querySelector(containerSelector) || document;
		const lists = container.querySelectorAll('.blade-list');
		lists.forEach(list => {
			const cat = list.getAttribute('data-category') || '';
			let items = MASTER.filter(x => categoryMatches(x.category, cat));
			items = items.slice().sort(itemComparator).slice(0, (list.dataset.limit ? Number(list.dataset.limit) : PERISH_DEFAULT_PER_CAT()));
			// explicit DOM cleanup
			while (list.firstChild) list.removeChild(list.firstChild);
			items.forEach(it => list.appendChild(renderBlade(it)));
		});
		// restore expanded after DOM inserted
		requestAnimationFrame(() => {
			const selector = (containerSelector || '') + ' [data-restore-expanded="1"]';
			document.querySelectorAll(selector).forEach(b => {
				delete b.dataset.restoreExpanded;
				const id = b.dataset.id;
				const masterItem = MASTER.find(x => stableIdForItem(x) === id);
				loadContentForItem(masterItem).then(() => openBladeNode(b, true));
			});
			updateCounters(containerSelector);
		});
	}
	function PERISH_DEFAULT_PER_CAT() { return 3; }

	function placeArchiveStream(containerSelector, pageSize, pagePrefetch) {
		const container = document.querySelector(containerSelector);
		if (!container) return;
		const stream = container.querySelector('#archive-stream') || container;
		// we render a prefetched window: currentPage .. currentPage + pagePrefetch - 1
		const built = buildArchiveView(pageSize, pagePrefetch);
		// build document fragment
		const frag = document.createDocumentFragment();
		built.pageItems.forEach(it => {
			const wrap = el('div', { 'class': 'archive-item-wrapper' });
			const blade = renderBlade(it);
			// if previously expanded, set flag
			if (getExpanded(stableIdForItem(it))) blade.dataset.restoreExpanded = '1';
			wrap.appendChild(blade);
			frag.appendChild(wrap);
		});
		// explicit swap (removes old wrappers -> encourages GC)
		while (stream.firstChild) stream.removeChild(stream.firstChild);
		stream.appendChild(frag);

		// restore expanded blades
		requestAnimationFrame(() => {
			stream.querySelectorAll('[data-restore-expanded="1"]').forEach(b => {
				delete b.dataset.restoreExpanded;
				const id = b.dataset.id;
				const masterItem = MASTER.find(x => stableIdForItem(x) === id);
				loadContentForItem(masterItem).then(() => openBladeNode(b, true));
			});
			updateCounters(containerSelector);
		});
	}

	/* archive view building */
	function buildArchiveView(pageSize, pagePrefetch) {
		const catEl = document.getElementById('filter-category');
		const sortEl = document.getElementById('sort-mode');
		const unreadOnlyEl = document.getElementById('filter-unread');
		const cat = catEl ? catEl.value : 'all';
		const sort = sortEl ? sortEl.value : 'newest';
		const unreadOnly = unreadOnlyEl ? unreadOnlyEl.checked : false;

		let items = MASTER.slice();
		if (cat && cat !== 'all') items = items.filter(x => x && x.category && categoryMatches(x.category, cat));
		if (unreadOnly) items = items.filter(it => !getRead(stableIdForItem(it)));

		if (sort === 'newest') items.sort(itemComparator);
		else if (sort === 'oldest') items.sort((a, b) => {
			const da = parseDateTimestamp(a), db = parseDateTimestamp(b);
			if (da && db) return da - db;
			if (da && !db) return -1;
			if (db && !da) return 1;
			return 0;
		});
		else if (sort === 'alpha') items.sort((a, b) => {
			const ta = (a.title || a.content || '').toLowerCase();
			const tb = (b.title || b.content || '').toLowerCase();
			return ta < tb ? -1 : (ta > tb ? 1 : 0);
		});

		totalPages = Math.max(1, Math.ceil(items.length / pageSize));
		if (currentPage > totalPages) currentPage = totalPages;
		if (currentPage < 1) currentPage = 1;
		const start = (currentPage - 1) * pageSize;
		const end = start + pageSize * pagePrefetch;
		const pageItems = items.slice(start, end);
		return { allFiltered: items, pageItems: pageItems, totalFiltered: items.length };
	}

	/* =========================
	   Cache trimming & cleanup
	========================= */
	function trimHtmlCachePrefetch(pageSize, pagePrefetch) {
		try {
			const built = buildArchiveView(pageSize, pagePrefetch);
			const keep = new Set(built.pageItems.map(it => stableIdForItem(it)));
			MASTER.forEach(it => {
				const id = stableIdForItem(it);
				if (!keep.has(id) && it._html) delete it._html;
			});
		} catch (e) {}
	}

	function cleanupPageNodes() {
		// remove archive wrappers to break references
		try {
			document.querySelectorAll('.archive-item-wrapper').forEach(w => { if (w.parentNode) w.parentNode.removeChild(w); });
			// also clear blade-lists
			document.querySelectorAll('.blade-list').forEach(l => { while (l.firstChild) l.removeChild(l.firstChild); });
		} catch (e) {}
		// clear timeouts
		timeouts.forEach(t => clearTimeout(t));
		timeouts.clear();
		// aggressively free cached HTML outside prefetch window
		trimHtmlCachePrefetch(pageSize, PREFETCH_PAGES);
	}

	function cleanupAll() {
		// remove bound handlers
		boundHandlers.forEach(b => { try { b.el.removeEventListener(b.type, b.handler); } catch (e) {} });
		boundHandlers.length = 0;
		// disconnect observer
		if (topbarObserver) { try { topbarObserver.disconnect(); } catch (e) {} topbarObserver = null; }
		// clear DOM nodes
		cleanupPageNodes();
		// clear master
		MASTER.length = 0;
	}

	/* =========================
	   Data loading & prefetching
	========================= */
	function fetchJSON() {
		return fetch(DATA_URL).then(r => { if (!r.ok) throw new Error('Failed to fetch ' + DATA_URL + ' (' + r.status + ')'); return r.json(); });
	}

	function hydrateMaster() {
		return fetchJSON().then(data => {
			if (!Array.isArray(data)) data = [];
			const itemsNormalized = data.map(it => ({
				category: it.category || '',
				id: (typeof it.id !== 'undefined') ? it.id : '',
				md: it.md || '',
				date: it.date || '',
				title: it.title || '',
				content: it.content || null,
				source: it.source || ''
			}));
			itemsNormalized.sort(itemComparator);
			MASTER = itemsNormalized.slice();
			// restore page size
			try {
				const stored = localStorage.getItem(PAGE_SIZE_KEY);
				if (stored && !isNaN(parseInt(stored, 10))) pageSize = parseInt(stored, 10);
			} catch (e) {}
			// prefetch initial window for archive
			return prefetchWindow(currentPage, pageSize, PREFETCH_PAGES).then(() => {
				// render both views if present
				renderActiveViews();
			});
		}).catch(err => {
			console.error('Failed to load data.json', err);
			const arc = document.getElementById('archive-stream');
			if (arc) arc.textContent = 'Failed to load archive.';
		});
	}

	function prefetchWindow(page, pageSize, pagePrefetch) {
		return new Promise((resolve) => {
			try {
				const start = (page - 1) * pageSize;
				const end = start + pageSize * pagePrefetch;
				const windowItems = MASTER.slice(start, end);
				const promises = windowItems.map(it => {
					if (it._html) return Promise.resolve(it);
					if (it.content) { try { it._html = mdToHtml(it.content); } catch (e) { it._html = escapeHtml(it.content || ''); } return Promise.resolve(it); }
					if (it.md) {
						return fetchMdResolved(it.md).then(txt => { try { it._html = mdToHtml(txt); } catch (e) { it._html = escapeHtml(txt); } return it; }).catch(() => {
							// fallback is handled later when trying ENTRIES_BASE
							it._html = null; return it;
						});
					}
					it._html = '<p><em>No content</em></p>';
					return Promise.resolve(it);
				});
				Promise.all(promises).then(() => resolve()).catch(() => resolve());
			} catch (e) { resolve(); }
		});
	}

	/* =========================
	   Controls wiring & delegation
	========================= */
	function wireControls() {
		// Mark-all-read (global)
		const markAllVisible = document.getElementById('mark-all-read') || document.querySelector('.mark-all-read');
		if (markAllVisible) {
			const h = function () { markAllVisibleRead('#corkboard-root'); markAllVisibleRead('#archive-root'); }; // affect both containers if present
			markAllVisible.addEventListener('click', h);
			boundHandlers.push({ el: markAllVisible, type: 'click', handler: h });
		}

		// mark-read menu (archive)
		const menuWrap = document.getElementById('mark-read-menu');
		const trigger = document.getElementById('mark-read-trigger');
		const menu = menuWrap ? menuWrap.querySelector('.menu') : null;
		function closeMenu() { if (!menuWrap || !trigger) return; menuWrap.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-expanded', 'false'); }
		function openMenu() { if (!menuWrap || !trigger) return; menuWrap.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-expanded', 'true'); }

		if (trigger && menuWrap) {
			const h = function () { const expanded = menuWrap.getAttribute('aria-expanded') === 'true'; if (expanded) closeMenu(); else openMenu(); };
			trigger.addEventListener('click', h);
			boundHandlers.push({ el: trigger, type: 'click', handler: h });
		}
		if (menu) {
			const h = function (e) {
				const btn = e.target.closest('button[data-action]');
				if (!btn) return;
				const act = btn.getAttribute('data-action');
				if (menuWrap && trigger) { menuWrap.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-expanded', 'false'); }
				if (act === 'visible') markAllVisibleRead('#archive-root' || '#corkboard-root');
				else if (act === 'all') markAllArchiveRead();
				else if (act === 'thought') markArchiveCategoryRead('thought');
				else if (act === 'bookmark') markArchiveCategoryRead('bookmark');
				else if (act === 'update') markArchiveCategoryRead('update');
			};
			menu.addEventListener('click', h);
			boundHandlers.push({ el: menu, type: 'click', handler: h });
		}

		// document-level close-menu & escape
		const docClickHandler = function (e) { if (menuWrap && !menuWrap.contains(e.target)) { try { menuWrap.setAttribute('aria-expanded', 'false'); if (trigger) trigger.setAttribute('aria-expanded', 'false'); } catch (e) {} } };
		document.addEventListener('click', docClickHandler);
		boundHandlers.push({ el: document, type: 'click', handler: docClickHandler });
		const docKeyHandler = function (e) { if (e.key === 'Escape') { try { if (menuWrap) menuWrap.setAttribute('aria-expanded', 'false'); if (trigger) trigger.setAttribute('aria-expanded', 'false'); } catch (e) {} } };
		document.addEventListener('keydown', docKeyHandler);
		boundHandlers.push({ el: document, type: 'keydown', handler: docKeyHandler });

		// page size controls (archive)
		try {
			const stored = localStorage.getItem(PAGE_SIZE_KEY);
			if (stored && !isNaN(parseInt(stored, 10))) pageSize = parseInt(stored, 10);
		} catch (e) {}
		const pageSizeEl = document.getElementById('page-size');
		const pageSizeBottom = document.getElementById('page-size-bottom');
		if (pageSizeEl) {
			pageSizeEl.value = String(pageSize);
			const h = function () {
				const v = parseInt(pageSizeEl.value, 10) || DEFAULT_PAGE_SIZE;
				pageSize = v; try { localStorage.setItem(PAGE_SIZE_KEY, String(v)); } catch (e) {}
				cleanupPageNodes(); prefetchWindow(currentPage, pageSize, PREFETCH_PAGES).then(() => renderActiveViews());
			};
			pageSizeEl.addEventListener('change', h);
			boundHandlers.push({ el: pageSizeEl, type: 'change', handler: h });
		}
		if (pageSizeBottom) {
			pageSizeBottom.value = String(pageSize);
			const h2 = function () {
				const v = parseInt(pageSizeBottom.value, 10) || DEFAULT_PAGE_SIZE;
				pageSize = v; try { localStorage.setItem(PAGE_SIZE_KEY, String(v)); } catch (e) {}
				if (pageSizeEl) pageSizeEl.value = pageSizeBottom.value;
				cleanupPageNodes(); prefetchWindow(currentPage, pageSize, PREFETCH_PAGES).then(() => renderActiveViews());
			};
			pageSizeBottom.addEventListener('change', h2);
			boundHandlers.push({ el: pageSizeBottom, type: 'change', handler: h2 });
		}

		// filter / sort / unread toggles (archive)
		const filterCategoryEl = document.getElementById('filter-category');
		const sortModeEl = document.getElementById('sort-mode');
		const filterUnreadEl = document.getElementById('filter-unread');
		if (filterCategoryEl) { const h = () => { currentPage = 1; cleanupPageNodes(); renderActiveViews(); }; filterCategoryEl.addEventListener('change', h); boundHandlers.push({ el: filterCategoryEl, type: 'change', handler: h }); }
		if (sortModeEl) { const h = () => { currentPage = 1; cleanupPageNodes(); renderActiveViews(); }; sortModeEl.addEventListener('change', h); boundHandlers.push({ el: sortModeEl, type: 'change', handler: h }); }
		if (filterUnreadEl) { const h = () => { currentPage = 1; cleanupPageNodes(); renderActiveViews(); }; filterUnreadEl.addEventListener('change', h); boundHandlers.push({ el: filterUnreadEl, type: 'change', handler: h }); }

		// pager buttons
		const prev = document.getElementById('page-prev');
		const next = document.getElementById('page-next');
		if (prev) { const h = () => { if (currentPage > 1) { currentPage--; prefetchWindow(currentPage, pageSize, PREFETCH_PAGES).then(() => { cleanupPageNodes(); renderActiveViews(); window.scrollTo({ top: 0, behavior: 'smooth' }); }); } }; prev.addEventListener('click', h); boundHandlers.push({ el: prev, type: 'click', handler: h }); }
		if (next) { const h = () => { if (currentPage < totalPages) { currentPage++; prefetchWindow(currentPage, pageSize, PREFETCH_PAGES).then(() => { cleanupPageNodes(); renderActiveViews(); window.scrollTo({ top: 0, behavior: 'smooth' }); }); } }; next.addEventListener('click', h); boundHandlers.push({ el: next, type: 'click', handler: h }); }

		// delegated click for blades (both corkboard and archive)
		const delegatedHandler = function (e) {
			const blade = e.target.closest('.blade');
			if (!blade) return;
			if (e.target.tagName === 'A' && e.target.href) return; // let links through

			const btn = e.target.closest('.expand-btn');
			const id = blade.dataset.id;
			const item = MASTER.find(m => stableIdForItem(m) === id);
			if (btn) {
				if (item && !item._html) {
					loadContentForItem(item).then(() => openBladeNode(blade, false));
				} else {
					if (blade.classList.contains('expanded')) collapseBladeNode(blade);
					else openBladeNode(blade, false);
				}
				updateCounters();
				return;
			}

			// clicking blade body toggles as well
			if (item && !item._html) {
				loadContentForItem(item).then(() => openBladeNode(blade, false));
			} else {
				if (blade.classList.contains('expanded')) collapseBladeNode(blade);
				else openBladeNode(blade, false);
			}
			updateCounters();
		};
		// attach to document (covers both pages)
		document.addEventListener('click', delegatedHandler);
		boundHandlers.push({ el: document, type: 'click', handler: delegatedHandler });
	}

	/* =========================
	   Back button positioning
	========================= */
	function wireBackButtonPositioning() {
		const backBtn = document.getElementById('back-to-categories');
		const topbar = document.getElementById('topbar');
		if (!backBtn || !topbar) return;

		function positionBackButton() {
			try {
				const current = topbar.querySelector('.topbar-btn[aria-current="page"]');
				const anchor = current || topbar.querySelector('.topbar-btn');
				if (!anchor) return;
				backBtn.style.position = 'fixed';
				backBtn.style.zIndex = 1202;
				const aRect = anchor.getBoundingClientRect();
				const bRect = backBtn.getBoundingClientRect();
				const left = Math.round(aRect.left + (aRect.width / 2) - (bRect.width / 2));
				const top = Math.round(aRect.bottom + 16);
				backBtn.style.left = left + 'px';
				backBtn.style.top = top + 'px';
			} catch (e) {}
		}

		let dbt = null;
		function debounced() {
			if (dbt) clearTimeout(dbt);
			dbt = setTimeout(() => { dbt = null; try { positionBackButton(); } catch (e) {} }, 80);
			timeouts.add(dbt);
		}

		const domH = function () { positionBackButton(); safeSetTimeout(timeouts, positionBackButton, 120); };
		document.addEventListener('DOMContentLoaded', domH);
		boundHandlers.push({ el: document, type: 'DOMContentLoaded', handler: domH });

		const loadH = function () { safeSetTimeout(timeouts, positionBackButton, 120); };
		window.addEventListener('load', loadH);
		boundHandlers.push({ el: window, type: 'load', handler: loadH });

		const resizeH = debounced;
		window.addEventListener('resize', resizeH);
		boundHandlers.push({ el: window, type: 'resize', handler: resizeH });

		try {
			if (window.MutationObserver) {
				topbarObserver = new MutationObserver(debounced);
				topbarObserver.observe(topbar, { attributes: true, childList: true, subtree: true });
			}
		} catch (e) {}
		// initial attempt
		setTimeout(positionBackButton, 60);
	}

	/* =========================
	   Render orchestration
	========================= */
	function renderActiveViews() {
		// corkboard (category lists)
		const corkboardRoot = document.querySelector('#corkboard-root') || document.querySelector('.corkboard-root');
		if (corkboardRoot) placeCategoryLists('#corkboard-root');

		// archive
		const archiveRoot = document.querySelector('#archive-root') || document.querySelector('#archive-stream') || document.querySelector('.archive-root');
		if (archiveRoot) placeArchiveStream(archiveRoot.closest ? ('#' + (archiveRoot.id || archiveRoot.className.split(' ').join('.'))) : '#archive-root', pageSize, PREFETCH_PAGES);
		// update pager UI if archive controls present
		updatePagerUI();
	}

	function updatePagerUI() {
		const indicator = document.getElementById('page-indicator');
		const prev = document.getElementById('page-prev');
		const next = document.getElementById('page-next');
		const indicatorBottom = document.getElementById('page-indicator-bottom');
		const prevBottom = document.getElementById('page-prev-bottom');
		const nextBottom = document.getElementById('page-next-bottom');

		if (indicator) indicator.textContent = currentPage + ' / ' + totalPages;
		if (indicatorBottom) indicatorBottom.textContent = currentPage + ' / ' + totalPages;
		if (prev) prev.disabled = (currentPage <= 1);
		if (next) next.disabled = (currentPage >= totalPages);
		if (prevBottom && prev) prevBottom.disabled = prev.disabled;
		if (nextBottom && next) nextBottom.disabled = next.disabled;
	}

	/* =========================
	   Public API / init
	========================= */
	// Auto-init on DOMContentLoaded: hydrate master and wire controls
	document.addEventListener('DOMContentLoaded', function () {
		if (!window.marked) console.warn('marked.js not detected; Markdown will render via fallback.');
		wireControls();
		wireBackButtonPositioning();
		// currentPage already default 1; hydrate MASTER then render views
		hydrateMaster();
	});

	// Expose a small API for manual control / debugging
	window.Blades = {
		hydrate: hydrateMaster,
		render: renderActiveViews,
		cleanup: cleanupAll,
		markAllArchiveRead: markAllArchiveRead,
		getMaster: () => MASTER,
		getUnreadCount: () => MASTER.filter(m => !getRead(stableIdForItem(m))).length,
		getMemoryStats: () => (performance && performance.memory) ? performance.memory : null
	};

	// ensure cleanup on pagehide (helps single-page / session leaks)
	window.addEventListener('pagehide', cleanupAll);
	window.addEventListener('beforeunload', cleanupAll);
})();
</script>
