(() => {
	// ---------------------- Config ----------------------
	const STORAGE_KEY = "readerSettings";
	const STORIES_INDEX = "/pages/collections/basement/data.json"; // absolute from site root (adjust if needed)
	
	// ---------------------- State -----------------------
	const state = {
		entry: null,              // { id, title }
		fontSize: 18,
		minFont: 14,
		maxFont: 26,
		theme: "default",
		align: "left",
		fontScheme: "default",
		cozy: false,
	};
	
	// ---------------------- DOM -------------------------
	const $ = (s) => document.querySelector(s);
	const reader = $("#reader");
	const titleEl = $("#entry-title");
	const contentEl = $("#entry-content");
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
		const pct = max > 0
			? (contentEl.scrollTop / max) * 100
			: 0;

		progressEl.style.width = pct + "%";
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
	
	// ---------------------- Entry Loading ----------------------
	async function loadEntry(id) {
		let rawIndex;

		try {
			const res = await fetch(STORIES_INDEX, { cache: "no-cache" });
			if (!res.ok) throw new Error(`Failed to load entry index (${res.status})`);

			rawIndex = await res.json();
		} catch (err) {
			renderError(`Could not load basement index.<br><small>${escapeHtml(String(err.message || err))}</small>`);
			return;
		}

		const entryData = rawIndex.entries.find(
			entry => String(entry.id) === String(id)
		);

		if (!entryData) {
			renderError(`Entry <strong>${escapeHtml(String(id))}</strong> not found.`);
			return;
		}

		state.entry = entryData;

		document.title = `| ${entryData.title}`;
		titleEl.textContent = entryData.title;

		await renderEntry();
	}
	
	function escapeHtml(s) {
		return String(s).replace(/[&<>"']/g, (ch) => (
			{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
		));
	}
	
	// ---------------------- Render Entry ----------------------
	async function renderEntry() {
		if (!titleEl || !contentEl || !state.entry) return;

		contentEl.innerHTML = `<div class="prose"><p>Loading entry...</p></div>`;

		let mdText = "";

		try {
			const res = await fetch(`/pages/collections/basement/${state.entry.id}/entry.md`, {
				cache: "no-cache"
			});

			if (!res.ok) throw new Error(`Failed to load entry (${res.status})`);

			mdText = await res.text();
		} catch (err) {
			renderError(`Could not load entry content.<br><small>${escapeHtml(String(err.message || err))}</small>`);
			return;
		}
		
		let html = "";
		
		try {
			const parser = (window.marked && (window.marked.parse || window.marked)) || null;

			html = parser
				? (window.marked.parse
					? window.marked.parse(mdText)
					: window.marked(mdText))
				: mdText;
		} catch (_) {
			html = mdText;
		}
		
		const metadata = buildMetadata(state.entry);

		contentEl.innerHTML = `
			${metadata}

			<div id="entry-body" class="prose">
				${DOMPurify.sanitize(html)}
			</div>
		`;
		
		buildIndex();
		
		contentEl.scrollTop = 0;
		updateProgress();
	}
	
	function renderError(messageHtml) {
		if (titleEl) titleEl.textContent = "Error";
		if (contentEl) {
			contentEl.innerHTML = `<div class="prose"><p>${messageHtml}</p></div>`;
		}
	}
	
	function buildMetadata(entry) {

		const tags = (entry.tags || [])
			.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
			.join("");

		return `
		<div class="entry-meta">

			<div class="entry-thumb">
				<img
					src="/pages/collections/basement/${entry.id}/thumbnail.webp"
					alt="${escapeHtml(entry.title)}">
			</div>

			<div class="entry-summary">

				<div class="entry-info">
					${metaRow("Developer", entry.developer)}
					${metaRow("Released", entry.releaseDate || entry.releaseYear)}
					${metaRow("Platform", entry.platform)}
				</div>

				${tags ? `
				<div class="tag-list">
					${tags}
				</div>
				` : ""}

				<details class="archive-details">
					<summary>Archive Details</summary>

					<div class="entry-info">
						${metaRow("Publisher", entry.publisher)}
						${metaRow("Format", entry.format)}
						${metaRow("Added", entry.added)}
					</div>

				</details>

			</div>

			<details class="entry-index" open>

				<summary>Sections</summary>

				<nav id="entry-index-links"></nav>

			</details>

		</div>
		
		<hr style="color: rgba(255,255,255,0.25)">
		`;
	}
	
	function metaRow(label,value){
		
		if(!value) return "";
		
		return `
		
		<div class="meta-row">
			
			<span class="meta-label">${label}</span>

			<span class="meta-dots"></span>

			<span class="meta-value">${escapeHtml(String(value))}</span>
			
		</div>
		
		`;
		
	}

	function buildIndex() {

		const body = document.getElementById("entry-body");
		const nav = document.querySelector(".entry-index");
		const toc = document.getElementById("entry-index-links");

		if (!body || !nav || !toc) return;

		toc.innerHTML = "";

		const headings = body.querySelectorAll("h2");

		// Hide if zero sections
		if (headings.length === 0) {

			nav.open = false;

			return;

		}

		nav.open = true;

		nav.style.display = "";
		
		const usedIDs = {};
		
		headings.forEach(heading => {

			let id = heading.textContent
				.trim()
				.toLowerCase()
				.replace(/[^\w\s-]/g, "")
				.replace(/\s+/g, "-");
			
			// Prevent ID collision. It should be fine either way but the anchors may get weird about it
			
			if (usedIDs[id]) {
				usedIDs[id]++;
				id += "-" + usedIDs[id];
			} else {
				usedIDs[id] = 1;
			}
			
			heading.id = id;

			const link = document.createElement("a");

			link.textContent = heading.textContent;
			link.href = "#";

			link.addEventListener("click", e => {

				e.preventDefault();

				heading.scrollIntoView({
					behavior: "smooth",
					block: "start"
				});

			});

			toc.appendChild(link);

		});

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

	// Read archive entry id from URL
	const params = new URLSearchParams(window.location.search);
	const id = params.get("id");
	if (!id) {
		renderError("No id specified.<br><small>Tip: link to this page with <code>?id=your-id</code>.</small>");
	} else {
		loadEntry(id);
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
