// Page controller for varkorax-archive/pages/changelog.html.

			let changelog = [];
			let current = 0;

			async function loadChangelog() {
				try {
					const res = await fetch("./changelogs/data.json");

					if (!res.ok) {
						throw new Error("Couldn't load data.json");
					}

					changelog = await res.json();

					// Newest first
					changelog.sort(
						(a, b) => new Date(b.date) - new Date(a.date)
					);

					await showEntry(0);
				}
				catch (err) {
					console.error(err);

					document.getElementById("changelog-content").innerHTML =
						"<p>Couldn't load the changelog.</p>";
				}
			}

			function formatDate(dateString) {
				const date = new Date(dateString);

				const day = date.getDate();

				const suffix =
					day % 10 === 1 && day !== 11 ? "st" :
					day % 10 === 2 && day !== 12 ? "nd" :
					day % 10 === 3 && day !== 13 ? "rd" :
					"th";

				return `${date.toLocaleString("en-US", {
					month: "long"
				})} ${day}${suffix}, ${date.getFullYear()}`;
			}

			async function showEntry(index) {

				if (index < 0 || index >= changelog.length) {
					return;
				}

				current = index;

				const entry = changelog[current];

				document.getElementById("version-title").innerHTML =
					`<img src="../custom/img/glyph.svg" class="panel-glyph" /> ${entry.version}`;

				document.getElementById("version-date").textContent =
					formatDate(entry.date);

				try {

					const mdRes = await fetch(entry.md);

					if (!mdRes.ok) {
						throw new Error("Couldn't load markdown.");
					}

					const markdown = await mdRes.text();
					const content = document.getElementById("changelog-content");
					if (window.marked && window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
						content.innerHTML = window.DOMPurify.sanitize(window.marked.parse(markdown));
					} else {
						content.textContent = markdown;
						content.style.whiteSpace = "pre-wrap";
					}

				}
				catch (err) {

					console.error(err);

					document.getElementById("changelog-content").innerHTML =
						"<p>Couldn't load this changelog entry.</p>";
				}

				updateButtons();
			}

			function updateButtons() {

				const prev = document.getElementById("prev-log");
				const next = document.getElementById("next-log");

				// Older version
				prev.disabled = (current >= changelog.length - 1);

				// Newer version
				next.disabled = (current <= 0);

				prev.classList.toggle("disabled", prev.disabled);
				next.classList.toggle("disabled", next.disabled);
			}

			document.getElementById("prev-log").addEventListener("click", () => {

				if (current < changelog.length - 1) {
					showEntry(current + 1);
				}

			});

			document.getElementById("next-log").addEventListener("click", () => {

				if (current > 0) {
					showEntry(current - 1);
				}

			});

			loadChangelog();
		