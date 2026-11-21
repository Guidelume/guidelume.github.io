// Page controller for varkorax-archive/pages/collections/filter.html.

			const topbar = document.getElementById("topbar");
			
			function onScroll() {
				const active = window.scrollY > 10;
				document.body.classList.toggle("scrolled-ui", active);
			}

			window.addEventListener("scroll", onScroll);
			onScroll();
		