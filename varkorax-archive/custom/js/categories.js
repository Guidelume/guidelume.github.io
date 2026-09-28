// --------- dummy data (fallback) ----------
// Keep this as a fallback if the JSON can't be fetched.
const STORIES = {
	short_stories: [
		{
			slug: "fallback-landia",
			title: "The Falling is Error",
			blurb: "Error encountered while loading stories. Sorry.",
			thumb: "../custom/img/thumb_test.png",
			href: "#",
		},
	],
	fanfiction: [
		{
			slug: "fallback-landia",
			title: "The Falling is Error",
			blurb: "Error encountered while loading stories. Sorry.",
			thumb: "../custom/img/thumb_test.png",
			href: "#",
		},
	],
};

// --------- config ----------
const STORIES_JSON = "../pages/stories/stories.json"; // adjust as needed
const PAGE_SIZE = 3; // entries per page. fits better currently. prev 4
const DEFAULT_TYPE = "short_stories";
const FALLBACK_THUMB = "../custom/img/thumb-fallback.png"; // change for different placeholder

// --------- helpers ----------
const qs = new URLSearchParams(location.search);
let rawType = qs.get("type") || DEFAULT_TYPE;
// accept both short-stories and short_stories in the URL
const type = rawType.replace(/-/g, "_");
const pageParam = Number(qs.get("page")) || 1;

const titleMap = {
	short_stories: "Short Stories",
	fanfiction: "Fanfiction",
	reviews: "Reviews",
	blog: "Blog",
};

// small blurbs to match each category (used in the headline block)
const blurbMap = {
	short_stories: "Short, self-contained tales — quick reads with complete arcs.",
	fanfiction: "Fan-made continuations, alternate takes, and character experiments.",
	reviews: "Thoughtful reviews and deep-dives into books and games.",
	blog: "Personal notes, updates, and shorter essays.",
};

// DOM refs (defensive)
const catTitleEl = document.getElementById("cat-title");
const catSubtitleEl = document.getElementById("cat-subtitle");
const catBlurbEl = document.getElementById("cat-blurb");
const storyListEl = document.getElementById("story-list");
const pagerEl = document.getElementById("pager");
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");
const pageIndicator = document.getElementById("pageIndicator");

function safeText(s) {
	return String(s == null ? "" : s);
}

// thumb resolver: if absolute path or http(s), return as-is; otherwise resolve relative to current page
function resolveThumb(path) {
	if (!path) return FALLBACK_THUMB;
	if (/^(?:https?:)?\/\//i.test(path) || path.startsWith("/")) return path;
	try {
		return new URL(path, window.location.href).toString();
	} catch (_) {
		return path || FALLBACK_THUMB;
	}
}

// Build the read href for a story given its slug.
// Uses the reader page at /pages/stories/stories.html?story=SLUG
function buildReadHref(slug, type) {
	return `./stories/stories.html?story=${encodeURIComponent(slug)}&genre=${encodeURIComponent(type)}`;
}

// small util to update or add a query param on a URL string
function updateQueryParam(uri, key, value) {
	const u = new URL(uri, window.location.href);
	u.searchParams.set(key, String(value));
	return u.toString();
}

// Render helpers
function renderRows(list, page) {
	if (!storyListEl) return;

	// no results state
	if (!Array.isArray(list) || list.length === 0) {
		storyListEl.innerHTML = `<div class="no-results" role="status" aria-live="polite">
				<p>No stories found in this category.</p>
			</div>`;
		if (pagerEl) pagerEl.hidden = true;
		if (catSubtitleEl) catSubtitleEl.textContent = `0 stories`;
		if (catBlurbEl) catBlurbEl.textContent = blurbMap[type] || "";
		return;
	}

	const start = (page - 1) * PAGE_SIZE;
	const slice = list.slice(start, start + PAGE_SIZE);

	storyListEl.innerHTML = slice
		.map((s) => {
			// allow JSON to provide either `href` (legacy) or just `slug` (preferred)
			const href = s.href ? s.href : buildReadHref(s.slug, type);
			const thumb = resolveThumb(s.thumb || s.thumb_url || "");
			const alt = safeText(s.title) || safeText(s.slug) || "Story thumbnail";

			// img has lazy loading, async decoding and an onerror fallback
			return `
				<article class="story-row" aria-labelledby="title-${safeText(s.slug)}">
					<img class="story-thumb" src="${thumb}" alt="${alt}" loading="lazy" decoding="async"
						onerror="this.onerror=null;this.src='${FALLBACK_THUMB}';" />
					<h3 id="title-${safeText(s.slug)}" class="story-title">${safeText(s.title)}</h3>
					<p class="story-blurb">${safeText(s.blurb)}</p>
					<a class="read-btn" href="${href}" aria-label="Read ${safeText(s.title)}">Read</a>
				</article>
			`;
		})
		.join("");

	// pager state
	const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
	if (pagerEl) pagerEl.hidden = pageCount <= 1;
	if (prevBtn) prevBtn.disabled = page <= 1;
	if (nextBtn) nextBtn.disabled = page >= pageCount;
	if (pageIndicator) pageIndicator.textContent = `${page} / ${pageCount}`;
}

// Primary loader: try JSON, fall back to STORIES constant
async function loadCategory() {
	// show a small inline loader while fetching JSON
	if (storyListEl) {
		storyListEl.innerHTML = `<div class="loader" role="status" aria-live="polite"><p>Loading…</p></div>`;
	}

	let rawIndex = null;
	try {
		const res = await fetch(STORIES_JSON, { cache: "no-cache" });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		rawIndex = await res.json();
	} catch (err) {
		// failed to fetch JSON — fall back quietly
		console.warn("Could not load stories.json, falling back to inline STORIES:", err);
		rawIndex = null;
	}

	// Determine list for this category.
	// rawIndex is expected to be an object mapping category keys -> arrays
	let list = [];

	if (rawIndex && typeof rawIndex === "object") {
		// If the top-level is an array (old flat format), use it directly.
		if (Array.isArray(rawIndex)) {
			list = rawIndex;
		} else {
			// try to find the category key
			const candidate = rawIndex[type];
			if (Array.isArray(candidate)) {
				list = candidate;
			} else {
				// not found — try to search across categories and flatten them
				for (const val of Object.values(rawIndex)) {
					if (Array.isArray(val)) list = list.concat(val);
				}
			}
		}
	}

	// if still empty, use fallback STORIES constant
	if (!list || !list.length) {
		list = (STORIES && STORIES[type]) ? STORIES[type] : [];
	}

	// normalize each entry a bit so render code can be simple
	list = list.map((it) => {
		return {
			slug: it.slug || it.id || "",
			title: it.title || it.name || "",
			blurb: it.blurb || it.description || "",
			thumb: it.thumb || it.thumb_url || "",
			href: it.href || (it.slug ? buildReadHref(it.slug, type) : "#")
		};
	});

	// update title/subtitle/blurb
	if (catTitleEl) catTitleEl.textContent = titleMap[type] || "Stories";
	if (catSubtitleEl) catSubtitleEl.textContent = `${list.length} stor${list.length === 1 ? "y" : "ies"}`;
	if (catBlurbEl) catBlurbEl.textContent = blurbMap[type] || "";

	// paging
	let page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
	const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
	if (page > pageCount) page = pageCount;

	// wire buttons (idempotent)
	const onPrev = () => {
		if (page > 1) {
			page--;
			renderRows(list, page);
			history.replaceState(null, "", updateQueryParam(location.href, "page", page));
		}
	};
	const onNext = () => {
		if (page < pageCount) {
			page++;
			renderRows(list, page);
			history.replaceState(null, "", updateQueryParam(location.href, "page", page));
		}
	};
	if (prevBtn) {
		prevBtn.removeEventListener("click", onPrev); // safe-guard
		prevBtn.addEventListener("click", onPrev);
	}
	if (nextBtn) {
		nextBtn.removeEventListener("click", onNext);
		nextBtn.addEventListener("click", onNext);
	}

	// initial render
	renderRows(list, page);
}

// kick off
loadCategory();
