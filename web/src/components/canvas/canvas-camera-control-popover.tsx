import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Aperture, Camera } from "lucide-react";
import { Button, Select, Switch } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { CAMERA_APERTURES, CAMERA_COMBINATION_PRESETS, CAMERA_FOCAL_LENGTHS, CAMERA_PROFILES, LENS_PROFILES, buildCameraSummary, normalizeCameraControl, type CameraCombinationPreset } from "@/lib/canvas/canvas-cinematography";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasCameraControl } from "@/types/canvas";

export function CanvasCameraControlPopover({ value, onChange, onOpenChange, buttonClassName }: { value?: CanvasCameraControl; onChange: (value: CanvasCameraControl) => void; onOpenChange?: (open: boolean) => void; buttonClassName?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const camera = normalizeCameraControl(value);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (target instanceof Element && target.closest(".ant-select-dropdown")) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
            onOpenChange?.(false);
        };
        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [onOpenChange, open]);

    const updateOpen = (next: boolean) => {
        setOpen(next);
        onOpenChange?.(next);
    };

    const update = <Key extends keyof CanvasCameraControl>(key: Key, next: CanvasCameraControl[Key]) => onChange({ ...camera, [key]: next });
    const applyPreset = (preset: CameraCombinationPreset) => onChange({ enabled: true, cameraId: preset.cameraId, lensId: preset.lensId, focalLengthMm: preset.focalLengthMm, apertureF: preset.apertureF });

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2"}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={<Camera className="size-3.5" />}
                    aria-label="摄像机控制"
                    onClick={() => updateOpen(!open)}
                >
                    <span className="truncate">{camera.enabled ? `${camera.focalLengthMm}mm · f/${camera.apertureF}` : "摄像机"}</span>
                </Button>
            </span>
            {open && buttonRect
                ? createPortal(
                      <CameraControlPanel panelRef={panelRef} buttonRect={buttonRect} theme={theme} value={camera} update={update} applyPreset={applyPreset} />,
                      document.body,
                  )
                : null}
        </>
    );
}

function CameraControlPanel({
    panelRef,
    buttonRect,
    theme,
    value,
    update,
    applyPreset,
}: {
    panelRef: RefObject<HTMLDivElement | null>;
    buttonRect: DOMRect;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    value: CanvasCameraControl;
    update: <Key extends keyof CanvasCameraControl>(key: Key, value: CanvasCameraControl[Key]) => void;
    applyPreset: (preset: CameraCombinationPreset) => void;
}) {
    const width = 520;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, buttonRect.right - width));
    const activePreset = CAMERA_COMBINATION_PRESETS.find((preset) => preset.cameraId === value.cameraId && preset.lensId === value.lensId && preset.focalLengthMm === value.focalLengthMm && preset.apertureF === value.apertureF)?.id;
    const spaceAbove = buttonRect.top - 20;
    const spaceBelow = window.innerHeight - buttonRect.bottom - 20;
    const openAbove = spaceAbove >= 420 || spaceAbove >= spaceBelow;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        ...(openAbove ? { bottom: window.innerHeight - buttonRect.top + 8 } : { top: buttonRect.bottom + 8 }),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.18)",
        padding: 18,
        color: theme.node.text,
        maxHeight: Math.max(260, openAbove ? spaceAbove : spaceBelow),
        overflowY: "auto",
    } as const;

    return (
        <div ref={panelRef} style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} data-camera-control-panel data-canvas-shortcuts-ignore>
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 font-semibold"><Aperture className="size-4" />摄像机控制</div>
                    <p className="mt-1 text-xs opacity-60">开启后会把机身、镜头、焦距和光圈写入真实生成请求。</p>
                </div>
                <Switch checked={value.enabled} onChange={(checked) => update("enabled", checked)} aria-label="启用摄像机控制" />
            </div>
            <div className="mb-4">
                <div className="mb-2 flex items-end justify-between gap-3">
                    <span className="text-xs font-semibold opacity-75">摄影搭配效果预览</span>
                    <span className="text-[10px] opacity-45">点击预设会自动启用</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {CAMERA_COMBINATION_PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            className={`overflow-hidden rounded-xl border text-left transition ${activePreset === preset.id ? "ring-2 ring-sky-500" : "hover:border-sky-500/60"}`}
                            style={{ borderColor: activePreset === preset.id ? "#38bdf8" : theme.node.stroke, background: theme.node.fill }}
                            aria-label={`应用摄影预设：${preset.label}`}
                            onClick={() => applyPreset(preset)}
                        >
                            <span
                                className="block aspect-video w-full bg-cover bg-no-repeat"
                                style={{
                                    backgroundImage: "url('/cinematography/camera-combination-atlas.jpg')",
                                    backgroundSize: "300% 200%",
                                    backgroundPosition: `${preset.previewColumn * 50}% ${preset.previewRow * 100}%`,
                                }}
                            />
                            <span className="block px-2.5 py-2">
                                <span className="block text-xs font-semibold">{preset.label}</span>
                                <span className="mt-0.5 block text-[10px] opacity-55">{preset.description}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[10px] leading-4 opacity-45">预览用于说明透视、景深、压缩和镜头风格差异，最终画面仍由所选模型生成。</p>
            </div>
            <div className={`space-y-3 ${value.enabled ? "" : "pointer-events-none opacity-45"}`}>
                <ControlRow label="机身">
                    <Select className="w-full" getPopupContainer={() => panelRef.current || document.body} value={value.cameraId} options={CAMERA_PROFILES.map((item) => ({ label: item.label, value: item.id }))} onChange={(next) => update("cameraId", next)} />
                </ControlRow>
                <ControlRow label="镜头">
                    <Select className="w-full" getPopupContainer={() => panelRef.current || document.body} value={value.lensId} options={LENS_PROFILES.map((item) => ({ label: item.label, value: item.id }))} onChange={(next) => update("lensId", next)} />
                </ControlRow>
                <div className="grid grid-cols-2 gap-3">
                    <ControlRow label="焦距">
                        <Select className="w-full" getPopupContainer={() => panelRef.current || document.body} value={value.focalLengthMm} options={CAMERA_FOCAL_LENGTHS.map((item) => ({ label: `${item} mm`, value: item }))} onChange={(next) => update("focalLengthMm", next)} />
                    </ControlRow>
                    <ControlRow label="光圈">
                        <Select className="w-full" getPopupContainer={() => panelRef.current || document.body} value={value.apertureF} options={CAMERA_APERTURES.map((item) => ({ label: `f/${item}`, value: item }))} onChange={(next) => update("apertureF", next)} />
                    </ControlRow>
                </div>
                <div className="rounded-lg border px-3 py-2 text-xs leading-5 opacity-75" style={{ borderColor: theme.node.stroke }}>{buildCameraSummary(value)}</div>
            </div>
        </div>
    );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium opacity-65">{label}</span>
            {children}
        </label>
    );
}
