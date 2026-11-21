// Page controller for varkorax-archive/update/settings_mwbc.html.

			// Mirror the parent’s logic for text color (just for this iframe’s content).
			function applyIframeTextColor() {
			  let mode = null;
			  try { mode = localStorage.getItem('userMode'); } catch (e) {}
			  const hour = new Date().getHours();
			  const isNightByClock = (hour >= 22 || hour < 6);
			  const night = mode === 'night' || (mode !== 'day' && isNightByClock);
			  const color = night ? '#f0f0f0' : '#000000';
			  document.querySelectorAll('.content').forEach(el => { el.style.color = color; });
			}
			
			function setMode(mode) {
			  try {
				if (mode) localStorage.setItem('userMode', mode);
				else localStorage.removeItem('userMode');
			  } catch (e) {}
			
			  // Update this iframe immediately…
			  applyIframeTextColor();
			
			  // …and the parent will update itself automatically via the `storage` listener.
			  // (Optionally also call it directly for belt & braces)
			  if (window.parent && typeof window.parent.setBackgroundAndText === 'function') {
				window.parent.setBackgroundAndText();
			  }
			}
			
			function remMode() {
				try { localStorage.removeItem('userMode'); } catch (e) {}
			}
			
			// If the parent changes mode (e.g., from another iframe), reflect it here.
			window.addEventListener('storage', (e) => {
			  if (e.key === 'userMode') applyIframeTextColor();
			});
			
			// Initial paint
			applyIframeTextColor();
		