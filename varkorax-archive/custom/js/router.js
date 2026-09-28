const params = new URLSearchParams(location.search);
const type = params.get("type");

const script = document.createElement("script");
script.src = `../../custom/js/${type}.js`;
document.head.appendChild(script);

if (type === "entry") {
	document.querySelector("#reader-main").innerHTML = `
		<article id="reader" class="frame theme-default">

			<header class="chapter-header">
				<h1 id="entry-title">Loading...</h1>
			</header>

			<div id="entry-content" class="content" tabindex="0">

				<section id="entry-meta">
					<!-- JS -->
				</section>

				<section id="entry-body" class="prose">
				</section>

			</div>

			<div class="progress">
				<div id="progress-bar" class="progress-bar"></div>
			</div>

		</article>
		`;
} 
			
if (type === "stories") {
	document.querySelector("#reader-main").innerHTML = `
		<article id="reader" class="frame theme-default" aria-labelledby="chapter-title">
			<header class="chapter-header">
				<h1 id="chapter-title">Loading…</h1>
			</header>

			<div id="chapter-content" class="content" aria-label="Chapter content" tabindex="0">
				<!-- injected content -->
			</div>

			<div class="progress" aria-hidden="true">
				<div id="progress-bar" class="progress-bar" role="progressbar" aria-hidden="true"></div>
			</div>
		</article>
		`;
}