// Keep shared guide metadata here so every Milky Way Bar Crawl page stays in sync.
(() => {
	const metadata = Object.freeze({
		lastUpdated: "October 2026",
		version: "v2.2"
	});

	const updatedLabel = `${metadata.lastUpdated} · ${metadata.version}`;
	document.querySelectorAll("[data-guide-updated]").forEach((element) => {
		element.textContent = updatedLabel;
	});
})();
