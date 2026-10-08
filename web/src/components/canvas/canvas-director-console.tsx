import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, Input, InputNumber, Modal, Segmented, Select } from "antd";
import { Clapperboard, LoaderCircle, Plus, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { CanvasCameraControlPopover } from "@/components/canvas/canvas-camera-control-popover";
import { modelOptionLabel, type AiConfig } from "@/stores/use-config-store";
import { createDefaultDirectorBlocking, type DirectorPlanningInput } from "@/lib/canvas/canvas-director";
import { CanvasNodeType, type CanvasDirectorScene, type CanvasDirectorShot, type CanvasNodeData } from "@/types/canvas";

export type DirectorConsoleRequest = DirectorPlanningInput & { model: string };

type Props = {
    open: boolean;
    config: AiConfig;
    sourceNodes: CanvasNodeData[];
    scenes: CanvasDirectorScene[];
    onClose: () => void;
    onPlan: (request: DirectorConsoleRequest) => Promise<CanvasDirectorScene>;
    onSaveScene: (scene: CanvasDirectorScene) => void;
    onMaterialize: (scene: CanvasDirectorScene, generate: boolean) => void;
};

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

export function CanvasDirectorConsole({ open, config, sourceNodes, scenes, onClose, onPlan, onSaveScene, onMaterialize }: Props) {
    const { t } = useTranslation();
    const { modal, message } = App.useApp();
    const [objective, setObjective] = useState("");
    const [aspectRatio, setAspectRatio] = useState("16:9");
    const [outputMode, setOutputMode] = useState<"image" | "video">("video");
    const [shotCount, setShotCount] = useState(6);
    const [durationSeconds, setDurationSeconds] = useState(8);
    const [model, setModel] = useState(config.textModel);
    const [planning, setPlanning] = useState(false);
    const [scene, setScene] = useState<CanvasDirectorScene | null>(null);

    useEffect(() => {
        if (!open) return;
        setModel((current) => current || config.textModel);
        setScene((current) => current || scenes[0] || null);
    }, [config.textModel, open, scenes]);

    const sourceSummary = useMemo(() => {
        const counts = { text: 0, image: 0, video: 0, audio: 0 };
        sourceNodes.forEach((node) => {
            if (node.type === CanvasNodeType.Text) counts.text += 1;
            if (node.type === CanvasNodeType.Image) counts.image += 1;
            if (node.type === CanvasNodeType.Video) counts.video += 1;
            if (node.type === CanvasNodeType.Audio) counts.audio += 1;
        });
        return counts;
    }, [sourceNodes]);

    const saveScene = (next: CanvasDirectorScene) => {
        const saved = { ...next, updatedAt: new Date().toISOString() };
        setScene(saved);
        onSaveScene(saved);
    };

    const handlePlan = async () => {
        if (!model) {
            message.warning(t("canvas.director.modelRequired"));
            return;
        }
        setPlanning(true);
        try {
            const planned = await onPlan({ objective, aspectRatio, outputMode, shotCount, durationSeconds, sourceNodes, model });
            setScene(planned);
            onSaveScene(planned);
            message.success(t("canvas.director.planned", { count: planned.shots.length }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.director.planFailed"));
        } finally {
            setPlanning(false);
        }
    };

    const handleMaterialize = (generate: boolean) => {
        if (!scene?.shots.length) return;
        if (!generate) {
            onMaterialize(scene, false);
            return;
        }
        modal.confirm({
            title: t("canvas.director.generateConfirmTitle"),
            content: t("canvas.director.generateConfirmDescription", { count: scene.shots.length }),
            okText: t("canvas.director.writeAndGenerate"),
            cancelText: t("common.cancel"),
            onOk: () => onMaterialize(scene, true),
        });
    };

    return (
        <Modal
            open={open}
            width={1180}
            centered
            destroyOnHidden={false}
            title={
                <span className="inline-flex items-center gap-2">
                    <Clapperboard className="size-5" />
                    {t("canvas.director.title")}
                </span>
            }
            footer={null}
            onCancel={onClose}
            className="canvas-director-console"
            styles={{ body: { height: "min(78vh, 850px)", paddingTop: 12, overflow: "hidden" } }}
        >
            <div className="grid h-full min-h-0 grid-cols-[330px_minmax(0,1fr)] gap-4">
                <aside className="thin-scrollbar min-h-0 overflow-y-auto rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="mb-1 text-sm font-semibold">{t("canvas.director.brief")}</div>
                    <div className="mb-4 text-xs text-muted-foreground">{t("canvas.director.briefDescription")}</div>

                    <label className="mb-4 block">
                        <span className="mb-1.5 block text-xs font-medium">{t("canvas.director.objective")}</span>
                        <Input.TextArea value={objective} rows={5} placeholder={t("canvas.director.objectivePlaceholder")} onChange={(event) => setObjective(event.target.value)} />
                    </label>

                    <div className="mb-4 grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-medium">{t("canvas.director.output")}</span>
                            <Segmented block value={outputMode} options={[{ label: t("canvas.configNode.video"), value: "video" }, { label: t("canvas.configNode.image"), value: "image" }]} onChange={(value) => setOutputMode(value as "image" | "video")} />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-medium">{t("canvas.director.aspect")}</span>
                            <Select className="w-full" value={aspectRatio} options={ASPECT_RATIOS.map((value) => ({ value, label: value }))} onChange={setAspectRatio} />
                        </label>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-medium">{t("canvas.director.shotCount")}</span>
                            <InputNumber className="w-full" min={1} max={24} value={shotCount} onChange={(value) => setShotCount(value || 1)} />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-medium">{t("canvas.director.duration")}</span>
                            <InputNumber className="w-full" min={4} max={30} disabled={outputMode === "image"} addonAfter="s" value={durationSeconds} onChange={(value) => setDurationSeconds(value || 4)} />
                        </label>
                    </div>

                    <label className="mb-4 block">
                        <span className="mb-1.5 block text-xs font-medium">{t("canvas.director.planningModel")}</span>
                        <ModelPicker config={config} value={model} capability="text" fullWidth onChange={setModel} />
                    </label>

                    <div className="mb-4 rounded-lg border border-border/70 bg-background/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">{t("canvas.director.sources")}</span>
                            <span className="text-[11px] text-muted-foreground">{t("canvas.director.sourceRule")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                            <SourceCount label={t("canvas.nodeTypes.text")} value={sourceSummary.text} />
                            <SourceCount label={t("canvas.nodeTypes.image")} value={sourceSummary.image} />
                            <SourceCount label={t("canvas.nodeTypes.video")} value={sourceSummary.video} />
                            <SourceCount label={t("canvas.nodeTypes.audio")} value={sourceSummary.audio} />
                        </div>
                        <div className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
                            {sourceNodes.length ? sourceNodes.map((node) => <div key={node.id} className="truncate">• {node.title || node.id}</div>) : <div>{t("canvas.director.noSources")}</div>}
                        </div>
                    </div>

                    {scenes.length ? (
                        <label className="mb-3 block">
                            <span className="mb-1.5 block text-xs font-medium">{t("canvas.director.savedScenes")}</span>
                            <Select
                                className="w-full"
                                value={scene?.id}
                                placeholder={t("canvas.director.selectScene")}
                                options={scenes.map((item) => ({ value: item.id, label: `${item.title} · ${item.shots.length}` }))}
                                onChange={(id) => setScene(scenes.find((item) => item.id === id) || null)}
                            />
                        </label>
                    ) : null}

                    <Button type="primary" block size="large" disabled={planning} onClick={() => void handlePlan()}>
                        <span className="inline-flex items-center gap-2">
                            {planning ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
                            {planning ? t("canvas.director.planning") : scene ? t("canvas.director.replan") : t("canvas.director.plan")}
                        </span>
                    </Button>
                </aside>

                <section className="flex min-h-0 flex-col rounded-xl border border-border/70 bg-background">
                    {scene ? (
                        <>
                            <div className="border-b border-border/70 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <Input variant="borderless" className="!px-0 !text-lg !font-semibold" value={scene.title} onChange={(event) => saveScene({ ...scene, title: event.target.value })} />
                                        <Input.TextArea variant="borderless" autoSize={{ minRows: 1, maxRows: 3 }} className="!px-0 text-sm text-muted-foreground" value={scene.summary} onChange={(event) => saveScene({ ...scene, summary: event.target.value })} />
                                    </div>
                                    <div className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                                        {scene.aspectRatio} · {scene.shots.length} {t("canvas.director.shotsUnit")} · {modelOptionLabel(config, scene.planningModel)}
                                    </div>
                                </div>
                            </div>

                            <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                                {scene.shots.map((shot) => (
                                    <DirectorShotCard
                                        key={shot.id}
                                        shot={shot}
                                        sourceNodes={sourceNodes}
                                        onChange={(next) => saveScene({ ...scene, shots: scene.shots.map((item) => (item.id === next.id ? next : item)) })}
                                        onDelete={() => saveScene({ ...scene, shots: reindexShots(scene.shots.filter((item) => item.id !== shot.id)) })}
                                    />
                                ))}
                                <Button
                                    block
                                    icon={<Plus className="size-4" />}
                                    onClick={() => saveScene({ ...scene, shots: [...scene.shots, createBlankShot(scene.shots.length + 1, outputMode, durationSeconds, sourceNodes)] })}
                                >
                                    {t("canvas.director.addShot")}
                                </Button>
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-border/70 p-4">
                                <div className="text-xs text-muted-foreground">{t("canvas.director.writeHint")}</div>
                                <div className="flex shrink-0 gap-2">
                                    <Button onClick={() => handleMaterialize(false)}>{t("canvas.director.writeCanvas")}</Button>
                                    <Button type="primary" icon={<Sparkles className="size-4" />} onClick={() => handleMaterialize(true)}>
                                        {t("canvas.director.writeAndGenerate")}
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="grid h-full place-items-center p-8 text-center">
                            <div>
                                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><Clapperboard className="size-8" /></div>
                                <div className="mb-1 text-base font-semibold">{t("canvas.director.emptyTitle")}</div>
                                <div className="max-w-md text-sm text-muted-foreground">{t("canvas.director.emptyDescription")}</div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </Modal>
    );
}

function DirectorShotCard({ shot, sourceNodes, onChange, onDelete }: { shot: CanvasDirectorShot; sourceNodes: CanvasNodeData[]; onChange: (shot: CanvasDirectorShot) => void; onDelete: () => void }) {
    const { t } = useTranslation();
    const referenceSet = new Set(shot.referenceNodeIds);
    return (
        <article className="rounded-xl border border-border/70 bg-muted/15 p-3">
            <div className="mb-3 flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{shot.index}</span>
                <Input className="min-w-0 flex-1" value={shot.title} onChange={(event) => onChange({ ...shot, title: event.target.value })} />
                <Segmented size="small" value={shot.mode} options={[{ label: t("canvas.configNode.video"), value: "video" }, { label: t("canvas.configNode.image"), value: "image" }]} onChange={(value) => onChange({ ...shot, mode: value as "image" | "video" })} />
                {shot.mode === "video" ? <InputNumber className="!w-24" min={1} max={30} addonAfter="s" value={shot.durationSeconds} onChange={(value) => onChange({ ...shot, durationSeconds: value || 1 })} /> : null}
                <CanvasCameraControlPopover value={shot.cameraControl} onChange={(cameraControl) => onChange({ ...shot, cameraControl: { ...cameraControl, enabled: true } })} />
                <Button type="text" danger icon={<Trash2 className="size-4" />} aria-label={t("canvas.director.deleteShot")} onClick={onDelete} />
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
                <Input value={shot.shotSize} addonBefore={t("canvas.director.shotSize")} onChange={(event) => onChange({ ...shot, shotSize: event.target.value })} />
                <Input value={shot.cameraAngle} addonBefore={t("canvas.director.cameraAngle")} onChange={(event) => onChange({ ...shot, cameraAngle: event.target.value })} />
                <Input value={shot.cameraMovement} addonBefore={t("canvas.director.cameraMovement")} onChange={(event) => onChange({ ...shot, cameraMovement: event.target.value })} />
            </div>
            <Input.TextArea className="mb-2" autoSize={{ minRows: 3, maxRows: 7 }} value={shot.prompt} placeholder={t("canvas.director.promptPlaceholder")} onChange={(event) => onChange({ ...shot, prompt: event.target.value })} />
            <div className="grid grid-cols-2 gap-2">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={shot.lighting} placeholder={t("canvas.director.lightingPlaceholder")} onChange={(event) => onChange({ ...shot, lighting: event.target.value })} />
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={shot.sound} placeholder={t("canvas.director.soundPlaceholder")} onChange={(event) => onChange({ ...shot, sound: event.target.value })} />
            </div>
            {sourceNodes.length ? (
                <div className="mt-3">
                    <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t("canvas.director.shotReferences")}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {sourceNodes.filter((node) => node.type !== CanvasNodeType.Text && Boolean(node.metadata?.content)).map((node) => (
                            <Checkbox
                                key={node.id}
                                checked={referenceSet.has(node.id)}
                                onChange={(event) => onChange({ ...shot, referenceNodeIds: event.target.checked ? [...shot.referenceNodeIds, node.id] : shot.referenceNodeIds.filter((id) => id !== node.id) })}
                            >
                                <span className="text-xs">{node.title || node.id}</span>
                            </Checkbox>
                        ))}
                    </div>
                </div>
            ) : null}
        </article>
    );
}

function SourceCount({ label, value }: { label: string; value: number }) {
    return <span className="rounded-full border border-border/70 bg-background px-2 py-0.5">{label} {value}</span>;
}

function reindexShots(shots: CanvasDirectorShot[]) {
    return shots.map((shot, index) => ({ ...shot, index: index + 1 }));
}

function createBlankShot(index: number, mode: "image" | "video", durationSeconds: number, sourceNodes: CanvasNodeData[]): CanvasDirectorShot {
    return {
        id: `director-shot-${Date.now()}-${index}`,
        index,
        title: `镜头 ${index}`,
        purpose: "",
        mode,
        durationSeconds: mode === "video" ? durationSeconds : 1,
        shotSize: "中景",
        cameraAngle: "平视",
        cameraMovement: mode === "video" ? "稳定器缓慢推进" : "固定机位",
        action: "",
        composition: "",
        lighting: "",
        sound: "",
        prompt: "",
        negativePrompt: "",
        referenceNodeIds: sourceNodes.filter((node) => node.type !== CanvasNodeType.Text && Boolean(node.metadata?.content)).map((node) => node.id),
        cameraControl: { enabled: true, cameraId: "arri-alexa-35", lensId: "arri-signature", focalLengthMm: 35, apertureF: 2.8 },
        blocking: createDefaultDirectorBlocking(sourceNodes.filter((node) => node.type !== CanvasNodeType.Text && Boolean(node.metadata?.content)).map((node) => node.id)),
    };
}
