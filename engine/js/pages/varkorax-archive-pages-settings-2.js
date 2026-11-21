// Page controller for varkorax-archive/pages/settings.html.

		  // existing scripts above remain — append this
		  // Sync the accessible fonts toggle (localStorage key: "accessibleFonts")
		  (function () {
			const btn = document.getElementById('settings-font-toggle');

			function readState() {
			  try {
				return localStorage.getItem('accessibleFonts') === 'true';
			  } catch (e) { return false; }
			}

			function applyStateToUI(enabled) {
			  if (!btn) return;
			  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
			  btn.querySelector('.settings-text').textContent = 'Accessible fonts: ' + (enabled ? 'On' : 'Off');
			}

			function applyStateToParent(enabled) {
			  try {
				// parent will update via storage listener, but we can also immediately set class
				if (window.parent && window.parent.document && window.parent.document.body) {
				  if (enabled) window.parent.document.body.classList.add('font-accessible');
				  else window.parent.document.body.classList.remove('font-accessible');
				}
				// announce & toast in parent if available
				try { window.parent.announce(enabled ? 'Accessible fonts enabled' : 'Accessible fonts disabled'); } catch (e) {}
				try { window.parent.showToast(enabled ? 'Accessible fonts enabled' : 'Accessible fonts disabled', 1600); } catch (e) {}
			  } catch (err) { /* ignore cross-context errors */ }
			}

			function setStorageEnabled(enabled) {
			  try {
				localStorage.setItem('accessibleFonts', enabled ? 'true' : 'false');
			  } catch (e) { /* ignore storage errors */ }
			}

			// click toggles
			if (btn) {
			  btn.addEventListener('click', (e) => {
				e.preventDefault();
				const current = readState();
				const next = !current;
				setStorageEnabled(next);
				applyStateToUI(next);
				applyStateToParent(next);
			  });
			}

			// react to storage changes (e.g. another tab)
			window.addEventListener('storage', (e) => {
			  if (e.key === 'accessibleFonts') {
				const enabled = readState();
				applyStateToUI(enabled);
			  }
			  if (e.key === 'userMode') {
				// keep your existing behavior for userMode
				applyIframeTextColor();
			  }
			});

			// initial paint
			applyStateToUI(readState());
		  })();
		