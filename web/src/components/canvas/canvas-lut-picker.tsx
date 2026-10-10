import { useMemo, useState } from "react";
import { Check, Palette, Search, X } from "lucide-react";
import { Button, Input, Modal, Segmented } from "antd";
import { useTranslation } from "react-i18next";

import {
    CANVAS_LUT_PRESETS,
    getCanvasLutPreset,
    getCanvasLutPreviewPalette,
    getCanvasLutPreviewUrl,
    type CanvasLutCollection,
    type CanvasLutPreset,
} from "@/lib/canvas/canvas-lut-presets";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasLutPickerProps = {
    value?: string;
    onChange: (presetId: string | undefined) => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
};

type LutFilter = "all" | CanvasLutCollection;

function CanvasLutPreview({ preset }: { preset: CanvasLutPreset }) {
    const previewUrl = getCanvasLutPreviewUrl(preset.id);
    if (previewUrl) {
        return <img src={previewUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />;
    }

    const palette = getCanvasLutPreviewPalette(preset);
    return (
        <span className="relative block size-full overflow-hidden" style={{ background: `linear-gradient(180deg, ${palette.sky}, ${palette.haze} 56%, ${palette.ground} 57%)`, filter: palette.filter }}>
            <span className="absolute left-[13%] top-[18%] size-[18%] rounded-full blur-[1px]" style={{ background: palette.accent, boxShadow: `0 0 22px ${palette.accent}` }} />
            <span className="absolute inset-x-[-8%] bottom-[22%] h-[48%] opacity-80" style={{ background: palette.shadow, clipPath: "polygon(0 100%, 18% 43%, 33% 72%, 49% 22%, 66% 68%, 82% 35%, 100% 100%)" }} />
            <span className="absolute inset-x-0 bottom-0 h-[35%]" style={{ background: `linear-gradient(160deg, ${palette.ground}, ${palette.shadow})` }} />
            <span className="absolute bottom-[12%] left-[54%] h-[45%] w-[5%] rounded-t-full" style={{ background: palette.shadow }} />
            <span className="absolute bottom-[40%] left-[52.4%] size-[8%] rounded-full" style={{ background: palette.shadow }} />
            {palette.grain ? <span className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 120 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")" }} /> : null}
        </span>
    );
}

export function CanvasLutPicker({ value, onChange, onOpenChange, buttonClassName }: CanvasLutPickerProps) {
    const { t, i18n } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [filter, setFilter] = useState<LutFilter>("all");
    const selected = getCanvasLutPreset(value);
    const isChinese = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;

    const filteredPresets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return CANVAS_LUT_PRESETS.filter((preset) => {
            if (filter !== "all" && preset.collection !== filter) return false;
            if (!query) return true;
            return `${preset.nameZh}\n${preset.nameEn}\n${preset.promptZh}`.toLowerCase().includes(query);
        });
    }, [filter, keyword]);

    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
            setKeyword("");
            setFilter("all");
        }
        onOpenChange?.(nextOpen);
    };

    const selectPreset = (presetId: string | undefined) => {
        onChange(presetId);
        updateOpen(false);
    };

    return (
        <>
            <Button
                size="small"
                type="text"
                className={buttonClassName || "!h-10 !max-w-[150px] !justify-start !rounded-full !px-3"}
                style={{ background: theme.node.fill, color: theme.node.text }}
                icon={<Palette className="size-3.5" />}
                aria-label={t("canvas.lut.open")}
                data-canvas-lut-trigger
                onClick={() => updateOpen(true)}
            >
                <span className="truncate">{selected ? (isChinese ? selected.nameZh : selected.nameEn) : t("canvas.lut.button")}</span>
            </Button>
            <Modal
                title={
                    <span className="inline-flex items-center gap-2">
                        <Palette className="size-4" />
                        {t("canvas.lut.title")}
                    </span>
                }
                open={open}
                centered
                width={980}
                footer={null}
                destroyOnHidden
                onCancel={() => updateOpen(false)}
            >
                <div data-canvas-lut-dialog data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    <p className="mb-3 text-xs text-muted-foreground">{t("canvas.lut.description")}</p>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Input
                            allowClear
                            className="min-w-56 flex-1"
                            prefix={<Search className="size-3.5 text-muted-foreground" />}
                            placeholder={t("canvas.lut.search")}
                            value={keyword}
                            onChange={(event) => setKeyword(event.target.value)}
                        />
                        <Segmented
                            value={filter}
                            onChange={(next) => setFilter(next as LutFilter)}
                            options={[
                                { value: "all", label: t("canvas.lut.all", { count: CANVAS_LUT_PRESETS.length }) },
                                { value: "guofeng", label: t("canvas.lut.guofeng") },
                                { value: "cinema", label: t("canvas.lut.cinema") },
                            ]}
                        />
                        {selected ? (
                            <Button icon={<X className="size-3.5" />} onClick={() => selectPreset(undefined)}>
                                {t("canvas.lut.clear")}
                            </Button>
                        ) : null}
                    </div>
                    <div className="thin-scrollbar grid max-h-[66dvh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredPresets.map((preset) => {
                            const active = preset.id === value;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className={`overflow-hidden rounded-xl border text-left transition ${active ? "ring-2 ring-sky-500" : "hover:border-sky-500/60"}`}
                                    style={{ borderColor: active ? "#38bdf8" : theme.node.stroke, background: theme.node.fill, color: theme.node.text, contentVisibility: "auto", containIntrinsicSize: "0 230px" }}
                                    aria-label={t("canvas.lut.apply", { name: preset.nameZh })}
                                    data-lut-preset-id={preset.id}
                                    onClick={() => selectPreset(preset.id)}
                                >
                                    <span className="block aspect-video overflow-hidden border-b" style={{ borderColor: theme.node.stroke }}>
                                        <CanvasLutPreview preset={preset} />
                                    </span>
                                    <span className="block p-3">
                                        <span className="flex items-start gap-2">
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-semibold">{isChinese ? preset.nameZh : preset.nameEn}</span>
                                                <span className="mt-0.5 block truncate text-[11px] opacity-55">{isChinese ? preset.nameEn : preset.nameZh}</span>
                                            </span>
                                            {active ? <Check className="mt-0.5 size-4 shrink-0 text-sky-500" /> : null}
                                        </span>
                                        <span className="mt-2 block line-clamp-2 text-xs leading-5 opacity-70">{preset.promptZh}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {!filteredPresets.length ? <div className="py-12 text-center text-sm text-muted-foreground">{t("canvas.lut.empty")}</div> : null}
                </div>
            </Modal>
        </>
    );
}
