// basement.js Version 5 (Entry)
// Everything works I think?

const DATA_JSON = "./basement/data.json";

// ---------- Settings ----------

const SETTINGS_KEY = "basementSettings";

let settings = {
    page: 1,
    pageSize: 10,
    sort: "newest",
    search: "",
    filters: {
        platform: "",
        type: "",
        format: "",
        tag: ""
    }
};

function loadSettings() {

    const stored = localStorage.getItem(SETTINGS_KEY);

    if (!stored)
        return;

    try {

        const saved = JSON.parse(stored);
		
		// Just in case I ever want to add more filters, so everyone's saved filters won't break
		settings = {
			...settings,
			...saved,
			filters: {
				...settings.filters,
				...(saved.filters || {})
			}
		};

    }

    catch {
        console.warn("Couldn't restore settings.");
    }

}

function saveSettings() {
    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(settings)
    );

}

let MASTER = [];
let FILTERED = [];

let currentPage = settings.page;
let pageSize = settings.pageSize;
let sortMode = settings.sort;

const FILTER_DEFS = [

    {
        key: "platform",
        label: "Platform"
    },

    {
        key: "type",
        label: "Type"
    },

    {
        key: "format",
        label: "Format"
    },

    {
        key: "tag",
        label: "Tag"
    }

];

const grid = document.querySelector(".browser-grid");
const counter = document.querySelector(".entry-counter");

const prevBtn = document.getElementById("page-prev");
const nextBtn = document.getElementById("page-next");
const pageLabel = document.getElementById("page-label");
const pageSelect = document.getElementById("page-size");

const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");

const platformFilter = document.getElementById("platform-filter");
const typeFilter = document.getElementById("type-filter");
const formatFilter = document.getElementById("format-filter");
const tagFilter = document.getElementById("tag-filter");

function normalize(value) {
	
	const NORMALIZE = {
	
    pc: "PC",
    dos: "DOS",
    dvd: "DVD",
    cd: "CD",
    gba: "Game Boy Advance",
    ps2: "PlayStation 2"
	
	};
	
    const key = value.trim().toLowerCase();
	
    return NORMALIZE[key] ??
        key.replace(/\b\w/g,c=>c.toUpperCase());
	
}

async function loadArchive() {

    try {

        const response = await fetch(DATA_JSON, { cache: "no-cache" });

        if (!response.ok)
            throw new Error("Couldn't load data.json");

        const data = await response.json();
		
        MASTER = data.entries || [];
		
		MASTER.forEach(entry => {
			
			entry.platform = normalize(entry.platform);
			entry.type = normalize(entry.type);
			entry.format = normalize(entry.format);
			
			entry.tags = (entry.tags || []).map(normalize);
			
		});
		
		populateFilters();

    } catch (err) {

        console.error(err);

        MASTER = [];

    }

    pageSelect.value = pageSize;
    sortSelect.value = sortMode;

    refresh();

}

function refresh() {
	
	const start =
    (settings.page - 1) * settings.pageSize;
	
    currentPage = settings.page;
    pageSize = settings.pageSize;
    sortMode = settings.sort;

    FILTERED = [...MASTER];

    FILTERED = applySearch(FILTERED);

    FILTERED = applyFilters(FILTERED);

    FILTERED = applySorting(FILTERED);
	
	populateFilters();
	
	renderActiveFilters();
	
    updateCounter();

    updatePagination();

    renderCards();

}

function applySearch(list) {

    const query =
        settings.search
            .trim()
            .toLowerCase();

    if (!query)
        return list;

    return list.filter(entry => {

        const haystack = [

            entry.title,

            entry.platform,

            entry.developer,

            entry.publisher,

            entry.type,

            entry.format,

            ...(entry.tags || [])

        ]
            .join(" ")
            .toLowerCase();

        return haystack.includes(query);

    });

}

function applyFilters(list, ignore = null) {
	
    return list.filter(entry => {

        if (
            settings.filters.platform &&
            entry.platform !== settings.filters.platform
        )
            return false;

        if (
            settings.filters.type &&
            entry.type !== settings.filters.type
        )
            return false;

        if (
            settings.filters.format &&
            entry.format !== settings.filters.format
        )
            return false;

        if (
            settings.filters.tag &&
            !(entry.tags || []).includes(settings.filters.tag)
        )
            return false;
		
		if (
			ignore !== "platform" &&
			settings.filters.platform &&
			entry.platform !== settings.filters.platform
		)
			return false;
		
        return true;

    });

}

function applySorting(list) {

    switch (settings.sort) {

        case "oldest":

            list.sort((a,b)=>
                new Date(a.added)-new Date(b.added));

            break;

		case "release-newest":

			list.sort((a, b) =>
				new Date(b.releaseDate) -
				new Date(a.releaseDate) ||
				a.title.localeCompare(b.title)
			);

			break;

		case "release-oldest":

			list.sort((a, b) =>
				new Date(a.releaseDate) -
				new Date(b.releaseDate) ||
				a.title.localeCompare(b.title)
			);

			break;

        case "az":

            list.sort((a,b)=>
                a.title.localeCompare(b.title));

            break;

        case "za":

            list.sort((a,b)=>
                b.title.localeCompare(a.title));

            break;

        default:

            list.sort((a,b)=>
                new Date(b.added)-new Date(a.added));

    }

    return list;

}

function setupFilter(select, key) {

    select.addEventListener("change", () => {

        settings.filters[key] = select.value;

        settings.page = 1;

        saveSettings();

        refresh();

    });

}

function updateCounter() {

    counter.textContent = `Entries: ${FILTERED.length}`;

}

function renderCards() {

    grid.innerHTML = "";

    const start =
        (currentPage - 1) * pageSize;

    const page =
        FILTERED.slice(start, start + pageSize);

    page.forEach(renderCard);

}

function escapeHTML(value){

    return String(value)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;");

}

// Wait I am not American

// formatDate(dateString): 01/01/2026
// ,"year": 2026
// ,"long": 1 January 2026

function getOrdinal(n) {

    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;

    return n + (s[(v - 20) % 10] || s[v] || s[0]);

}

function formatDate(dateString, style = "long") {

    const date = new Date(dateString);

    switch (style) {

        case "year":
            return date.getFullYear();

        case "short":
            return date.toLocaleDateString("en-GB");

        case "long": {
            const day = getOrdinal(date.getDate());

            const month = date.toLocaleString("en-GB", {
                month: "long"
            });

            const year = date.getFullYear();

            return `${day} ${month} ${year}`;

        }

    }

}

function renderCard(entry) {

    const card = document.createElement("a");

    card.className = "archive-card";

    card.href =
        `./reader.html?type=entry&id=${encodeURIComponent(entry.id)}`;

    card.innerHTML = `

        <img
            src="./basement/${entry.id}/thumbnail.webp"
            alt="${entry.title}"
            loading="lazy"
            onerror="this.src='../../custom/img/thumb-fallback.png';">

        <div class="archive-overlay">

            <h3>${escapeHTML(entry.title)}</h3>

            <p>${entry.platform} • ${formatDate(entry.releaseDate, "year")}</p>

            <span>${entry.developer}</span>

        </div>

    `;

    grid.appendChild(card);

}

function updatePagination() {

    const totalPages =
        Math.max(
            1,
            Math.ceil(FILTERED.length / pageSize)
        );

    if (currentPage > totalPages)
        currentPage = totalPages;

    pageLabel.textContent =
        `${currentPage} / ${totalPages}`;

    prevBtn.disabled =
        currentPage === 1;

    nextBtn.disabled =
        currentPage === totalPages;

    localStorage.setItem(
        "basementPage",
        currentPage
    );

}

function filteredWithout(field){

    let list = [...MASTER];

    list = applySearch(list);

    list = applyFilters(list, field);

    return list;

}

// Version 3 - Rewrite to return objects instead of arrays

function buildOptions(field) {

    // Entries matching all filters except this one
    const source = filteredWithout(field);

    // Every possible value
    const values = new Set();

    // Current counts
    const counts = new Map();

    // Collect every possible option from MASTER
    MASTER.forEach(entry => {

        const value = entry[field];

        if (Array.isArray(value)) {

            value.forEach(v => values.add(v));

        }

        else if (value) {

            values.add(value);

        }

    });

    // Count matching entries from filtered source
    source.forEach(entry => {

        const value = entry[field];

        if (Array.isArray(value)) {

            value.forEach(v => {

                counts.set(
                    v,
                    (counts.get(v) || 0) + 1
                );

            });

        }

        else if (value) {

            counts.set(
                value,
                (counts.get(value) || 0) + 1
            );

        }

    });

    // Return nice objects
    return [...values]
        .sort((a, b) => a.localeCompare(b))
        .map(value => ({

            value,
            count: counts.get(value) || 0

        }));

}

// Version 3 - Rewrite incorporating buildOptions changes

function populateSelect(select, field, label) {

    select.innerHTML = "";

    const all =
        document.createElement("option");

    all.value = "";

    all.textContent =
        `All ${label}`;

    select.appendChild(all);

    buildOptions(field).forEach(optionData => {

		const option =
			document.createElement("option");

		option.value = optionData.value;

		option.textContent =
			`${optionData.value} (${optionData.count})`;

		option.disabled =
			optionData.count === 0 &&
			optionData.value !== settings.filters[field];
		
		select.appendChild(option);
		
		const settingKey =
			field === "tags" ? "tag" : field; // Whoopsie. Eh I'll make it more explicit eventually
		
		select.value =
			settings.filters[settingKey] ?? "";
		
	});

}

function renderActiveFilters() {

    const container =
        document.getElementById("active-filters");

    container.innerHTML = "";

    const active = [];

    // Search
    if (settings.search) {

        active.push({

            label: "Search",

            value: settings.search,

            clear() {

                settings.search = "";
                searchInput.value = "";

            }

        });

    }

    // Filters
    FILTER_DEFS.forEach(filter => {

        const value =
            settings.filters[filter.key];

        if (!value)
            return;

        active.push({

            label: filter.label,

            value,

            clear() {

                settings.filters[filter.key] = "";

                document.getElementById(
                    `${filter.key}-filter`
                ).value = "";

            }

        });

    });

    // Nothing active
    if (active.length === 0) {

        container.classList.add("hidden");

        return;

    }

    container.classList.remove("hidden");

    // Create pills
    active.forEach(item => {

        const pill =
            document.createElement("button");

        pill.className = "filter-pill";

        pill.textContent =
            `${item.value} ✕`;

        pill.addEventListener("click", () => {

            item.clear();

            settings.page = 1;

            saveSettings();

            refresh();

        });

        container.appendChild(pill);

    });

    // Clear button
    const clear =
        document.createElement("button");

    clear.className = "filter-clear";

    clear.textContent =
        "Clear Selection";

    clear.addEventListener("click", () => {

        settings.search = "";

        settings.sort = "newest";

        settings.page = 1;

        settings.filters = {

            platform: "",
            type: "",
            format: "",
            tag: ""

        };

        searchInput.value = "";

        sortSelect.value = settings.sort;

        platformFilter.value = "";
        typeFilter.value = "";
        formatFilter.value = "";
        tagFilter.value = "";

        saveSettings();

        refresh();

    });
	
    container.appendChild(clear);
	
}

function populateFilters(){

    populateSelect(
        platformFilter,
        "platform",
        "Platforms"
    );

    populateSelect(
        typeFilter,
        "type",
        "Types"
    );

    populateSelect(
        formatFilter,
        "format",
        "Formats"
    );

    populateSelect(
        tagFilter,
        "tags",
        "Tags"
    );

}

prevBtn.addEventListener("click", () => {

    if (currentPage <= 1)
        return;

    currentPage--;

    updatePagination();
    renderCards();

});

nextBtn.addEventListener("click", () => {

    const totalPages =
        Math.max(
            1,
            Math.ceil(FILTERED.length / pageSize)
        );

    if (currentPage >= totalPages)
        return;

    currentPage++;

    updatePagination();
    renderCards();

});

pageSelect.addEventListener("change", () => {

    settings.pageSize =
		Number(pageSelect.value);
		
	settings.page = 1;
	
	saveSettings();

    refresh();

});

searchInput.addEventListener("input", () => {

    settings.search = searchInput.value;
	
	settings.page = 1;
	
	saveSettings();

    refresh();

});

sortSelect.addEventListener("change", () => {

    settings.sort = sortSelect.value;
	
	settings.page = 1;
	
	saveSettings();
	
	refresh();

});

setupFilter(platformFilter, "platform");
setupFilter(typeFilter, "type");
setupFilter(formatFilter, "format");
setupFilter(tagFilter, "tag");

loadSettings();
loadArchive();
