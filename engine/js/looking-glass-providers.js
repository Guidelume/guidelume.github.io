const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

function parseStart(value) {
    if (!value) return 0;
    if (/^\d+$/.test(value)) return Math.min(Number(value), 359999);
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    return match ? Math.min(Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0), 359999) : 0;
}

const youtube = Object.freeze({
    id: "youtube",
    resolve(url) {
        const host = url.hostname.toLowerCase();
        const path = url.pathname.split("/").filter(Boolean);
        let id;
        if (["youtu.be", "www.youtu.be"].includes(host) && path.length === 1) id = path[0];
        else if (youtubeHosts.has(host)) {
            if (url.pathname === "/watch") id = url.searchParams.get("v");
            else if (["shorts", "live", "embed"].includes(path[0]) && path.length === 2) id = path[1];
        } else if (["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)
            && path[0] === "embed" && path.length === 2) id = path[1];
        if (!videoIdPattern.test(id || "")) return null;
        const start = parseStart(url.searchParams.get("t") || url.searchParams.get("start")
            || new URLSearchParams(url.hash.slice(1)).get("t"));
        const externalUrl = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;
        return {
            provider: "youtube", id, externalUrl,
            embedUrl: `https://www.youtube.com/embed/${id}?autoplay=0&playsinline=1${start ? `&start=${start}` : ""}`
        };
    }
});

// A provider owns recognition, identifier validation, and both destination URLs.
// The interface and bookmark library only consume this.
export const lookingGlassProviders = Object.freeze([youtube]);

export function resolveLookingGlassUrl(value, expectedProvider) {
    if (typeof value !== "string" || value.length > 2048) return null;
    let input = value.trim();
    if (/^(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(input)) input = `https://${input}`;
    let url;
    try { url = new URL(input); } catch { return null; }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    for (const provider of lookingGlassProviders) {
        if (expectedProvider !== undefined && provider.id !== expectedProvider) continue;
        const result = provider.resolve(url);
        if (result) return result;
    }
    return null;
}
