export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f2eee6",
            dot: "rgba(111,81,43,.24)",
            line: "rgba(111,81,43,.11)",
            selectionStroke: "#8a6333",
            selectionFill: "rgba(138,99,51,.08)",
        },
        node: {
            label: "#675b4b",
            fill: "#e9e3d8",
            panel: "#fbf8f2",
            stroke: "#d0c4b3",
            activeStroke: "#9c7036",
            placeholder: "#8b7d6b",
            text: "#26211b",
            muted: "#756957",
            faint: "#aaa08f",
        },
        toolbar: {
            panel: "rgba(250,247,241,.94)",
            border: "rgba(126,96,56,.26)",
            item: "#675b4b",
            itemHover: "rgba(156,112,54,.10)",
            activeBg: "rgba(156,112,54,.14)",
            activeText: "#7d5527",
        },
    },
    dark: {
        canvas: {
            background: "#0d0f0e",
            dot: "rgba(211,178,119,.20)",
            line: "rgba(211,178,119,.085)",
            selectionStroke: "#d5ad68",
            selectionFill: "rgba(213,173,104,.10)",
        },
        node: {
            label: "#cec5b7",
            fill: "#171816",
            panel: "#151614",
            stroke: "rgba(205,177,128,.24)",
            activeStroke: "#d8b270",
            placeholder: "#8e877c",
            text: "#f2ede4",
            muted: "#b6aa98",
            faint: "#716b62",
        },
        toolbar: {
            panel: "rgba(20,20,18,.92)",
            border: "rgba(205,177,128,.25)",
            item: "#cfc6b7",
            itemHover: "rgba(216,178,112,.10)",
            activeBg: "rgba(216,178,112,.14)",
            activeText: "#e1bd7b",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
