(function () {
	'use strict';

	/* =========================
	   - Rebrand as Corkboard
	   ========================= */

	// config
	const DATA_PATH = 'corkboard/data.json';
	const PER_CATEGORY = 3; // show latest N blades per category. 3 seemes like a good number for now

	// state
	let MASTER = [];
	const _timeouts = new Set();
	const _boundHandlers = [];

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
		if (window.marked) {
			try {
				return (typeof window.marked.parse === 'function') ? window.marked.parse(txt) : window.marked(txt);
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

	// Robust MD path resolution: produce candidate URLs and try them in order
	function resolveMdCandidates(md) {
		if (!md) return [];
		// absolute HTTP(S) or protocol-relative or absolute path -> try as-is
		if (/^https?:\/\//i.test(md) || md.startsWith('//') || md.startsWith('/')) return [md];

		// base folder from DATA_PATH (e.g. 'corkboard/data.json' -> 'corkboard/')
		const base = DATA_PATH.replace(/\/[^\/]*$/, '/');

		const candidates = [];
		// try as-provided
		candidates.push(md);

		// if md starts with './', try relative to DATA_PATH folder
		if (md.indexOf('./') === 0) candidates.push(base + md.slice(2));
		else candidates.push(base + md);

		// if md looks like it begins with 'corkboard/' (common in some JSON), try ../corkboard/...
		if (md.indexOf('corkboard/') === 0) candidates.push('../' + md);

		// try prefixed with './' as fallback
		candidates.push('./' + md);

		// dedupe while preserving order
		const seen = new Set();
		return candidates.filter(c => {
			if (!c) return false;
			if (seen.has(c)) return false;
			seen.add(c);
			return true;
		});
	}

	// Attempt to fetch md from multiple candidate paths, return fetched text for first OK response
	function fetchMdResolved(md) {
		const candidates = resolveMdCandidates(md);
		if (!candidates.length) return Promise.reject(new Error('No md path'));
		// try sequentially
		let i = 0;
		function tryNext() {
			if (i >= candidates.length) return Promise.reject(new Error('All candidates failed for ' + md));
			const p = candidates[i++];
			return fetch(p).then(r => {
				if (!r.ok) {
					// try next
					return tryNext();
				}
				return r.text();
			}).catch(() => tryNext());
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
		if (item._html) text.innerHTML = item._html;
		else if (item.content) text.innerHTML = mdToHtml(item.content);
		else text.innerHTML = '<p><em>Content will load when expanded</em></p>';
		content.appendChild(text);

		// expand/load button
		const expandBtn = el('button', { 'class': 'expand-btn' });
		expandBtn.type = 'button';
		expandBtn.textContent = item._html ? 'Expand' : 'Load';
		content.appendChild(expandBtn);
		wrapper.appendChild(content);

		// read/expanded state from storage (we won't auto-open here; restore after append)
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

	// content loader (cached in MASTER._html) using resolved MD fetch helper
	function loadContentForItem(item) {
		// returns Promise that resolves when item._html is ready
		if (!item) return Promise.resolve(false);
		if (item._html) return Promise.resolve(true);
		// inline content preferred
		if (item.content) {
			try { item._html = mdToHtml(item.content); } catch (e) { item._html = escapeHtml(item.content || ''); }
			return Promise.resolve(true);
		}
		if (item.md) {
			return fetchMdResolved(item.md).then(txt => {
				try { item._html = mdToHtml(txt); } catch (e) { item._html = escapeHtml(txt); }
				return true;
			}).catch(err => {
				console.warn('Failed to load md for', item.md, err);
				item._html = '<p><em>Content unavailable</em></p>';
				return true;
			});
		}
		item._html = '<p><em>No content</em></p>';
		return Promise.resolve(true);
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
		const lists = document.querySelectorAll('.blade-list');
		lists.forEach(list => {
			const cat = list.getAttribute('data-category');
			let items = master.filter(x => categoryMatches(x.category, cat));
			items = limitAndSort(items);
			// explicit DOM cleanup: remove children by node (encourages GC)
			while (list.firstChild) list.removeChild(list.firstChild);

			items.forEach(it => {
				const bladeEl = renderBlade(it);
				list.appendChild(bladeEl);
			});
		});
		// restore expanded blades (after DOM inserted)
		requestAnimationFrame(() => {
			const toOpen = document.querySelectorAll('.blade[data-restore-expanded="1"]');
			toOpen.forEach(b => {
				delete b.dataset.restoreExpanded;
				const id = b.dataset.id;
				const masterItem = MASTER.find(x => stableIdForItem(x) === id);
				loadContentForItem(masterItem).then(() => openBladeNode(b, true));
			});
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
		return fetch(DATA_PATH).then(r => {
			if (!r.ok) throw new Error('Failed to fetch ' + DATA_PATH + ' (' + r.status + ')');
			return r.json();
		});
	}

	function hydrate() {
		return fetchJSON().then(data => {
			if (!Array.isArray(data)) data = [];
			// map & fetch all md in parallel (so local _html present)
			const promises = data.map(item => {
				item.category = item.category || '';
				item.id = (typeof item.id !== 'undefined') ? item.id : '';
				item.md = item.md || '';
				item.date = item.date || '';
				item.title = item.title || '';
				item.content = item.content || null;
				// fetch md if provided (normalize early using fetchMdResolved)
				if (item.md) {
					return fetchMdResolved(item.md).then(txt => {
						try { item._html = mdToHtml(txt); } catch (e) { item._html = escapeHtml(txt); }
						return item;
					}).catch(err => {
						console.warn('Failed to load md:', item.md, err);
						if (item.content) {
							try { item._html = mdToHtml(item.content); } catch (e) { item._html = escapeHtml(item.content || ''); }
						} else {
							item._html = '<p><em>Content unavailable</em></p>';
						}
						return item;
					});
				}
				// inline content convert
				if (item.content) {
					try { item._html = mdToHtml(item.content); } catch (e) { item._html = escapeHtml(item.content || ''); }
				} else {
					item._html = '<p><em>No content</em></p>';
				}
				return Promise.resolve(item);
			});

			return Promise.all(promises).then(all => {
				// store normalized master (not global)
				MASTER = all.slice().sort(itemComparator);
				placeBlades(MASTER);
			});
		}).catch(err => {
			console.error('Failed to load corkboard data', err);
		});
	}

	// event delegation ------------------------------------------------------
	function wireDelegation() {
		// delegated click handler for any blade interactions
		const delegatedClick = function (e) {
			const blade = e.target.closest('.blade');
			if (!blade) return;
			// let links behave normally
			if (e.target.tagName === 'A' && e.target.href) return;

			// handle expand-btn
			const btn = e.target.closest('.expand-btn');
			if (btn) {
				const id = blade.dataset.id;
				const item = MASTER.find(x => stableIdForItem(x) === id);
				if (!item) return;
				// if not loaded, load then open
				if (!item._html) {
					loadContentForItem(item).then(() => openBladeNode(blade, false));
				} else {
					if (blade.classList.contains('expanded')) collapseBladeNode(blade);
					else openBladeNode(blade, false);
				}
				updateCounters();
				return;
			}

			// click footprint on blade toggles (load if needed)
			const id = blade.dataset.id;
			const item = MASTER.find(x => stableIdForItem(x) === id);
			if (!item) return;
			if (!item._html) {
				loadContentForItem(item).then(() => openBladeNode(blade, false));
			} else {
				if (blade.classList.contains('expanded')) collapseBladeNode(blade);
				else openBladeNode(blade, false);
			}
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

	// debug API
	window.corkboard_DEBUG = {
		cleanup: cleanupcorkboard,
		pageCleanup: pageCleanup,
		getMaster: () => MASTER
	};
})();
