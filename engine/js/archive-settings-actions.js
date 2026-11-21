// Explicit event listeners keep the settings pages compatible with strict CSP.
document.querySelectorAll("[data-archive-mode]").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.archiveMode || null));
});
document.querySelectorAll("[data-clear-local-preferences]").forEach(button => {
    button.addEventListener("click", () => { try { localStorage.clear(); } catch { /* Storage may be unavailable. */ } });
});
