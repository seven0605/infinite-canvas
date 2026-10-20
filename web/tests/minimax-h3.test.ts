import { expect, test } from "bun:test";

import { videoResolutionApiValue } from "../src/lib/media-size";
import { buildMiniMaxH3Content, isMiniMaxH3Request, miniMaxH3ApiBaseUrl, miniMaxH3Resolution, miniMaxH3ResolutionValue, normalizeMiniMaxH3DataUrl } from "../src/services/api/minimax-h3";
import { shouldSampleMiniMaxH3ReferenceVideos } from "../src/services/api/minimax-h3-media";

test("keeps first and last frame roles in frame mode", () => {
    expect(buildMiniMaxH3Content("prompt", ["first", "last", "ignored"], [], [], "frames")).toEqual([
        { type: "text", text: "prompt" },
        { type: "image_url", image_url: { url: "first" }, role: "first_frame" },
        { type: "image_url", image_url: { url: "last" }, role: "last_frame" },
    ]);
});

test("uses H3 omni-reference roles for every connected media type", () => {
    expect(buildMiniMaxH3Content("prompt", ["image"], ["video"], ["audio"], "reference")).toEqual([
        { type: "text", text: "prompt" },
        { type: "image_url", image_url: { url: "image" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "video" }, role: "reference_video" },
        { type: "audio_url", audio_url: { url: "audio" }, role: "reference_audio" },
    ]);
});

test("forces omni-reference mode when video or audio is connected", () => {
    expect(buildMiniMaxH3Content("prompt", ["image"], ["video"], [], "frames")[1]).toEqual({ type: "image_url", image_url: { url: "image" }, role: "reference_image" });
    expect(buildMiniMaxH3Content("prompt", ["image"], [], ["audio"], "frames")[1]).toEqual({ type: "image_url", image_url: { url: "image" }, role: "reference_image" });
});

test("routes Metaso OpenAI channels to the native MiniMax V2 endpoint", () => {
    expect(isMiniMaxH3Request("https://metaso.cn/api/openai", "MiniMax-H3")).toBe(true);
    expect(miniMaxH3ApiBaseUrl("https://metaso.cn/api/openai")).toBe("https://metaso.cn/api/minimax/v2");
});

test("keeps the MiniMax H3 resolution tiers distinct", () => {
    expect(miniMaxH3Resolution("480p")).toBe("768P");
    expect(miniMaxH3Resolution("720p")).toBe("768P");
    expect(miniMaxH3Resolution("1080p")).toBe("1080P");
    expect(miniMaxH3Resolution("2K")).toBe("2K");
    expect(miniMaxH3ResolutionValue("1080")).toBe("1080");
    expect(miniMaxH3ResolutionValue("2k")).toBe("2k");
});

test("keeps general video API resolution tiers distinct", () => {
    expect(videoResolutionApiValue("480")).toBe("480p");
    expect(videoResolutionApiValue("720")).toBe("720p");
    expect(videoResolutionApiValue("1080")).toBe("1080p");
    expect(videoResolutionApiValue("2k")).toBe("2K");
});

test("removes MIME parameters from H3 base64 media data URLs", () => {
    expect(normalizeMiniMaxH3DataUrl("data:video/mp4;charset=utf-8;base64,AAAA")).toBe("data:video/mp4;base64,AAAA");
    expect(normalizeMiniMaxH3DataUrl("data:audio/mpeg;codecs=mp3;base64,BBBB")).toBe("data:audio/mpeg;base64,BBBB");
    expect(normalizeMiniMaxH3DataUrl("blob:http://localhost/video")).toBe("blob:http://localhost/video");
});

test("uses storyboard fallback for H3 reference videos over the input-duration budget", () => {
    expect(shouldSampleMiniMaxH3ReferenceVideos([30_675])).toBe(true);
    expect(shouldSampleMiniMaxH3ReferenceVideos([10_000, 10_000])).toBe(true);
});

test("keeps H3 reference videos when their combined duration fits", () => {
    expect(shouldSampleMiniMaxH3ReferenceVideos([6_000, 9_000])).toBe(false);
    expect(shouldSampleMiniMaxH3ReferenceVideos([15_083])).toBe(false);
});
