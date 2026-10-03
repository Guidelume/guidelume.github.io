(() => {
    function appendInlineMarkdown(parent, source) {
        // To-Do: Expose renderMarkdown so my stupid faux Sticky Note idea can use this later
		// Markdown will find a way to break this I just know it
		const tokens = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
        let position = 0;

        for (const match of source.matchAll(tokens)) {
            if (match.index > position) {
                parent.append(document.createTextNode(source.slice(position, match.index)));
            }

            const token = match[0];
            let element;
            if (token.startsWith("**")) {
                element = document.createElement("strong");
                element.textContent = token.slice(2, -2);
            } else if (token.startsWith("*")) {
                element = document.createElement("em");
                element.textContent = token.slice(1, -1);
            } else if (token.startsWith("`")) {
                element = document.createElement("code");
                element.textContent = token.slice(1, -1);
            } else {
                const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                let safeUrl;
                try {
                    safeUrl = new URL(link[2], document.baseURI);
                } catch {
                    safeUrl = null;
                }

                if (safeUrl && ["http:", "https:", "mailto:"].includes(safeUrl.protocol)) {
                    element = document.createElement("a");
                    element.href = safeUrl.href;
                    element.textContent = link[1];
                    if (safeUrl.protocol !== "mailto:" && safeUrl.origin !== window.location.origin) {
                        element.target = "_blank";
                        element.rel = "noopener noreferrer";
                    }
                } else {
                    element = document.createTextNode(token);
                }
            }

            parent.append(element);
            position = match.index + token.length;
        }
		
		// Is this overkill? Better safe than sorry I suppose
        if (position < source.length) {
            parent.append(document.createTextNode(source.slice(position)));
        }
    }

    function renderMarkdown(target, markdown) {
        const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
        let paragraph = [];

        function flushParagraph() {
            if (!paragraph.length) return;
            const element = document.createElement("p");
            paragraph.forEach((line, index) => {
                const hardBreak = / {2,}$/.test(line);
                appendInlineMarkdown(element, line.replace(/\s+$/, ""));
                if (index < paragraph.length - 1) {
                    if (hardBreak) element.append(document.createElement("br"));
                    else element.append(document.createTextNode(" "));
                }
            });
            target.append(element);
            paragraph = [];
        }

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (heading) {
                flushParagraph();
                const element = document.createElement(`h${heading[1].length}`);
                appendInlineMarkdown(element, heading[2]);
                target.append(element);
                continue;
            }

            const listItem = line.match(/^\s*(?:[-*+]\s+|\d+\.\s+)(.+)$/);
            if (listItem) {
                flushParagraph();
                const ordered = /^\s*\d+\./.test(line);
                // This behaves a bit odd under the hood but visually it seems fine
				let list = target.lastElementChild;
                if (!list || list.tagName !== (ordered ? "OL" : "UL")) {
                    list = document.createElement(ordered ? "ol" : "ul");
                    target.append(list);
                }
                const item = document.createElement("li");
                appendInlineMarkdown(item, listItem[1]);
                list.append(item);
                continue;
            }

            if (!line.trim()) flushParagraph();
            else paragraph.push(line);
        }
        flushParagraph();
    }

    document.querySelectorAll("[data-markdown-src]").forEach(async target => {
        try {
            const sourceUrl = new URL(target.dataset.markdownSrc, document.baseURI);
            // I will regret this six months from now but it's fine for now
			if (sourceUrl.origin !== window.location.origin) {
                throw new Error("Markdown content must be loaded from this site.");
            }
            const response = await fetch(sourceUrl.href, { credentials: "same-origin" });
            if (!response.ok) throw new Error("Markdown file could not be loaded.");
            const markdown = await response.text();
            target.replaceChildren();
            renderMarkdown(target, markdown);
        } catch {
            target.textContent = "This document could not be loaded right now.";
        }
    });
})();
