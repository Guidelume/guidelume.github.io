/* ---------------- Utilities & prefs ---------------- */
const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORAGE_PREFIX = 'varkorax_v1_';
const POS_KEY = (owner) => `${STORAGE_PREFIX}winpos_${owner}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let zTop = 10010;

function saveExpanded(key, expanded) {
	if (expanded === undefined) expanded = false;
	try {
		localStorage.setItem(STORAGE_PREFIX + 'expanded_' + key, expanded ? '1' : '0');
	} catch (e) { }
}
function loadExpanded(key) {
	try {
		return localStorage.getItem(STORAGE_PREFIX + 'expanded_' + key) === '1';
	} catch (e) { return false; }
}

/* ---------------- Rain ---------------- */
const canvas = document.getElementById('rain');
const ctx = canvas.getContext('2d', { alpha: true });
let W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
	W = canvas.width = window.innerWidth;
	H = canvas.height = window.innerHeight;
	repositionAllWindows();
	updateExclusionRects();
});

const streaks = [];
const MAX_ACTIVE = 28;
const SPAWN_CHANCE = 0.028;

function spawnStreak() {
	if (streaks.length >= MAX_ACTIVE) return;
	streaks.push({
		x: Math.random() * W,
		y: -8 - Math.random() * 80,
		speed: 4 + Math.random() * 4,
		length: 3 + Math.floor(Math.random() * 6),
		drift: (Math.random() - 0.5) * 1.2,
		baseAlpha: 0.09 + Math.random() * 0.16,
		fontSize: 12 + Math.random() * 8,
		life: 0
	});
}

let exclusionRects = [];
function updateExclusionRects() {
	exclusionRects = [];
	const selectors = ['.project', '.window', '.expanded'];
	selectors.forEach(sel => {
		document.querySelectorAll(sel).forEach(el => {
			const style = window.getComputedStyle(el);
			if (style.display === 'none' || style.visibility === 'hidden') return;
			const r = el.getBoundingClientRect();
			exclusionRects.push({
				left: Math.max(0, Math.floor(r.left)),
				top: Math.max(0, Math.floor(r.top)),
				right: Math.min(W, Math.ceil(r.right)),
				bottom: Math.min(H, Math.ceil(r.bottom))
			});
		});
	});
}
updateExclusionRects();
setInterval(updateExclusionRects, 350);

function isExcluded(x, y) {
	for (let i = 0; i < exclusionRects.length; i++) {
		const r = exclusionRects[i];
		if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
	}
	return false;
}

ctx.textBaseline = 'top';
ctx.globalCompositeOperation = 'source-over';
if (!prefersReduced) requestAnimationFrame(drawRain);

function drawRain() {
	ctx.clearRect(0, 0, W, H);
	if (Math.random() < SPAWN_CHANCE) spawnStreak();

	for (let i = streaks.length - 1; i >= 0; i--) {
		const s = streaks[i];
		for (let j = 0; j < s.length; j++) {
			const px = Math.round(s.x + j * 0.2 + s.drift * j * 0.25);
			const py = Math.round(s.y - j * (s.fontSize * 0.95));
			if (py < -120 || py > H + 120) continue;
			if (isExcluded(px, py)) continue;

			const alpha = s.baseAlpha * (1 - (j / s.length) * 0.85);
			ctx.globalAlpha = alpha;
			ctx.font = `${Math.round(s.fontSize)}px monospace`;
			const bit = Math.random() > 0.5 ? '1' : '0';
			ctx.fillStyle = `rgba(22, ${140 + Math.floor(Math.random() * 40)}, ${120 + Math.floor(Math.random() * 20)}, 1)`;

			if (j === 0) {
				ctx.shadowColor = 'rgba(0,170,150,0.6)';
				ctx.shadowBlur = 4;
			} else {
				ctx.shadowColor = 'transparent';
				ctx.shadowBlur = 0;
			}
			ctx.fillText(bit, px, py);
		}

		s.y += s.speed;
		s.x += s.drift;
		s.life++;
		if (s.y - s.length * s.fontSize > H + 120 || s.life > 260) streaks.splice(i, 1);
	}

	ctx.globalAlpha = 1;
	ctx.shadowBlur = 0;
	if (!prefersReduced) requestAnimationFrame(drawRain);
}

/* ---------------- header / jitter / bounce ---------------- */
const vText = document.getElementById('varkorax');
const fullText = "Varkorax";
let idx = fullText.length;
let typingForward = false;

if (!prefersReduced) setInterval(() => {
	if (Math.random() < 0.06) typingForward = !typingForward;
	if (typingForward) idx = Math.min(fullText.length, idx + 1);
	else idx = Math.max(3, idx - 1);
	vText.textContent = fullText.slice(0, idx);
}, 240);

if (!prefersReduced) {
	setInterval(() => {
		if (Math.random() < 0.12) {
			const orig = vText.textContent;
			vText.textContent = 'Var';
			vText.classList.add('bounce-brief');
			setTimeout(() => {
				vText.classList.remove('bounce-brief');
				vText.textContent = fullText.slice(0, Math.max(3, idx));
				setTimeout(() => {
					vText.textContent = fullText;
					idx = fullText.length;
				}, 260);
			}, 620);
		}
	}, 4200);
}

const crt = document.getElementById('crt');
if (!prefersReduced) {
	(function jitter() {
		const x = (Math.random() * 2 - 1) * 0.7;
		const y = (Math.random() * 2 - 1) * 0.7;
		crt.style.transform = `translate(${x}px, ${y}px)`;
		setTimeout(() => { crt.style.transform = 'translate(0,0)'; }, 120 + Math.random() * 160);
		setTimeout(jitter, 800 + Math.random() * 2200);
	})();
}

/* ---------------- Project wheel ---------------- */
const projectEls = Array.from(document.querySelectorAll('.project'));
const projectMap = new Map();
projectEls.forEach(proj => {
	const key = proj.dataset.key;
	const win = proj.querySelector('.window');
	const expanded = proj.querySelector('.expanded');
	projectMap.set(key, { proj, win, expanded });
});

let currentIndex = 0;
function showProjectAt(idx) {
	currentIndex = (idx % projectEls.length + projectEls.length) % projectEls.length;
	projectEls.forEach((p, i) => {
		if (i === currentIndex) {
			p.style.display = '';
			p.classList.remove('hidden');
			p.tabIndex = 0;
		} else {
			p.style.display = 'none';
			p.classList.add('hidden');
			p.tabIndex = -1;
		}
	});
	updateExclusionRects();
	const visible = projectEls[currentIndex];
	if (visible) visible.focus();
}
showProjectAt(0);

const navUp = document.getElementById('navUp');
const navDown = document.getElementById('navDown');
navUp.addEventListener('click', () => showProjectAt(currentIndex - 1));
navDown.addEventListener('click', () => showProjectAt(currentIndex + 1));

window.addEventListener('keydown', (e) => {
	if (e.key === 'ArrowUp') { e.preventDefault(); showProjectAt(currentIndex - 1); }
	if (e.key === 'ArrowDown') { e.preventDefault(); showProjectAt(currentIndex + 1); }
	if (e.key === 'Escape') {
		closeAllWindows();
		document.getElementById('allProjects').style.display = 'none';
		document.getElementById('allProjects').setAttribute('aria-hidden', 'true');
		updateExclusionRects();
	}
});

/* ---------------- Window system ---------------- */
function detachToBody(el) {
	if (!el) return;
	if (!el.dataset.__detached) {
		el.dataset.__detached = '1';
		document.body.appendChild(el);
	} else {
		if (el.parentElement !== document.body) document.body.appendChild(el);
	}
}

function applyStoredPosition(el, owner) {
	try {
		const raw = sessionStorage.getItem(POS_KEY(owner));
		if (!raw) return false;
		const pos = JSON.parse(raw);
		const centerX = window.innerWidth / 2;
		const centerY = window.innerHeight / 2;
		const left = Math.round(centerX + pos.dx);
		const top = Math.round(centerY + pos.dy);
		el.style.position = 'fixed';
		el.style.left = `${left}px`;
		el.style.top = `${top}px`;
		el.style.transform = 'translate(0,0)';
		return true;
	} catch (e) { return false; }
}

function centerAndStoreRelative(el, owner) {
	el.style.position = 'fixed';
	el.style.left = `50%`;
	el.style.top = `50%`;
	const rx = smallRandomOffset(12);
	const ry = smallRandomOffset(8);
	el.style.transform = `translate(-50%,-50%) translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;
	requestAnimationFrame(() => {
		const rect = el.getBoundingClientRect();
		const left = rect.left;
		const top = rect.top;
		el.style.left = `${Math.round(left)}px`;
		el.style.top = `${Math.round(top)}px`;
		el.style.transform = `translate(0,0)`;
		try {
			const centerX = window.innerWidth / 2;
			const centerY = window.innerHeight / 2;
			const dx = Math.round(left - centerX);
			const dy = Math.round(top - centerY);
			if (owner) sessionStorage.setItem(POS_KEY(owner), JSON.stringify({ dx, dy }));
		} catch (e) { }
	});
}

function repositionAllWindows() {
	document.querySelectorAll('.window, .expanded').forEach(el => {
		const owner = el.dataset.owner || el.id || '';
		if (!owner) return;
		try {
			const raw = sessionStorage.getItem(POS_KEY(owner));
			if (!raw) return;
			const pos = JSON.parse(raw);
			const centerX = window.innerWidth / 2;
			const centerY = window.innerHeight / 2;
			const left = Math.round(centerX + pos.dx);
			const top = Math.round(centerY + pos.dy);
			el.style.position = 'fixed';
			el.style.left = `${left}px`;
			el.style.top = `${top}px`;
			el.style.transform = 'translate(0,0)';
		} catch (e) { }
	});
}

function smallRandomOffset(range = 18) {
	return (Math.random() - 0.5) * range * 2;
}

function bringToFront(el) {
	if (!el) return;
	el.style.zIndex = ++zTop;
	document.querySelectorAll('.window, .expanded').forEach(w => w.classList.remove('window-focused'));
	el.classList.add('window-focused');
}

function makeDraggable(el) {
	if (!el) return;
	const title = el.querySelector('.titlebar');
	if (!title) return;

	let dragging = false;
	let offsetX = 0, offsetY = 0;
	const owner = el.dataset.owner || el.id || '';

	function onDown(e) {
		if (e.type === 'mousedown' && e.button !== 0) return;
		const clientX = e.touches ? e.touches[0].clientX : e.clientX;
		const clientY = e.touches ? e.touches[0].clientY : e.clientY;
		const rect = el.getBoundingClientRect();
		el.style.left = `${rect.left}px`;
		el.style.top = `${rect.top}px`;
		el.style.transform = 'translate(0,0)';
		offsetX = clientX - rect.left;
		offsetY = clientY - rect.top;
		dragging = true;
		bringToFront(el);
		document.body.style.userSelect = 'none';
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		window.addEventListener('touchmove', onMove, { passive: false });
		window.addEventListener('touchend', onUp);
	}

	function onMove(e) {
		if (!dragging) return;
		e.preventDefault();
		const clientX = e.touches ? e.touches[0].clientX : e.clientX;
		const clientY = e.touches ? e.touches[0].clientY : e.clientY;
		let nx = clientX - offsetX;
		let ny = clientY - offsetY;
		const bw = el.offsetWidth, bh = el.offsetHeight;
		nx = clamp(nx, 8 - bw + 16, window.innerWidth - 8 - 16);
		ny = clamp(ny, 8, window.innerHeight - bh - 8);
		el.style.left = `${Math.round(nx)}px`;
		el.style.top = `${Math.round(ny)}px`;
	}

	function onUp() {
		if (!dragging) return;
		dragging = false;
		document.body.style.userSelect = '';
		window.removeEventListener('mousemove', onMove);
		window.removeEventListener('mouseup', onUp);
		window.removeEventListener('touchmove', onMove);
		window.removeEventListener('touchend', onUp);
		try {
			const left = parseInt(el.style.left || el.getBoundingClientRect().left, 10);
			const top = parseInt(el.style.top || el.getBoundingClientRect().top, 10);
			const centerX = window.innerWidth / 2;
			const centerY = window.innerHeight / 2;
			const dx = Math.round(left - centerX);
			const dy = Math.round(top - centerY);
			if (owner) sessionStorage.setItem(POS_KEY(owner), JSON.stringify({ dx, dy }));
		} catch (e) { }
	}

	title.addEventListener('mousedown', onDown);
	title.addEventListener('touchstart', onDown, { passive: false });

	el.addEventListener('mousedown', (ev) => { bringToFront(el); });
	el.addEventListener('touchstart', (ev) => { bringToFront(el); }, { passive: true });
}

/* mapping */
const pageMap = {
	'my-site': 'my-site/index.html',
	'milky-way-bar-crawl': 'milky-way-bar-crawl/index.html'
};

// returns the first sensible focusable inside `el`
function findFirstFocusable(el) {
	return el && el.querySelector && el.querySelector(
		'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
	);
}
function safeFocus(el) {
	try { if (el && typeof el.focus === 'function') el.focus(); } catch (e) { }
}

function showWindowForProjectKey(key, opts = { expanded: true }) {
	const entry = projectMap.get(key); if (!entry) return;
	const { win, expanded } = entry;
	const target = expanded || win;
	if (!target) return;

	// store the element that triggered/opened this dialog so we can restore focus later
	target.__opener = document.activeElement;

	detachToBody(target);
	target.style.display = 'block';
	// mark visible for assistive tech
	target.setAttribute('aria-hidden', 'false');
	if (!target.dataset.owner) target.dataset.owner = key;
	const owner = target.dataset.owner || key;

	const applied = applyStoredPosition(target, owner);
	if (!applied) centerAndStoreRelative(target, owner);
	makeDraggable(target);
	bringToFront(target);
	updateExclusionRects();

	// focus first focusable inside the dialog (or the dialog itself) after making visible
	const focusable = findFirstFocusable(target);
	// small timeout helps some screenreaders notice the DOM change first
	setTimeout(() => {
		if (focusable) safeFocus(focusable);
		else safeFocus(target);
	}, 10);
}

function closeWindowEl(el) {
	if (!el) return;

	// try to return focus to the opener first, otherwise a visible project or body
	const opener = el.__opener;
	const fallback = document.querySelector('.project:not(.hidden)') || document.body;

	try {
		if (opener && typeof opener.focus === 'function') opener.focus();
		else safeFocus(fallback);
	} catch (e) { /* ignore */ }

	// now hide the element for assistive tech
	el.style.display = 'none';
	el.setAttribute('aria-hidden', 'true');
	el.classList.remove('window-focused');
	updateExclusionRects();

	// cleanup
	try { delete el.__opener; } catch (e) { }
}

function closeAllWindows() {
	document.querySelectorAll('.window, .expanded').forEach(w => {
		w.style.display = 'none';
		w.setAttribute('aria-hidden', 'true');
		w.classList.remove('window-focused');
	});
	updateExclusionRects();
}

/* ---------------- project wiring ---------------- */
projectMap.forEach(({ proj, win, expanded }, key) => {
	proj.addEventListener('click', (e) => { if (e.target.closest('.btn-close') || e.target.closest('.open-btn')) return; showProjectForClick(key); });
	proj.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showProjectForClick(key); }
		if (e.key === 'Escape') { closeAllWindows(); }
	});

	const closeBtn = proj.querySelector('.btn-close');
	if (closeBtn) {
		closeBtn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			if (win) { closeWindowEl(win); }
			if (expanded) { closeWindowEl(expanded); }
		});
	}

	const openBtn = proj.querySelector('[data-owner-open]');
	if (openBtn) {
		openBtn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			const targetHref = pageMap[key];
			if (targetHref) {
				window.open(targetHref, '_blank');
			} else {
				showWindowForProjectKey(key, { expanded: true });
			}
		});
	}
});

function showProjectForClick(key) {
	const idx = projectEls.findIndex(p => p.dataset.key === key);
	if (idx >= 0) showProjectAt(idx);
	showWindowForProjectKey(key, { expanded: true });
}

/* ---------------- All Projects modal + buttons ---------------- */
const allProjectsBtn = document.getElementById('projectsWheelBtn');
const allProjectsModal = document.getElementById('allProjects');
const allProjectsList = document.getElementById('allProjectsList');
const closeAllProjectsBtn = document.getElementById('closeAllProjects');

function populateAllProjects() {
	allProjectsList.innerHTML = '';
	projectEls.forEach((p, i) => {
		const key = p.dataset.key;
		const title = p.querySelector('.project-title')?.textContent || key;
		const meta = p.querySelector('.meta')?.textContent || '';
		const row = document.createElement('div');
		row.style.display = 'flex';
		row.style.justifyContent = 'space-between';
		row.style.alignItems = 'center';
		row.style.gap = '12px';
		row.style.padding = '6px';
		row.style.borderTop = '1px solid rgba(255,255,255,0.02)';
		row.innerHTML = `<div><strong style="display:block">${title}</strong><small style="opacity:.85">${meta}</small></div>`;
		const btnWrap = document.createElement('div'); btnWrap.style.display = 'flex'; btnWrap.style.gap = '8px';
		const openBtn = document.createElement('button'); openBtn.textContent = 'Open'; openBtn.className = 'footer-btn';
		openBtn.addEventListener('click', () => {
			showProjectAt(i);
			const page = pageMap[p.dataset.key];
			if (page) { window.open(page, '_blank'); } else {
				showWindowForProjectKey(p.dataset.key, { expanded: true });
			}
		});
		btnWrap.appendChild(openBtn);
		row.appendChild(btnWrap);
		allProjectsList.appendChild(row);
	});
}

allProjectsBtn.addEventListener('click', () => {
	populateAllProjects();
	detachToBody(allProjectsModal);
	allProjectsModal.style.display = 'block';
	allProjectsModal.setAttribute('aria-hidden', 'false');
	allProjectsModal.dataset.owner = 'allProjects';
	const applied = applyStoredPosition(allProjectsModal, 'allProjects');
	if (!applied) centerAndStoreRelative(allProjectsModal, 'allProjects');
	makeDraggable(allProjectsModal);
	bringToFront(allProjectsModal);
	updateExclusionRects();
});
closeAllProjectsBtn.addEventListener('click', () => {
	allProjectsModal.style.display = 'none';
	allProjectsModal.setAttribute('aria-hidden', 'true');
	updateExclusionRects();
});

/* ---------------- Credits window ---------------- */
(function createCreditsWindow() {
	const creditsKey = 'credits';
	const creditsWindow = document.createElement('div');
	creditsWindow.className = 'expanded win-vertical';
	creditsWindow.dataset.owner = creditsKey;
	creditsWindow.setAttribute('aria-hidden', 'true');
	creditsWindow.style.display = 'none';
	creditsWindow.innerHTML = `
		<div class="titlebar"><div class="t-left"><span class="title-icon"></span><span style="margin-left:8px">Credits</span></div><div class="t-right"><button class="btn-close" title="Close" aria-label="Close">✕</button></div></div>
		<div class="win-shell">
			<div class="win-content">
				<strong>Varkorax Project Hub</strong>
				<p style="margin-top:8px; color:rgba(255,186,96,0.85)">Created by Me — UI experiments & projects.</p>
				<p style="margin-top:6px; font-size:11px; color:rgba(255,186,96,0.75)">This window is position-persistent for the session.</p>
			</div>
		</div>
	`;
	document.body.appendChild(creditsWindow);
	projectMap.set(creditsKey, { proj: null, win: null, expanded: creditsWindow });

	const creditsBtn = document.getElementById('creditsBtn');
	if (creditsBtn) {
		creditsBtn.addEventListener('click', (e) => {
			e.preventDefault();
			showWindowForProjectKey(creditsKey, { expanded: true });
		});
	}

	creditsWindow.querySelector('.btn-close').addEventListener('click', (ev) => { ev.stopPropagation(); creditsWindow.style.display = 'none'; creditsWindow.setAttribute('aria-hidden', 'true'); });
})();
 
/* ---------------- close-button delegation ---------------- */
document.addEventListener('click', (e) => {
	if (e.target.classList && e.target.classList.contains('btn-close')) {
		const ownerEl = e.target.closest('[data-owner]') || e.target.closest('.expanded') || e.target.closest('#allProjects');
		if (ownerEl) {
			closeWindowEl(ownerEl);
		}
	}
});

/* ---------------- keep exclusion rects fresh ---------------- */
const projectRoot = document.getElementById('projects');
const mo = new MutationObserver(() => updateExclusionRects());
mo.observe(projectRoot, { attributes: true, childList: true, subtree: true });
window.addEventListener('scroll', updateExclusionRects, { passive: true });

/* initial focus */
if (projectEls[0]) projectEls[0].focus();

console.log('Hub initialized...');

document.getElementById('blueskyBtn').addEventListener('click', ()=>{
  window.open('https://bsky.app/profile/varkorax.bsky.social', '_blank');
});

function setFaviconForDialogImg(target, faviconUrl = 'custom/favicon.svg'){
  if (!target) return;
  const titleIcon = target.querySelector('.title-icon');
  if (!titleIcon) return;

  let img = titleIcon.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    titleIcon.appendChild(img);
  }
  img.src = faviconUrl;
  titleIcon.setAttribute('aria-hidden','true');
}

// patch showWindowForProjectKey
if (typeof showWindowForProjectKey === 'function') {
  const _origShow = showWindowForProjectKey;
  showWindowForProjectKey = function(key, opts){
    _origShow.call(this, key, opts);
    const entry = projectMap.get(key);
    const target = entry && (entry.expanded || entry.win);
    if (target) setFaviconForDialogImg(target, 'custom/favicon.svg');
  };
}
