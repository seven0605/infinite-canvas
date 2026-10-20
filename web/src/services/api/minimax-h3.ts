export type MiniMaxH3Content =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string }; role: "first_frame" | "last_frame" | "reference_image" }
    | { type: "video_url"; video_url: { url: string }; role: "reference_video" }
    | { type: "audio_url"; audio_url: { url: string }; role: "reference_audio" };

export function isMiniMaxH3Request(baseUrl: string, model: string) {
    if (!/^minimax-h3$/i.test(model.trim())) return false;
    try {
        const url = new URL(baseUrl.trim());
        const host = url.hostname.toLowerCase();
        const path = url.pathname.replace(/\/+$/, "").toLowerCase();
        if (host === "metaso.cn" || host.endsWith(".metaso.cn")) return path === "/api/openai" || path.startsWith("/api/openai/");
        return host === "api.minimax.io" || host === "api.minimaxi.com";
    } catch {
        return false;
    }
}

export function miniMaxH3ApiBaseUrl(baseUrl: string) {
    const url = new URL(baseUrl.trim());
    const host = url.hostname.toLowerCase();
    if (host === "metaso.cn" || host.endsWith(".metaso.cn")) return `${url.origin}/api/minimax/v2`;
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${/\/v2$/i.test(normalizedPath) ? normalizedPath : "/v2"}`;
}

export function buildMiniMaxH3Content(prompt: string, images: string[], videos: string[], audios: string[], mode: string): MiniMaxH3Content[] {
    const content: MiniMaxH3Content[] = [{ type: "text", text: prompt }];
    const referenceMode = mode === "reference" || videos.length > 0 || audios.length > 0;
    if (referenceMode) {
        images.forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
        videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
        audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
        return content;
    }
    if (images[0]) content.push({ type: "image_url", image_url: { url: images[0] }, role: "first_frame" });
    if (images[1]) content.push({ type: "image_url", image_url: { url: images[1] }, role: "last_frame" });
    return content;
}

export function miniMaxH3Resolution(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "2k") return "2K";
    if (/^1080p?$/.test(normalized)) return "1080P";
    return "768P";
}

export function miniMaxH3ResolutionValue(value: string) {
    const resolution = miniMaxH3Resolution(value);
    if (resolution === "2K") return "2k";
    if (resolution === "1080P") return "1080";
    return "768";
}

export function normalizeMiniMaxH3DataUrl(value: string) {
    const match = value.match(/^data:([^;,]+)((?:;[^;,]+)*)?;base64,([\s\S]*)$/i);
    return match ? `data:${match[1]};base64,${match[3]}` : value;
}
