// File: custom/js/global.js

/* ---------- Initial load ---------- */
window.addEventListener("load", () => {
	document.body.classList.add("ready");
});

document.addEventListener("DOMContentLoaded", () => {
	ensureA11yStatus();
	setBackgroundAndText();
	scheduleUpdates();
	applyInitialFontAccessibleState();
	wirePopupButtons();
});

/* ---------- Base Path & helpers ---------- */
let BASE_PATH = "./";
const path = window.location.pathname;

// detect whether we're on the stories reader path
const IS_STORIES_PAGE = path.includes("/pages/stories/") || path.includes("/pages/collections/");

if (path.includes("/pages/stories/") || path.includes("/pages/collections/") || path.includes("/pages/corkboard/") || path.includes("/pages/changelogs/") || path.includes("/pages/milky-way-bar-crawl/")) {
	BASE_PATH = "../../";
} else if (path.includes("/pages/")) {
	BASE_PATH = "../";
}

function joinPath(base, relative) {
	base = base.replace(/\/+$/, "");
	relative = relative.replace(/^\/+/, "");
	return base + "/" + relative;
}

/* auto-resolve data-link and data-src */
document.querySelectorAll("[data-link]").forEach(el => {
	const v = el.getAttribute("data-link");
	if (v) el.href = joinPath(BASE_PATH, v);
});
document.querySelectorAll("[data-src]").forEach(el => {
	const v = el.getAttribute("data-src");
	if (v) el.src = joinPath(BASE_PATH, v);
});

/* ---------- Backgrounds & Theme ---------- */
const images = [
	`${BASE_PATH}custom/img/bg/bg1.png`,
	`${BASE_PATH}custom/img/bg/bg2.png`,
	`${BASE_PATH}custom/img/bg/bg3.png`,
	`${BASE_PATH}custom/img/bg/bg4.png`,
	`${BASE_PATH}custom/img/bg/bg5.png`,
	`${BASE_PATH}custom/img/bg/bg6.png`,
	`${BASE_PATH}custom/img/bg/bg7.png`,
	`${BASE_PATH}custom/img/bg/bg8.png`,
	`${BASE_PATH}custom/img/bg/bg9.png`,
	`${BASE_PATH}custom/img/bg/bg10.png`,
	`${BASE_PATH}custom/img/bg/bg11.png`,
	`${BASE_PATH}custom/img/bg/bg12.png`
];

// Preload images
const preloaded = [];
images.forEach(src => {
	const img = new Image();
	img.src = src;
	preloaded.push(img);
});

const bg1 = document.getElementById("bg1");
const bg2 = document.getElementById("bg2");
let activeLayer = bg1 || null;

function setBackgroundAndText() {
	// Respect Cozy mode: don't change background while cozy is active
	if (localStorage.getItem("isCozy") === "true") return;

	const hasBackground = bg1 && bg2 && activeLayer;
	const userMode = localStorage.getItem("userMode"); // 'day' | 'night' | null
	const hour = new Date().getHours();
	const index = Math.floor(hour / 2);
	const isNightByClock = (hour >= 22 || hour < 6);

	let imageToShow, textColor, themeClass;

	// Standard theme cycle (site-wide)
	if (userMode === "day") {
		imageToShow = images[6]; // noon-ish
		textColor = "#000";
		themeClass = "theme-day";
	} else if (userMode === "night") {
		imageToShow = images[0]; // midnight-ish
		textColor = "#f0f0f0";
		themeClass = "theme-night";
	} else {
		imageToShow = images[index];
		textColor = isNightByClock ? "#f0f0f0" : "#000";
		themeClass = isNightByClock ? "theme-night" : "theme-day";
	}

	if (hasBackground) {
		const nextLayer = (activeLayer === bg1) ? bg2 : bg1;
		nextLayer.style.backgroundImage = `url(${imageToShow})`;
		void nextLayer.offsetWidth;
		nextLayer.classList.add("active");
		activeLayer.classList.remove("active");
		activeLayer = nextLayer;
	}
	
	// Update readable text color for main content (but modals remain white)
	document.querySelectorAll(".content:not(.popup .content), .readable-panel").forEach(el => {
		el.style.color = textColor;
	});

	// Set theme class on body (used by CSS) BUT skip this on story pages.
	// Story pages manage theme locally
	if (!IS_STORIES_PAGE) {
		document.body.classList.remove("theme-day", "theme-night", "theme-default");
		if (themeClass) document.body.classList.add(themeClass);
	}

	// sync modal text too (modals are forced white in CSS, but keep this for completion)
	updateModalTextColors();
}

/* schedule background updates every 2 hours on the 0/2/4... */
function scheduleUpdates() {
	setBackgroundAndText();

	const now = new Date();
	const minutes = now.getMinutes();
	const hours = now.getHours();
	const nextHourBlock = ((Math.floor(hours / 2) + 1) * 2) % 24;
	let msUntilNext = ((((nextHourBlock - hours + 24) % 24) * 60) - minutes) * 60 * 1000;

	setTimeout(() => {
		setBackgroundAndText();
		setInterval(setBackgroundAndText, 2 * 60 * 60 * 1000);
	}, msUntilNext);
}

/* expose function to change mode from settings */
function setMode(mode) {
	if (mode === "day" || mode === "night") {
		localStorage.setItem("userMode", mode);
	} else {
		localStorage.removeItem("userMode");
	}
	setBackgroundAndText();
}

/* make sure popup/modal text inherits white (CSS handles with !important) */
function updateModalTextColors() {
	// Content inside .popup is forced white through CSS; nothing required here.
}

/* ---------- Accessibility helpers ---------- */
function ensureA11yStatus() {
	if (!document.getElementById("a11y-status")) {
		const el = document.createElement("div");
		el.id = "a11y-status";
		el.className = "sr-only";
		el.setAttribute("role", "status");
		el.setAttribute("aria-live", "polite");
		document.body.appendChild(el);
	}
}
function announce(msg) {
	const region = document.getElementById("a11y-status");
	if (region) {
		region.textContent = "";
		setTimeout(() => { region.textContent = msg; }, 50);
	}
}

/* ---------- Toast helpers ---------- */
function ensureToastContainer() {
	let c = document.getElementById("toast-container");
	if (!c) {
		c = document.createElement("div");
		c.id = "toast-container";
		c.setAttribute("aria-live", "polite");
		c.setAttribute("aria-atomic", "true");
		document.body.appendChild(c);
	}
	return c;
}
function showToast(text, ms = 1800) {
	const container = ensureToastContainer();
	const t = document.createElement("div");
	t.className = "toast";
	t.textContent = text;
	container.appendChild(t);
	announce(text);
	requestAnimationFrame(() => t.classList.add("show"));
	setTimeout(() => {
		t.classList.remove("show");
		t.classList.add("hide");
		t.addEventListener("transitionend", () => {
			try { container.removeChild(t); } catch {}
		}, { once: true });
	}, ms);
}

/* ---------- Font-accessible toggle wiring ---------- */
/* Apply the stored accessible-font preference (button now lives in settings iframe) */
function applyInitialFontAccessibleState() {
	try {
		const saved = localStorage.getItem("fontAccessible") === "true";
		if (saved) document.body.classList.add("font-accessible");
		else document.body.classList.remove("font-accessible");
	} catch (e) {
		// ignore storage errors
	}
}

/* react to storage changes from other windows/iframes */
window.addEventListener("storage", (e) => {
	if (e.key === "userMode" || e.key === "isCozy" || e.key === "cozyMode") {
		setBackgroundAndText();
	}
	if (e.key === "fontAccessible") {
		const enabled = localStorage.getItem("fontAccessible") === "true";
		if (enabled) document.body.classList.add("font-accessible");
		else document.body.classList.remove("font-accessible");
		const fontToggle = document.getElementById("font-toggle");
		if (fontToggle) fontToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
	}
});

/* ---------- Modal / popup logic (accessible) ---------- */
const settingsToggle = document.getElementById("settings-toggle");
const creditsToggle = document.getElementById("info-toggle");
const notifToggle = document.getElementById("notif-toggle");

const settingsPopup = document.getElementById("settings-popup");
const creditsPopup = document.getElementById("info-popup");
const notifPopup = document.getElementById("notif-popup");

let currentPopup = null;
let lastToggle = null;
let inertedElements = [];

// A simple queue for popup requests
const modalQueue = []; // items: { popup, toggle, priority }
let _processingQueue = false;

// When a toggle is clicked briefly suppress the global document click handler
// to avoid the "open then immediately close" race.
let _suppressDocClick = false;

/* helper: read numeric priority from popup element (default 0) */
function getPriorityFor(popup) {
	const p = popup?.getAttribute?.('data-priority');
	const n = parseInt(p, 10);
	return Number.isFinite(n) ? n : 0;
}

/* make background inert (best-effort) and block scroll via body.modal-open */
function disableBackgroundFor(popup) {
	inertedElements = [];
	const children = Array.from(document.body.children);
	children.forEach(child => {
		if (child === popup || child.id === "a11y-status" || child.id === "toast-container") return;
		if (child.tagName === "SCRIPT") return;

		const prevAria = child.getAttribute("aria-hidden");
		child.setAttribute("data-prev-aria-hidden", prevAria === null ? "" : prevAria);
		child.setAttribute("aria-hidden", "true");

		try { child.inert = true; } catch (err) { child.setAttribute("inert", ""); }

		const focusableSelector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]';
		const focusables = Array.from(child.querySelectorAll(focusableSelector));
		const saved = [];
		focusables.forEach(f => {
			const prevTab = f.getAttribute("tabindex");
			saved.push({el: f, prev: prevTab === null ? "" : prevTab});
			try { f.setAttribute("tabindex", "-1"); } catch {}
		});
		if (saved.length) {
			child.setAttribute('data-prev-focusable', '1');
			child.__saved_focusables = saved;
		}
		inertedElements.push(child);
	});

	document.body.classList.add('modal-open');
}

/* restore background interactivity */
function restoreBackground() {
	if (!inertedElements || !inertedElements.length) return;
	inertedElements.forEach(child => {
		const prev = child.getAttribute("data-prev-aria-hidden");
		if (prev === "") child.removeAttribute("aria-hidden");
		else child.setAttribute("aria-hidden", prev);

		try { child.inert = false; } catch (err) { child.removeAttribute("inert"); }

		if (child.__saved_focusables) {
			child.__saved_focusables.forEach(item => {
				if (item.prev === "") item.el.removeAttribute("tabindex");
				else item.el.setAttribute("tabindex", item.prev);
			});
			delete child.__saved_focusables;
		}
		child.removeAttribute("data-prev-aria-hidden");
		child.removeAttribute("data-prev-focusable");
	});
	inertedElements = [];
	document.body.classList.remove('modal-open');
}

/* focus trap */
function trapFocus(e) {
	if (!currentPopup) return;
	if (e.key !== "Tab") return;

	const focusableSelector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
	const focusable = Array.from(currentPopup.querySelectorAll(focusableSelector)).filter(el => {
		return (el.offsetParent !== null) && (el.getAttribute('aria-hidden') !== 'true');
	});

	if (focusable.length === 0) {
		e.preventDefault();
		currentPopup.querySelector('.popup-start')?.focus();
		return;
	}

	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	const active = document.activeElement;

	if (!e.shiftKey && active === last) {
		e.preventDefault();
		first.focus();
	} else if (e.shiftKey && (active === first || active === currentPopup)) {
		e.preventDefault();
		last.focus();
	}
}

/* queue processing */
function processModalQueue() {
	if (_processingQueue) return;
	_processingQueue = true;
	try {
		// Do nothing if already a popup open
		if (currentPopup) return;
		if (modalQueue.length === 0) return;

		const next = modalQueue.shift();
		// openPopup will respect that currentPopup is null and proceed
		openPopup(next.popup, next.toggle);
	} finally {
		_processingQueue = false;
	}
}

/* open popup (managed: respects priorities and queueing) */
function openPopup(popup, toggle) {
	if (!popup || !toggle) return;

	const newPriority = getPriorityFor(popup);

	// If there's a currently open popup, decide whether to queue or preempt
	if (currentPopup) {
		const currPriority = getPriorityFor(currentPopup);

		if (newPriority > currPriority) {
			// Preempt: save current popup to the front of the queue so it re-opens after
			modalQueue.unshift({ popup: currentPopup, toggle: lastToggle, priority: currPriority });

			// Force-close currentPopup immediately (skip animation) to make way for the high-priority one.
			// finalizeClose handles cleanup (restoring background, focus, key handlers).
			try {
				finalizeClose(currentPopup, lastToggle);
			} catch (err) {
				// fallback: attempt to hide it quickly
				try { currentPopup.style.display = "none"; } catch {}
				currentPopup = null;
				lastToggle = null;
			}
			// now proceed to open the high-priority popup below
		} else {
			// New popup <= current priority → queue it and return (in theory)
			modalQueue.push({ popup, toggle, priority: newPriority });
			showToast("Panel queued", 900);
			return;
		}
	}

	// At this point there is no currentPopup.
	// Open the popup (use existing behavior)
	// Do NOT call hideAllPopups() queue logic already handled closing. Beat it with a stick if it doesn't.
	disableBackgroundFor(popup);

	popup.style.display = "block";
	popup.classList.add("open");
	popup.setAttribute("aria-hidden", "false");
	toggle.setAttribute("aria-expanded", "true");

	// focus close or start
	const closeBtn = popup.querySelector('.popup-close');
	const start = popup.querySelector('.popup-start');
	// prevent scroll when focusing programmatically
	try {
		if (closeBtn) closeBtn.focus({ preventScroll: true });
		else if (start) { start.classList.add('visually-hidden'); start.focus({ preventScroll: true }); }
		else { popup.setAttribute("tabindex", "-1"); popup.focus({ preventScroll: true }); }
	} catch (err) {
		// older browsers: fallback to plain focus
		if (closeBtn) closeBtn.focus();
		else if (start) start.focus();
		else popup.focus();
	}

	currentPopup = popup;
	lastToggle = toggle;

	const title = toggle.getAttribute("title") || toggle.getAttribute("aria-label") || "Panel";
	announce(`${title} opened. Press Escape to close or Tab to navigate inside.`);

	document.addEventListener("keydown", trapFocus);
}

/* finalize close after animation or force-close (now also triggers processing the queue) */
function finalizeClose(popup, toggle) {
	// Defensive: handle case where popup is already hidden
	try { popup.style.display = "none"; } catch {}
	popup.classList.remove("open");
	popup.classList.remove("closing");
	popup.setAttribute("aria-hidden", "true");
	if (toggle) toggle.setAttribute("aria-expanded", "false");

	restoreBackground();

	if (lastToggle) {
		try { lastToggle.focus({ preventScroll: true }); }
		catch (err) { lastToggle.focus(); }
	}

	const title = toggle ? (toggle.getAttribute("title") || toggle.getAttribute("aria-label") || "Panel") : "Panel";
	announce(`${title} closed.`);
	currentPopup = null;
	lastToggle = null;

	document.removeEventListener("keydown", trapFocus);
	
	// Let any popup-specific code know that a popup was closed (so they can cleanup overlays/guards)
	try {
		document.dispatchEvent(new CustomEvent('popupclosed', { detail: { popup } }));
	} catch (err) {
		// ignore dispatch errors on very old browsers
	}
	
	// After a popup fully closes, try to open the next in queue
	// Use a small timeout to ensure any UI animations/layout settle first.
	setTimeout(processModalQueue, 10);
}

/* close popup (animated close if open) */
function closePopup(popup, toggle) {
	if (!popup || !toggle) return;
	// If the popup to close is not the current open popup, remove it from queue if present.
	if (currentPopup !== popup) {
		// find and remove from queue
		for (let i = 0; i < modalQueue.length; i++) {
			if (modalQueue[i].popup === popup) {
				modalQueue.splice(i, 1);
				return;
			}
		}
		return;
	}

	popup.classList.remove("open");
	popup.classList.add("closing");

	const onEnd = (ev) => {
		if (ev.target !== popup) return;
		popup.removeEventListener("animationend", onEnd);
		finalizeClose(popup, toggle);
	};
	popup.addEventListener("animationend", onEnd);
}

/* hide all popups (animated close if open) also clears the queued items */
function hideAllPopups() {
	// Close current popup if any (animated)
	if (currentPopup) {
		const associatedToggle = lastToggle;
		closePopup(currentPopup, associatedToggle);
	}
	// Clear the queue
	modalQueue.length = 0;
}

/* wrapper to toggle specific popup */
function togglePopupFor(toggle, popup) {
	if (!popup || !toggle) return;
	const isVisible = popup.style.display === "block";
	if (isVisible) closePopup(popup, toggle);
	else openPopup(popup, toggle);
}

/* wire popup buttons and close controls */
function wirePopupButtons() {
	if (creditsToggle && creditsPopup) {
		creditsToggle.addEventListener("click", (e) => {
			// Prevent any other click handlers from running for this event (robust)
			try { e.stopImmediatePropagation(); } catch (err) {}
			e.preventDefault();

			// suppress global document click for a short window to avoid open/close race
			_suppressDocClick = true;
			setTimeout(() => { _suppressDocClick = false; }, 60);

			togglePopupFor(creditsToggle, creditsPopup);
		});
	}
	if (settingsToggle && settingsPopup) {
		settingsToggle.addEventListener("click", (e) => {
			try { e.stopImmediatePropagation(); } catch (err) {}
			e.preventDefault();

			_suppressDocClick = true;
			setTimeout(() => { _suppressDocClick = false; }, 60);

			togglePopupFor(settingsToggle, settingsPopup);
		});
	}
	if (notifToggle && notifPopup) {
		notifToggle.addEventListener("click", (e) => {
			try { e.stopImmediatePropagation(); } catch (err) {}
			e.preventDefault();

			_suppressDocClick = true;
			setTimeout(() => { _suppressDocClick = false; }, 60);

			togglePopupFor(notifToggle, notifPopup);
		});
	}
	
	// close buttons inside popups
	document.addEventListener("click", (ev) => {
		const btn = ev.target.closest('.popup-close');
		if (btn) {
			ev.stopPropagation();
			const popup = btn.closest('.popup');
			if (popup === settingsPopup) closePopup(settingsPopup, settingsToggle);
			else if (popup === creditsPopup) closePopup(creditsPopup, creditsToggle);
			else if (popup === notifPopup) closePopup(notifPopup, notifToggle);    // NEW
			else {
				// If other popup types exist, attempt to find their toggle via aria-controls or data attribute
				const assocToggleId = popup.getAttribute('data-toggle-id');
				if (assocToggleId) {
					const assocToggle = document.getElementById(assocToggleId);
					closePopup(popup, assocToggle);
				} else {
					// best effort: call finalizeClose for unknown popup
					finalizeClose(popup, null);
				}
			}
		}
	});

	document.addEventListener("click", (event) => {
		// If a toggle just fired, ignore the next document click to avoid the open/close race.
		if (_suppressDocClick) return;

		// If some handler intentionally prevented this event (e.g. stopImmediatePropagation + preventDefault),
		// don't treat it as an outside click.
		if (event.defaultPrevented) return;

		const clickedToggle = (creditsToggle && creditsToggle.contains(event.target)) ||
			(settingsToggle && settingsToggle.contains(event.target));

		// Treat clicks inside ANY .popup as "clickedInsidePopup" (covers mature-modal and others)
		const clickedInsidePopup = Array.from(document.querySelectorAll('.popup')).some(p => p.contains(event.target));

		if (!clickedToggle && !clickedInsidePopup) hideAllPopups();
	});

	// Escape closes
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") hideAllPopups();
	});
}

/* expose helpers for debugging or additional use */
window.openPopup = openPopup;
window.closePopup = closePopup;
window.setMode = setMode;
window.showToast = showToast;
window.setBackgroundAndText = setBackgroundAndText;

/* ---------- Mature-content modal (age-gate) — updated: non-dismissible except buttons ---------- */
(function () {
	const MATURE_KEY = "matureAcknowledged_v1";
	const modal = document.getElementById("mature-modal");
	const toggle = document.getElementById("mature-toggle");
	const overlay = document.getElementById("mature-overlay");
	const enterBtn = document.getElementById("mature-enter-btn");
	const exitBtn = document.getElementById("mature-exit-btn");
	const rememberCheckbox = document.getElementById("mature-remember");

	if (!modal || !toggle || !overlay) return;

	// Give the mature modal a very high priority so it always preempts others.
	modal.setAttribute('data-priority', '50');

	let _escGuard = null;
	let _outsideGuard = null;

	function showMatureModal() {
		overlay.classList.add("active");
		// openPopup handles inerting/focus trap and queueing rules
		openPopup(modal, toggle);

		// Immediately set focus to the primary action
		setTimeout(() => {
			enterBtn?.focus();
		}, 120);

		// Override/announce guidance (openPopup announces generically; replace it)
		announce("This site contains mature themes. Use Enter to continue or Exit to leave.");

		// Add guards to prevent Esc and outside-clicks from closing or bubbling to global handlers
		_escGuard = function (e) {
			if (e.key === "Escape" || e.key === "Esc") {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		};
		document.addEventListener("keydown", _escGuard, true);

		_outsideGuard = function (e) {
			// If click is outside modal while modal is open, block it (so global handlers won't act)
			if (!modal.contains(e.target)) {
				e.preventDefault();
				e.stopImmediatePropagation();
				showToast("Please use the buttons in the notice to continue.", 1000);
			}
		};
		// use capture so this fires before other click handlers
		document.addEventListener("click", _outsideGuard, true);
	}

	function hideMatureModal() {
		// close using existing closePopup to keep animation & cleanup consistent
		closePopup(modal, toggle);
		setTimeout(() => overlay.classList.remove("active"), 420);

		// remove guards
		if (_escGuard) { document.removeEventListener("keydown", _escGuard, true); _escGuard = null; }
		if (_outsideGuard) { document.removeEventListener("click", _outsideGuard, true); _outsideGuard = null; }
	}

	function accept(remember) {
		try {
			if (remember) localStorage.setItem(MATURE_KEY, "true");
			else sessionStorage.setItem(MATURE_KEY, "true");
		} catch (err) {
			console.warn("Could not persist mature acknowledgement:", err);
		}
		hideMatureModal();
		showToast("Thanks! Enjoy the site", 1400);
		announce("Mature content acknowledged. Welcome.");
	}

	function exitAction() {
		// safe redirect
		// window.location.href = "https://www.google.com";
		window.history.back();
	}

	// Wire buttons
	if (enterBtn) {
		enterBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const remember = rememberCheckbox ? rememberCheckbox.checked : true;
			accept(remember);
		});
	}

	if (exitBtn) {
		exitBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			exitAction();
		});
	}
	
	modal.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') {
			// Prevent default (avoid native submit/scroll behaviours)
			e.preventDefault();
			e.stopPropagation();

			// If checkbox or other control has focus, still want the primary action
			if (enterBtn) enterBtn.click();
		}
	}, true); // use capture to intercept before anything else
	
	// Show modal on load if not accepted (localStorage OR sessionStorage)
	document.addEventListener("DOMContentLoaded", () => {
		const acceptedPersist = localStorage.getItem(MATURE_KEY) === "true";
		const acceptedSession = sessionStorage.getItem(MATURE_KEY) === "true";
		if (!acceptedPersist && !acceptedSession) {
			setTimeout(() => {
				showMatureModal();
			}, 120);
		}
	});
	
	// Clean up overlay & guards if the mature modal was closed by generic handlers
	document.addEventListener('popupclosed', (e) => {
		try {
			if (e && e.detail && e.detail.popup === modal) {
				overlay.classList.remove('active');
				if (_escGuard) { document.removeEventListener("keydown", _escGuard, true); _escGuard = null; }
				if (_outsideGuard) { document.removeEventListener("click", _outsideGuard, true); _outsideGuard = null; }
			}
		} catch (err) { /* ignore */ }
	});
	
	// Keep overlay state consistent if other code calls hideAllPopups
	document.addEventListener("click", () => {
		if (!modal || modal.style.display === "none") {
			overlay.classList.remove("active");
		}
	});
	
	// ensure popup buttons wired once
	wirePopupButtons();
})();
