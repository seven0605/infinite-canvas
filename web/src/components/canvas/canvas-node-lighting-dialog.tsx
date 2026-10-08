import { useEffect, useState } from "react";
import { Button, Input, Modal, Segmented, Slider, Switch } from "antd";
import { RotateCcw, WandSparkles } from "lucide-react";

import { DEFAULT_LIGHTING_PARAMS } from "@/lib/canvas/canvas-cinematography";
import type { CanvasLightingParams } from "@/types/canvas";

const lightingPresets: Array<{ id: string; label: string; patch: Partial<CanvasLightingParams> }> = [
    { id: "soft-key", label: "柔和主光", patch: { azimuth: -35, elevation: 30, brightness: 60, softness: "soft", rimLight: false, lightColor: "#fff1d6" } },
    { id: "rembrandt", label: "伦勃朗光", patch: { azimuth: -55, elevation: 35, brightness: 55, softness: "hard", rimLight: false, lightColor: "#ffd8ad" } },
    { id: "butterfly", label: "蝴蝶光", patch: { azimuth: 0, elevation: 42, brightness: 70, softness: "soft", rimLight: false, lightColor: "#fff4df" } },
    { id: "backlight", label: "侧逆光", patch: { azimuth: 145, elevation: 25, brightness: 72, softness: "hard", rimLight: true, lightColor: "#dce9ff" } },
    { id: "high-key", label: "高调光", patch: { azimuth: -20, elevation: 28, brightness: 88, softness: "soft", rimLight: true, lightColor: "#ffffff" } },
    { id: "low-key", label: "低调光", patch: { azimuth: 70, elevation: 18, brightness: 28, softness: "hard", rimLight: true, lightColor: "#8aabff" } },
];

export function CanvasNodeLightingDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasLightingParams) => void }) {
    const [params, setParams] = useState(DEFAULT_LIGHTING_PARAMS);

    useEffect(() => {
        if (open) setParams(DEFAULT_LIGHTING_PARAMS);
    }, [dataUrl, open]);

    const update = <Key extends keyof CanvasLightingParams>(key: Key, value: CanvasLightingParams[Key]) => setParams((current) => ({ ...current, [key]: value, ...(key === "presetId" ? {} : { presetId: "custom" }) }));
    const applyPreset = (id: string) => {
        const preset = lightingPresets.find((item) => item.id === id);
        if (preset) setParams((current) => ({ ...current, ...preset.patch, presetId: preset.id }));
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={900} centered destroyOnHidden>
            <div className="space-y-5" data-canvas-shortcuts-ignore>
                <div>
                    <h2 className="text-xl font-semibold">AI 打光</h2>
                    <p className="mt-1 text-sm opacity-60">以原图为参考重新生成，只改变光线方向、颜色、强弱和氛围。</p>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(280px,1fr)_400px]">
                    <div className="flex min-h-[360px] flex-col justify-between rounded-xl border p-4">
                        <div className="relative grid flex-1 place-items-center overflow-hidden rounded-xl bg-black/5">
                            <img src={dataUrl} alt="打光预览" className="max-h-[300px] max-w-full rounded-xl object-contain" draggable={false} />
                            <div className="pointer-events-none absolute inset-0 mix-blend-screen" style={{ background: lightingPreview(params) }} />
                        </div>
                        <Button className="mt-3 w-fit" icon={<RotateCcw className="size-4" />} onClick={() => setParams(DEFAULT_LIGHTING_PARAMS)}>重置</Button>
                    </div>
                    <div className="space-y-4 py-1">
                        <div>
                            <div className="mb-2 text-sm font-medium opacity-75">灯光预设</div>
                            <div className="grid grid-cols-3 gap-2">
                                {lightingPresets.map((preset) => (
                                    <Button key={preset.id} type={params.presetId === preset.id ? "primary" : "default"} onClick={() => applyPreset(preset.id)}>{preset.label}</Button>
                                ))}
                            </div>
                        </div>
                        <LightingSlider label="水平角度" value={params.azimuth} min={-180} max={180} suffix="°" onChange={(value) => update("azimuth", value)} />
                        <LightingSlider label="高度角" value={params.elevation} min={-60} max={60} suffix="°" onChange={(value) => update("elevation", value)} />
                        <LightingSlider label="亮度" value={params.brightness} min={0} max={100} suffix="%" onChange={(value) => update("brightness", value)} />
                        <div className="grid grid-cols-[88px_1fr] items-center gap-4">
                            <span className="font-medium opacity-75">光质</span>
                            <Segmented block value={params.softness} options={[{ label: "柔光", value: "soft" }, { label: "硬光", value: "hard" }]} onChange={(value) => update("softness", value as CanvasLightingParams["softness"])} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                                <span className="font-medium opacity-75">轮廓光</span>
                                <Switch checked={params.rimLight} onChange={(value) => update("rimLight", value)} />
                            </label>
                            <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                                <span className="font-medium opacity-75">灯光颜色</span>
                                <input type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={params.lightColor} onChange={(event) => update("lightColor", event.target.value)} />
                            </label>
                        </div>
                        <Input.TextArea value={params.smartDescription} rows={2} maxLength={240} placeholder="可选：补充光线氛围，例如“窗外冷月光，人物脸部保留微暖主光”" onChange={(event) => update("smartDescription", event.target.value)} />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<WandSparkles className="size-4" />} onClick={() => onConfirm(params)}>生成打光版本</Button>
                </div>
            </div>
        </Modal>
    );
}

function LightingSlider({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
    return (
        <div className="grid grid-cols-[88px_1fr_62px] items-center gap-4">
            <span className="font-medium opacity-75">{label}</span>
            <Slider min={min} max={max} value={value} onChange={onChange} />
            <span className="text-right font-semibold">{value}{suffix}</span>
        </div>
    );
}

function lightingPreview(params: CanvasLightingParams) {
    const x = Math.round(50 + Math.sin((params.azimuth * Math.PI) / 180) * 48);
    const y = Math.round(55 - Math.sin((params.elevation * Math.PI) / 180) * 45);
    const alpha = Math.max(0.08, params.brightness / 130);
    return `radial-gradient(circle at ${x}% ${y}%, ${hexToRgba(params.lightColor, alpha)} 0%, transparent 58%)`;
}

function hexToRgba(hex: string, alpha: number) {
    const value = hex.replace("#", "");
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
