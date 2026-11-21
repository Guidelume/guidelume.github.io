// Page controller for varkorax-archive/index.html.

		async function loadLatestChangelog() {
			try {
				const res = await fetch("./pages/changelogs/data.json");
				const data = await res.json();

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

				let featured = data.filter(entry => entry.featured === true);
				let latest;

				if (featured.length === 1) {
					latest = featured[0];
				}
				else {
					const sorted = [...data].sort(
						(a, b) => new Date(b.date) - new Date(a.date)
					);

					latest = sorted[0];

					if (featured.length > 1) {
						console.warn(
							"Multiple featured changelog entries found. Falling back to newest entry."
						);
					}
				}

				const written = formatDate(latest.date);

				const summary = latest.summary
				.slice(0, 3)
				.map(item => `<li>${item}</li>`)
				.join("");

				document.getElementById("latest-update").innerHTML = `
				<div class="latest-box">
					<div class="latest-text">
						<h2 class="latest-title">${latest.version}</h2>
						<p class="latest-date">${written}</p>

						<ul class="latest-summary" style="color: white">
							${summary}
						</ul>

						<a href="pages/changelog.html" target="_blank" class="story-btn">
							View Changelog →
						</a>
					</div>
				</div>
				`;
				
			}
			catch(err){
				document.getElementById("latest-update").innerHTML =
					"<p>Couldn't load the latest changelog.</p>";
			}
		}

		loadLatestChangelog();
		