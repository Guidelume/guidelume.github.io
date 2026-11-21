// Page controller for varkorax-archive/pages/landing_collections.html.

		const topButton = document.getElementById("backToTop");

		function onScroll() {
			const scrolled = window.scrollY > 10;
			document.body.classList.toggle("scrolled-ui", scrolled);

			topButton.classList.toggle("visible", window.scrollY > 200);
		}

		window.addEventListener("scroll", onScroll);
		onScroll();

		topButton.addEventListener("click", () => {
			window.scrollTo({
				top: 0,
				behavior: "smooth"
			});
		});
		