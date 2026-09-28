const params = new URLSearchParams(location.search);
const type = params.get("type");

const script = document.createElement("script");
script.src = `../../custom/js/filter-${type}.js`;
document.head.appendChild(script);

if (type === "entry") {
	document.querySelector("#filter-head").innerHTML = `
		<h1>The Basement Index</h1>
		<p><q>At the end of everything, hold onto anything.</q> - Night in the Woods</p>
		<p>That is to say, this is an archive or record of the media I have collected over the years, from games to movies and everything in between.</p>
		<p>Things are rough right now and they show no sign of stopping. But we are still here and so will my media I hope.</p>
		<p>So take a look around and see what you may discover.</p>
		<br>
		<hr style="width: 80%">
		<br>
		<p class="entry-counter">Entries: 0</p>
		<div id="active-filters" class="active-filters hidden"></div>
		`;
	document.querySelector("#filter-main").innerHTML = `
		<select id="sort">
			<option value="newest">Newest Added</option>
			<option value="oldest">Oldest Added</option>
								
			<option value="release-newest">Release Date ↓</option>
			<option value="release-oldest">Release Date ↑</option>
								
			<option value="az">A → Z</option>
			<option value="za">Z → A</option>
		</select>
							
		<!-- Filter -->
		<select id="platform-filter">
			<option value="">All Platforms</option>
		</select>

		<select id="type-filter">
			<option value="">All Types</option>
		</select>

		<select id="format-filter">
			<option value="">All Formats</option>
		</select>

		<select id="tag-filter">
			<option value="">All Tags</option>
		</select>
		`;
} 
	
if (type === "stories") {
	document.querySelector("#filter-head").innerHTML = `
		<h1>The Quill of Faffing</h1>
		<p>Sometimes I wake up in the middle of the night having dreamed something I immediately need to jot down somewhere. Often it doesn't make much sense, but sometimes it leads to some exciting stories.</p>
		<p>Here I hope to collect those ideas and many more. From short stories to loose snippets and maybe even some ambitious projects.</p>
		<p>So take a look around and see what you may discover.</p>
		<br>
		<hr style="width: 80%">
		<br>
		<p class="entry-counter">Entries: 0</p>
		<div id="active-filters" class="active-filters hidden"></div>
		`;
	document.querySelector("#filter-main").innerHTML = `
		<select id="sort">
			<option value="newest">Newest Added</option>
			<option value="oldest">Oldest Added</option>
								
			<option value="release-newest">Release Date ↓</option>
			<option value="release-oldest">Release Date ↑</option>
								
			<option value="az">A → Z</option>
			<option value="za">Z → A</option>
		</select>
							
		<!-- Filter -->
		<select id="category-filter">
			<option value="">All Categories</option>
		</select>

		<select id="genre-filter">
			<option value="">Genre</option>
		</select>

		<select id="status-filter">
			<option value="">Status</option>
		</select>
		
		<select id="tag-filter">
			<option value="">All Tags</option>
		</select>
		`;
}

if (type === "projects") {
	document.querySelector("#filter-head").innerHTML = `
		<h1>The Project Basin</h1>
		<p>Sometimes you sit at your desk and think: "Wouldn't it be cool if..."</p>
		<p>This is where I collect those ideas, experiments, and other amorphous, vaguely project shaped things; Big and small, finished or very much not.</p>
		<p>So take a look around and I am sure something will catch your interest.</p>
		<br>
		<hr style="width: 80%">
		<br>
		<p class="entry-counter">Entries: 0</p>
		<div id="active-filters" class="active-filters hidden"></div>
		`;
	document.querySelector("#filter-main").innerHTML = `
		<select id="sort">
			<option value="newest">Newest Added</option>
			<option value="oldest">Oldest Added</option>
								
			<option value="release-newest">Release Date ↓</option>
			<option value="release-oldest">Release Date ↑</option>
								
			<option value="az">A → Z</option>
			<option value="za">Z → A</option>
		</select>
							
		<!-- Filter -->
		<select id="category-filter">
			<option value="">All Categories</option>
		</select>

		<select id="genre-filter">
			<option value="">Genre</option>
		</select>

		<select id="status-filter">
			<option value="">Status</option>
		</select>
		
		<select id="tag-filter">
			<option value="">All Tags</option>
		</select>
		`;
}
