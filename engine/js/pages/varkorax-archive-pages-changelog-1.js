// Page controller for varkorax-archive/pages/changelog.html.

			(function () {
				const backBtn = document.getElementById('back-to-categories');

				function positionBackButton() {
					if (!backBtn) return;
					// find the current topbar button (the one with aria-current="page")
					const current = document.querySelector('#topbar .topbar-btn[aria-current="page"]');
					// If that's not found, fallback to first topbar-btn
					const anchor = current || document.querySelector('#topbar .topbar-btn');
					if (!anchor) return;

					// ensure backBtn has fixed positioning
					backBtn.style.position = 'fixed';
					backBtn.style.zIndex = 1202;

					// measure
					const aRect = anchor.getBoundingClientRect();
					const bRect = backBtn.getBoundingClientRect();

					// center under anchor, with slightly larger vertical gap so hover translate doesn't clip into topbar
					const left = Math.round(aRect.left + (aRect.width / 2) - (bRect.width / 2));
					const top = Math.round(aRect.bottom + 16); // was 8 -> now 16 (tiny bit lower)

					backBtn.style.left = left + 'px';
					backBtn.style.top = top + 'px';
				}

				// run on DOM ready and on resize; also run again shortly after load to catch late layout shifts
				window.addEventListener('DOMContentLoaded', () => {
					positionBackButton();
					// slight retry after fonts/images settle
					setTimeout(positionBackButton, 120);
				});
				window.addEventListener('load', () => setTimeout(positionBackButton, 120));
				window.addEventListener('resize', positionBackButton);
				// optional: observe layout changes to the topbar (e.g., if icons change)
				const topbar = document.getElementById('topbar');
				if (topbar && window.MutationObserver) {
					const mo = new MutationObserver(() => positionBackButton());
					mo.observe(topbar, { attributes: true, childList: true, subtree: true });
				}
			})();
		