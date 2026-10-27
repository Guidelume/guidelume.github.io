// Run in the head so managed guide covers never paint their redundant top bar.
// Visibility preserves the header's layout box and the cover's existing geometry.
(() => {
    let embedded = false;
    try {
        const frame = window.frameElement;
        embedded = Boolean(frame?.closest(".setup-window[data-window]")
            && frame.ownerDocument.querySelector(".setup-page"));
    } catch {
        // Unrelated or cross-origin embeds keep standalone navigation.
    }
    document.documentElement.toggleAttribute("data-guidelume-embedded", embedded);
    if (!embedded) return;
    const markHeader = () => document.querySelectorAll("[data-guide-header]").forEach(header => {
        header.inert = true;
        header.setAttribute("aria-hidden", "true");
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", markHeader, { once: true });
    else markHeader();
})();
