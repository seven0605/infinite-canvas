import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { App, Button, ColorPicker, Input, InputNumber, Modal, Segmented, Select, Slider, Switch } from "antd";
import { Box, Camera, CircleUserRound, Clapperboard, Eye, Lightbulb, LoaderCircle, Move3d, Pause, Play, Plus, Redo2, Rotate3d, Save, Scan, Trash2, Undo2, Video, X } from "lucide-react";
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from "mediabunny";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";

import { CAMERA_APERTURES } from "@/lib/canvas/canvas-cinematography";
import type { CanvasDirectorBlocking, CanvasDirectorInterpolation, CanvasDirectorKeyframe, CanvasDirectorScene, CanvasDirectorShot, CanvasNodeData } from "@/types/canvas";

type Actor = CanvasDirectorBlocking["actors"][number];
type StageLight = CanvasDirectorBlocking["lights"][number];
type EditorMode = "layout" | "pose" | "animate" | "camera";
type TransformMode = "translate" | "rotate" | "scale";
type RenderMode = "beauty" | "clay" | "depth" | "normal";
type ViewMode = "stage" | "camera";
type CameraMovementMode = CanvasDirectorBlocking["cameraMovementMode"];

type Props = {
    open: boolean;
    scene: CanvasDirectorScene | null;
    shot: CanvasDirectorShot | null;
    sourceNodes: CanvasNodeData[];
    onClose: () => void;
    onShotChange: (shot: CanvasDirectorShot) => void;
    onOpenPlanner: () => void;
    onApplyShot: (shot: CanvasDirectorShot, beautyDataUrl: string) => Promise<void>;
    onExportWhitebox: (shot: CanvasDirectorShot, video: Blob) => Promise<void>;
};

type Runtime = {
    renderer: THREE.WebGLRenderer;
    previewRenderer: THREE.WebGLRenderer;
    previewComposer: EffectComposer;
    bokehPass: BokehPass;
    outputPass: OutputPass;
    scene: THREE.Scene;
    editorCamera: THREE.PerspectiveCamera;
    shotCamera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transform: TransformControls;
    transformHelper: THREE.Object3D;
    cameraHelper: THREE.CameraHelper;
    objects: Map<string, THREE.Object3D>;
    actors: Map<string, THREE.Group>;
    lights: Map<string, THREE.Light>;
    animationFrame: number;
    resizeObserver: ResizeObserver;
    previewResizeObserver: ResizeObserver;
    clayMaterial: THREE.MeshStandardMaterial;
    normalMaterial: THREE.MeshNormalMaterial;
    depthMaterial: THREE.MeshDepthMaterial;
    renderMode: RenderMode;
    previewMode: RenderMode;
    viewMode: ViewMode;
    selectedId: string;
};

type BokehUniforms = {
    focus: { value: number };
    aperture: { value: number };
    maxblur: { value: number };
};

const CAMERA_ID = "director-camera";
const ACTION_OPTIONS: Actor["actionClip"][] = ["idle", "walk", "run", "agree", "point", "wave"];
const CAMERA_LOCK_OFFSET_LIMIT = 0.92;
const WHITEBOX_EXPORT_FPS = 30;

export function CanvasDirectorWorkbench({ open, scene, shot, sourceNodes, onClose, onShotChange, onOpenPlanner, onApplyShot, onExportWhitebox }: Props) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const runtimeRef = useRef<Runtime | null>(null);
    const shotRef = useRef(shot);
    const onShotChangeRef = useRef(onShotChange);
    const playingRef = useRef(false);
    const recordingRef = useRef(false);
    const editorModeRef = useRef<EditorMode>("layout");
    const playheadRef = useRef(0);
    const lastFrameRef = useRef(0);
    const transformStartRef = useRef<CanvasDirectorBlocking | null>(null);
    const transformDraggingRef = useRef(false);
    const activeTransformKeyframeRef = useRef<string | null>(null);
    const focusDragStartRef = useRef<CanvasDirectorBlocking | null>(null);
    const keyframeDragStartRef = useRef<CanvasDirectorBlocking | null>(null);
    const historyRef = useRef<{ past: CanvasDirectorBlocking[]; future: CanvasDirectorBlocking[] }>({ past: [], future: [] });
    const [editorMode, setEditorMode] = useState<EditorMode>("layout");
    const [transformMode, setTransformMode] = useState<TransformMode>("translate");
    const [renderMode, setRenderMode] = useState<RenderMode>("beauty");
    const [viewMode, setViewMode] = useState<ViewMode>("stage");
    const [selectedId, setSelectedId] = useState<string>(CAMERA_ID);
    const [sceneFilter, setSceneFilter] = useState<"all" | "actors" | "camera" | "lights">("all");
    const [playing, setPlaying] = useState(false);
    const [playhead, setPlayhead] = useState(0);
    const [applying, setApplying] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [stageHost, setStageHost] = useState<HTMLDivElement | null>(null);
    const [previewHost, setPreviewHost] = useState<HTMLDivElement | null>(null);
    const [focusOffsetDraft, setFocusOffsetDraft] = useState<[number, number] | null>(null);
    const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

    useEffect(() => {
        shotRef.current = shot;
    }, [shot]);
    useEffect(() => {
        onShotChangeRef.current = onShotChange;
    }, [onShotChange]);
    useEffect(() => {
        playingRef.current = playing;
    }, [playing]);
    useEffect(() => {
        editorModeRef.current = editorMode;
    }, [editorMode]);

    const displayedShot = useMemo(() => shot && editorMode === "animate" ? evaluateDirectorShot(shot, playhead) : shot, [editorMode, playhead, shot]);
    const selectedActor = displayedShot?.blocking.actors.find((actor) => actor.id === selectedId) || null;
    const selectedLight = displayedShot?.blocking.lights.find((light) => light.id === selectedId) || null;
    const currentCameraMode = displayedShot ? cameraMovementMode(displayedShot.blocking) : "locked";
    const lockedActor = displayedShot?.blocking.actors.find((actor) => actor.id === displayedShot.blocking.cameraLockedActorId) || displayedShot?.blocking.actors[0] || null;
    const cameraLockOffset = focusOffsetDraft || cameraLockOffsetForBlocking(displayedShot?.blocking);
    const selectedKeyframe = directorKeyframes(shot?.blocking).find((keyframe) => keyframe.id === selectedKeyframeId) || null;
    const effectiveTransformMode: TransformMode = selectedId === CAMERA_ID ? (currentCameraMode === "locked" || transformMode === "scale" ? "translate" : transformMode) : editorMode === "pose" ? "rotate" : transformMode;
    const sourceById = useMemo(() => new Map(sourceNodes.map((node) => [node.id, node])), [sourceNodes]);

    const commitBlocking = useCallback(
        (blocking: CanvasDirectorBlocking, record = true) => {
            const current = shotRef.current;
            if (!current) return;
            if (record) {
                historyRef.current.past = [...historyRef.current.past.slice(-39), current.blocking];
                historyRef.current.future = [];
            }
            const next = { ...current, blocking };
            shotRef.current = next;
            onShotChangeRef.current(next);
        },
        [],
    );

    const updateActor = (id: string, patch: Partial<Actor>, record = true) => {
        const current = shotRef.current;
        if (!current) return;
        if (editorModeRef.current === "animate") {
            const evaluated = evaluateDirectorShot(current, playheadRef.current);
            const actor = evaluated.blocking.actors.find((item) => item.id === id);
            if (!actor) return;
            const frame = captureDirectorKeyframe({ ...evaluated, blocking: { ...evaluated.blocking, actors: evaluated.blocking.actors.map((item) => item.id === id ? { ...item, ...patch } : item) } }, id, playheadRef.current, current.blocking);
            if (!frame) return;
            commitBlocking({ ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) }, record);
            setSelectedKeyframeId(frame.id);
            return;
        }
        const actors = current.blocking.actors.map((actor) => (actor.id === id ? { ...actor, ...patch } : actor));
        const lockedId = current.blocking.cameraLockedActorId || actors[0]?.id;
        const lockedActor = cameraMovementMode(current.blocking) === "locked" ? actors.find((actor) => actor.id === lockedId) : undefined;
        commitBlocking({ ...current.blocking, actors, ...(lockedActor ? { cameraTarget: actorHeadTarget(lockedActor) } : {}) }, record);
    };
    const updateLight = (id: string, patch: Partial<StageLight>, record = true) => {
        const current = shotRef.current;
        if (!current) return;
        if (editorModeRef.current === "animate") {
            const evaluated = evaluateDirectorShot(current, playheadRef.current);
            const light = evaluated.blocking.lights.find((item) => item.id === id);
            if (!light) return;
            const frame = captureDirectorKeyframe({ ...evaluated, blocking: { ...evaluated.blocking, lights: evaluated.blocking.lights.map((item) => item.id === id ? { ...item, ...patch } : item) } }, id, playheadRef.current, current.blocking);
            if (!frame) return;
            commitBlocking({ ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) }, record);
            setSelectedKeyframeId(frame.id);
            return;
        }
        commitBlocking({ ...current.blocking, lights: current.blocking.lights.map((light) => (light.id === id ? { ...light, ...patch } : light)) }, record);
    };
    const updateCamera = (key: "cameraPosition" | "cameraTarget", index: number, value: number | null) => {
        const current = shotRef.current;
        if (!current || value === null) return;
        if (editorModeRef.current === "animate") {
            const evaluated = evaluateDirectorShot(current, playheadRef.current);
            const vector = [...evaluated.blocking[key]] as [number, number, number];
            vector[index] = value;
            const frame = captureDirectorKeyframe({ ...evaluated, blocking: { ...evaluated.blocking, [key]: vector } }, CAMERA_ID, playheadRef.current, current.blocking);
            if (!frame) return;
            commitBlocking({ ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) });
            setSelectedKeyframeId(frame.id);
            return;
        }
        const vector = [...current.blocking[key]] as [number, number, number];
        vector[index] = value;
        if (key === "cameraPosition" && cameraMovementMode(current.blocking) === "free") {
            const cameraTarget = [...current.blocking.cameraTarget] as [number, number, number];
            cameraTarget[index] += value - current.blocking.cameraPosition[index];
            commitBlocking({ ...current.blocking, cameraPosition: vector, cameraTarget });
            return;
        }
        commitBlocking({ ...current.blocking, [key]: vector });
    };
    const updateCameraMode = (mode: CameraMovementMode) => {
        const current = shotRef.current;
        if (!current) return;
        const lockedActor = current.blocking.actors.find((actor) => actor.id === current.blocking.cameraLockedActorId) || current.blocking.actors[0];
        if (editorModeRef.current === "animate") {
            const evaluated = evaluateDirectorShot(current, playheadRef.current);
            const blocking = mode === "locked" && lockedActor ? { ...evaluated.blocking, cameraMovementMode: mode, cameraLockedActorId: lockedActor.id, cameraTarget: actorHeadTarget(lockedActor) } : { ...evaluated.blocking, cameraMovementMode: "free" as const };
            const frame = captureDirectorKeyframe({ ...evaluated, blocking }, CAMERA_ID, playheadRef.current, current.blocking);
            if (!frame) return;
            commitBlocking({ ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) });
            setSelectedKeyframeId(frame.id);
            if (mode === "locked") setTransformMode("translate");
            return;
        }
        if (mode === "locked" && lockedActor) {
            commitBlocking({ ...current.blocking, cameraMovementMode: mode, cameraLockedActorId: lockedActor.id, cameraTarget: actorHeadTarget(lockedActor) });
            setTransformMode("translate");
            return;
        }
        commitBlocking({ ...current.blocking, cameraMovementMode: "free" });
    };
    const updateLockedActor = (cameraLockedActorId: string) => {
        const current = shotRef.current;
        const actor = current?.blocking.actors.find((item) => item.id === cameraLockedActorId);
        if (!current || !actor) return;
        if (editorModeRef.current === "animate") {
            const evaluated = evaluateDirectorShot(current, playheadRef.current);
            const frame = captureDirectorKeyframe({ ...evaluated, blocking: { ...evaluated.blocking, cameraMovementMode: "locked", cameraLockedActorId, cameraTarget: actorHeadTarget(actor) } }, CAMERA_ID, playheadRef.current, current.blocking);
            if (!frame) return;
            commitBlocking({ ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) });
            setSelectedKeyframeId(frame.id);
            return;
        }
        commitBlocking({ ...current.blocking, cameraMovementMode: "locked", cameraLockedActorId, cameraTarget: actorHeadTarget(actor) });
    };
    const centerLockedFocus = () => {
        const current = shotRef.current;
        if (!current) return;
        if (editorModeRef.current === "animate") {
            const evaluated = evaluateDirectorShot(current, playheadRef.current);
            const frame = captureDirectorKeyframe({ ...evaluated, blocking: { ...evaluated.blocking, cameraLockOffset: [0, 0] } }, CAMERA_ID, playheadRef.current, current.blocking);
            if (!frame) return;
            commitBlocking({ ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) });
            setSelectedKeyframeId(frame.id);
            return;
        }
        commitBlocking({ ...current.blocking, cameraLockOffset: [0, 0] });
    };
    const updateFocusOffsetFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
        const current = shotRef.current;
        if (!current || cameraMovementMode(current.blocking) !== "locked") return;
        const rect = event.currentTarget.getBoundingClientRect();
        const cameraLockOffset: [number, number] = [
            THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -CAMERA_LOCK_OFFSET_LIMIT, CAMERA_LOCK_OFFSET_LIMIT),
            THREE.MathUtils.clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -CAMERA_LOCK_OFFSET_LIMIT, CAMERA_LOCK_OFFSET_LIMIT),
        ];
        if (editorModeRef.current === "animate") {
            const evaluated = evaluateDirectorShot(current, playheadRef.current);
            const frame = captureDirectorKeyframe({ ...evaluated, blocking: { ...evaluated.blocking, cameraLockOffset } }, CAMERA_ID, playheadRef.current, current.blocking);
            if (frame) {
                shotRef.current = { ...current, blocking: { ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) } };
                setSelectedKeyframeId(frame.id);
            }
        } else {
            shotRef.current = { ...current, blocking: { ...current.blocking, cameraLockOffset } };
        }
        setFocusOffsetDraft(cameraLockOffset);
    };
    const startFocusDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const current = shotRef.current;
        if (event.button !== 0 || !current || cameraMovementMode(current.blocking) !== "locked") return;
        event.preventDefault();
        focusDragStartRef.current = current.blocking;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFocusOffsetFromPointer(event);
    };
    const moveFocusDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFocusOffsetFromPointer(event);
    };
    const finishFocusDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const start = focusDragStartRef.current;
        if (!start) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        historyRef.current.past = [...historyRef.current.past.slice(-39), start];
        historyRef.current.future = [];
        focusDragStartRef.current = null;
        setFocusOffsetDraft(null);
        if (shotRef.current) onShotChangeRef.current(shotRef.current);
    };
    const seekTimeline = (time: number) => {
        const duration = Math.max(4, shotRef.current?.durationSeconds || 4);
        const next = THREE.MathUtils.clamp(time, 0, duration);
        playheadRef.current = next;
        setPlayhead(next);
    };
    const addTimelineKeyframe = () => {
        const current = shotRef.current;
        if (!current) return;
        const frame = captureDirectorKeyframe(evaluateDirectorShot(current, playheadRef.current), selectedId, playheadRef.current, current.blocking);
        if (!frame) return;
        commitBlocking({ ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) });
        setSelectedKeyframeId(frame.id);
    };
    const updateTimelineKeyframe = (id: string, patch: Partial<CanvasDirectorKeyframe>) => {
        const current = shotRef.current;
        if (!current) return;
        const duration = Math.max(4, current.durationSeconds);
        const keyframes = directorKeyframes(current.blocking).map((frame) => frame.id === id ? { ...frame, ...patch, ...(patch.time === undefined ? {} : { time: THREE.MathUtils.clamp(patch.time, 0, duration) }) } : frame);
        commitBlocking({ ...current.blocking, keyframes: sortDirectorKeyframes(keyframes) });
        if (patch.time !== undefined) seekTimeline(patch.time);
    };
    const deleteTimelineKeyframe = (id = selectedKeyframeId) => {
        const current = shotRef.current;
        if (!current || !id) return;
        commitBlocking({ ...current.blocking, keyframes: directorKeyframes(current.blocking).filter((frame) => frame.id !== id) });
        setSelectedKeyframeId(null);
    };
    const selectTimelineKeyframe = (frame: CanvasDirectorKeyframe) => {
        setSelectedKeyframeId(frame.id);
        setSelectedId(frame.targetId);
        seekTimeline(frame.time);
    };
    const previewTimelineKeyframeTime = (id: string, time: number) => {
        const current = shotRef.current;
        if (!current) return;
        if (!keyframeDragStartRef.current) keyframeDragStartRef.current = current.blocking;
        const duration = Math.max(4, current.durationSeconds);
        const nextTime = THREE.MathUtils.clamp(time, 0, duration);
        const keyframes = directorKeyframes(current.blocking).map((frame) => frame.id === id ? { ...frame, time: nextTime } : frame);
        shotRef.current = { ...current, blocking: { ...current.blocking, keyframes: sortDirectorKeyframes(keyframes) } };
        seekTimeline(nextTime);
    };
    const finishTimelineKeyframeDrag = () => {
        const start = keyframeDragStartRef.current;
        if (!start) return;
        historyRef.current.past = [...historyRef.current.past.slice(-39), start];
        historyRef.current.future = [];
        keyframeDragStartRef.current = null;
        if (shotRef.current) onShotChangeRef.current(shotRef.current);
    };

    useEffect(() => {
        const host = stageHost;
        if (!open || !shot || !host || !previewHost) return;
        const runtime = createRuntime(host, previewHost, aspectRatioValue(scene?.aspectRatio), shot, {
            onSelect: setSelectedId,
            onTransformStart: () => {
                transformDraggingRef.current = true;
                playingRef.current = false;
                setPlaying(false);
                transformStartRef.current = shotRef.current?.blocking || null;
                activeTransformKeyframeRef.current = null;
            },
            onTransform: (id, object) => {
                const current = shotRef.current;
                if (!current) return;
                if (editorModeRef.current === "animate") {
                    const frame = captureDirectorKeyframe(evaluateDirectorShot(current, playheadRef.current), id, playheadRef.current, current.blocking, object);
                    if (!frame) return;
                    activeTransformKeyframeRef.current = frame.id;
                    shotRef.current = { ...current, blocking: { ...current.blocking, keyframes: upsertDirectorKeyframe(current.blocking, frame) } };
                    return;
                }
                if (id === CAMERA_ID) {
                    const cameraPosition = object.position.toArray() as [number, number, number];
                    if (cameraMovementMode(current.blocking) === "free") {
                        const focusDistance = Math.max(0.5, new THREE.Vector3().fromArray(current.blocking.cameraPosition).distanceTo(new THREE.Vector3().fromArray(current.blocking.cameraTarget)));
                        const direction = object.getWorldDirection(new THREE.Vector3());
                        const cameraTarget = object.position.clone().addScaledVector(direction, focusDistance).toArray() as [number, number, number];
                        shotRef.current = { ...current, blocking: { ...current.blocking, cameraPosition, cameraTarget } };
                    } else {
                        shotRef.current = { ...current, blocking: { ...current.blocking, cameraPosition } };
                    }
                    return;
                }
                const actor = current.blocking.actors.find((item) => item.id === id);
                if (actor) {
                    const nextActor = {
                        ...actor,
                        position: object.position.toArray() as [number, number, number],
                        rotation: [THREE.MathUtils.radToDeg(object.rotation.x), THREE.MathUtils.radToDeg(object.rotation.y), THREE.MathUtils.radToDeg(object.rotation.z)] as [number, number, number],
                        scale: object.scale.toArray() as [number, number, number],
                    };
                    const actors = current.blocking.actors.map((item) => item.id === id ? nextActor : item);
                    const lockedId = current.blocking.cameraLockedActorId || actors[0]?.id;
                    shotRef.current = {
                        ...current,
                        blocking: {
                            ...current.blocking,
                            actors,
                            ...(cameraMovementMode(current.blocking) === "locked" && id === lockedId ? { cameraTarget: actorHeadTarget(nextActor) } : {}),
                        },
                    };
                    return;
                }
                const light = current.blocking.lights.find((item) => item.id === id);
                if (light) {
                    shotRef.current = {
                        ...current,
                        blocking: { ...current.blocking, lights: current.blocking.lights.map((item) => (item.id === id ? { ...item, position: object.position.toArray() as [number, number, number] } : item)) },
                    };
                }
            },
            onTransformEnd: () => {
                transformDraggingRef.current = false;
                const start = transformStartRef.current;
                if (start) historyRef.current.past = [...historyRef.current.past.slice(-39), start];
                historyRef.current.future = [];
                transformStartRef.current = null;
                if (activeTransformKeyframeRef.current) setSelectedKeyframeId(activeTransformKeyframeRef.current);
                activeTransformKeyframeRef.current = null;
                if (shotRef.current) onShotChangeRef.current(shotRef.current);
            },
        });
        runtimeRef.current = runtime;
        selectRuntimeObject(runtime, selectedId, effectiveTransformMode, viewMode);

        let lastUiUpdate = 0;
        const animate = (now: number) => {
            runtime.animationFrame = requestAnimationFrame(animate);
            const delta = lastFrameRef.current ? Math.min((now - lastFrameRef.current) / 1000, 0.1) : 0;
            lastFrameRef.current = now;
            const currentShot = shotRef.current;
            if (currentShot && playingRef.current) {
                const duration = Math.max(4, currentShot.durationSeconds);
                playheadRef.current += delta;
                if (playheadRef.current > duration) playheadRef.current = recordingRef.current ? duration : 0;
                if (now - lastUiUpdate > 80) {
                    lastUiUpdate = now;
                    setPlayhead(playheadRef.current);
                }
            }
            if (currentShot && !recordingRef.current) {
                const renderedShot = playingRef.current || editorModeRef.current === "animate" ? evaluateDirectorShot(currentShot, playheadRef.current) : currentShot;
                syncRuntime(runtime, renderedShot, transformDraggingRef.current ? runtime.selectedId : undefined);
                animateActors(runtime, renderedShot.blocking.actors, playheadRef.current, directorKeyframes(currentShot.blocking));
                runtime.orbit.update();
                renderRuntime(runtime);
            }
        };
        runtime.animationFrame = requestAnimationFrame(animate);

        return () => {
            transformDraggingRef.current = false;
            destroyRuntime(runtime);
            if (runtimeRef.current === runtime) runtimeRef.current = null;
            lastFrameRef.current = 0;
        };
        // Rebuild only for a new shot; all edits are synchronized into the existing runtime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, previewHost, scene?.aspectRatio, shot?.id, stageHost]);

    useEffect(() => {
        const runtime = runtimeRef.current;
        if (!runtime || !shot) return;
        runtime.renderMode = renderMode;
        runtime.viewMode = viewMode;
        syncRuntime(runtime, shot);
        selectRuntimeObject(runtime, selectedId, effectiveTransformMode, viewMode);
    }, [effectiveTransformMode, renderMode, selectedId, shot?.blocking.cameraMovementMode, transformMode, viewMode]);

    const undo = () => {
        if (!shot) return;
        const previous = historyRef.current.past.at(-1);
        if (!previous) return;
        historyRef.current.past = historyRef.current.past.slice(0, -1);
        historyRef.current.future = [shot.blocking, ...historyRef.current.future].slice(0, 40);
        commitBlocking(previous, false);
    };
    const redo = () => {
        if (!shot) return;
        const next = historyRef.current.future[0];
        if (!next) return;
        historyRef.current.future = historyRef.current.future.slice(1);
        historyRef.current.past = [...historyRef.current.past, shot.blocking].slice(-40);
        commitBlocking(next, false);
    };

    const addActor = () => {
        if (!shot) return;
        const index = shot.blocking.actors.length + 1;
        const actor: Actor = {
            id: nanoid(),
            name: `${t("canvas.director.actor")} ${index}`,
            position: [(index - 1) * 1.2, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            uniformScale: true,
            color: ["#f2f2f2", "#1677ff", "#e5484d", "#f5b942", "#2eb67d"][index % 5],
            actionClip: "idle",
            playbackSpeed: 1,
            loop: true,
            visible: true,
            castShadow: true,
        };
        commitBlocking({ ...shot.blocking, actors: [...shot.blocking.actors, actor] });
        setSelectedId(actor.id);
    };

    const deleteSelected = () => {
        if (!shot || selectedId === CAMERA_ID) return;
        const actors = shot.blocking.actors.filter((actor) => actor.id !== selectedId);
        const nextLockedActor = actors.find((actor) => actor.id === shot.blocking.cameraLockedActorId) || actors[0];
        commitBlocking({
            ...shot.blocking,
            actors,
            lights: shot.blocking.lights.filter((light) => light.id !== selectedId),
            keyframes: directorKeyframes(shot.blocking).filter((frame) => frame.targetId !== selectedId),
            ...(cameraMovementMode(shot.blocking) === "locked"
                ? nextLockedActor
                    ? { cameraLockedActorId: nextLockedActor.id, cameraTarget: actorHeadTarget(nextLockedActor) }
                    : { cameraMovementMode: "free", cameraLockedActorId: undefined }
                : {}),
        });
        setSelectedId(CAMERA_ID);
    };

    const applyShot = async () => {
        const runtime = runtimeRef.current;
        const current = shotRef.current;
        if (!runtime || !current) return;
        setApplying(true);
        try {
            const dataUrl = captureFrame(runtime, "beauty", aspectRatioValue(scene?.aspectRatio));
            await onApplyShot(current, dataUrl);
            message.success(t("canvas.director.applied"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.director.applyFailed"));
        } finally {
            setApplying(false);
        }
    };

    const exportWhitebox = async () => {
        const runtime = runtimeRef.current;
        const current = shotRef.current;
        if (!runtime || !current) return;
        setExporting(true);
        try {
            playheadRef.current = 0;
            setPlayhead(0);
            recordingRef.current = true;
            playingRef.current = false;
            setPlaying(false);
            const blob = await recordWhitebox(runtime, current, Math.max(4, Math.min(30, current.durationSeconds)), aspectRatioValue(scene?.aspectRatio));
            await onExportWhitebox(current, blob);
            message.success(t("canvas.director.whiteboxExported"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.director.whiteboxExportFailed"));
        } finally {
            recordingRef.current = false;
            playingRef.current = false;
            setPlaying(false);
            setExporting(false);
        }
    };

    return (
        <Modal
            open={open && Boolean(scene && shot)}
            width="calc(100vw - 44px)"
            centered
            closeIcon={null}
            footer={null}
            title={null}
            onCancel={onClose}
            destroyOnHidden
            forceRender
            styles={{ container: { padding: 0, overflow: "hidden" }, body: { height: "calc(100vh - 72px)", minHeight: 680, padding: 0 } }}
        >
            {scene && shot ? (
                <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
                    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 px-3">
                        <Button type="text" size="small" icon={<X className="size-4" />} onClick={onClose} />
                        <div className="flex items-center gap-2 pr-3 text-sm font-semibold"><Clapperboard className="size-4" />{t("canvas.director.threeDTitle")}</div>
                        <Input className="!w-48" size="small" value={shot.title} onChange={(event) => onShotChange({ ...shot, title: event.target.value })} />
                        <Button type="text" size="small" icon={<Undo2 className="size-4" />} disabled={!historyRef.current.past.length} onClick={undo} />
                        <Button type="text" size="small" icon={<Redo2 className="size-4" />} disabled={!historyRef.current.future.length} onClick={redo} />
                        <Segmented
                            size="small"
                            value={editorMode}
                            options={(["layout", "pose", "animate", "camera"] as EditorMode[]).map((value) => ({ value, label: t(`canvas.director.mode.${value}`) }))}
                            onChange={(value) => {
                                const mode = value as EditorMode;
                                editorModeRef.current = mode;
                                setEditorMode(mode);
                                if (mode === "camera") setSelectedId(CAMERA_ID);
                            }}
                        />
                        <div className="ml-auto flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Save className="size-3.5" />{t("canvas.director.saved")}</span>
                            <Button size="small" onClick={onOpenPlanner}>{t("canvas.director.aiPlan")}</Button>
                            <Select size="small" className="w-28" value={renderMode} options={(["beauty", "clay", "depth", "normal"] as RenderMode[]).map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={(value) => setRenderMode(value)} />
                            <Button size="small" loading={exporting} icon={exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Video className="size-4" />} onClick={() => void exportWhitebox()}>{t("canvas.director.exportWhitebox")}</Button>
                            <Button type="primary" size="small" loading={applying} icon={<Save className="size-4" />} onClick={() => void applyShot()}>{t("canvas.director.applyToShot")}</Button>
                        </div>
                    </header>

                    <div className="grid min-h-0 flex-1 grid-cols-[236px_minmax(0,1fr)_292px]">
                        <aside className="grid min-h-0 grid-cols-[44px_1fr] border-r border-border/70 bg-muted/10">
                            <div className="flex flex-col items-center gap-2 border-r border-border/60 py-3">
                                <RailButton active={sceneFilter === "all"} label={t("canvas.director.scene")} icon={<Box className="size-4" />} onClick={() => setSceneFilter("all")} />
                                <RailButton active={sceneFilter === "actors"} label={t("canvas.director.actors")} icon={<CircleUserRound className="size-4" />} onClick={() => setSceneFilter("actors")} />
                                <RailButton active={sceneFilter === "camera"} label={t("canvas.director.cameras")} icon={<Camera className="size-4" />} onClick={() => setSceneFilter("camera")} />
                                <RailButton active={sceneFilter === "lights"} label={t("canvas.director.lights")} icon={<Lightbulb className="size-4" />} onClick={() => setSceneFilter("lights")} />
                            </div>
                            <div className="min-w-0 p-3">
                                <div className="mb-3 flex items-center justify-between text-xs font-semibold"><span>{t("canvas.director.scene")}</span><Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={addActor} /></div>
                                {(sceneFilter === "all" || sceneFilter === "camera") ? <SceneRow id={CAMERA_ID} selected={selectedId === CAMERA_ID} icon={<Camera className="size-3.5" />} label={t("canvas.director.mainCamera")} onSelect={setSelectedId} /> : null}
                                {(sceneFilter === "all" || sceneFilter === "actors") ? shot.blocking.actors.map((actor) => <SceneRow key={actor.id} id={actor.id} selected={selectedId === actor.id} icon={<CircleUserRound className="size-3.5" />} label={actor.name} visible={actor.visible} onSelect={setSelectedId} />) : null}
                                {(sceneFilter === "all" || sceneFilter === "lights") ? shot.blocking.lights.map((light) => <SceneRow key={light.id} id={light.id} selected={selectedId === light.id} icon={<Lightbulb className="size-3.5" />} label={light.name} visible={light.visible} onSelect={setSelectedId} />) : null}
                            </div>
                        </aside>

                        <main className="relative min-h-0 overflow-hidden bg-[#08090b]">
                            <div className="absolute left-4 top-3 z-10 text-xs text-white/80">{shot.title} · {t("canvas.director.mainCamera")} · {shot.durationSeconds}s</div>
                            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2"><Segmented size="small" value={viewMode} options={[{ value: "stage", label: t("canvas.director.directorView") }, { value: "camera", label: t("canvas.director.cameraView") }]} onChange={(value) => setViewMode(value as ViewMode)} /></div>
                            <div ref={setStageHost} className="absolute inset-0 [&>canvas]:block [&>canvas]:size-full" />
                            <div className="absolute right-4 top-14 z-10 w-[clamp(260px,29vw,380px)] overflow-hidden rounded-xl border border-white/15 bg-black/85 text-white shadow-2xl backdrop-blur-md">
                                <div className="flex h-8 items-center gap-2 border-b border-white/10 px-3 text-[11px]">
                                    <span className="size-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.9)]" />
                                    <span className="font-medium">{t("canvas.director.livePreview")}</span>
                                    <span className="ml-auto tabular-nums text-white/60">{scene.aspectRatio} · {shot.cameraControl.focalLengthMm}mm · f/{shot.cameraControl.apertureF}</span>
                                </div>
                                <div className="relative bg-black" style={{ aspectRatio: scene.aspectRatio.replace(":", " / ") }} onDoubleClick={() => setViewMode("camera")}>
                                    <div ref={setPreviewHost} className="absolute inset-0 [&>canvas]:block [&>canvas]:size-full" />
                                    <div className="pointer-events-none absolute inset-[7%] border border-white/20">
                                        <span className="absolute left-1/3 top-0 h-full border-l border-white/10" />
                                        <span className="absolute left-2/3 top-0 h-full border-l border-white/10" />
                                        <span className="absolute left-0 top-1/3 w-full border-t border-white/10" />
                                        <span className="absolute left-0 top-2/3 w-full border-t border-white/10" />
                                    </div>
                                    <div
                                        data-testid="camera-lock-focus-surface"
                                        className={`absolute inset-0 z-10 ${currentCameraMode === "locked" ? "cursor-crosshair touch-none" : "pointer-events-none"}`}
                                        onPointerDown={startFocusDrag}
                                        onPointerMove={moveFocusDrag}
                                        onPointerUp={finishFocusDrag}
                                        onPointerCancel={finishFocusDrag}
                                    >
                                        <span
                                            data-testid="camera-lock-reticle"
                                            className={`pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-[0_0_8px_rgba(34,211,238,.65)] ${currentCameraMode === "locked" ? "border-cyan-300" : "border-white/35"}`}
                                            style={{ left: `${50 + cameraLockOffset[0] * 50}%`, top: `${50 - cameraLockOffset[1] * 50}%` }}
                                        >
                                            <span className="absolute left-1/2 top-[-5px] h-[28px] -translate-x-1/2 border-l border-current" />
                                            <span className="absolute left-[-5px] top-1/2 w-[28px] -translate-y-1/2 border-t border-current" />
                                        </span>
                                    </div>
                                </div>
                                <div className="flex h-7 items-center justify-between px-3 text-[10px] text-white/50">
                                    <span>{currentCameraMode === "locked" ? t("canvas.director.dragFocusHint") : t("canvas.director.livePreviewHint")}</span>
                                    <span>{currentCameraMode === "locked" && lockedActor ? t("canvas.director.focusActor", { name: lockedActor.name }) : t("canvas.director.focusTarget")}</span>
                                </div>
                            </div>
                            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/75 p-1.5 text-white shadow-xl backdrop-blur">
                                <DockButton active={transformMode === "translate"} label={t("canvas.director.translate")} icon={<Move3d className="size-4" />} onClick={() => setTransformMode("translate")} />
                                <DockButton active={effectiveTransformMode === "rotate"} disabled={selectedId === CAMERA_ID && currentCameraMode === "locked"} label={currentCameraMode === "locked" && selectedId === CAMERA_ID ? t("canvas.director.rotateLockedHint") : t("canvas.director.rotate")} icon={<Rotate3d className="size-4" />} onClick={() => setTransformMode("rotate")} />
                                <DockButton active={effectiveTransformMode === "scale"} disabled={selectedId === CAMERA_ID} label={selectedId === CAMERA_ID ? t("canvas.director.cameraScaleUnavailable") : t("canvas.director.scale")} icon={<Scan className="size-4" />} onClick={() => setTransformMode("scale")} />
                                <span className="mx-1 h-5 w-px bg-white/15" />
                                <DockButton label={t("canvas.director.addActor")} icon={<CircleUserRound className="size-4" />} onClick={addActor} />
                                <DockButton label={t("canvas.director.deleteSelected")} icon={<Trash2 className="size-4" />} onClick={deleteSelected} />
                                <span className="mx-1 h-5 w-px bg-white/15" />
                                <DockButton active={viewMode === "camera"} label={t("canvas.director.cameraView")} icon={<Camera className="size-4" />} onClick={() => setViewMode((value) => (value === "camera" ? "stage" : "camera"))} />
                            </div>
                            {editorMode === "animate" ? (
                                <DirectorTimeline
                                    shot={shot}
                                    selectedId={selectedId}
                                    selectedKeyframeId={selectedKeyframeId}
                                    playhead={playhead}
                                    playing={playing}
                                    onPlayingChange={setPlaying}
                                    onSeek={seekTimeline}
                                    onAddKeyframe={addTimelineKeyframe}
                                    onDeleteKeyframe={() => deleteTimelineKeyframe()}
                                    onSelectTrack={setSelectedId}
                                    onSelectKeyframe={selectTimelineKeyframe}
                                    onPreviewKeyframeTime={previewTimelineKeyframeTime}
                                    onFinishKeyframeDrag={finishTimelineKeyframeDrag}
                                />
                            ) : null}
                        </main>

                        <aside className="thin-scrollbar min-h-0 overflow-y-auto border-l border-border/70 bg-muted/10 p-4">
                            {selectedActor ? <ActorInspector actor={selectedActor} sourceTitle={selectedActor.sourceNodeId ? sourceById.get(selectedActor.sourceNodeId)?.title : undefined} onChange={(patch) => updateActor(selectedActor.id, patch)} /> : selectedLight ? <LightInspector light={selectedLight} onChange={(patch) => updateLight(selectedLight.id, patch)} /> : <CameraInspector shot={shot} displayBlocking={displayedShot?.blocking} onCameraVector={updateCamera} onCameraMode={updateCameraMode} onLockedActor={updateLockedActor} onCenterLockedFocus={centerLockedFocus} onShotChange={onShotChange} />}
                            {editorMode === "animate" && selectedKeyframe ? <KeyframeInspector keyframe={selectedKeyframe} duration={Math.max(4, shot.durationSeconds)} onChange={(patch) => updateTimelineKeyframe(selectedKeyframe.id, patch)} onDelete={() => deleteTimelineKeyframe(selectedKeyframe.id)} /> : null}
                        </aside>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}

function DirectorTimeline({ shot, selectedId, selectedKeyframeId, playhead, playing, onPlayingChange, onSeek, onAddKeyframe, onDeleteKeyframe, onSelectTrack, onSelectKeyframe, onPreviewKeyframeTime, onFinishKeyframeDrag }: { shot: CanvasDirectorShot; selectedId: string; selectedKeyframeId: string | null; playhead: number; playing: boolean; onPlayingChange: (playing: boolean) => void; onSeek: (time: number) => void; onAddKeyframe: () => void; onDeleteKeyframe: () => void; onSelectTrack: (id: string) => void; onSelectKeyframe: (keyframe: CanvasDirectorKeyframe) => void; onPreviewKeyframeTime: (id: string, time: number) => void; onFinishKeyframeDrag: () => void }) {
    const { t } = useTranslation();
    const duration = Math.max(4, shot.durationSeconds);
    const keyframes = directorKeyframes(shot.blocking);
    const [dragging, setDragging] = useState<{ id: string; time: number } | null>(null);
    const tracks = [
        { id: CAMERA_ID, label: t("canvas.director.mainCamera"), type: "camera" as const },
        ...shot.blocking.actors.map((actor) => ({ id: actor.id, label: actor.name, type: "actor" as const })),
        ...shot.blocking.lights.map((light) => ({ id: light.id, label: light.name, type: "light" as const })),
    ];
    const timeFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
        const rail = event.currentTarget.parentElement;
        if (!rail) return 0;
        const rect = rail.getBoundingClientRect();
        return THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * duration, 0, duration);
    };
    const startMarkerDrag = (event: ReactPointerEvent<HTMLButtonElement>, frame: CanvasDirectorKeyframe) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging({ id: frame.id, time: frame.time });
        onSelectKeyframe(frame);
    };
    const moveMarker = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!dragging || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const time = timeFromPointer(event);
        setDragging({ id: dragging.id, time });
        onPreviewKeyframeTime(dragging.id, time);
    };
    const finishMarkerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!dragging) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(null);
        onFinishKeyframeDrag();
    };
    return (
        <div className="absolute inset-x-3 bottom-14 z-10 overflow-hidden rounded-xl border border-white/10 bg-black/85 text-white shadow-2xl backdrop-blur">
            <div className="flex h-10 items-center gap-2 border-b border-white/10 px-2.5">
                <Button type="text" size="small" className="!text-white" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => onPlayingChange(!playing)} />
                <span className="w-24 text-xs tabular-nums">{playhead.toFixed(2)}s / {duration.toFixed(1)}s</span>
                <Slider className="min-w-0 flex-1" min={0} max={duration} step={0.01} value={playhead} onChange={onSeek} />
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onAddKeyframe}>{t("canvas.director.addKeyframe")}</Button>
                <Button size="small" danger disabled={!selectedKeyframeId} icon={<Trash2 className="size-3.5" />} onClick={onDeleteKeyframe}>{t("canvas.director.deleteKeyframe")}</Button>
            </div>
            <div className="thin-scrollbar max-h-40 overflow-y-auto py-1">
                {tracks.map((track) => {
                    const frames = keyframes.filter((frame) => frame.targetType === track.type && frame.targetId === track.id);
                    return (
                        <div key={`${track.type}-${track.id}`} className={`grid h-7 grid-cols-[104px_minmax(0,1fr)] items-center px-2 ${selectedId === track.id ? "bg-white/7" : ""}`}>
                            <button type="button" className="truncate pr-2 text-left text-[10px] text-white/65 hover:text-white" onClick={() => onSelectTrack(track.id)}>{track.label}</button>
                            <div className="relative h-4 cursor-pointer border-l border-r border-white/10 bg-white/[.03]" onPointerDown={(event) => {
                                if (event.button !== 0 || event.target !== event.currentTarget) return;
                                const rect = event.currentTarget.getBoundingClientRect();
                                onSeek((event.clientX - rect.left) / rect.width * duration);
                            }}>
                                {[0.25, 0.5, 0.75].map((ratio) => <span key={ratio} className="pointer-events-none absolute top-0 h-full border-l border-white/8" style={{ left: `${ratio * 100}%` }} />)}
                                <span className="pointer-events-none absolute top-0 h-full border-l border-cyan-300/80" style={{ left: `${playhead / duration * 100}%` }} />
                                {frames.map((frame) => {
                                    const time = dragging?.id === frame.id ? dragging.time : frame.time;
                                    return <button key={frame.id} type="button" title={`${time.toFixed(2)}s · ${t(`canvas.director.interpolation.${frame.interpolation}`)}`} className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border ${selectedKeyframeId === frame.id ? "border-cyan-200 bg-cyan-400" : "border-white/70 bg-black hover:bg-white/30"}`} style={{ left: `${time / duration * 100}%` }} onPointerDown={(event) => startMarkerDrag(event, frame)} onPointerMove={moveMarker} onPointerUp={finishMarkerDrag} onPointerCancel={finishMarkerDrag} />;
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function KeyframeInspector({ keyframe, duration, onChange, onDelete }: { keyframe: CanvasDirectorKeyframe; duration: number; onChange: (patch: Partial<CanvasDirectorKeyframe>) => void; onDelete: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="mt-5 border-t border-border/60 pt-4">
            <div className="mb-3 text-sm font-semibold">{t("canvas.director.keyframe")}</div>
            <label className="mb-4 block text-xs"><span className="mb-1.5 block text-muted-foreground">{t("canvas.director.keyframeTime")}</span><InputNumber className="w-full" min={0} max={duration} step={0.1} value={Number(keyframe.time.toFixed(2))} onChange={(time) => time !== null && onChange({ time })} /></label>
            <label className="mb-4 block text-xs"><span className="mb-1.5 block text-muted-foreground">{t("canvas.director.interpolationLabel")}</span><Select className="w-full" value={keyframe.interpolation} options={(Object.keys({ linear: 1, easeInOut: 1, bezier: 1 }) as CanvasDirectorInterpolation[]).map((value) => ({ value, label: t(`canvas.director.interpolation.${value}`) }))} onChange={(interpolation) => onChange({ interpolation })} /></label>
            {keyframe.interpolation === "bezier" ? <VectorEditor label={t("canvas.director.curveOffset")} values={keyframe.curveOffset} step={0.1} onChange={(index, value) => { if (value === null) return; const curveOffset = [...keyframe.curveOffset] as [number, number, number]; curveOffset[index] = value; onChange({ curveOffset }); }} /> : null}
            <div className="mb-3 text-[11px] leading-4 text-muted-foreground">{t("canvas.director.keyframeRangeHint")}</div>
            <Button danger size="small" block icon={<Trash2 className="size-3.5" />} onClick={onDelete}>{t("canvas.director.deleteKeyframe")}</Button>
        </div>
    );
}

function ActorInspector({ actor, sourceTitle, onChange }: { actor: Actor; sourceTitle?: string; onChange: (patch: Partial<Actor>) => void }) {
    const { t } = useTranslation();
    const vectorChange = (key: "position" | "rotation" | "scale", index: number, value: number | null) => {
        if (value === null) return;
        const vector = [...actor[key]] as [number, number, number];
        if (key === "scale" && actor.uniformScale) vector.fill(value);
        else vector[index] = value;
        onChange({ [key]: vector });
    };
    return (
        <>
            <Input className="mb-4" variant="borderless" value={actor.name} onChange={(event) => onChange({ name: event.target.value })} />
            {sourceTitle ? <div className="mb-3 truncate text-[11px] text-muted-foreground">{t("canvas.director.sourceAsset")}: {sourceTitle}</div> : null}
            <VectorEditor label={t("canvas.director.position")} values={actor.position} step={0.1} onChange={(index, value) => vectorChange("position", index, value)} />
            <VectorEditor label={t("canvas.director.rotation")} values={actor.rotation} step={1} onChange={(index, value) => vectorChange("rotation", index, value)} />
            <VectorEditor label={t("canvas.director.scale")} values={actor.scale} step={0.1} onChange={(index, value) => vectorChange("scale", index, value)} />
            <PropertyRow label={t("canvas.director.uniformScale")}><Switch size="small" checked={actor.uniformScale} onChange={(uniformScale) => onChange({ uniformScale })} /></PropertyRow>
            <PropertyRow label={t("canvas.director.actorColor")}><ColorPicker value={actor.color} onChange={(color) => onChange({ color: color.toHexString() })} /></PropertyRow>
            <label className="mb-4 block text-xs"><span className="mb-1.5 block text-muted-foreground">{t("canvas.director.actionClip")}</span><Select className="w-full" value={actor.actionClip} options={ACTION_OPTIONS.map((value) => ({ value, label: t(`canvas.director.action.${value}`) }))} onChange={(actionClip) => onChange({ actionClip })} /></label>
            <label className="mb-4 block text-xs"><span className="mb-1.5 block text-muted-foreground">{t("canvas.director.playbackSpeed")}</span><InputNumber className="w-full" min={0.1} max={4} step={0.1} value={actor.playbackSpeed} onChange={(playbackSpeed) => playbackSpeed !== null && onChange({ playbackSpeed })} /></label>
            <PropertyRow label={t("canvas.director.loop")}><Switch size="small" checked={actor.loop} onChange={(loop) => onChange({ loop })} /></PropertyRow>
            <PropertyRow label={t("canvas.director.visible")}><Switch size="small" checked={actor.visible} onChange={(visible) => onChange({ visible })} /></PropertyRow>
            <PropertyRow label={t("canvas.director.castShadow")}><Switch size="small" checked={actor.castShadow} onChange={(castShadow) => onChange({ castShadow })} /></PropertyRow>
        </>
    );
}

function LightInspector({ light, onChange }: { light: StageLight; onChange: (patch: Partial<StageLight>) => void }) {
    const { t } = useTranslation();
    const vectorChange = (index: number, value: number | null) => {
        if (value === null) return;
        const position = [...light.position] as [number, number, number];
        position[index] = value;
        onChange({ position });
    };
    return <><Input className="mb-4" variant="borderless" value={light.name} onChange={(event) => onChange({ name: event.target.value })} />{light.type !== "ambient" ? <VectorEditor label={t("canvas.director.position")} values={light.position} step={0.1} onChange={vectorChange} /> : null}<label className="mb-4 block text-xs"><span className="mb-1 block text-muted-foreground">{t("canvas.director.intensity")}</span><Slider min={0} max={5} step={0.1} value={light.intensity} onChange={(intensity) => onChange({ intensity })} /></label><PropertyRow label={t("canvas.director.lightColor")}><ColorPicker value={light.color} onChange={(color) => onChange({ color: color.toHexString() })} /></PropertyRow><PropertyRow label={t("canvas.director.visible")}><Switch size="small" checked={light.visible} onChange={(visible) => onChange({ visible })} /></PropertyRow><PropertyRow label={t("canvas.director.castShadow")}><Switch size="small" disabled={light.type === "ambient"} checked={light.castShadow} onChange={(castShadow) => onChange({ castShadow })} /></PropertyRow></>;
}

function CameraInspector({ shot, displayBlocking = shot.blocking, onCameraVector, onCameraMode, onLockedActor, onCenterLockedFocus, onShotChange }: { shot: CanvasDirectorShot; displayBlocking?: CanvasDirectorBlocking; onCameraVector: (key: "cameraPosition" | "cameraTarget", index: number, value: number | null) => void; onCameraMode: (mode: CameraMovementMode) => void; onLockedActor: (actorId: string) => void; onCenterLockedFocus: () => void; onShotChange: (shot: CanvasDirectorShot) => void }) {
    const { t } = useTranslation();
    const mode = cameraMovementMode(displayBlocking);
    const lockedActorId = displayBlocking.cameraLockedActorId || displayBlocking.actors[0]?.id;
    return (
        <>
            <div className="mb-4 text-sm font-semibold">{t("canvas.director.mainCamera")}</div>
            <label className="mb-4 block text-xs">
                <span className="mb-1.5 block text-muted-foreground">{t("canvas.director.cameraMovementMode")}</span>
                <Segmented
                    block
                    value={mode}
                    options={[
                        { value: "locked", label: t("canvas.director.lockActor"), disabled: !displayBlocking.actors.length },
                        { value: "free", label: t("canvas.director.freeMove") },
                    ]}
                    onChange={(value) => onCameraMode(value as CameraMovementMode)}
                />
            </label>
            {mode === "locked" ? (
                <label className="mb-4 block text-xs">
                    <span className="mb-1.5 block text-muted-foreground">{t("canvas.director.lockedActor")}</span>
                    <Select className="w-full" value={lockedActorId} options={displayBlocking.actors.map((actor) => ({ value: actor.id, label: actor.name }))} onChange={onLockedActor} />
                    <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{t("canvas.director.lockActorHint")}</span>
                    <Button className="mt-2" size="small" block disabled={cameraLockOffsetForBlocking(displayBlocking).every((value) => Math.abs(value) < 0.001)} onClick={onCenterLockedFocus}>{t("canvas.director.centerLockedFocus")}</Button>
                </label>
            ) : (
                <div className="mb-4 rounded-lg border border-border/60 bg-background/50 p-2.5 text-[11px] leading-4 text-muted-foreground">{t("canvas.director.freeMoveHint")}</div>
            )}
            <VectorEditor label={t("canvas.director.position")} values={displayBlocking.cameraPosition} step={0.1} onChange={(index, value) => onCameraVector("cameraPosition", index, value)} />
            {mode === "free" ? <VectorEditor label={t("canvas.director.lookAt")} values={displayBlocking.cameraTarget} step={0.1} onChange={(index, value) => onCameraVector("cameraTarget", index, value)} /> : null}
            <label className="mb-4 block text-xs"><span className="mb-1 block text-muted-foreground">{t("canvas.director.focalLength")}</span><Slider min={18} max={200} step={1} value={shot.cameraControl.focalLengthMm} onChange={(focalLengthMm) => onShotChange({ ...shot, cameraControl: { ...shot.cameraControl, enabled: true, focalLengthMm } })} /></label>
            <label className="mb-4 block text-xs"><span className="mb-1.5 block text-muted-foreground">{t("canvas.director.aperture")}</span><Select className="w-full" value={shot.cameraControl.apertureF} options={CAMERA_APERTURES.map((value) => ({ value, label: `f/${value}` }))} onChange={(apertureF) => onShotChange({ ...shot, cameraControl: { ...shot.cameraControl, enabled: true, apertureF } })} /></label>
            <label className="mb-4 block text-xs"><span className="mb-1 block text-muted-foreground">{t("canvas.director.duration")}</span><Slider min={4} max={30} step={1} value={Math.max(4, shot.durationSeconds)} onChange={(durationSeconds) => onShotChange({ ...shot, durationSeconds, blocking: { ...shot.blocking, keyframes: sortDirectorKeyframes(directorKeyframes(shot.blocking).map((frame) => ({ ...frame, time: Math.min(frame.time, durationSeconds) }))) } })} /></label>
        </>
    );
}

function VectorEditor({ label, values, step, onChange }: { label: string; values: [number, number, number]; step: number; onChange: (index: number, value: number | null) => void }) {
    return <div className="mb-4"><div className="mb-1.5 text-xs text-muted-foreground">{label}</div><div className="grid grid-cols-3 gap-1.5">{values.map((value, index) => <InputNumber key={index} className="w-full" size="small" step={step} value={Number(value.toFixed(2))} onChange={(next) => onChange(index, next)} />)}</div></div>;
}

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
    return <div className="mb-4 flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span>{children}</div>;
}

function SceneRow({ id, selected, icon, label, visible = true, onSelect }: { id: string; selected: boolean; icon: ReactNode; label: string; visible?: boolean; onSelect: (id: string) => void }) {
    return <button type="button" className={`mb-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition ${selected ? "bg-primary/12 text-primary" : "hover:bg-black/5 dark:hover:bg-white/8"}`} onClick={() => onSelect(id)}>{icon}<span className="min-w-0 flex-1 truncate">{label}</span>{visible ? <Eye className="size-3 opacity-50" /> : null}</button>;
}

function RailButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
    return <button type="button" title={label} className={`grid size-8 place-items-center rounded-md ${active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"}`} onClick={onClick}>{icon}</button>;
}

function DockButton({ active, disabled, label, icon, onClick }: { active?: boolean; disabled?: boolean; label: string; icon: ReactNode; onClick: () => void }) {
    return <button type="button" title={label} disabled={disabled} className={`grid size-8 place-items-center rounded-md ${disabled ? "cursor-not-allowed text-white/25" : active ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`} onClick={onClick}>{icon}</button>;
}

function createRuntime(host: HTMLElement, previewHost: HTMLElement, shotAspect: number, shot: CanvasDirectorShot, handlers: { onSelect: (id: string) => void; onTransformStart: () => void; onTransform: (id: string, object: THREE.Object3D) => void; onTransformEnd: () => void }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x08090b, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const previewRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    previewRenderer.setClearColor(0x08090b, 1);
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer.shadowMap.enabled = true;
    previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    previewHost.appendChild(previewRenderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x08090b, 18, 42);
    const editorCamera = new THREE.PerspectiveCamera(44, 1, 0.05, 120);
    editorCamera.position.set(12, 8, 14);
    const shotCamera = new THREE.PerspectiveCamera(focalLengthToFov(shot.cameraControl.focalLengthMm), shotAspect, 0.05, 120);
    scene.add(shotCamera);
    const orbit = new OrbitControls(editorCamera, renderer.domElement);
    orbit.target.set(0, 1, 2.5);
    orbit.enableDamping = true;
    orbit.screenSpacePanning = true;
    orbit.maxPolarAngle = Math.PI * 0.495;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(40, 40, 0x264d72, 0x15283a);
    grid.position.y = 0.005;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(2));

    const objects = new Map<string, THREE.Object3D>();
    const actors = new Map<string, THREE.Group>();
    shot.blocking.actors.forEach((actor) => {
        const mannequin = createMannequin(actor);
        actors.set(actor.id, mannequin);
        objects.set(actor.id, mannequin);
        scene.add(mannequin);
    });
    const lights = new Map<string, THREE.Light>();
    shot.blocking.lights.forEach((light) => {
        const object = createLight(light);
        lights.set(light.id, object);
        objects.set(light.id, object);
        scene.add(object);
        if (object instanceof THREE.DirectionalLight) scene.add(object.target);
    });
    objects.set(CAMERA_ID, shotCamera);
    const cameraHelper = new THREE.CameraHelper(shotCamera);
    scene.add(cameraHelper);

    const previewComposer = new EffectComposer(previewRenderer);
    previewComposer.addPass(new RenderPass(scene, shotCamera));
    const focusDistance = new THREE.Vector3().fromArray(shot.blocking.cameraPosition).distanceTo(new THREE.Vector3().fromArray(cameraFocusTargetForBlocking(shot.blocking)));
    const bokehPass = new BokehPass(scene, shotCamera, bokehSettings(shot.cameraControl.apertureF, focusDistance));
    previewComposer.addPass(bokehPass);
    const outputPass = new OutputPass();
    previewComposer.addPass(outputPass);

    const transform = new TransformControls(editorCamera, renderer.domElement);
    const transformHelper = transform.getHelper();
    scene.add(transformHelper);
    transform.addEventListener("dragging-changed", (event) => { orbit.enabled = !event.value; });
    transform.addEventListener("mouseDown", handlers.onTransformStart);
    transform.addEventListener("objectChange", () => {
        const object = transform.object;
        if (object) handlers.onTransform(String(object.userData.directorId || CAMERA_ID), object);
    });
    transform.addEventListener("mouseUp", handlers.onTransformEnd);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || transform.dragging) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, editorCamera);
        const hit = raycaster.intersectObjects([...actors.values()], true)[0];
        let object: THREE.Object3D | null = hit?.object || null;
        while (object && !object.userData.directorId) object = object.parent;
        if (object?.userData.directorId) handlers.onSelect(String(object.userData.directorId));
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const runtime: Runtime = {
        renderer, previewRenderer, previewComposer, bokehPass, outputPass, scene, editorCamera, shotCamera, orbit, transform, transformHelper, cameraHelper, objects, actors, lights,
        animationFrame: 0,
        resizeObserver: new ResizeObserver(() => resizeRuntime(runtime, host)),
        previewResizeObserver: new ResizeObserver(() => resizePreviewRuntime(runtime, previewHost, shotAspect)),
        clayMaterial: new THREE.MeshStandardMaterial({ color: 0xd5d1c8, roughness: 0.85 }),
        normalMaterial: new THREE.MeshNormalMaterial(),
        depthMaterial: new THREE.MeshDepthMaterial(),
        renderMode: "beauty",
        previewMode: "beauty",
        viewMode: "stage",
        selectedId: CAMERA_ID,
    };
    runtime.resizeObserver.observe(host);
    runtime.previewResizeObserver.observe(previewHost);
    resizeRuntime(runtime, host);
    resizePreviewRuntime(runtime, previewHost, shotAspect);
    syncRuntime(runtime, shot);
    (runtime as Runtime & { pointerCleanup?: () => void }).pointerCleanup = () => renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    return runtime;
}

function createMannequin(actor: Actor) {
    const root = new THREE.Group();
    root.userData.directorId = actor.id;
    const material = new THREE.MeshStandardMaterial({ color: actor.color, roughness: 0.62, metalness: 0.05 });
    const addMesh = (geometry: THREE.BufferGeometry, parent: THREE.Object3D, position: [number, number, number]) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);
        mesh.castShadow = actor.castShadow;
        mesh.userData.directorId = actor.id;
        parent.add(mesh);
        return mesh;
    };
    addMesh(new THREE.CapsuleGeometry(0.28, 0.62, 5, 10), root, [0, 1.18, 0]);
    const headPivot = new THREE.Group(); headPivot.position.set(0, 1.78, 0); root.add(headPivot);
    addMesh(new THREE.SphereGeometry(0.22, 16, 12), headPivot, [0, 0, 0]);
    const leftArm = createLimb(root, material, actor.id, [-0.36, 1.48, 0], 0.62, 0.095);
    const rightArm = createLimb(root, material, actor.id, [0.36, 1.48, 0], 0.62, 0.095);
    const leftLeg = createLimb(root, material, actor.id, [-0.16, 0.86, 0], 0.82, 0.12);
    const rightLeg = createLimb(root, material, actor.id, [0.16, 0.86, 0], 0.82, 0.12);
    const front = addMesh(new THREE.ConeGeometry(0.08, 0.26, 4), root, [0, 1.18, -0.34]);
    front.rotation.x = -Math.PI / 2;
    const label = createTextSprite(actor.name);
    label.position.set(0, 2.25, 0);
    root.add(label);
    root.userData.rig = { material, headPivot, leftArm, rightArm, leftLeg, rightLeg };
    return root;
}

function createLimb(parent: THREE.Object3D, material: THREE.Material, id: string, position: [number, number, number], length: number, radius: number) {
    const pivot = new THREE.Group();
    pivot.position.set(...position);
    pivot.userData.directorId = id;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
    mesh.position.y = -length / 2;
    mesh.userData.directorId = id;
    mesh.castShadow = true;
    pivot.add(mesh);
    parent.add(pivot);
    return pivot;
}

function createTextSprite(text: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) { context.font = "28px sans-serif"; context.textAlign = "center"; context.fillStyle = "rgba(0,0,0,.65)"; context.fillRect(0, 0, 256, 64); context.fillStyle = "white"; context.fillText(text, 128, 41); }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(1.4, 0.35, 1);
    return sprite;
}

function createLight(light: StageLight) {
    const object = light.type === "ambient" ? new THREE.AmbientLight(light.color, light.intensity) : light.type === "point" ? new THREE.PointLight(light.color, light.intensity, 30, 2) : new THREE.DirectionalLight(light.color, light.intensity);
    object.userData.directorId = light.id;
    object.position.fromArray(light.position);
    object.visible = light.visible;
    object.castShadow = light.castShadow;
    if (object instanceof THREE.DirectionalLight) { object.target.position.set(0, 1, 0); object.shadow.mapSize.set(1024, 1024); }
    return object;
}

function syncRuntime(runtime: Runtime, shot: CanvasDirectorShot, skipTransformId?: string) {
    if (skipTransformId !== CAMERA_ID) runtime.shotCamera.position.fromArray(shot.blocking.cameraPosition);
    runtime.shotCamera.fov = focalLengthToFov(shot.cameraControl.focalLengthMm);
    const focusTarget = new THREE.Vector3().fromArray(cameraFocusTargetForBlocking(shot.blocking));
    runtime.shotCamera.lookAt(focusTarget);
    runtime.shotCamera.clearViewOffset();
    runtime.shotCamera.updateProjectionMatrix();
    if (cameraMovementMode(shot.blocking) === "locked") {
        const [offsetX, offsetY] = cameraLockOffsetForBlocking(shot.blocking);
        const fullWidth = 1000;
        const fullHeight = fullWidth / runtime.shotCamera.aspect;
        runtime.shotCamera.setViewOffset(fullWidth, fullHeight, -offsetX * fullWidth / 2, offsetY * fullHeight / 2, fullWidth, fullHeight);
    }
    const bokeh = runtime.bokehPass.uniforms as BokehUniforms;
    const settings = bokehSettings(shot.cameraControl.apertureF, runtime.shotCamera.position.distanceTo(focusTarget));
    bokeh.focus.value = settings.focus;
    bokeh.aperture.value = settings.aperture;
    bokeh.maxblur.value = settings.maxblur;
    runtime.cameraHelper.update();
    shot.blocking.actors.forEach((actor) => {
        let object = runtime.actors.get(actor.id);
        if (!object) { object = createMannequin(actor); runtime.actors.set(actor.id, object); runtime.objects.set(actor.id, object); runtime.scene.add(object); }
        if (runtime.selectedId === actor.id && runtime.viewMode === "stage" && runtime.transform.object !== object) runtime.transform.attach(object);
        if (skipTransformId !== actor.id) {
            object.position.fromArray(actor.position);
            object.rotation.set(...actor.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
            object.scale.fromArray(actor.scale);
        }
        object.visible = actor.visible;
        const material = object.userData.rig?.material as THREE.MeshStandardMaterial | undefined;
        material?.color.set(actor.color);
        object.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = actor.castShadow; });
    });
    [...runtime.actors.entries()].forEach(([id, object]) => { if (!shot.blocking.actors.some((actor) => actor.id === id)) { runtime.scene.remove(object); runtime.actors.delete(id); runtime.objects.delete(id); } });
    shot.blocking.lights.forEach((light) => {
        let object = runtime.lights.get(light.id);
        if (!object) {
            object = createLight(light);
            runtime.lights.set(light.id, object);
            runtime.objects.set(light.id, object);
            runtime.scene.add(object);
            if (object instanceof THREE.DirectionalLight) runtime.scene.add(object.target);
        }
        if (runtime.selectedId === light.id && runtime.viewMode === "stage" && runtime.transform.object !== object) runtime.transform.attach(object);
        if (skipTransformId !== light.id) object.position.fromArray(light.position);
        object.intensity = light.intensity; object.color.set(light.color); object.visible = light.visible; object.castShadow = light.castShadow;
    });
    [...runtime.lights.entries()].forEach(([id, object]) => {
        if (shot.blocking.lights.some((light) => light.id === id)) return;
        runtime.scene.remove(object);
        if (object instanceof THREE.DirectionalLight) runtime.scene.remove(object.target);
        runtime.lights.delete(id);
        runtime.objects.delete(id);
    });
}

function animateActors(runtime: Runtime, actors: Actor[], playhead: number, keyframes: CanvasDirectorKeyframe[]) {
    actors.forEach((actor) => {
        const object = runtime.actors.get(actor.id);
        const rig = object?.userData.rig as { headPivot: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group } | undefined;
        if (!rig) return;
        const actionStart = [...keyframes].reverse().find((frame) => frame.targetType === "actor" && frame.targetId === actor.id && frame.time <= playhead)?.time || 0;
        const elapsed = Math.max(0, playhead - actionStart) * actor.playbackSpeed;
        const cycleDuration = actor.actionClip === "run" ? Math.PI * 2 / 8 : actor.actionClip === "wave" ? Math.PI * 2 / 6 : Math.PI * 2 / 5;
        const time = actor.loop ? elapsed : Math.min(elapsed, cycleDuration);
        rig.headPivot.rotation.set(0, 0, 0); rig.leftArm.rotation.set(0, 0, 0); rig.rightArm.rotation.set(0, 0, 0); rig.leftLeg.rotation.set(0, 0, 0); rig.rightLeg.rotation.set(0, 0, 0);
        if (actor.actionClip === "walk" || actor.actionClip === "run") {
            const amplitude = actor.actionClip === "run" ? 0.9 : 0.55;
            const speed = actor.actionClip === "run" ? 8 : 5;
            const swing = Math.sin(time * speed) * amplitude;
            rig.leftArm.rotation.x = swing; rig.rightArm.rotation.x = -swing; rig.leftLeg.rotation.x = -swing; rig.rightLeg.rotation.x = swing;
        } else if (actor.actionClip === "agree") {
            rig.headPivot.rotation.x = Math.sin(time * 5) * 0.24;
        } else if (actor.actionClip === "point") {
            rig.rightArm.rotation.x = -1.42; rig.rightArm.rotation.z = -0.2;
        } else if (actor.actionClip === "wave") {
            rig.rightArm.rotation.z = -2.25 + Math.sin(time * 6) * 0.35;
        } else {
            rig.leftArm.rotation.z = 0.05; rig.rightArm.rotation.z = -0.05;
        }
    });
}

function selectRuntimeObject(runtime: Runtime, id: string, mode: TransformMode, viewMode: ViewMode) {
    runtime.transform.detach();
    runtime.transform.setMode(mode);
    runtime.selectedId = id;
    runtime.transformHelper.visible = viewMode === "stage";
    if (viewMode !== "stage") return;
    const object = runtime.objects.get(id);
    if (object) runtime.transform.attach(object);
}

function renderRuntime(runtime: Runtime) {
    runtime.cameraHelper.visible = runtime.viewMode === "stage" && runtime.selectedId === CAMERA_ID;
    runtime.transformHelper.visible = runtime.viewMode === "stage" && Boolean(runtime.transform.object);
    runtime.scene.overrideMaterial = runtime.renderMode === "clay" ? runtime.clayMaterial : runtime.renderMode === "normal" ? runtime.normalMaterial : runtime.renderMode === "depth" ? runtime.depthMaterial : null;
    runtime.renderer.render(runtime.scene, runtime.viewMode === "camera" ? runtime.shotCamera : runtime.editorCamera);
    renderPreviewRuntime(runtime);
}

function renderPreviewRuntime(runtime: Runtime) {
    const cameraHelperVisible = runtime.cameraHelper.visible;
    const transformHelperVisible = runtime.transformHelper.visible;
    runtime.cameraHelper.visible = false;
    runtime.transformHelper.visible = false;
    runtime.scene.overrideMaterial = runtime.previewMode === "clay" ? runtime.clayMaterial : runtime.previewMode === "normal" ? runtime.normalMaterial : runtime.previewMode === "depth" ? runtime.depthMaterial : null;
    runtime.previewComposer.render();
    runtime.scene.overrideMaterial = null;
    runtime.cameraHelper.visible = cameraHelperVisible;
    runtime.transformHelper.visible = transformHelperVisible;
}

function captureFrame(runtime: Runtime, mode: RenderMode, shotAspect: number) {
    const previousMode = runtime.previewMode;
    const restoreSize = prepareMinimumMediaCaptureSize(runtime, shotAspect);
    runtime.previewMode = mode;
    try {
        renderPreviewRuntime(runtime);
        return runtime.previewRenderer.domElement.toDataURL("image/png");
    } finally {
        runtime.previewMode = previousMode;
        restoreSize();
    }
}

async function recordWhitebox(runtime: Runtime, shot: CanvasDirectorShot, durationSeconds: number, shotAspect: number) {
    const canvas = runtime.previewRenderer.domElement;
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") throw new Error("当前浏览器不支持固定帧率白模视频导出，请使用最新版 Chrome 或 Edge");
    const previousMode = runtime.previewMode;
    runtime.previewMode = "clay";
    const restoreSize = prepareMinimumMediaCaptureSize(runtime, shotAspect);
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const source = new CanvasSource(canvas, { codec: "avc", quality: new Quality("high"), keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: WHITEBOX_EXPORT_FPS });
    try {
        await output.start();
        const frameDuration = 1 / WHITEBOX_EXPORT_FPS;
        const frameCount = Math.round(durationSeconds * WHITEBOX_EXPORT_FPS);
        const keyframeInterval = WHITEBOX_EXPORT_FPS * 2;
        for (let frame = 0; frame < frameCount; frame += 1) {
            const timestamp = frame * frameDuration;
            const renderedShot = evaluateDirectorShot(shot, Math.min(timestamp, durationSeconds));
            syncRuntime(runtime, renderedShot);
            animateActors(runtime, renderedShot.blocking.actors, timestamp, directorKeyframes(shot.blocking));
            renderPreviewRuntime(runtime);
            await source.add(timestamp, frameDuration, { keyFrame: frame % keyframeInterval === 0 });
        }
        await output.finalize();
        if (!target.buffer) throw new Error("白模 MP4 封装失败");
        return new Blob([target.buffer], { type: "video/mp4" });
    } catch (error) {
        void output.cancel();
        throw error;
    } finally {
        runtime.previewMode = previousMode;
        syncRuntime(runtime, shot);
        animateActors(runtime, shot.blocking.actors, 0, directorKeyframes(shot.blocking));
        restoreSize();
    }
}

function prepareMinimumMediaCaptureSize(runtime: Runtime, shotAspect: number) {
    const renderer = runtime.previewRenderer;
    const composer = runtime.previewComposer;
    const host = renderer.domElement.parentElement;
    const previousPixelRatio = renderer.getPixelRatio();
    const [width, height] = minimumMediaDimensions(shotAspect);
    renderer.setPixelRatio(1);
    composer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    runtime.shotCamera.aspect = shotAspect;
    runtime.shotCamera.updateProjectionMatrix();
    return () => {
        renderer.setPixelRatio(previousPixelRatio);
        composer.setPixelRatio(previousPixelRatio);
        if (host) resizePreviewRuntime(runtime, host, shotAspect);
    };
}

function minimumMediaDimensions(aspect: number): [number, number] {
    const evenCeil = (value: number) => Math.ceil(value / 2) * 2;
    return aspect >= 1 ? [evenCeil(256 * aspect), 256] : [256, evenCeil(256 / aspect)];
}

function resizeRuntime(runtime: Runtime, host: HTMLElement) {
    const width = Math.max(1, host.clientWidth); const height = Math.max(1, host.clientHeight); const aspect = width / height;
    runtime.renderer.setSize(width, height, false);
    runtime.editorCamera.aspect = aspect; runtime.editorCamera.updateProjectionMatrix();
}

function resizePreviewRuntime(runtime: Runtime, host: HTMLElement, shotAspect: number) {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight || Math.round(width / shotAspect));
    runtime.previewRenderer.setSize(width, height, false);
    runtime.previewComposer.setSize(width, height);
    runtime.shotCamera.aspect = shotAspect;
    runtime.shotCamera.updateProjectionMatrix();
}

function destroyRuntime(runtime: Runtime) {
    cancelAnimationFrame(runtime.animationFrame);
    runtime.resizeObserver.disconnect();
    runtime.previewResizeObserver.disconnect();
    (runtime as Runtime & { pointerCleanup?: () => void }).pointerCleanup?.();
    runtime.transform.detach(); runtime.transform.dispose(); runtime.orbit.dispose();
    runtime.scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()); } if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); } });
    runtime.clayMaterial.dispose(); runtime.normalMaterial.dispose(); runtime.depthMaterial.dispose();
    runtime.bokehPass.dispose(); runtime.outputPass.dispose(); runtime.previewComposer.dispose();
    runtime.previewRenderer.dispose(); runtime.previewRenderer.domElement.remove();
    runtime.renderer.dispose(); runtime.renderer.domElement.remove();
}

function focalLengthToFov(focalLengthMm: number) {
    return THREE.MathUtils.radToDeg(2 * Math.atan(18 / Math.max(12, focalLengthMm)));
}

function bokehSettings(apertureF: number, focus: number) {
    const normalized = Math.pow(2.8 / Math.max(1.2, apertureF), 2);
    return {
        focus: Math.max(0.1, focus),
        aperture: THREE.MathUtils.clamp(0.0015 * normalized, 0.00004, 0.008),
        maxblur: THREE.MathUtils.clamp(0.012 * Math.sqrt(normalized), 0.0015, 0.024),
    };
}

function aspectRatioValue(value?: string) {
    const [width, height] = String(value || "16:9").split(":").map(Number);
    return width > 0 && height > 0 ? width / height : 16 / 9;
}

function cameraMovementMode(blocking: CanvasDirectorBlocking): CameraMovementMode {
    return blocking.cameraMovementMode || "locked";
}

function directorKeyframes(blocking?: CanvasDirectorBlocking) {
    return blocking?.keyframes || [];
}

function sortDirectorKeyframes(keyframes: CanvasDirectorKeyframe[]) {
    return [...keyframes].sort((left, right) => left.time - right.time || left.targetType.localeCompare(right.targetType) || left.targetId.localeCompare(right.targetId));
}

function upsertDirectorKeyframe(blocking: CanvasDirectorBlocking, keyframe: CanvasDirectorKeyframe) {
    return sortDirectorKeyframes([...directorKeyframes(blocking).filter((frame) => frame.id !== keyframe.id), keyframe]);
}

function existingDirectorKeyframe(blocking: CanvasDirectorBlocking, targetType: CanvasDirectorKeyframe["targetType"], targetId: string, time: number) {
    return directorKeyframes(blocking).find((frame) => frame.targetType === targetType && frame.targetId === targetId && Math.abs(frame.time - time) < 0.02);
}

function captureDirectorKeyframe(shot: CanvasDirectorShot, targetId: string, time: number, originalBlocking: CanvasDirectorBlocking, object?: THREE.Object3D): CanvasDirectorKeyframe | null {
    const normalizedTime = Number(THREE.MathUtils.clamp(time, 0, Math.max(4, shot.durationSeconds)).toFixed(3));
    const actor = shot.blocking.actors.find((item) => item.id === targetId);
    if (actor) {
        const existing = existingDirectorKeyframe(originalBlocking, "actor", targetId, normalizedTime);
        return {
            id: existing?.id || nanoid(), targetType: "actor", targetId, time: normalizedTime,
            interpolation: existing?.interpolation || "easeInOut", curveOffset: existing?.curveOffset || [0, 0, 0],
            position: object ? object.position.toArray() as [number, number, number] : actor.position,
            rotation: object ? [THREE.MathUtils.radToDeg(object.rotation.x), THREE.MathUtils.radToDeg(object.rotation.y), THREE.MathUtils.radToDeg(object.rotation.z)] : actor.rotation,
            scale: object ? object.scale.toArray() as [number, number, number] : actor.scale,
            actionClip: actor.actionClip, playbackSpeed: actor.playbackSpeed, loop: actor.loop,
        };
    }
    const light = shot.blocking.lights.find((item) => item.id === targetId);
    if (light) {
        const existing = existingDirectorKeyframe(originalBlocking, "light", targetId, normalizedTime);
        return {
            id: existing?.id || nanoid(), targetType: "light", targetId, time: normalizedTime,
            interpolation: existing?.interpolation || "easeInOut", curveOffset: existing?.curveOffset || [0, 0, 0],
            position: object ? object.position.toArray() as [number, number, number] : light.position,
            intensity: light.intensity,
            color: light.color,
        };
    }
    if (targetId !== CAMERA_ID) return null;
    const existing = existingDirectorKeyframe(originalBlocking, "camera", CAMERA_ID, normalizedTime);
    const position = object ? object.position.toArray() as [number, number, number] : shot.blocking.cameraPosition;
    let cameraTarget = shot.blocking.cameraTarget;
    if (object && cameraMovementMode(shot.blocking) === "free") {
        const distance = Math.max(0.5, new THREE.Vector3().fromArray(shot.blocking.cameraPosition).distanceTo(new THREE.Vector3().fromArray(shot.blocking.cameraTarget)));
        cameraTarget = object.position.clone().addScaledVector(object.getWorldDirection(new THREE.Vector3()), distance).toArray() as [number, number, number];
    }
    return {
        id: existing?.id || nanoid(), targetType: "camera", targetId: CAMERA_ID, time: normalizedTime,
        interpolation: existing?.interpolation || "easeInOut", curveOffset: existing?.curveOffset || [0, 0, 0],
        position, cameraTarget, cameraMovementMode: cameraMovementMode(shot.blocking),
        cameraLockedActorId: shot.blocking.cameraLockedActorId, cameraLockOffset: cameraLockOffsetForBlocking(shot.blocking),
    };
}

function evaluateDirectorShot(shot: CanvasDirectorShot, time: number): CanvasDirectorShot {
    const keyframes = directorKeyframes(shot.blocking);
    if (!keyframes.length) return shot;
    const actors = shot.blocking.actors.map((actor) => {
        const segment = directorKeyframeSegment(keyframes, "actor", actor.id, time);
        if (!segment) return actor;
        const { from, to, progress } = segment;
        return {
            ...actor,
            position: interpolateDirectorVector(from.position, to.position, progress, from.interpolation, from.curveOffset),
            rotation: interpolateDirectorRotation(from.rotation || actor.rotation, to.rotation || from.rotation || actor.rotation, interpolationProgress(progress, from.interpolation)),
            scale: interpolateDirectorVector(from.scale || actor.scale, to.scale || from.scale || actor.scale, interpolationProgress(progress, from.interpolation), "linear", [0, 0, 0]),
            actionClip: from.actionClip || actor.actionClip,
            playbackSpeed: from.playbackSpeed ?? actor.playbackSpeed,
            loop: from.loop ?? actor.loop,
        };
    });
    const lights = shot.blocking.lights.map((light) => {
        const segment = directorKeyframeSegment(keyframes, "light", light.id, time);
        if (!segment) return light;
        const { from, to, progress } = segment;
        const amount = interpolationProgress(progress, from.interpolation);
        const fromColor = new THREE.Color(from.color || light.color);
        const toColor = new THREE.Color(to.color || from.color || light.color);
        return {
            ...light,
            position: interpolateDirectorVector(from.position, to.position, progress, from.interpolation, from.curveOffset),
            intensity: THREE.MathUtils.lerp(from.intensity ?? light.intensity, to.intensity ?? from.intensity ?? light.intensity, amount),
            color: `#${fromColor.lerp(toColor, amount).getHexString()}`,
        };
    });
    const cameraSegment = directorKeyframeSegment(keyframes, "camera", CAMERA_ID, time);
    if (!cameraSegment) return { ...shot, blocking: { ...shot.blocking, actors, lights } };
    const { from, to, progress } = cameraSegment;
    const amount = interpolationProgress(progress, from.interpolation);
    return {
        ...shot,
        blocking: {
            ...shot.blocking,
            actors,
            lights,
            cameraPosition: interpolateDirectorVector(from.position, to.position, progress, from.interpolation, from.curveOffset),
            cameraTarget: interpolateDirectorVector(from.cameraTarget || shot.blocking.cameraTarget, to.cameraTarget || from.cameraTarget || shot.blocking.cameraTarget, amount, "linear", [0, 0, 0]),
            cameraMovementMode: from.cameraMovementMode || shot.blocking.cameraMovementMode,
            cameraLockedActorId: from.cameraLockedActorId || shot.blocking.cameraLockedActorId,
            cameraLockOffset: [
                THREE.MathUtils.lerp((from.cameraLockOffset || cameraLockOffsetForBlocking(shot.blocking))[0], (to.cameraLockOffset || from.cameraLockOffset || cameraLockOffsetForBlocking(shot.blocking))[0], amount),
                THREE.MathUtils.lerp((from.cameraLockOffset || cameraLockOffsetForBlocking(shot.blocking))[1], (to.cameraLockOffset || from.cameraLockOffset || cameraLockOffsetForBlocking(shot.blocking))[1], amount),
            ],
        },
    };
}

function directorKeyframeSegment(keyframes: CanvasDirectorKeyframe[], targetType: CanvasDirectorKeyframe["targetType"], targetId: string, time: number) {
    const frames = keyframes.filter((frame) => frame.targetType === targetType && frame.targetId === targetId).sort((left, right) => left.time - right.time);
    let from: CanvasDirectorKeyframe | undefined;
    let to: CanvasDirectorKeyframe | undefined;
    for (const frame of frames) {
        if (frame.time <= time + 0.0001) from = frame;
        else { to = frame; break; }
    }
    if (!from) return null;
    if (!to) return { from, to: from, progress: 0 };
    return { from, to, progress: THREE.MathUtils.clamp((time - from.time) / Math.max(0.001, to.time - from.time), 0, 1) };
}

function interpolationProgress(progress: number, interpolation: CanvasDirectorInterpolation) {
    return interpolation === "easeInOut" ? progress * progress * (3 - 2 * progress) : progress;
}

function interpolateDirectorVector(from: [number, number, number], to: [number, number, number], progress: number, interpolation: CanvasDirectorInterpolation, curveOffset: [number, number, number]) {
    if (interpolation !== "bezier") {
        const amount = interpolationProgress(progress, interpolation);
        return from.map((value, index) => THREE.MathUtils.lerp(value, to[index], amount)) as [number, number, number];
    }
    const inverse = 1 - progress;
    return from.map((value, index) => {
        const control = (value + to[index]) / 2 + curveOffset[index];
        return inverse * inverse * value + 2 * inverse * progress * control + progress * progress * to[index];
    }) as [number, number, number];
}

function interpolateDirectorRotation(from: [number, number, number], to: [number, number, number], progress: number) {
    return from.map((value, index) => {
        const delta = THREE.MathUtils.euclideanModulo(to[index] - value + 180, 360) - 180;
        return value + delta * progress;
    }) as [number, number, number];
}

function cameraLockOffsetForBlocking(blocking?: CanvasDirectorBlocking): [number, number] {
    return blocking?.cameraLockOffset || [0, 0];
}

function cameraFocusTargetForBlocking(blocking: CanvasDirectorBlocking) {
    if (cameraMovementMode(blocking) === "locked") {
        const actor = blocking.actors.find((item) => item.id === blocking.cameraLockedActorId) || blocking.actors[0];
        if (actor) return actorHeadTarget(actor);
    }
    return blocking.cameraTarget;
}

function actorHeadTarget(actor: Pick<Actor, "position" | "scale">) {
    return [actor.position[0], actor.position[1] + 1.78 * actor.scale[1], actor.position[2]] as [number, number, number];
}
