// Page controller for varkorax-archive/pages/collections/reader.html.

		(function() {
				const backBtn = document.getElementById('back-btn');
				const urlParams = new URLSearchParams(window.location.search);
				const genre = urlParams.get('genre'); // could be null or empty
				const fallbackURL = `../landing_collections.html`;
				const archiveRoot = new URL('../../', window.location.href);
				let returnURL = fallbackURL;

				// Guidelume and Archive share a hostname. Only return to referrers
				// inside Archive, so an embedding Guidelume page is not opened here.
				try {
					const referrer = new URL(document.referrer);
					if (referrer.origin === window.location.origin && referrer.pathname.startsWith(archiveRoot.pathname)) {
						returnURL = referrer.href;
					}
				} catch (_) {}

				backBtn.href = returnURL;
			})();
			
			document.addEventListener('DOMContentLoaded', () => {
				const btnDefault = document.getElementById('btn-default');
				const btnDay = document.getElementById('btn-day');
				const btnNight = document.getElementById('btn-night');

				const body = document.body;
				const readReaderMode = () => {
					try { return sessionStorage.getItem('storiesReaderMode'); } catch (_) { return null; }
				};
				const saveReaderMode = mode => {
					try {
						if (mode === 'day' || mode === 'night') sessionStorage.setItem('storiesReaderMode', mode);
						else sessionStorage.removeItem('storiesReaderMode');
					} catch (_) {}
				};

				/* ---------- ACTIVE STATE HIGHLIGHT (restored logic) ---------- */
				function updateButtonStates(active) {
					[btnDefault, btnDay, btnNight].forEach(btn => {
						if (!btn) return;
						btn.classList.remove('is-active');
						btn.setAttribute('aria-pressed', 'false');
					});
					if (active === 'day' && btnDay) {
						btnDay.classList.add('is-active');
						btnDay.setAttribute('aria-pressed', 'true');
					} else if (active === 'night' && btnNight) {
						btnNight.classList.add('is-active');
						btnNight.setAttribute('aria-pressed', 'true');
					} else if (active === null && btnDefault) {
						btnDefault.classList.add('is-active');
						btnDefault.setAttribute('aria-pressed', 'true');
					}
				}

				/* ---------- READER THEME (local to #reader only) ---------- */
				function applyReaderTheme(mode) {
					const reader = document.getElementById('reader');
					if (!reader) return;

					// reader container classes (visual only)
					reader.classList.remove('theme-default', 'theme-light', 'theme-dark');
					if (mode === 'day') reader.classList.add('theme-light');
					else if (mode === 'night') reader.classList.add('theme-dark');
					else reader.classList.add('theme-default');

					// Mirror to body.theme-* so stories.js and the theme-text CSS pick up the right color
					document.body.classList.remove('theme-day', 'theme-night');
					if (mode === 'day') document.body.classList.add('theme-day');
					else if (mode === 'night') document.body.classList.add('theme-night');

					// Update local button visuals
					updateButtonStates(mode);
					try { window.setBackgroundAndText && window.setBackgroundAndText(); } catch (_) {}

					// Let stories.js know about the change so it can centralise state & update outlines.
					try {
						window.dispatchEvent(new CustomEvent('stories:theme-changed', { detail: { mode } }));
					} catch (_) {}
				}

				function setReaderTheme(mode) {
					// Use sessionStorage so it is local to the tab/session and does not affect other pages/tabs
					saveReaderMode(mode);
					applyReaderTheme(mode);
				}

				// Wire theme buttons (local only)
				if (btnDay) btnDay.addEventListener('click', (e) => { e.preventDefault(); setReaderTheme('day'); });
				if (btnNight) btnNight.addEventListener('click', (e) => { e.preventDefault(); setReaderTheme('night'); });
				if (btnDefault) btnDefault.addEventListener('click', (e) => { e.preventDefault(); setReaderTheme(null); });

				window.addEventListener('archive:reader-ready', () => applyReaderTheme(readReaderMode()));

				// Initial reader theme
				const savedReader = readReaderMode();
				applyReaderTheme((savedReader === 'day' || savedReader === 'night') ? savedReader : null);

			});
		