// Page controller for varkorax-archive/index.html.

			/* ------------------------------
			   Shared helpers
			------------------------------ */
			
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

			function pickFeatured(items, warningText) {
				const featured = items.filter(item => item.featured === true);

				if (featured.length === 1)
					return featured[0];

				if (featured.length > 1)
					console.warn(warningText);

				return [...items].sort(
					(a, b) => new Date(b.date) - new Date(a.date)
				)[0];
			}

			/* ------------------------------
			   Featured Story
			------------------------------ */

			async function loadFeaturedStory() {
				try {
					const res = await fetch("./pages/collections/stories/stories.json");
					const data = await res.json();
					
					const stories = data.entries || [];
					
					const story = pickFeatured(
						stories,
						"Multiple featured stories found. Falling back to newest story."
					);
					
					document.getElementById("latest-story").innerHTML = `
						<div class="latest-box"
							style="background-image:url('./pages/collections/${story.thumb}')">
							
							<div class="latest-text" style="margin-left:10px">

								<h2 class="latest-title">${story.title}</h2>

								<p class="latest-date">
									${story.category} • ${formatDate(story.date)}
								</p>

								<p class="latest-blurb">
									${story.blurb}
								</p>

								<a href="pages/collections/reader.html?type=stories&story=${story.slug}"
								   class="story-btn">
									Read →
								</a>

							</div>
						</div>
					`;
				}
				catch (err) {
					console.error(err);

					document.getElementById("latest-story").innerHTML =
						"<p>Couldn't load the featured story.</p>";
				}
			}

			/* ------------------------------
			   Featured Corkboard Entry
			------------------------------ */

			async function loadLatestThought() {

				try {

					const res = await fetch("./pages/corkboard/data.json");
					const entries = await res.json();

					const latest = pickFeatured(
						entries,
						"Multiple featured corkboard entries found. Falling back to newest entry."
					);

					const categoryColors = {
						thought: "#3B82F6",
						bookmark: "#F59E0B",
						update: "#10B981"
					};

					const color =
						categoryColors[latest.category] || "#888888";

					const category =
						latest.category.charAt(0).toUpperCase() +
						latest.category.slice(1);

					document.getElementById("latest-thought").innerHTML = `
						<div class="latest-box"
							style="border-left:2px outset ${color};">

							<div class="latest-text" style="margin-left:10px">

								<h2 class="latest-title">
									${latest.title}
								</h2>

								<p class="latest-date">
									${category} • ${formatDate(latest.date)}
								</p>

								<a href="pages/landing_corkboard.html"
								   class="story-btn">
									Open Corkboard →
								</a>

							</div>
						</div>
					`;

				}
				catch {

					document.getElementById("latest-thought").innerHTML =
						"<p>Couldn't load the latest corkboard entry.</p>";

				}

			}

			/* ------------------------------
			   Initialize
			------------------------------ */

			loadFeaturedStory();
			loadLatestThought();

		