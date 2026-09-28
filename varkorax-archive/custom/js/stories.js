(() => {
	// ---------------------- Config ----------------------
	const STORAGE_KEY = "readerSettings";
	const RESUME_KEY_PREFIX = "storyProgress:"; // per-slug last chapter + scroll
	const STORIES_INDEX = "/pages/collections/stories/stories.json"; // absolute from site root
	const RESUME_POPUP_THRESHOLD = 0.05; // don't show resume popup unless progress > 5%
	
	// ---------------------- State -----------------------
	const state = {
		story: null,              // { slug, title, chapters: [{ title, file }] }
		chapterIndex: 0,
		fontSize: 18,
		minFont: 14,
		maxFont: 26,
		theme: "default",
		align: "left",
		fontScheme: "default",
		cozy: false,
		scrollSaveTimer: null
	};
	
	// ---------------------- DOM -------------------------
	const $ = (s) => document.querySelector(s);
	const reader = $("#reader");
	const titleEl = $("#chapter-title");
	const contentEl = $("#chapter-content");
	const progressEl = $("#progress-bar");

	const cozyBtn = $("#cozy-btn");
	const cozyPlayer = $("#cozy-player");
	const rainAudio = $("#rain-audio");
	const audioToggle = $("#audio-toggle");
	const vol = $("#vol");
	const playerCollapse = $("#player-collapse");

	const btnAccessible = $("#btn-accessible");
	const btnFontInc = $("#btn-font-inc");
	const btnFontDec = $("#btn-font-dec");

	const btnAlignLeft = $("#btn-align-left");
	const btnAlignCenter = $("#btn-align-center");
	const btnAlignRight = $("#btn-align-right");

	const btnDay = $("#btn-day");
	const btnNight = $("#btn-night");
	const btnDefault = $("#btn-default");

	const settingsToggle = $("#settings-toggle");
	const infoToggle = $("#info-toggle");
	const settingsPopup = $("#settings-popup");
	const infoPopup = $("#info-popup");

	const rainFront = document.querySelector("#rain-layer .front-row");
	const rainBack = document.querySelector("#rain-layer .back-row");

	// ---------------------- Utils -----------------------
	function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
	function resumeKey(slug) { return `${RESUME_KEY_PREFIX}${slug}`; }

	// Resolve a chapter path into an absolute URL.
	// If `file` is absolute (starts with / or http) it returns as-is.
	// Otherwise it resolves relative to the current page (window.location).
	function resolvePath(file) {
		if (!file || typeof file !== "string") return file;
		if (/^(?:https?:)?\/\//i.test(file) || file.startsWith("/")) return file;
		try {
			return new URL(file, window.location.href).toString();
		} catch (_) {
			return file;
		}
	}

	// ---------------------- Persistence -----------------
	function saveSettings() {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					fontSize: state.fontSize,
					theme: state.theme,
					align: state.align,
					fontScheme: state.fontScheme
				})
			);
		} catch (_) {}
	}

	function loadSettings() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw);
			if (typeof saved.fontSize === "number") setFontSize(saved.fontSize);
			if (typeof saved.theme === "string") setTheme(saved.theme);
			if (typeof saved.align === "string") setAlignment(saved.align);
			if (typeof saved.fontScheme === "string") setFontScheme(saved.fontScheme);
		} catch (_) {}
	}

	function saveResume(slug, index) {
		try {
			const ratio = contentEl ? (contentEl.scrollTop / (contentEl.scrollHeight - contentEl.clientHeight)) : 0;
			localStorage.setItem(resumeKey(slug), JSON.stringify({
				chapterIndex: index,
				scrollRatio: ratio
			}));
		} catch (_) {}
	}

	function loadResume(slug) {
		try {
			const raw = localStorage.getItem(resumeKey(slug));
			if (!raw) return null;
			// handle older numeric-only format gracefully
			if (raw.trim().startsWith("{")) {
				const parsed = JSON.parse(raw);
				// ensure fallback values
				return {
					chapterIndex: typeof parsed.chapterIndex === "number" ? parsed.chapterIndex : 0,
					scrollRatio: typeof parsed.scrollRatio === "number" ? parsed.scrollRatio : 0
				};
			} else {
				const n = raw == null ? NaN : Number(raw);
				return {
					chapterIndex: Number.isFinite(n) ? n : 0,
					scrollRatio: 0
				};
			}
		} catch (_) {
			return null;
		}
	}

	// ---------------------- UI setters ------------------
	function setFontSize(px) {
		state.fontSize = clamp(Number(px) || 18, state.minFont, state.maxFont);
		if (reader) reader.style.setProperty("--content-font-size", state.fontSize + "px");
		saveSettings();
	}

	// ---------------------- Theme text-color helper ----------------
	function ensureThemeTextStyle() {
		if (document.getElementById("theme-text-style")) return;
		const css = `
			/* Provide an explicit text color for reader content and resume modal
			   based on body.theme-day / body.theme-night. Uses a CSS variable
			   so it is easy to tune later. */
			:root { --reader-text-day: #111111; --reader-text-night: #ffffff; }

			body.theme-day .prose,
			body.theme-day #chapter-content,
			body.theme-day .popup-resume,
			body.theme-day .popup-resume .prose {
				color: var(--reader-text-day) !important;
			}
			/* ensure headings/paragraphs/links inherit the color */
			body.theme-day .prose h1,
			body.theme-day .prose h2,
			body.theme-day .prose p,
			body.theme-day .prose li,
			body.theme-day .prose a,
			body.theme-day .popup-resume .prose,
			body.theme-day .popup-resume p {
				color: var(--reader-text-day) !important;
			}

			body.theme-night .prose,
			body.theme-night #chapter-content,
			body.theme-night .popup-resume,
			body.theme-night .popup-resume .prose {
				color: var(--reader-text-night) !important;
			}
			body.theme-night .prose h1,
			body.theme-night .prose h2,
			body.theme-night .prose p,
			body.theme-night .prose li,
			body.theme-night .prose a,
			body.theme-night .popup-resume .prose,
			body.theme-night .popup-resume p {
				color: var(--reader-text-night) !important;
			}

			/* keep other UI controls unaffected; these rules are narrow and specific */
		`.trim();
		const s = document.createElement("style");
		s.id = "theme-text-style";
		s.appendChild(document.createTextNode(css));
		document.head.appendChild(s);
	}

	// ---------------------- UI setters (replace existing setTheme) ------------------
	function setTheme(theme) {
		state.theme = theme === "day" || theme === "night" ? theme : "default";
		if (!reader) return;

		// ensure our style rules are present once
		try { ensureThemeTextStyle(); } catch (_) {}

		// reader-level classes (visual skin for reader container)
		reader.classList.remove("theme-default", "theme-light", "theme-dark");
		if (state.theme === "day") {
			reader.classList.add("theme-light");
		} else if (state.theme === "night") {
			reader.classList.add("theme-dark");
		} else {
			reader.classList.add("theme-default");
		}

		// Body-level theme classes used by the injected CSS to set text color
		try {
			document.body.classList.remove("theme-day", "theme-night");
			if (state.theme === "day") document.body.classList.add("theme-day");
			else if (state.theme === "night") document.body.classList.add("theme-night");
		} catch (_) {}

		saveSettings();
		updateActiveStates();
		try { window.setBackgroundAndText && window.setBackgroundAndText(); } catch (_) {}
	}

	function setAlignment(align) {
		state.align = align === "center" || align === "right" ? align : "left";
		if (reader) reader.style.setProperty("--text-align", state.align);
		saveSettings();
		updateActiveStates();
	}

	function setFontScheme(scheme) {
		state.fontScheme = scheme === "accessible" ? "accessible" : "default";
		document.body.classList.toggle("font-accessible", state.fontScheme === "accessible");
		if (btnAccessible) btnAccessible.setAttribute("aria-pressed", String(state.fontScheme === "accessible"));
		saveSettings();
		updateActiveStates();
	}
	
	function updateActiveStates() {
		// --- Align buttons: clear all, then set the one that matches state.align ---
		const aligns = { left: btnAlignLeft, center: btnAlignCenter, right: btnAlignRight };
		Object.values(aligns).forEach(btn => {
			if (!btn) return;
			btn.classList.remove("is-active");
			btn.setAttribute("aria-pressed", "false");
		});
		if (state.align && aligns[state.align]) {
			const b = aligns[state.align];
			b.classList.add("is-active");
			b.setAttribute("aria-pressed", "true");
		}

		// --- Theme buttons: clear all, then set the one that matches state.theme ---
		const themes = { day: btnDay, night: btnNight, default: btnDefault };
		Object.values(themes).forEach(btn => {
			if (!btn) return;
			btn.classList.remove("is-active");
			btn.setAttribute("aria-pressed", "false");
		});
		if (state.theme && themes[state.theme]) {
			const tb = themes[state.theme];
			tb.classList.add("is-active");
			tb.setAttribute("aria-pressed", "true");
		}

		// --- Accessible font scheme toggle ---
		const aOn = state.fontScheme === "accessible";
		if (btnAccessible) {
			btnAccessible.classList.toggle("is-active", aOn);
			btnAccessible.setAttribute("aria-pressed", String(aOn));
		}

		// --- Cozy toggle ---
		if (cozyBtn) {
			cozyBtn.classList.toggle("is-active", state.cozy);
			cozyBtn.setAttribute("aria-pressed", String(state.cozy));
		}
	}

	function updateProgress() {
		if (!contentEl || !progressEl) return;
		const max = contentEl.scrollHeight - contentEl.clientHeight;
		const pct = max > 0 ? (contentEl.scrollTop / max) * 100 : 0;
		progressEl.style.width = pct + "%";

		// throttle save (persist scroll position)
		if (!state.scrollSaveTimer && state.story) {
			state.scrollSaveTimer = setTimeout(() => {
				saveResume(state.story.slug, state.chapterIndex);
				state.scrollSaveTimer = null;
			}, 500);
		}
	}

	// ---------------------- Cozy & Rain -----------------
	function clearRain() {
		if (rainFront) rainFront.innerHTML = "";
		if (rainBack) rainBack.innerHTML = "";
	}

	function makeItRain() {
		if (!rainFront || !rainBack) return;
		clearRain();
		let increment = 0;
		while (increment < 100) {
			const gap = Math.floor(Math.random() * 4) + 2; // 2..5
			increment += gap;
			const offsetPct = increment;
			const delaySeconds = (Math.random() * 0.9 + 0.05).toFixed(2);
			const durSeconds = (0.45 + Math.random() * 0.85).toFixed(2);

			const delay = `${delaySeconds}s`;
			const dur = `${durSeconds}s`;

			const buildDrop = (container, leftOrRight) => {
				const drop = document.createElement("div");
				drop.className = "drop";
				if (leftOrRight === "left") drop.style.left = offsetPct + "%";
				else drop.style.right = offsetPct + "%";
				drop.style.bottom = (100 + Math.floor(Math.random() * 6)) + "%";
				drop.style.animationDelay = delay;
				drop.style.animationDuration = dur;

				const stem = document.createElement("div");
				stem.className = "stem";
				stem.style.animationDelay = delay;
				stem.style.animationDuration = dur;

				const splat = document.createElement("div");
				splat.className = "splat";
				splat.style.animationDelay = delay;
				splat.style.animationDuration = dur;

				drop.append(stem, splat);
				container.appendChild(drop);
			};

			buildDrop(rainFront, "left");
			buildDrop(rainBack, "right");
		}
	}

	function setCozyUIState(active) {
		document.body.classList.toggle("cozy-active", active);
		if (cozyBtn) {
			cozyBtn.classList.toggle("is-active", active);
			cozyBtn.setAttribute("aria-pressed", String(active));
		}
		if (cozyPlayer) cozyPlayer.style.display = active ? "flex" : "none";

		if (active) {
			if (cozyPlayer) cozyPlayer.classList.add("open");
			if (playerCollapse) {
				playerCollapse.setAttribute("aria-expanded", "true");
				playerCollapse.textContent = "⟨";
			}
			try { if (rainAudio) { rainAudio.pause(); } if (audioToggle) { audioToggle.textContent = "Play"; audioToggle.setAttribute("aria-pressed", "false"); } } catch (_) {}
			makeItRain();
		} else {
			try { if (rainAudio) { rainAudio.pause(); } } catch (_) {}
			if (cozyPlayer) cozyPlayer.classList.remove("open");
			clearRain();
		}

		[btnDay, btnNight, btnDefault].forEach((b) => {
			if (!b) return;
			if (active) { b.setAttribute("disabled", "true"); b.setAttribute("aria-disabled", "true"); }
			else { b.removeAttribute("disabled"); b.removeAttribute("aria-disabled"); }
		});
	}

	function enableCozy() {
		state.cozy = true;
		try { localStorage.setItem("isCozy", "true"); } catch (_) {}
		setCozyUIState(true);
		updateActiveStates();
	}

	function disableCozy() {
		state.cozy = false;
		try { localStorage.removeItem("isCozy"); } catch (_) {}
		setCozyUIState(false);
		updateActiveStates();
		try { window.setBackgroundAndText && window.setBackgroundAndText(); } catch (_) {}
	}

	function toggleCozy() { state.cozy ? disableCozy() : enableCozy(); }

	// ---------------------- Popups ----------------------
	function openPopup(popupEl) {
		if (!popupEl) return;
		popupEl.classList.add("open");
		popupEl.setAttribute("aria-hidden", "false");
		const iframe = popupEl.querySelector("iframe");
		if (iframe && iframe.dataset && iframe.dataset.src && iframe.getAttribute("src") !== iframe.dataset.src) {
			iframe.src = iframe.dataset.src;
		}
		const inner = popupEl.querySelector(".popup-inner");
		if (inner) inner.focus();
		// while popup open, prevent page scroll (reader still scrolls)
		document.body.style.overflow = "hidden";
	}

	function closePopup(popupEl) {
		if (!popupEl) return;
		popupEl.classList.remove("open");
		popupEl.setAttribute("aria-hidden", "true");
		const iframe = popupEl.querySelector("iframe");
		if (iframe) iframe.removeAttribute("src");
		// restore page-level overflow
		document.body.style.overflow = "";
	}

	function togglePopup(popupEl) {
		if (!popupEl) return;
		if (popupEl.classList.contains("open")) closePopup(popupEl);
		else openPopup(popupEl);
	}

	// ---------------------- Modal blur helper ----------------
	function ensureModalBlurStyle() {
		if (document.getElementById("modal-blur-style-resume")) return;
		const css = `
			/* Only blur when resume modal is open. Other popups use normal modal-open but are not blurred. */
			body.resume-modal-open > *:not(.popup-resume) {
				filter: blur(4px);
				pointer-events: none;
				user-select: none;
				transition: filter 0.18s ease;
			}
			@media (prefers-reduced-motion: reduce) {
				body.resume-modal-open > *:not(.popup-resume) { transition: none; }
			}
			/* allow the resume popup itself to be interactive */
			body.resume-modal-open > .popup-resume { pointer-events: auto; user-select: text; }
		`.trim();
		const s = document.createElement("style");
		s.id = "modal-blur-style-resume";
		s.appendChild(document.createTextNode(css));
		document.head.appendChild(s);
	}

	// ---------------------- Resume Popup (uses global modal helpers) ----------------
	function showResumePopup(slug, resumeData) {
		const { chapterIndex, scrollRatio } = resumeData || {};
		const story = state.story;
		if (!story || typeof chapterIndex !== "number" || chapterIndex < 0 || chapterIndex >= story.chapters.length) return;

		const chapterTitle = story.chapters[chapterIndex].title || `Chapter ${chapterIndex + 1}`;
		const percent = Math.round((typeof scrollRatio === "number" ? scrollRatio : 0) * 100);

		// build modal (no top-right X) with ARIA attributes
		const popup = document.createElement("div");
		popup.className = "popup popup-resume";
		popup.setAttribute("role", "dialog");
		popup.setAttribute("aria-modal", "true");
		const titleId = `resume-popup-title-${String(slug).replace(/[^a-z0-9\-_]/gi, "")}`;
		popup.innerHTML = `
			<div class="popup-inner">
				<div class="popup-content" role="document">
					<header class="popup-header">
						<h2 id="${titleId}">Resume reading</h2>
					</header>
					<section class="popup-body" aria-labelledby="${titleId}">
						<p class="muted">You last read:</p>
						<p class="last-read"><strong>Chapter ${chapterIndex + 1} — ${escapeHtml(chapterTitle)}</strong></p>
						<p class="muted small">Position in chapter: ${percent}%</p>

						<div class="settings-actions" style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
							<button id="resumeBtn" class="settings-btn" type="button"><span class="settings-icon">▶</span> Resume</button>
							<button id="restartBtn" class="settings-btn" type="button"><span class="settings-icon">↺</span> Start from beginning</button>
						</div>

						<hr style="margin:1rem 0;">

						<label for="resumeChapterSelect" class="muted small">Or jump to another chapter</label>
						<div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
							<select id="resumeChapterSelect" style="flex:1;"></select>
							<button id="goToChapterBtn" class="settings-btn" type="button"><span class="settings-icon">⇢</span> Go</button>
						</div>
						
						<p class="muted"><br><br>To close this window, press ESC. (Note that this voids progress)</p>
					</section>
				</div>
			</div>
		`;

		// Insert into DOM and use your global modal helpers to inert/blur the background
		ensureModalBlurStyle();
		document.body.appendChild(popup);

		// Call your background-inert helper; fall back gracefully if missing.
		try {
			disableBackgroundFor(popup);
		} catch (err) {
			// fallback: at least block body scroll
			document.body.classList.add("modal-open");
			document.body.style.overflow = "hidden";
		}

		// Add resume-only blur class so other popups are not blurred
		document.body.classList.add("resume-modal-open");

		// Show and mark as open (mirrors your other popups)
		popup.style.display = "block";
		popup.classList.add("open");
		popup.setAttribute("aria-hidden", "false");

		// make focus-trap active by using your global variables / handler if available
		try {
			currentPopup = popup;
			lastToggle = null;
			document.addEventListener("keydown", trapFocus);
		} catch (err) { /* ignore if globals not present */ }

		// Populate chapter selector with readable names
		const select = popup.querySelector("#resumeChapterSelect");
		story.chapters.forEach((ch, i) => {
			const opt = document.createElement("option");
			opt.value = i;
			opt.textContent = `Chapter ${i + 1} — ${ch.title || `Chapter ${i + 1}`}`;
			if (i === chapterIndex) opt.selected = true;
			select.appendChild(opt);
		});

		// Focus the primary action
		const resumeBtn = popup.querySelector("#resumeBtn");
		if (resumeBtn) resumeBtn.focus();

		// closure to cleanly remove modal and restore background
		const close = () => {
			// remove our focus trap listener
			try { document.removeEventListener("keydown", trapFocus); } catch (_) {}

			// remove resume-specific blur class
			document.body.classList.remove("resume-modal-open");

			// restore inert/background (use your helper if present)
			try {
				restoreBackground();
			} catch (err) {
				// fallback: undo body changes
				document.body.classList.remove("modal-open");
				document.body.style.overflow = "";
			}

			// remove node from DOM
			if (popup && popup.parentNode) popup.parentNode.removeChild(popup);

			// clear global pointers if present
			try { currentPopup = null; lastToggle = null; } catch (_) {}
		};

		// Button handlers
		popup.querySelector("#resumeBtn").onclick = () => {
			close();
			renderChapter(chapterIndex, scrollRatio);
		};
		popup.querySelector("#restartBtn").onclick = () => {
			close();
			renderChapter(0, 0);
		};
		popup.querySelector("#goToChapterBtn").onclick = () => {
			const idx = parseInt(select.value, 10);
			close();
			renderChapter(idx, 0);
		};

		// Close on ESC if user presses it (one-time listener)
		const escHandler = (e) => { if (e.key === "Escape") { close(); } };
		document.addEventListener("keydown", escHandler, { once: true });

		// Click outside to close
		popup.addEventListener("click", (e) => { if (e.target === popup) close(); });
	}

	// ---------------------- Story Loading ---------------
	async function loadStory(slug) {
		let rawIndex;
		try {
			const res = await fetch(STORIES_INDEX, { cache: "no-cache" });
			if (!res.ok) throw new Error(`Failed to load stories index (${res.status})`);
			rawIndex = await res.json();
		} catch (err) {
			renderError(`Could not load stories index.<br><small>${escapeHtml(String(err.message || err))}</small>`);
			return;
		}

		// storyData: search across categories
		let storyData = null;
		if (Array.isArray(rawIndex)) {
			// older flat-array format
			storyData = rawIndex.find(s => String(s.slug) === String(slug));
		} else if (rawIndex && typeof rawIndex === "object") {
			for (const [category, list] of Object.entries(rawIndex)) {
				if (!Array.isArray(list)) continue;
				const found = list.find(s => String(s.slug) === String(slug));
				if (found) {
					storyData = found;
					storyData._category = category;
					break;
				}
			}
		}

		if (!storyData) {
			renderError(`Story <strong>${escapeHtml(String(slug))}</strong> not found in stories index.`);
			return;
		}

		// Normalize chapters: allow either array-of-strings or array-of-objects { title, file }
		const chapters = (storyData.chapters || []).map((c, i) => {
			if (typeof c === "string") {
				return {
					title: `Chapter ${i + 1}`,
					file: resolvePath(c)
				};
			} else {
				return {
					title: c.title || `Chapter ${i + 1}`,
					file: resolvePath(c.file || "")
				};
			}
		});

		state.story = {
			slug,
			title: storyData.title || slug,
			chapters
		};

		document.title = `| ${state.story.title}`;
		// Show popup if resume data exists and meets threshold
		const resumeData = loadResume(slug);
		if (resumeData && state.story && typeof resumeData.scrollRatio === "number" && resumeData.scrollRatio > RESUME_POPUP_THRESHOLD) {
			// Load the saved chapter first, then offer popup to resume within it (so can extract the chapter name).
			renderChapter(resumeData.chapterIndex, 0).then(() => {
				showResumePopup(slug, resumeData);
			});
		} else if (resumeData && state.story && typeof resumeData.chapterIndex === "number") {
			// If resume data exists but below threshold, just open the saved chapter at top.
			await renderChapter(resumeData.chapterIndex, 0);
		} else {
			await renderChapter(0, 0);
		}
	}

	function escapeHtml(s) {
		return String(s).replace(/[&<>"']/g, (ch) => (
			{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
		));
	}

	// ---------------------- Render Chapter ----------------
	async function renderChapter(index, scrollRatio = 0) {
		if (!titleEl || !contentEl || !state.story) return;

		state.chapterIndex = clamp(index, 0, state.story.chapters.length - 1);
		const chapter = state.story.chapters[state.chapterIndex];

		// Start with metadata title
		let displayTitle = chapter.title;

		// Loading indicator
		contentEl.innerHTML = `<div class="prose"><p>Loading...</p></div>`;

		// Load markdown -> text
		let mdText = "";
		try {
			const res = await fetch(chapter.file, { cache: "no-cache" });
			if (!res.ok) throw new Error(`Failed to load chapter (${res.status})`);
			mdText = await res.text();
		} catch (err) {
			renderError(`Could not load chapter content.<br><small>${escapeHtml(String(err.message || err))}</small>`);
			clearExistingNav();
			return;
		}

		// Detect and strip first markdown heading (# or ##)
		let mdTextAdjusted = mdText;
		try {
			const headingMatch = mdText.match(/^\s{0,3}#{1,2}\s+(.+)$/m);
			if (headingMatch && headingMatch[1]) {
				displayTitle = headingMatch[1].trim();
				mdTextAdjusted = mdText.replace(headingMatch[0], "").trimStart();
			}
		} catch (_) {}

		// Apply final title
		titleEl.textContent = displayTitle;

		// Parse markdown
		let html = "";
		try {
			const parser = (window.marked && (window.marked.parse || window.marked)) || null;
			html = parser
				? (window.marked.parse ? window.marked.parse(mdTextAdjusted) : window.marked(mdTextAdjusted))
				: mdTextAdjusted;
		} catch (_) {
			html = mdTextAdjusted; // fallback to raw text if parser fails
		}

		// Purify and inject content
		contentEl.innerHTML = `<div class="prose">${DOMPurify.sanitize(html)}</div>`;
		buildEndNav();

		// Restore scroll position (after paint for accuracy)
		requestAnimationFrame(() => {
			contentEl.scrollTop = Math.round(
				scrollRatio * (contentEl.scrollHeight - contentEl.clientHeight)
			);
		});

		updateProgress();

		// Persist progress
		saveResume(state.story.slug, state.chapterIndex);
	}

	function clearExistingNav() {
		if (!contentEl) return;
		const existing = contentEl.querySelector(".chapter-end-nav");
		if (existing) existing.remove();
	}

	function buildEndNav() {
		clearExistingNav();
		if (!contentEl || !state.story) return;

		const nav = document.createElement("div");
		nav.className = "chapter-end-nav";

		if (state.chapterIndex > 0) {
			const prevBtn = document.createElement("button");
			prevBtn.type = "button";
			prevBtn.textContent = "Previous Chapter";
			prevBtn.addEventListener("click", () => renderChapter(state.chapterIndex - 1));
			nav.appendChild(prevBtn);
		}

		if (state.chapterIndex < state.story.chapters.length - 1) {
			const nextBtn = document.createElement("button");
			nextBtn.type = "button";
			nextBtn.textContent = "Next Chapter";
			nextBtn.addEventListener("click", () => renderChapter(state.chapterIndex + 1));
			nav.appendChild(nextBtn);
		}

		contentEl.appendChild(nav);
	}

	function renderError(messageHtml) {
		if (titleEl) titleEl.textContent = "Error";
		if (contentEl) {
			contentEl.innerHTML = `<div class="prose"><p>${messageHtml}</p></div>`;
		}
	}

	// ---------------------- Events ----------------------
	if (contentEl) contentEl.addEventListener("scroll", updateProgress, { passive: true });
	window.addEventListener("resize", () => { updateProgress(); if (state.cozy) { makeItRain(); } });

	if (btnFontInc) btnFontInc.addEventListener("click", () => setFontSize(state.fontSize + 1));
	if (btnFontDec) btnFontDec.addEventListener("click", () => setFontSize(state.fontSize - 1));

	if (btnDay) btnDay.addEventListener("click", () => setTheme("day"));
	if (btnNight) btnNight.addEventListener("click", () => setTheme("night"));
	if (btnDefault) btnDefault.addEventListener("click", () => setTheme("default"));

	if (btnAlignLeft) btnAlignLeft.addEventListener("click", () => setAlignment("left"));
	if (btnAlignCenter) btnAlignCenter.addEventListener("click", () => setAlignment("center"));
	if (btnAlignRight) btnAlignRight.addEventListener("click", () => setAlignment("right"));

	if (btnAccessible) btnAccessible.addEventListener("click", () => {
		const next = state.fontScheme === "accessible" ? "default" : "accessible";
		setFontScheme(next);
	});

	if (cozyBtn) cozyBtn.addEventListener("click", () => (state.cozy ? disableCozy() : enableCozy()));

	if (playerCollapse) playerCollapse.addEventListener("click", () => {
		const isOpen = cozyPlayer && cozyPlayer.classList.toggle("open");
		if (playerCollapse) {
			playerCollapse.setAttribute("aria-expanded", String(Boolean(isOpen)));
			playerCollapse.textContent = isOpen ? "⟨" : "⟩";
		}
	});

	if (audioToggle) audioToggle.addEventListener("click", () => {
		const pressed = audioToggle.getAttribute("aria-pressed") === "true";
		if (pressed) {
			try { rainAudio.pause(); } catch (_) {}
			audioToggle.textContent = "Play";
			audioToggle.setAttribute("aria-pressed", "false");
		} else {
			try { if (rainAudio) rainAudio.volume = parseFloat(vol.value || "0.35"); } catch (_) {}
			try { rainAudio.play(); } catch (_) {}
			audioToggle.textContent = "Pause";
			audioToggle.setAttribute("aria-pressed", "true");
		}
	});

	if (vol) vol.addEventListener("input", () => { try { if (rainAudio) rainAudio.volume = parseFloat(vol.value); } catch (_) {} });

	// Popup toggles
	if (settingsToggle) settingsToggle.addEventListener("click", (ev) => { ev.stopPropagation(); togglePopup(settingsPopup); });
	if (infoToggle) infoToggle.addEventListener("click", (ev) => { ev.stopPropagation(); togglePopup(infoPopup); });

	document.addEventListener("click", (event) => {
		const clickedToggle = (settingsToggle && settingsToggle.contains(event.target)) ||
			(infoToggle && infoToggle.contains(event.target));
		const clickedInsidePopup = (settingsPopup && settingsPopup.contains(event.target)) ||
			(infoPopup && infoPopup.contains(event.target));
		if (!clickedToggle && !clickedInsidePopup) {
			if (settingsPopup) settingsPopup.style.display = settingsPopup.classList.contains("open") ? "block" : settingsPopup.style.display;
			// We keep close logic in toggle/closePopup; user clicks outside are handled below by checking containment:
			if (settingsPopup && settingsPopup.classList.contains("open") && !settingsPopup.contains(event.target)) closePopup(settingsPopup);
			if (infoPopup && infoPopup.classList.contains("open") && !infoPopup.contains(event.target)) closePopup(infoPopup);
		}
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			if (settingsPopup && settingsPopup.classList.contains("open")) closePopup(settingsPopup);
			if (infoPopup && infoPopup.classList.contains("open")) closePopup(infoPopup);
		}
	});

	// ---------------------- Init ------------------------
	loadSettings();
	if (reader && !reader.style.getPropertyValue("--content-font-size")) setFontSize(state.fontSize);
	if (reader && ![...reader.classList].some((c) => c.startsWith("theme-"))) setTheme(state.theme);
	if (!document.body.classList.contains("font-accessible") && state.fontScheme !== "default") setFontScheme(state.fontScheme);
	updateActiveStates();

	// Force background paint early to avoid empty bg on some loads
	try { window.setBackgroundAndText && window.setBackgroundAndText(); } catch (_) {}

	// Read slug from URL: ?story=whispering-woods
	const params = new URLSearchParams(window.location.search);
	const slug = params.get("story");
	if (!slug) {
		renderError("No story specified.<br><small>Tip: link to this page with <code>?story=your-slug</code>.</small>");
	} else {
		loadStory(slug);
	}
	
	// ---------------------- Sync with per-page reader-mode (sessionStorage) ----------------
	// If the inline page script sets a session-local reader mode (storiesReaderMode),
	// make sure stories.js respects it (so the frame text color follows time-of-day).
	try {
		const savedReaderMode = (function() { try { return sessionStorage.getItem('storiesReaderMode'); } catch (_) { return null; } })();
		if (savedReaderMode === 'day' || savedReaderMode === 'night') {
			// adopt the inline-per-tab setting into the stories.js theme state
			setTheme(savedReaderMode);
		}
	} catch (_) {}
	
	// Listen for the page-level event when the inline script changes reader theme.
	// Inline script will dispatch: window.dispatchEvent(new CustomEvent('stories:theme-changed', { detail: { mode } }));
	window.addEventListener('stories:theme-changed', (ev) => {
		try {
			const mode = ev && ev.detail && ev.detail.mode;
			if (mode === 'day' || mode === 'night') setTheme(mode);
			else setTheme('default');
		} catch (_) {
			// best-effort only
		}
		// Ensure button outlines immediately reflect the new theme
		try { updateActiveStates(); } catch (_) {}
	});
	
})();
