import { expect, test } from "bun:test";

import { buildMiniMaxH3Content, isMiniMaxH3Request, miniMaxH3ApiBaseUrl } from "../src/services/api/minimax-h3";

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
