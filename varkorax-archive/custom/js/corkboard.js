(function () {
	'use strict';

	/* =========================
	   - Rebrand as Corkboard
	   ========================= */

	// config
	const DATA_PATH = new URL('../../pages/corkboard/data.json', document.currentScript?.src || window.location.href).href;
	const PER_CATEGORY = 3; // show latest N blades per category. 3 seemes like a good number for now

	// state
	let MASTER = [];
	const _timeouts = new Set();
	const _boundHandlers = [];
	const contentRequests = new Map();
	const contentQueue = [];
	const MAX_CONTENT_REQUESTS = 3;
	let activeContentRequests = 0;
	let generation = 0;
	let contentController = new AbortController();
	let previewObserver;

	// helpers -----------------------------------------------------------
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

	function sanitizeContentHtml(html) {
		if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
			return window.DOMPurify.sanitize(html);
		}
		// mdToHtml already escapes the source when DOMPurify is unavailable.
		return String(html || '');
	}

	function mdToHtml(txt) {
		if (typeof txt !== 'string') return '';
		// strip front matter if present
		if (txt.indexOf('---') === 0) {
			const fmEnd = txt.indexOf('\n---', 3);
			if (fmEnd !== -1) {
				const nextLine = txt.indexOf('\n', fmEnd + 4);
				txt = nextLine !== -1 ? txt.slice(nextLine + 1) : txt.slice(fmEnd + 4);
			}
		}
		if (window.marked && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
			try {
				const html = (typeof window.marked.parse === 'function') ? window.marked.parse(txt) : window.marked(txt);
				return window.DOMPurify.sanitize(html);
			} catch (e) {
				/* fallthrough */
			}
		}
		return '<p>' + escapeHtml(txt).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
	}

	function safeSetTimeout(fn, ms) {
		const id = setTimeout(() => {
			try { fn(); } catch (e) { console.error(e); }
			_timeouts.delete(id);
		}, ms);
		_timeouts.add(id);
		return id;
	}

	// date / id utilities ------------------------------------------------
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
		const da = parseDateTimestamp(a);
		const db = parseDateTimestamp(b);
		if (da !== null && db !== null) return db - da;
		if (da !== null && db === null) return -1;
		if (db !== null && da === null) return 1;

		const na = parseNumericFromIdOrFile(a);
		const nb = parseNumericFromIdOrFile(b);
		if (na !== null && nb !== null) return nb - na;
		if (na !== null && nb === null) return -1;
		if (nb !== null && na === null) return 1;
		return 0;
	}

	function categoryMatches(itemCategory, listCategory) {
		if (!itemCategory || !listCategory) return false;
		const ic = String(itemCategory).toLowerCase();
		const lc = String(listCategory).toLowerCase();
		if (ic === lc) return true;
		if (ic === lc + 's' || lc === ic + 's') return true;
		if (ic.indexOf(lc) === 0 || lc.indexOf(ic) === 0) return true;
		return false;
	}

	function limitAndSort(items) {
		const arr = (items || []).slice().sort(itemComparator);
		return arr.slice(0, PER_CATEGORY);
	}

	function getOrdinal(n) {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	}

	function formatFriendlyDate(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (isNaN(d)) return iso;
		const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
		return monthNames[d.getUTCMonth()] + ' ' + getOrdinal(d.getUTCDate()) + ', ' + d.getUTCFullYear();
	}

	function stableIdForItem(item) {
		if (!item) return 'item-' + Math.random().toString(36).slice(2,9);
		if (item.id) return String(item.id);
		if (item.md) {
			const p = String(item.md).split('/').pop();
			return 'md-' + p.replace(/\W+/g, '_');
		}
		return 'item-' + (item.date ? item.date.replace(/\W+/g, '_') : Math.random().toString(36).slice(2,9));
	}

	// Resolve entry paths from the shared JSON file for both Corkboard views.
	function resolveMdCandidates(md) {
		if (!md) return [];
		try {
			const normalizedPath = md.replace(/^(?:\.\/)?corkboard\//, './');
			return [new URL(normalizedPath, DATA_PATH).href];
		} catch (_) {
			return [];
		}
	}

	// Attempt to fetch md from multiple candidate paths, return fetched text for first OK response
	function fetchMdResolved(md, signal) {
		const candidates = resolveMdCandidates(md);
		if (!candidates.length) return Promise.reject(new Error('No md path'));
		// try sequentially
		let i = 0;
		function tryNext() {
			if (i >= candidates.length) return Promise.reject(new Error('All candidates failed for ' + md));
			const p = candidates[i++];
			return fetch(p, { signal }).then(r => {
				if (!r.ok) {
					// try next
					return tryNext();
				}
				return r.text();
			}).catch(error => {
				if (signal.aborted) throw error;
				return tryNext();
			});
		}
		return tryNext();
	}

	// DOM render helpers ---------------------------------------------------
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

		if (item.id) {
			const idEl = el('span'); idEl.textContent = '#' + item.id; idEl.style.opacity = '0.9';
			meta.appendChild(idEl);
		}
		if (item.source) {
			const srcEl = el('span'); srcEl.textContent = item.source; srcEl.style.opacity = '0.7';
			meta.appendChild(srcEl);
		}
		wrapper.appendChild(meta);

		// content placeholder (show preview if _html available)
		const content = el('div', { 'class': 'blade-content' });
		const text = el('div', { 'class': 'blade-text' });
		if (item._html) text.innerHTML = sanitizeContentHtml(item._html);
		else text.innerHTML = '<p><em>Loading preview…</em></p>';
		content.appendChild(text);

		// expand/load button
		const expandBtn = el('button', { 'class': 'expand-btn' });
		expandBtn.type = 'button';
		expandBtn.textContent = item._html ? 'Expand' : 'Load';
		content.appendChild(expandBtn);
		wrapper.appendChild(content);

		// read/expanded state from storage
		try {
			const readKey = 'corkboard.read.' + id;
			const expandedKey = 'corkboard.expanded.' + id;
			const wasRead = localStorage.getItem(readKey) === '1';
			const wasExpanded = localStorage.getItem(expandedKey) === '1';
			if (!wasRead) wrapper.classList.add('unread'); else wrapper.classList.add('read');
			if (wasExpanded) wrapper.dataset.restoreExpanded = '1';
		} catch (e) { /* ignore */ }

		return wrapper;
	}

	function drainContentQueue() {
		while (activeContentRequests < MAX_CONTENT_REQUESTS && contentQueue.length) {
			const job = contentQueue.shift();
			activeContentRequests++;
			job.run().then(job.resolve).finally(() => {
				activeContentRequests--;
				drainContentQueue();
			});
		}
	}

	// Cache pending requests as well as completed HTML, including preview/open races.
	function loadContentForItem(item) {
		if (!item) return Promise.resolve(false);
		if (item._html) return Promise.resolve(true);
		if (contentRequests.has(item)) return contentRequests.get(item);
		const version = generation;
		const signal = contentController.signal;
		const request = new Promise(resolve => {
			contentQueue.push({ resolve, run: async () => {
				try {
					const text = item.content || (item.md ? await fetchMdResolved(item.md, signal) : '');
					if (version !== generation || signal.aborted) return false;
					item._html = text ? mdToHtml(text) : '<p><em>No content</em></p>';
				} catch (error) {
					if (version !== generation || signal.aborted) return false;
					console.warn('Failed to load md for', item.md, error);
					item._html = '<p><em>Content unavailable</em></p>';
				}
				return true;
			} });
		});
		contentRequests.set(item, request);
		void request.then(() => {
			if (contentRequests.get(item) === request) contentRequests.delete(item);
		});
		drainContentQueue();
		return request;
	}

	async function loadBladeContent(wrapper, item, expand = false, restore = false) {
		const version = generation;
		if (expand) wrapper.dataset.opening = '1';
		const loaded = await loadContentForItem(item);
		if (!loaded || version !== generation || !wrapper.isConnected) return;
		if (!wrapper.dataset.contentReady) {
			wrapper.querySelector('.blade-text').innerHTML = sanitizeContentHtml(item._html);
			wrapper.dataset.contentReady = '1';
			wrapper.querySelector('.expand-btn').textContent = 'Expand';
		}
		if (expand) {
			delete wrapper.dataset.opening;
			openBladeNode(wrapper, restore);
			updateCounters();
		}
	}

	// animate open/collapse (timeouts tracked so we can clear)
	function openBladeNode(wrapper, restore) {
		const textEl = wrapper.querySelector('.blade-text');
		const btn = wrapper.querySelector('.expand-btn');
		if (!textEl || !btn) return;
		// ensure content displayed (images may affect scrollHeight)
		textEl.style.display = 'block';
		textEl.style.webkitLineClamp = 'unset';
		const targetPx = textEl.scrollHeight + 'px';
		textEl.style.maxHeight = targetPx;

		wrapper.classList.add('expanded');
		wrapper.classList.remove('unread');
		wrapper.classList.add('read');
		btn.textContent = 'Collapse';

		// persist
		try {
			localStorage.setItem('corkboard.read.' + wrapper.dataset.id, '1');
			localStorage.setItem('corkboard.expanded.' + wrapper.dataset.id, '1');
		} catch (e) {}

		// tidy after animation
		const tidyDelay = restore ? 220 : 420;
		safeSetTimeout(() => {
			textEl.style.maxHeight = 'none';
		}, tidyDelay);
	}

	function collapseBladeNode(wrapper) {
		const textEl = wrapper.querySelector('.blade-text');
		const btn = wrapper.querySelector('.expand-btn');
		if (!textEl || !btn) return;

		const fullH = textEl.scrollHeight;
		textEl.style.maxHeight = fullH + 'px';
		// schedule collapse to clamp height
		safeSetTimeout(() => {
			const lineH = parseFloat(getComputedStyle(textEl).lineHeight || 18);
			textEl.style.maxHeight = (lineH * 3 + 6) + 'px';
			textEl.style.webkitLineClamp = '3';
		}, 20);

		wrapper.classList.remove('expanded');
		btn.textContent = 'Expand';
		try { localStorage.removeItem('corkboard.expanded.' + wrapper.dataset.id); } catch (e) {}
	}

	// place blades into lists ------------------------------------------------
	function placeBlades(master) {
		previewObserver?.disconnect();
		const version = generation;
		const lists = document.querySelectorAll('.blade-list');
		lists.forEach(list => {
			const cat = list.getAttribute('data-category');
			let items = master.filter(x => categoryMatches(x.category, cat));
			items = limitAndSort(items);
			// explicit DOM cleanup
			while (list.firstChild) list.removeChild(list.firstChild);

			items.forEach(it => {
				const bladeEl = renderBlade(it);
				list.appendChild(bladeEl);
			});
		});
		// restore expanded blades (after DOM inserted)
		requestAnimationFrame(() => {
			if (version !== generation) return;
			const toOpen = document.querySelectorAll('.blade[data-restore-expanded="1"]');
			toOpen.forEach(b => {
				delete b.dataset.restoreExpanded;
				const id = b.dataset.id;
				const masterItem = MASTER.find(x => stableIdForItem(x) === id);
				void loadBladeContent(b, masterItem, true, true);
			});
			const loadPreview = blade => {
				const item = MASTER.find(entry => stableIdForItem(entry) === blade.dataset.id);
				void loadBladeContent(blade, item);
			};
			if ('IntersectionObserver' in window) {
				previewObserver = new IntersectionObserver(entries => {
					if (version !== generation) return;
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						previewObserver.unobserve(entry.target);
						loadPreview(entry.target);
					}
				}, { rootMargin: '200px' });
				document.querySelectorAll('.blade-list .blade').forEach(blade => previewObserver.observe(blade));
			} else {
				document.querySelectorAll('.blade-list .blade').forEach(loadPreview);
			}
		});
		updateCounters();
	}

	// counters (compute from MASTER rather than querying DOM)
	function computeUnreadCounts() {
		const counts = { total: 0, thought: 0, bookmark: 0, update: 0 };
		try {
			MASTER.forEach(it => {
				const id = stableIdForItem(it);
				const isRead = localStorage.getItem('corkboard.read.' + id) === '1';
				if (!isRead) {
					counts.total++;
					const cat = (it.category || '').toLowerCase();
					if (cat.indexOf('thought') === 0 || cat === 'thought') counts.thought++;
					else if (cat.indexOf('bookmark') === 0 || cat === 'bookmark') counts.bookmark++;
					else if (cat.indexOf('update') === 0 || cat === 'update') counts.update++;
				}
			});
		} catch (e) { /* ignore */ }
		return counts;
	}

	function updateCounters() {
		const counts = computeUnreadCounts();
		// per-category counters (.cat-counter[data-category="..."])
		const catEls = document.querySelectorAll('.cat-counter');
		catEls.forEach(elm => {
			const cat = elm.getAttribute('data-category');
			const n = counts[cat] || 0;
			elm.textContent = n + ' unread';
			elm.setAttribute('aria-label', n + ' unread items in ' + cat);
		});
		// total
		const totalEl = document.getElementById('soundboard-unread');
		if (totalEl) {
			totalEl.textContent = counts.total + ' unread';
			totalEl.setAttribute('aria-label', counts.total + ' unread items total');
		}
	}

	// mark all visible as read (affects DOM and localStorage)
	function markAllRead() {
		const blades = document.querySelectorAll('.blade-list .blade');
		blades.forEach(b => {
			const id = b.dataset.id;
			try { localStorage.setItem('corkboard.read.' + id, '1'); } catch (e) {}
			b.classList.remove('unread');
			b.classList.add('read');
		});
		updateCounters();
	}

	// data load --------------------------------------------------------------
	function fetchJSON() {
		return fetch(DATA_PATH, { signal: contentController.signal }).then(r => {
			if (!r.ok) throw new Error('Failed to fetch ' + DATA_PATH + ' (' + r.status + ')');
			return r.json();
		});
	}

	function hydrate() {
		const version = generation;
		return fetchJSON().then(data => {
			if (version !== generation) return;
			if (!Array.isArray(data)) data = [];
			MASTER = data.map(item => {
				item.category = item.category || '';
				item.id = (typeof item.id !== 'undefined') ? item.id : '';
				item.md = item.md || '';
				item.date = item.date || '';
				item.title = item.title || '';
				item.content = item.content || null;
				return item;
			}).sort(itemComparator);
			placeBlades(MASTER);
		}).catch(err => {
			if (version !== generation) return;
			console.error('Failed to load corkboard data', err);
		});
	}

	// event delegation ------------------------------------------------------
	function wireDelegation() {
		// delegated click handler for any blade interactions
		const delegatedClick = function (e) {
			const blade = e.target.closest('.blade');
			if (!blade) return;
			if (blade.dataset.opening) return;
			// let links behave normally
			if (e.target.closest('a[href]')) return;

			// click footprint on blade toggles (load if needed)
			const id = blade.dataset.id;
			const item = MASTER.find(x => stableIdForItem(x) === id);
			if (!item) return;
			if (blade.classList.contains('expanded')) collapseBladeNode(blade);
			else void loadBladeContent(blade, item, true);
			updateCounters();
		};

		document.addEventListener('click', delegatedClick);
		_boundHandlers.push({ el: document, type: 'click', handler: delegatedClick });
	}

	// wire controls (mark-all-read)
	function wireControls() {
		const markBtn = document.getElementById('mark-all-read');
		if (markBtn) {
			const h = function () {
				markAllRead();
				// optional toast behavior (non-critical)
				try {
					const toast = document.getElementById('toast-container');
					if (toast) {
						toast.innerText = 'All visible items marked read';
						safeSetTimeout(() => { toast.innerText = ''; }, 1600);
					}
				} catch (e) {}
			};
			markBtn.addEventListener('click', h);
			_boundHandlers.push({ el: markBtn, type: 'click', handler: h });
		}
	}

	// cleanup ---------------------------------------------------------------
	function pageCleanup() {
		generation++;
		previewObserver?.disconnect();
		contentController.abort();
		contentController = new AbortController();
		contentQueue.splice(0).forEach(job => job.resolve(false));
		contentRequests.clear();
		// remove blade nodes to help GC
		const lists = document.querySelectorAll('.blade-list');
		lists.forEach(list => {
			while (list.firstChild) list.removeChild(list.firstChild);
		});
		// clear timeouts
		_timeouts.forEach(id => clearTimeout(id));
		_timeouts.clear();
		// do not remove control handlers (unless calling cleanupcorkboard)
	}

	function cleanupcorkboard() {
		// remove bound handlers
		_boundHandlers.forEach(b => {
			try { b.el.removeEventListener(b.type, b.handler); } catch (e) {}
		});
		_boundHandlers.length = 0;
		// clear DOM
		pageCleanup();
		// clear master
		MASTER.length = 0;
	}

	// init ------------------------------------------------------------------
	document.addEventListener('DOMContentLoaded', function () {
		if (!window.marked) console.warn('marked.js not detected; Markdown will render via fallback.');
		wireDelegation();
		wireControls();
		hydrate();
	});
	window.addEventListener('pagehide', pageCleanup);
	window.addEventListener('pageshow', event => { if (event.persisted) hydrate(); });

	// debug API
	window.corkboard_DEBUG = {
		cleanup: cleanupcorkboard,
		pageCleanup: pageCleanup,
		getMaster: () => MASTER
	};
})();
