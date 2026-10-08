import { nanoid } from "nanoid";

import { CAMERA_APERTURES, CAMERA_FOCAL_LENGTHS, CAMERA_PROFILES, DEFAULT_CAMERA_CONTROL, LENS_PROFILES } from "@/lib/canvas/canvas-cinematography";
import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasDirectorScene, type CanvasDirectorShot, type CanvasNodeData, type Position } from "@/types/canvas";

export type DirectorPlanningInput = {
    objective: string;
    aspectRatio: string;
    outputMode: "image" | "video";
    shotCount: number;
    durationSeconds: number;
    sourceNodes: CanvasNodeData[];
};

type UnknownRecord = Record<string, unknown>;

export function buildDirectorPlanningPrompt(input: DirectorPlanningInput) {
    const sourceIndex = input.sourceNodes.map((node) => describeSourceNode(node)).join("\n");
    const cameraIds = CAMERA_PROFILES.map((item) => item.id).join(", ");
    const lensIds = LENS_PROFILES.map((item) => item.id).join(", ");

    return `你是电影导演与摄影指导。请把用户目标和画布素材拆成可直接生成的镜头方案。输出必须是一个 JSON 对象，不要 Markdown，不要解释。

硬性要求：
1. shots 必须恰好 ${input.shotCount} 个，index 从 1 连续编号。
2. 每个镜头 mode 固定为 ${input.outputMode}，durationSeconds 为 ${input.outputMode === "video" ? `${input.durationSeconds} 左右（4-30）` : "1"}。
3. referenceNodeIds 只能使用下方素材清单里的 nodeId；只选该镜头真正需要的角色、场景或声音素材。
4. prompt 必须是可直接交给${input.outputMode === "video" ? "视频" : "图片"}模型的完整中文提示词，明确主体、动作、构图、环境、连续性、光线、镜头运动和物理约束，不要写解释。
5. 摄影机 cameraId 只能选：${cameraIds}。
6. 镜头 lensId 只能选：${lensIds}；focalLengthMm 只能选 ${CAMERA_FOCAL_LENGTHS.join("/")}；apertureF 只能选 ${CAMERA_APERTURES.join("/")}。
7. 相邻镜头要保持人物身份、服装、空间方向、光线方向和动作衔接；不要把摄影机或灯具画进画面。
8. 画幅固定为 ${input.aspectRatio}。

JSON 结构：
{"sceneTitle":"场景名","summary":"导演意图摘要","shots":[{"index":1,"title":"镜头名","purpose":"叙事目的","mode":"${input.outputMode}","durationSeconds":${input.outputMode === "video" ? input.durationSeconds : 1},"shotSize":"景别","cameraAngle":"机位角度","cameraMovement":"运镜","action":"人物与物体动作","composition":"构图与空间关系","lighting":"可执行打光描述","sound":"对白/环境音/音乐，无则为空","prompt":"完整生成提示词","negativePrompt":"需要规避的内容","referenceNodeIds":["nodeId"],"camera":{"cameraId":"arri-alexa-35","lensId":"arri-signature","focalLengthMm":35,"apertureF":2.8}}]}

用户目标：
${input.objective.trim() || "根据素材设计一组叙事清晰、连续可生成的专业镜头。"}

画布素材清单：
${sourceIndex || "无素材；请仅根据用户目标规划。"}`;
}

export function parseDirectorScene(raw: string, input: DirectorPlanningInput, planningModel: string): CanvasDirectorScene {
    const payload = readJsonObject(raw);
    const rawShots = Array.isArray(payload.shots) ? payload.shots : [];
    if (!rawShots.length) throw new Error("导演模型没有返回可用镜头，请重试或更换文本模型。");

    const allowedNodeIds = new Set(input.sourceNodes.map((node) => node.id));
    const fallbackReferences = input.sourceNodes.filter((node) => node.type !== CanvasNodeType.Text && Boolean(node.metadata?.content)).map((node) => node.id);
    const shots = rawShots.slice(0, 24).map((item, index) => normalizeShot(asRecord(item), index, input, allowedNodeIds, fallbackReferences));
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        title: stringValue(payload.sceneTitle) || stringValue(payload.title) || "导演场景",
        summary: stringValue(payload.summary) || input.objective.trim(),
        objective: input.objective.trim(),
        aspectRatio: input.aspectRatio,
        sourceNodeIds: input.sourceNodes.map((node) => node.id),
        planningModel,
        shots,
        createdAt: now,
        updatedAt: now,
    };
}

export function createDefaultDirectorScene(sourceNodes: CanvasNodeData[], planningModel: string): CanvasDirectorScene {
    const now = new Date().toISOString();
    const referenceNodeIds = sourceNodes.filter((node) => node.type !== CanvasNodeType.Text && Boolean(node.metadata?.content)).map((node) => node.id);
    const shot: CanvasDirectorShot = {
        id: nanoid(),
        index: 1,
        title: "镜头 1",
        purpose: "3D 白模预演与正式生成",
        mode: "video",
        durationSeconds: 8,
        shotSize: "全景",
        cameraAngle: "平视",
        cameraMovement: "主摄影机固定",
        action: "",
        composition: "",
        lighting: "主光、轮廓光与环境光构成立体照明",
        sound: "",
        prompt: "根据导演台的白模预演执行人物走位、动作和镜头调度，保持参考素材中的人物与场景外观一致。",
        negativePrompt: "不要继承白模的纯色材质、简化几何、网格、标签和诊断标记",
        referenceNodeIds,
        cameraControl: { enabled: true, cameraId: "arri-alexa-35", lensId: "arri-signature", focalLengthMm: 35, apertureF: 2.8 },
        blocking: createDefaultDirectorBlocking(referenceNodeIds),
    };
    return {
        id: nanoid(),
        title: "3D 导演场景",
        summary: "用于验证人物站位、动作、机位、镜头和灯光的白模预演场景。",
        objective: "3D 白模预演",
        aspectRatio: "16:9",
        sourceNodeIds: sourceNodes.map((node) => node.id),
        planningModel,
        shots: [shot],
        createdAt: now,
        updatedAt: now,
    };
}

export function buildDirectorShotPrompt(shot: CanvasDirectorShot, scene: CanvasDirectorScene) {
    const sections = [
        shot.prompt.trim(),
        `导演执行：${shot.shotSize}；${shot.cameraAngle}；${shot.cameraMovement}。`,
        shot.action ? `动作与表演：${shot.action}。` : "",
        shot.composition ? `构图与空间：${shot.composition}。` : "",
        shot.lighting ? `打光：${shot.lighting}。灯光只改变照明、阴影、色温、对比度和氛围，不要把灯具画入画面。` : "",
        shot.sound && shot.mode === "video" ? `声音：${shot.sound}。` : "",
        buildBlockingPrompt(shot),
        shot.negativePrompt ? `避免：${shot.negativePrompt}。` : "",
        `连续性：保持“${scene.title}”内人物身份、服装、道具、空间方向与前后镜头一致。画幅 ${scene.aspectRatio}。`,
    ];
    return sections.filter(Boolean).join("\n\n");
}

export function materializeDirectorScene(scene: CanvasDirectorScene, config: AiConfig, origin: Position) {
    const textSize = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
    const configSize = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
    const rowGap = 52;
    const columnGap = 76;
    const promptNodes: CanvasNodeData[] = [];
    const configNodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];

    const sceneNode: CanvasNodeData = {
        id: nanoid(),
        type: CanvasNodeType.Text,
        title: `导演台 · ${scene.title}`,
        position: { x: origin.x, y: origin.y - 180 },
        width: textSize.width * 2 + columnGap,
        height: 120,
        metadata: {
            content: `${scene.title}\n\n${scene.summary}\n\n画幅：${scene.aspectRatio} · ${scene.shots.length} 个镜头`,
            prompt: scene.summary,
            fontSize: 16,
            status: "success",
            workflowKind: "director-scene",
            directorSceneId: scene.id,
        },
    };

    const nextShots = scene.shots.map((shot, row) => {
        const promptNodeId = nanoid();
        const configNodeId = nanoid();
        const prompt = buildDirectorShotPrompt(shot, scene);
        const y = origin.y + row * (Math.max(textSize.height, configSize.height) + rowGap);
        const promptNode: CanvasNodeData = {
            id: promptNodeId,
            type: CanvasNodeType.Text,
            title: `S${String(shot.index).padStart(2, "0")} · ${shot.title}`,
            position: { x: origin.x, y },
            width: textSize.width,
            height: textSize.height,
            metadata: {
                content: prompt,
                prompt,
                fontSize: 14,
                status: "success",
                workflowKind: "director-shot",
                directorSceneId: scene.id,
                directorShotId: shot.id,
                shotIndex: shot.index,
            },
        };
        const configNode: CanvasNodeData = {
            id: configNodeId,
            type: CanvasNodeType.Config,
            title: `S${String(shot.index).padStart(2, "0")} · ${shot.mode === "video" ? "视频生成" : "图片生成"}`,
            position: { x: origin.x + textSize.width + columnGap, y },
            width: configSize.width,
            height: configSize.height,
            metadata: {
                generationMode: shot.mode,
                model: resolveModelForCapability(config, undefined, shot.mode),
                size: scene.aspectRatio,
                count: 1,
                seconds: String(shot.mode === "video" ? Math.max(4, Math.min(30, Math.round(shot.durationSeconds))) : 1),
                cameraControl: shot.cameraControl,
                status: "idle",
                workflowKind: "director-shot",
                directorSceneId: scene.id,
                directorShotId: shot.id,
                shotIndex: shot.index,
            },
        };
        promptNodes.push(promptNode);
        configNodes.push(configNode);
        connections.push({ id: nanoid(), fromNodeId: promptNodeId, toNodeId: configNodeId });
        shot.referenceNodeIds.forEach((nodeId) => connections.push({ id: nanoid(), fromNodeId: nodeId, toNodeId: configNodeId }));
        return { ...shot, promptNodeId, configNodeId };
    });

    return {
        scene: { ...scene, shots: nextShots, updatedAt: new Date().toISOString() },
        nodes: [sceneNode, ...promptNodes, ...configNodes],
        connections,
        configNodeIds: configNodes.map((node) => node.id),
    };
}

function describeSourceNode(node: CanvasNodeData) {
    const content = (node.metadata?.content || node.metadata?.prompt || "").trim();
    const summary = node.type === CanvasNodeType.Text ? content.slice(0, 6000) : node.metadata?.prompt?.slice(0, 1200) || "";
    const dimensions = node.metadata?.naturalWidth && node.metadata.naturalHeight ? `，${node.metadata.naturalWidth}×${node.metadata.naturalHeight}` : "";
    const duration = node.metadata?.durationMs ? `，${Math.round(node.metadata.durationMs / 1000)} 秒` : "";
    return `- nodeId=${node.id}；类型=${node.type}；名称=${node.title || "未命名"}${dimensions}${duration}${summary ? `；内容/生成说明=${summary}` : ""}`;
}

function normalizeShot(record: UnknownRecord, index: number, input: DirectorPlanningInput, allowedNodeIds: Set<string>, fallbackReferences: string[]): CanvasDirectorShot {
    const camera = asRecord(record.camera);
    const requestedReferences = arrayStrings(record.referenceNodeIds).filter((id) => allowedNodeIds.has(id));
    const cameraId = enumString(camera.cameraId, CAMERA_PROFILES.map((item) => item.id), DEFAULT_CAMERA_CONTROL.cameraId);
    const lensId = enumString(camera.lensId, LENS_PROFILES.map((item) => item.id), DEFAULT_CAMERA_CONTROL.lensId);
    const focalLengthMm = closestNumber(numberValue(camera.focalLengthMm, DEFAULT_CAMERA_CONTROL.focalLengthMm), CAMERA_FOCAL_LENGTHS);
    const apertureF = closestNumber(numberValue(camera.apertureF, DEFAULT_CAMERA_CONTROL.apertureF), CAMERA_APERTURES);

    const referenceNodeIds = requestedReferences.length ? requestedReferences : fallbackReferences;
    return {
        id: nanoid(),
        index: index + 1,
        title: stringValue(record.title) || `镜头 ${index + 1}`,
        purpose: stringValue(record.purpose),
        mode: input.outputMode,
        durationSeconds: input.outputMode === "video" ? clamp(numberValue(record.durationSeconds, input.durationSeconds), 4, 30) : 1,
        shotSize: stringValue(record.shotSize) || "中景",
        cameraAngle: stringValue(record.cameraAngle) || "平视",
        cameraMovement: stringValue(record.cameraMovement) || (input.outputMode === "video" ? "稳定器缓慢推进" : "固定机位"),
        action: stringValue(record.action),
        composition: stringValue(record.composition),
        lighting: stringValue(record.lighting),
        sound: stringValue(record.sound),
        prompt: stringValue(record.prompt) || stringValue(record.action) || stringValue(record.purpose),
        negativePrompt: stringValue(record.negativePrompt),
        referenceNodeIds,
        cameraControl: { enabled: true, cameraId, lensId, focalLengthMm, apertureF },
        blocking: createDefaultDirectorBlocking(referenceNodeIds),
    };
}

export function createDefaultDirectorBlocking(referenceNodeIds: string[]) {
    const actorIds = referenceNodeIds.length ? referenceNodeIds.slice(0, 8) : ["director-actor-1"];
    const colors = ["#f2f2f2", "#1677ff", "#e5484d", "#f5b942", "#2eb67d", "#a56eff"];
    const actors = actorIds.map((nodeId, index, items) => ({
        id: `actor-${index + 1}`,
        ...(nodeId.startsWith("director-actor-") ? {} : { sourceNodeId: nodeId }),
        name: `演员 ${index + 1}`,
        position: [(index - (items.length - 1) / 2) * 1.8, 0, index % 2 ? 0.65 : 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        uniformScale: true,
        color: colors[index % colors.length],
        actionClip: "idle" as const,
        playbackSpeed: 1,
        loop: true,
        visible: true,
        castShadow: true,
    }));
    return {
        cameraPosition: [0, 1.7, 7] as [number, number, number],
        cameraTarget: actors[0] ? actorHeadTarget(actors[0]) : [0, 1.2, 0] as [number, number, number],
        cameraMovementMode: "locked" as const,
        cameraLockedActorId: actors[0]?.id,
        cameraLockOffset: [0, 0] as [number, number],
        keyframes: [],
        actors,
        lights: [
            { id: "key-light", name: "主光", type: "directional" as const, position: [-4, 6, 4] as [number, number, number], intensity: 1.8, color: "#fff1d6", visible: true, castShadow: true },
            { id: "rim-light", name: "轮廓光", type: "directional" as const, position: [4, 4, -4] as [number, number, number], intensity: 1.1, color: "#b9d8ff", visible: true, castShadow: false },
            { id: "ambient-light", name: "环境光", type: "ambient" as const, position: [0, 3, 0] as [number, number, number], intensity: 0.55, color: "#8ba3c7", visible: true, castShadow: false },
        ],
    };
}

function buildBlockingPrompt(shot: CanvasDirectorShot) {
    const blocking = shot.blocking;
    if (!blocking) return "";
    const lockedActor = (blocking.cameraMovementMode || "locked") === "locked" ? blocking.actors.find((actor) => actor.id === blocking.cameraLockedActorId) || blocking.actors[0] : undefined;
    const cameraTarget = lockedActor ? actorHeadTarget(lockedActor) : blocking.cameraTarget;
    const cameraLockOffset = blocking.cameraLockOffset || [0, 0];
    const actors = blocking.actors
        .map((actor) => `${actor.name}${actor.sourceNodeId ? `（参考 ${actor.sourceNodeId}）` : ""}位于场景坐标 (${actor.position.map((value) => value.toFixed(1)).join(", ")})，旋转 (${actor.rotation.map((value) => Math.round(value)).join(", ")}) 度，动作 ${actor.actionClip}，颜色 ${actor.color}`)
        .join("；");
    const lights = blocking.lights.filter((light) => light.visible).map((light) => `${light.name}位于 (${light.position.map((value) => value.toFixed(1)).join(", ")})，强度 ${light.intensity.toFixed(1)}，颜色 ${light.color}`).join("；");
    const timeline = (blocking.keyframes || []).map((frame) => {
        const targetName = frame.targetType === "camera" ? "摄影机" : frame.targetType === "actor" ? blocking.actors.find((actor) => actor.id === frame.targetId)?.name || frame.targetId : blocking.lights.find((light) => light.id === frame.targetId)?.name || frame.targetId;
        return `${frame.time.toFixed(2)}s ${targetName} 到 (${frame.position.map((value) => value.toFixed(1)).join(", ")})${frame.rotation ? `、旋转 (${frame.rotation.map((value) => Math.round(value)).join(", ")}) 度` : ""}${frame.actionClip ? `、动作 ${frame.actionClip}` : ""}，后续采用 ${frame.interpolation}`;
    }).join("；");
    return [
        `预演机位：摄影机位于 (${blocking.cameraPosition.map((value) => value.toFixed(1)).join(", ")})，${lockedActor ? `锁定跟随 ${lockedActor.name} 头部，并保持在画面归一化位置 (${cameraLockOffset.map((value) => value.toFixed(2)).join(", ")})` : `自由朝向 (${cameraTarget.map((value) => value.toFixed(1)).join(", ")})`}。`,
        actors ? `场面调度：${actors}。保持前后、左右和遮挡关系。` : "",
        lights ? `预演灯光：${lights}。` : "",
        timeline ? `动态白模时间轴（30fps，关键帧之间连续补间）：${timeline}。` : "",
        "白模只作为镜头运动、人物走位、站位、朝向、动作时序和空间关系参考；最终画面不得继承白模几何体、纯色材质、网格、标签或简化背景。",
    ]
        .filter(Boolean)
        .join("\n\n");
}

function actorHeadTarget(actor: { position: [number, number, number]; scale: [number, number, number] }) {
    return [actor.position[0], actor.position[1] + 1.78 * actor.scale[1], actor.position[2]] as [number, number, number];
}

function readJsonObject(raw: string): UnknownRecord {
    const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("导演模型返回的不是 JSON 镜头方案，请重试或更换文本模型。");
    try {
        return asRecord(JSON.parse(withoutFence.slice(start, end + 1)));
    } catch {
        throw new Error("导演模型返回的 JSON 无法解析，请重试或减少镜头数量。");
    }
}

function asRecord(value: unknown): UnknownRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function arrayStrings(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function enumString<T extends string>(value: unknown, allowed: T[], fallback: T) {
    return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function closestNumber(value: number, allowed: number[]) {
    return allowed.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best), allowed[0]);
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}
