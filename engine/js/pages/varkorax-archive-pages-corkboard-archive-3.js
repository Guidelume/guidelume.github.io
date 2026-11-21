// Page controller for varkorax-archive/pages/corkboard/archive.html.

	(function () {
		'use strict';

		/* --------------------
		   Config & State
		   -------------------- */
		const DATA_PATH = new URL('data.json', window.location.href).href;
		const PAGE_SIZE_KEY = 'archive.pageSize';
		const DEFAULT_PAGE_SIZE = 10;
		const PAGE_PREFETCH = 2; // how many pages of entries to keep loaded/rendered at once

		let PAGE_SIZE = DEFAULT_PAGE_SIZE;
		let currentPage = 1;
		let totalPages = 1;
		let MASTER = [];

		// trackers for cleanup
		const _timeouts = new Set();
		const _intervals = new Set();
		const _boundHandlers = [];
		let _topbarObserver = null;
		let _resizeHandler = null;
		let _docDOMContentLoadedHandler = null;

		/* --------------------
		   Utilities
		   -------------------- */
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
				} catch (e) { /* fallthrough */ }
			}
			return '<p>' + escapeHtml(txt).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
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

		function stableIdForItem(item) {
			if (!item) return 'item-' + Math.random().toString(36).slice(2, 9);
			if (item.id) return String(item.id);
			if (item.md) {
				const p = String(item.md).split('/').pop();
				return 'md-' + p.replace(/\W+/g, '_');
			}
			return 'item-' + (item.date ? item.date.replace(/\W+/g, '_') : Math.random().toString(36).slice(2, 9));
		}

		function resolveMdPath(md) {
			if (!md) return '';
			const normalizedPath = md.replace(/^(?:\.\/)?corkboard\//, './');
			try { return new URL(normalizedPath, DATA_PATH).href; }
			catch (_) { return ''; }
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

		function categoryMatches(itemCategory, listCategory) {
			if (!itemCategory || !listCategory) return false;
			const ic = String(itemCategory).toLowerCase();
			const lc = String(listCategory).toLowerCase();
			if (ic === lc) return true;
			if (ic === lc + 's' || lc === ic + 's') return true;
			if (ic.indexOf(lc) === 0 || lc.indexOf(ic) === 0) return true;
			return false;
		}

		/* --------------------
		   Timeout helpers
		   -------------------- */
		function safeSetTimeout(fn, ms) {
			const id = setTimeout(() => {
				try { fn(); } catch (e) { console.error(e); }
				_timeouts.delete(id);
			}, ms);
			_timeouts.add(id);
			return id;
		}
		function safeClearTimeout(id) { clearTimeout(id); _timeouts.delete(id); }

		/* --------------------
		   Rendering & lazy fetch strategy (prefetch N pages)
		   -------------------- */
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
			if (item.category) {
				const catEl = el('span'); catEl.textContent = item.category; catEl.className = 'archive-tag'; catEl.style.opacity = '0.85';
				meta.appendChild(catEl);
			}
			wrapper.appendChild(meta);

			// content placeholder
			const content = el('div', { 'class': 'blade-content' });
			const text = el('div', { 'class': 'blade-text' });

			// If item._html is present (prefetched), show preview, else instruct to load
			if (item._html) text.innerHTML = sanitizeContentHtml(item._html);
			else text.innerHTML = '<p><em>Click "Load" to fetch content</em></p>';
			content.appendChild(text);

			const expandBtn = el('button', { 'class': 'expand-btn' });
			expandBtn.type = 'button';
			// If prefetched, show expand; otherwise show Load
			expandBtn.textContent = item._html ? 'Expand' : 'Load';
			content.appendChild(expandBtn);
			wrapper.appendChild(content);

			// read/expanded state (don't auto-open; restore flag handled after append)
			try {
				const readKey = 'archive.read.' + id;
				const expandedKey = 'archive.expanded.' + id;
				const wasRead = localStorage.getItem(readKey) === '1';
				const wasExpanded = localStorage.getItem(expandedKey) === '1';
				if (!wasRead) wrapper.classList.add('unread'); else wrapper.classList.add('read');
				if (wasExpanded) wrapper.dataset.restoreExpanded = '1';
			} catch (e) { /* ignore */ }

			return wrapper;
		}

		function setButtonLoadedState(btn, wrapper, loaded) {
			if (!btn) return;
			if (!loaded) { btn.textContent = 'Load'; return; }
			btn.textContent = wrapper.classList.contains('expanded') ? 'Collapse' : 'Expand';
		}

		function loadContentForWrapper(wrapper, forceReload) {
			return new Promise((resolve) => {
				const id = wrapper.dataset.id;
				const masterItem = MASTER.find(it => stableIdForItem(it) === id);
				const textEl = wrapper.querySelector('.blade-text');
				const btn = wrapper.querySelector('.expand-btn');
				if (!masterItem || !textEl || !btn) { resolve(false); return; }

				if (masterItem._html && !forceReload) {
					textEl.innerHTML = masterItem._html;
					setButtonLoadedState(btn, wrapper, true);
					resolve(true);
					return;
				}

				btn.classList.add('loading');

				// inline content preferred
				if (masterItem.content) {
					try { masterItem._html = mdToHtml(masterItem.content); } catch (e) { masterItem._html = escapeHtml(masterItem.content || ''); }
					textEl.innerHTML = masterItem._html;
					btn.classList.remove('loading');
					setButtonLoadedState(btn, wrapper, true);
					resolve(true);
					return;
				}

				// fetch markdown if present
				if (masterItem.md) {
					const p = resolveMdPath(masterItem.md);
					fetch(p).then(r => {
						if (!r.ok) throw new Error('Failed to fetch ' + p + ' (' + r.status + ')');
						return r.text();
					}).then(txt => {
						try { masterItem._html = mdToHtml(txt); } catch (e) { masterItem._html = escapeHtml(txt); }
						textEl.innerHTML = masterItem._html;
					}).catch(err => {
						console.warn('Failed to load md:', masterItem.md, err);
						masterItem._html = '<p><em>Content unavailable</em></p>';
						textEl.innerHTML = masterItem._html;
					}).finally(() => {
						btn.classList.remove('loading');
						setButtonLoadedState(btn, wrapper, true);
						resolve(true);
					});
					return;
				}

				// no content
				masterItem._html = '<p><em>No content</em></p>';
				textEl.innerHTML = masterItem._html;
				btn.classList.remove('loading');
				setButtonLoadedState(btn, wrapper, true);
				resolve(true);
			});
		}

		function animateOpen(wrapper, textEl, btn, restore) {
			textEl.style.display = 'block';
			textEl.style.webkitLineClamp = 'unset';
			const targetPx = textEl.scrollHeight + 'px';
			textEl.style.maxHeight = targetPx;
			wrapper.classList.add('expanded');
			wrapper.classList.remove('unread');
			wrapper.classList.add('read');
			try {
				localStorage.setItem('archive.read.' + wrapper.dataset.id, '1');
				localStorage.setItem('archive.expanded.' + wrapper.dataset.id, '1');
			} catch (e) { /* ignore */ }
			setButtonLoadedState(btn, wrapper, true);
			safeSetTimeout(() => { textEl.style.maxHeight = 'none'; }, restore ? 220 : 420);
		}

		function openAfterLoad(wrapper, restore) {
			const textEl = wrapper.querySelector('.blade-text');
			const btn = wrapper.querySelector('.expand-btn');
			animateOpen(wrapper, textEl, btn, restore);
		}

		function openOrLoadAndOpen(wrapper, restore) {
			const id = wrapper.dataset.id;
			const masterItem = MASTER.find(it => stableIdForItem(it) === id);
			if (!masterItem) return;
			if (!masterItem._html) {
				loadContentForWrapper(wrapper).then(() => openAfterLoad(wrapper, restore));
			} else {
				openAfterLoad(wrapper, restore);
			}
		}

		function collapseBlade(wrapper) {
			const textEl = wrapper.querySelector('.blade-text');
			const btn = wrapper.querySelector('.expand-btn');
			if (!textEl || !btn) return;
			const fullH = textEl.scrollHeight;
			textEl.style.maxHeight = fullH + 'px';
			safeSetTimeout(() => {
				const lineH = parseFloat(getComputedStyle(textEl).lineHeight || 18);
				textEl.style.maxHeight = (lineH * 3 + 6) + 'px';
				textEl.style.webkitLineClamp = '3';
			}, 20);
			wrapper.classList.remove('expanded');
			btn.textContent = 'Expand';
			try { localStorage.removeItem('archive.expanded.' + wrapper.dataset.id); } catch (e) {}
		}

		/* --------------------
		   Counters & marking
		   -------------------- */
		function computeUnreadCounts() {
			const counts = { all: 0, thought: 0, bookmark: 0, update: 0 };
			try {
				MASTER.forEach(it => {
					const id = stableIdForItem(it);
					const read = localStorage.getItem('archive.read.' + id) === '1';
					if (!read) {
						counts.all++;
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
			try {
				const allCounts = computeUnreadCounts();
				const ac = document.getElementById('archive-count');
				if (ac) {
					ac.textContent = 'All: ' + allCounts.all + ' unread — Thoughts: ' + allCounts.thought + ' · Bookmarks: ' + allCounts.bookmark + ' · Updates: ' + allCounts.update;
				}
			} catch (e) {}
		}

		function markAllVisibleRead() {
			const container = document.getElementById('archive-stream');
			if (!container) return;
			const blades = container.querySelectorAll('.archive-item-wrapper .blade.unread');
			blades.forEach(b => {
				b.classList.remove('unread'); b.classList.add('read');
				const id = b.dataset.id || '';
				try { localStorage.setItem('archive.read.' + id, '1'); } catch (e) {}
			});
			updateCounters();
		}

		function markAllArchiveRead() {
			MASTER.forEach(it => {
				const id = stableIdForItem(it);
				try { localStorage.setItem('archive.read.' + id, '1'); } catch (e) {}
			});
			// full visual update: clear DOM wrappers, trim cache aggressively and re-render
			pageCleanup();
			applyRender();
		}

		function markArchiveCategoryRead(cat) {
			if (!cat) return;
			MASTER.forEach(it => {
				if (it && it.category && String(it.category).toLowerCase() === cat) {
					const id = stableIdForItem(it);
					try { localStorage.setItem('archive.read.' + id, '1'); } catch (e) {}
				}
			});
			pageCleanup();
			applyRender();
		}

		/* --------------------
		   Filtering / pagination
		   -------------------- */
		function buildViewArray() {
			const cat = (document.getElementById('filter-category') ? document.getElementById('filter-category').value : 'all');
			const sort = (document.getElementById('sort-mode') ? document.getElementById('sort-mode').value : 'newest');
			const unreadOnly = (document.getElementById('filter-unread') ? document.getElementById('filter-unread').checked : false);

			let items = MASTER.slice();

			if (cat && cat !== 'all') items = items.filter(x => x && x.category && categoryMatches(x.category, cat));
			if (unreadOnly) items = items.filter(it => {
				try { return localStorage.getItem('archive.read.' + stableIdForItem(it)) !== '1'; }
				catch (e) { return true; }
			});

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

			totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
			if (currentPage > totalPages) currentPage = totalPages;
			if (currentPage < 1) currentPage = 1;

			// page slice spans multiple pages (PAGE_PREFETCH)
			const start = (currentPage - 1) * PAGE_SIZE;
			const end = start + PAGE_SIZE * PAGE_PREFETCH;
			const pageSlice = items.slice(start, end);

			return { allFiltered: items, pageItems: pageSlice, totalFiltered: items.length };
		}

		/* --------------------
		   Render pipeline (renders up to PAGE_PREFETCH pages at once)
		   -------------------- */
		function applyRender() {
			const built = buildViewArray();
			const container = document.getElementById('archive-stream');
			if (!container) return;

			if (!built || built.totalFiltered === 0) {
				// clear old DOM explicitly
				container.innerHTML = '';
				const empty = el('div', { 'class': 'content small' });
				empty.innerHTML = '<p>No items match that filter.</p>';
				container.appendChild(empty);
				const ac = document.getElementById('archive-count');
				if (ac) ac.textContent = 'All: 0 unread — Thoughts: 0 · Bookmarks: 0 · Updates: 0';
				updatePagerUI();
				return;
			}

			const frag = document.createDocumentFragment();
			built.pageItems.forEach(it => {
				const blade = renderBlade(it);
				if (blade.dataset.restoreExpanded === '1') blade.dataset._shouldOpen = '1';
				const wrap = el('div', { 'class': 'archive-item-wrapper' });
				wrap.appendChild(blade);
				frag.appendChild(wrap);
			});

			// explicit DOM swap: remove old wrappers then append new fragment
			// (removal helps break references and encourages GC)
			container.innerHTML = '';
			container.appendChild(frag);

			// after insertion, open any restore requests (lazy-load will occur if needed)
			const toOpen = container.querySelectorAll('[data-_should-open="1"]');
			toOpen.forEach(b => {
				delete b.dataset._shouldOpen;
				openOrLoadAndOpen(b, true);
			});

			updateCounters();
			updatePagerUI();

			// trim cached html aggressively but keep prefetched pages' html
			_trimHtmlCachePrefetch(built.pageItems);
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

		/* --------------------
		   Cache trimming & cleanup
		   -------------------- */
		function _trimHtmlCachePrefetch(prefetchedItems = null) {
			try {
				// keep only the items that fall within the prefetched window (current .. current+PAGE_PREFETCH-1)
				const itemsToKeep = prefetchedItems || buildViewArray().pageItems;
				const keepIds = new Set(itemsToKeep.map(it => stableIdForItem(it)));
				for (let i = 0; i < MASTER.length; i++) {
					const id = stableIdForItem(MASTER[i]);
					if (!keepIds.has(id) && MASTER[i]._html) {
						delete MASTER[i]._html;
					}
				}
			} catch (e) { /* ignore */ }
		}

		function pageCleanup() {
			// remove all archive wrappers from DOM (explicit remove to break refs)
			try {
				const container = document.getElementById('archive-stream');
				if (container) {
					const wrappers = Array.from(container.querySelectorAll('.archive-item-wrapper'));
					wrappers.forEach(w => {
						if (w.parentNode) w.parentNode.removeChild(w);
					});
				}
			} catch (e) {}

			// clear timeouts & intervals tracked for UI transitions
			_timeouts.forEach(id => clearTimeout(id));
			_timeouts.clear();
			_intervals.forEach(id => clearInterval(id));
			_intervals.clear();

			// aggressively free cached HTML for non-prefetched items
			_trimHtmlCachePrefetch();
		}

		function cleanupAll() {
			_timeouts.forEach(id => clearTimeout(id));
			_timeouts.clear();
			_intervals.forEach(id => clearInterval(id));
			_intervals.clear();

			_boundHandlers.forEach(binding => {
				try { binding.el.removeEventListener(binding.type, binding.handler); } catch (e) {}
			});
			_boundHandlers.length = 0;

			if (_topbarObserver) { try { _topbarObserver.disconnect(); } catch (e) {} _topbarObserver = null; }

			const container = document.getElementById('archive-stream');
			if (container) container.innerHTML = '';

			MASTER.length = 0;
		}

		/* --------------------
		   Navigation helpers
		   -------------------- */
		function navigateToPage(page) {
			if (page === currentPage) return;
			pageCleanup();
			currentPage = page;
			// prefetch pages when navigating
			_prefetchWindowPages().then(() => applyRender());
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}

		/* --------------------
		   Data loading & prefetch strategy
		   -------------------- */
		function fetchJSON() {
			return fetch(DATA_PATH).then(r => {
				if (!r.ok) throw new Error('Failed to fetch ' + DATA_PATH + ' (' + r.status + ')');
				return r.json();
			});
		}

		function fetchMDResolved(md) {
			const p = resolveMdPath(md);
			return fetch(p).then(r => {
				if (!r.ok) throw new Error('Failed to fetch ' + p + ' (' + r.status + ')');
				return r.text();
			});
		}

		function hydrate() {
			return fetchJSON().then(data => {
				if (!Array.isArray(data)) data = [];
				// normalize metadata; do not eagerly fetch all md files
				const items = data.map(it => ({
					category: it.category || '',
					id: (typeof it.id !== 'undefined') ? it.id : '',
					md: it.md || '',
					date: it.date || '',
					title: it.title || '',
					content: it.content || null
				}));
				items.sort(itemComparator);
				MASTER = items.slice();
				currentPage = 1;
				// prefetch the first PAGE_PREFETCH pages' items' HTML so UI feels snappy
				return _prefetchWindowPages().then(() => applyRender());
			}).catch(err => {
				console.error('Failed to load archive data', err);
				const container = document.getElementById('archive-stream');
				if (container) container.textContent = 'Failed to load archive.';
			});
		}

		function _prefetchWindowPages() {
			// fetch/convert _html for items within the prefetch window (currentPage .. current+PAGE_PREFETCH-1)
			return new Promise((resolve) => {
				try {
					const start = (currentPage - 1) * PAGE_SIZE;
					const end = start + PAGE_SIZE * PAGE_PREFETCH;
					const windowItems = MASTER.slice(start, end);
					const promises = windowItems.map(it => {
						// if already converted, skip
						if (it._html) return Promise.resolve(it);
						// inline content conversion
						if (it.content) {
							try { it._html = mdToHtml(it.content); } catch (e) { it._html = escapeHtml(it.content || ''); }
							return Promise.resolve(it);
						}
						// fetch md if present
						if (it.md) {
							return fetchMDResolved(it.md).then(txt => {
								try { it._html = mdToHtml(txt); } catch (e) { it._html = escapeHtml(txt); }
								return it;
							}).catch(err => {
								console.warn('Prefetch failed for', it.md, err);
								it._html = '<p><em>Content unavailable</em></p>';
								return it;
							});
						}
						it._html = '<p><em>No content</em></p>';
						return Promise.resolve(it);
					});
					Promise.all(promises).then(() => resolve()).catch(() => resolve());
				} catch (e) { resolve(); }
			});
		}

		/* --------------------
		   Controls wiring (delegated)
		   -------------------- */
		function wireControls() {
			// page size
			try {
				const stored = localStorage.getItem(PAGE_SIZE_KEY);
				if (stored && !isNaN(parseInt(stored, 10))) PAGE_SIZE = parseInt(stored, 10);
			} catch (e) {}

			const pageSizeEl = document.getElementById('page-size');
			const pageSizeBottom = document.getElementById('page-size-bottom');
			if (pageSizeEl) {
				pageSizeEl.value = String(PAGE_SIZE);
				const handler = function () {
					const v = parseInt(pageSizeEl.value, 10) || DEFAULT_PAGE_SIZE;
					PAGE_SIZE = v;
					try { localStorage.setItem(PAGE_SIZE_KEY, String(v)); } catch (e) {}
					if (pageSizeBottom) pageSizeBottom.value = pageSizeEl.value;
					pageCleanup();
					applyRender();
				};
				pageSizeEl.addEventListener('change', handler);
				_boundHandlers.push({ el: pageSizeEl, type: 'change', handler: handler });
			}
			if (pageSizeBottom) {
				pageSizeBottom.value = String(PAGE_SIZE);
				const handler = function () {
					const v = parseInt(pageSizeBottom.value, 10) || DEFAULT_PAGE_SIZE;
					PAGE_SIZE = v;
					try { localStorage.setItem(PAGE_SIZE_KEY, String(v)); } catch (e) {}
					if (pageSizeEl) pageSizeEl.value = pageSizeBottom.value;
					pageCleanup();
					applyRender();
				};
				pageSizeBottom.addEventListener('change', handler);
				_boundHandlers.push({ el: pageSizeBottom, type: 'change', handler: handler });
			}

			// filters & sort
			const filterCategoryEl = document.getElementById('filter-category');
			const sortModeEl = document.getElementById('sort-mode');
			const filterUnreadEl = document.getElementById('filter-unread');
			if (filterCategoryEl) { const h = () => { currentPage = 1; pageCleanup(); applyRender(); }; filterCategoryEl.addEventListener('change', h); _boundHandlers.push({ el: filterCategoryEl, type: 'change', handler: h }); }
			if (sortModeEl) { const h = () => { currentPage = 1; pageCleanup(); applyRender(); }; sortModeEl.addEventListener('change', h); _boundHandlers.push({ el: sortModeEl, type: 'change', handler: h }); }
			if (filterUnreadEl) { const h = () => { currentPage = 1; pageCleanup(); applyRender(); }; filterUnreadEl.addEventListener('change', h); _boundHandlers.push({ el: filterUnreadEl, type: 'change', handler: h }); }

			// pager
			const prev = document.getElementById('page-prev');
			const next = document.getElementById('page-next');
			if (prev) { const h = () => { if (currentPage > 1) navigateToPage(currentPage - 1); }; prev.addEventListener('click', h); _boundHandlers.push({ el: prev, type: 'click', handler: h }); }
			if (next) { const h = () => { if (currentPage < totalPages) navigateToPage(currentPage + 1); }; next.addEventListener('click', h); _boundHandlers.push({ el: next, type: 'click', handler: h }); }

			// bottom mirrors
			const prevBottom = document.getElementById('page-prev-bottom');
			const nextBottom = document.getElementById('page-next-bottom');
			if (prevBottom) { const h = () => { const topPrev = document.getElementById('page-prev'); if (topPrev && !topPrev.disabled) topPrev.click(); }; prevBottom.addEventListener('click', h); _boundHandlers.push({ el: prevBottom, type: 'click', handler: h }); }
			if (nextBottom) { const h = () => { const topNext = document.getElementById('page-next'); if (topNext && !topNext.disabled) topNext.click(); }; nextBottom.addEventListener('click', h); _boundHandlers.push({ el: nextBottom, type: 'click', handler: h }); }

			// mark-read menu (guarded)
			const menuWrap = document.getElementById('mark-read-menu');
			const trigger = document.getElementById('mark-read-trigger');
			const menu = menuWrap ? menuWrap.querySelector('.menu') : null;
			function closeMenu() { if (!menuWrap || !trigger) return; menuWrap.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-expanded', 'false'); }
			function openMenu() { if (!menuWrap || !trigger) return; menuWrap.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-expanded', 'true'); }

			if (trigger && menuWrap) {
				const h = function () { const expanded = menuWrap.getAttribute('aria-expanded') === 'true'; if (expanded) closeMenu(); else openMenu(); };
				trigger.addEventListener('click', h); _boundHandlers.push({ el: trigger, type: 'click', handler: h });
			}

			if (menu) {
				const h = function (e) {
					const btn = e.target.closest('button[data-action]');
					if (!btn) return;
					const act = btn.getAttribute('data-action');
					if (menuWrap && trigger) { menuWrap.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-expanded', 'false'); }
					if (act === 'visible') markAllVisibleRead();
					else if (act === 'all') markAllArchiveRead();
					else if (act === 'thought') markArchiveCategoryRead('thought');
					else if (act === 'bookmark') markArchiveCategoryRead('bookmark');
					else if (act === 'update') markArchiveCategoryRead('update');
				};
				menu.addEventListener('click', h); _boundHandlers.push({ el: menu, type: 'click', handler: h });
			}

			// document-level close menu & escape
			const docClickHandler = function (e) { if (menuWrap && !menuWrap.contains(e.target)) closeMenu(); };
			document.addEventListener('click', docClickHandler); _boundHandlers.push({ el: document, type: 'click', handler: docClickHandler });
			const docKeyHandler = function (e) { if (e.key === 'Escape') closeMenu(); };
			document.addEventListener('keydown', docKeyHandler); _boundHandlers.push({ el: document, type: 'keydown', handler: docKeyHandler });

			// delegated click for blades (attach to container)
			const container = document.getElementById('archive-stream') || document;
			const delegatedClickHandler = function (e) {
				const blade = e.target.closest('.blade');
				if (!blade) return;
				// allow links to work
				if (e.target.tagName === 'A' && e.target.href) return;
				const btn = e.target.closest('.expand-btn');
				if (btn) {
					// expand-button-specific behavior
					const masterId = blade.dataset.id;
					const masterItem = MASTER.find(it => stableIdForItem(it) === masterId);
					const isLoaded = masterItem && masterItem._html;
					if (!isLoaded) {
						loadContentForWrapper(blade).then(() => openAfterLoad(blade, false));
					} else {
						if (blade.classList.contains('expanded')) collapseBlade(blade);
						else openAfterLoad(blade, false);
					}
					return;
				}
				// clicking the blade area toggles (load if needed)
				if (blade) {
					const masterId = blade.dataset.id;
					const masterItem = MASTER.find(it => stableIdForItem(it) === masterId);
					if (!masterItem || !masterItem._html) {
						loadContentForWrapper(blade).then(() => openAfterLoad(blade, false));
					} else {
						if (blade.classList.contains('expanded')) collapseBlade(blade);
						else openAfterLoad(blade, false);
					}
				}
			};
			container.addEventListener('click', delegatedClickHandler); _boundHandlers.push({ el: container, type: 'click', handler: delegatedClickHandler });
		}

		/* --------------------
		   Topbar back button positioning (safe observer + debounce)
		   -------------------- */
		function wireBackButtonPositioning() {
			const backBtn = document.getElementById('back-to-categories');
			if (!backBtn) return;

			const positionBackButton = function () {
				const current = document.querySelector('#topbar .topbar-btn[aria-current="page"]');
				const anchor = current || document.querySelector('#topbar .topbar-btn');
				if (!anchor) return;
				backBtn.style.position = 'fixed';
				backBtn.style.zIndex = 1202;
				const aRect = anchor.getBoundingClientRect();
				const bRect = backBtn.getBoundingClientRect();
				const left = Math.round(aRect.left + (aRect.width / 2) - (bRect.width / 2));
				const top = Math.round(aRect.bottom + 16);
				backBtn.style.left = left + 'px';
				backBtn.style.top = top + 'px';
			};

			let dbt = null;
			const debouncedPosition = function () {
				if (dbt) clearTimeout(dbt);
				dbt = setTimeout(() => { dbt = null; try { positionBackButton(); } catch (e) {} }, 80);
				_timeouts.add(dbt);
			};

			_docDOMContentLoadedHandler = function () {
				try {
					positionBackButton();
					safeSetTimeout(positionBackButton, 120);
				} catch (e) {}
			};
			document.addEventListener('DOMContentLoaded', _docDOMContentLoadedHandler);
			_boundHandlers.push({ el: document, type: 'DOMContentLoaded', handler: _docDOMContentLoadedHandler });

			const onLoadOnce = function () { safeSetTimeout(positionBackButton, 120); };
			window.addEventListener('load', onLoadOnce);
			_boundHandlers.push({ el: window, type: 'load', handler: onLoadOnce });

			_resizeHandler = function () { debouncedPosition(); };
			window.addEventListener('resize', _resizeHandler);
			_boundHandlers.push({ el: window, type: 'resize', handler: _resizeHandler });

			const topbar = document.getElementById('topbar');
			if (topbar && window.MutationObserver) {
				_topbarObserver = new MutationObserver(debouncedPosition);
				_topbarObserver.observe(topbar, { attributes: true, childList: true, subtree: true });
			}
		}

		/* --------------------
		   Init & unload
		   -------------------- */
		document.addEventListener('DOMContentLoaded', function init() {
			wireControls();
			// prefetching N pages happens inside hydrate()
			hydrate();
			wireBackButtonPositioning();
		});

		// ensure full cleanup on unload or pagehide
		window.addEventListener('pagehide', cleanupAll);
		window.addEventListener('beforeunload', cleanupAll);

		/* Debug exposure */
		window.__archiveDebug = {
			getMaster: () => MASTER,
			cleanup: cleanupAll,
			pageCleanup: pageCleanup,
			getMemoryStats: () => (performance && performance.memory) ? performance.memory : null
		};
	})();
	