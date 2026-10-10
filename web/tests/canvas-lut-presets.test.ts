import { expect, test } from "bun:test";

import { appendCanvasLutPrompt, CANVAS_LUT_PRESETS, getCanvasLutPreviewPalette, getCanvasLutPreviewUrl } from "../src/lib/canvas/canvas-lut-presets";

test("loads every non-empty LUT row from both workbooks", () => {
    expect(CANVAS_LUT_PRESETS).toHaveLength(52);
    expect(CANVAS_LUT_PRESETS.filter((preset) => preset.collection === "guofeng")).toHaveLength(23);
    expect(CANVAS_LUT_PRESETS.filter((preset) => preset.collection === "cinema")).toHaveLength(29);
});

test("uses workbook stills when available and creates tonal previews for missing stills", () => {
    expect(CANVAS_LUT_PRESETS.filter((preset) => getCanvasLutPreviewUrl(preset.id))).toHaveLength(31);
    expect(getCanvasLutPreviewUrl("cinema-13")).toBe("/lut-previews/cinema-13.jpg");
    expect(getCanvasLutPreviewUrl("guofeng-28")).toBeUndefined();
    expect(getCanvasLutPreviewPalette(CANVAS_LUT_PRESETS.find((preset) => preset.id === "guofeng-28")!).sky).toBe("#93abb0");
});

test("appends image color grading without changing scene content", () => {
    const prompt = appendCanvasLutPrompt("一名剑客站在雪山之巅", "cinema-118", "image");
    expect(prompt).toContain("Color grading LUT requirements:");
    expect(prompt).toContain("镖人雪山对决场景");
    expect(prompt).toContain("Preserve the requested subjects");
});

test("adds temporal color consistency only for video and never duplicates the LUT block", () => {
    const once = appendCanvasLutPrompt("镜头跟随人物穿过客栈", "cinema-116", "video");
    const twice = appendCanvasLutPrompt(once, "cinema-116", "video");
    expect(once).toContain("every frame without flicker");
    expect(twice).toBe(once);
});

test("replaces or removes an existing LUT block when the selection changes", () => {
    const first = appendCanvasLutPrompt("原始提示词", "cinema-13");
    const replaced = appendCanvasLutPrompt(first, "guofeng-28");
    expect(replaced).toContain("琅琊榜（水墨山水）");
    expect(replaced).not.toContain("奥本海默");
    expect(appendCanvasLutPrompt(replaced, undefined)).toBe("原始提示词");
});

test("leaves clean prompts unchanged when no valid LUT is selected", () => {
    expect(appendCanvasLutPrompt("原始提示词", undefined)).toBe("原始提示词");
    expect(appendCanvasLutPrompt("原始提示词", "missing")).toBe("原始提示词");
});
