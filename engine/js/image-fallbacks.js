// Capture image failures before asynchronously rendered Archive cards arrive.
document.addEventListener("error", event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.fallbackSrc || image.dataset.fallbackAttempted === "true") return;
    let fallback;
    try { fallback = new URL(image.dataset.fallbackSrc, document.baseURI); } catch { return; }
    if (fallback.origin !== location.origin || !["http:", "https:"].includes(fallback.protocol)) return;
    image.dataset.fallbackAttempted = "true";
    if (image.src !== fallback.href) image.src = fallback.href;
}, true);
