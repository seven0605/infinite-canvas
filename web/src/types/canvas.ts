export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Group = "group",
}

// Node types are open strings: built-ins use CanvasNodeType and plugins use "<pluginId>:<name>".
export type CanvasNodeTypeId = CanvasNodeType | (string & {});

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";

export type CanvasCameraControl = {
    enabled: boolean;
    cameraId: string;
    lensId: string;
    focalLengthMm: number;
    apertureF: number;
};

export type CanvasLightingParams = {
    azimuth: number;
    elevation: number;
    brightness: number;
    lightColor: string;
    rimLight: boolean;
    softness: "soft" | "hard";
    presetId: string;
    smartDescription: string;
};

export type CanvasDirectorShot = {
    id: string;
    index: number;
    title: string;
    purpose: string;
    mode: "image" | "video";
    durationSeconds: number;
    shotSize: string;
    cameraAngle: string;
    cameraMovement: string;
    action: string;
    composition: string;
    lighting: string;
    sound: string;
    prompt: string;
    negativePrompt: string;
    referenceNodeIds: string[];
    cameraControl: CanvasCameraControl;
    blocking: CanvasDirectorBlocking;
    previewNodeId?: string;
    promptNodeId?: string;
    configNodeId?: string;
};

export type CanvasDirectorBlocking = {
    cameraPosition: [number, number, number];
    cameraTarget: [number, number, number];
    cameraMovementMode: "locked" | "free";
    cameraLockedActorId?: string;
    cameraLockOffset: [number, number];
    keyframes: CanvasDirectorKeyframe[];
    actors: Array<{
        id: string;
        sourceNodeId?: string;
        name: string;
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
        uniformScale: boolean;
        color: string;
        actionClip: "idle" | "walk" | "run" | "agree" | "point" | "wave";
        playbackSpeed: number;
        loop: boolean;
        visible: boolean;
        castShadow: boolean;
    }>;
    lights: Array<{
        id: string;
        name: string;
        type: "directional" | "point" | "ambient";
        position: [number, number, number];
        intensity: number;
        color: string;
        visible: boolean;
        castShadow: boolean;
    }>;
};

export type CanvasDirectorInterpolation = "linear" | "easeInOut" | "bezier";

export type CanvasDirectorKeyframe = {
    id: string;
    targetType: "actor" | "camera" | "light";
    targetId: string;
    time: number;
    interpolation: CanvasDirectorInterpolation;
    curveOffset: [number, number, number];
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    actionClip?: "idle" | "walk" | "run" | "agree" | "point" | "wave";
    playbackSpeed?: number;
    loop?: boolean;
    cameraTarget?: [number, number, number];
    cameraMovementMode?: "locked" | "free";
    cameraLockedActorId?: string;
    cameraLockOffset?: [number, number];
    intensity?: number;
    color?: string;
};

export type CanvasDirectorScene = {
    id: string;
    title: string;
    summary: string;
    objective: string;
    aspectRatio: string;
    sourceNodeIds: string[];
    planningModel: string;
    shots: CanvasDirectorShot[];
    createdAt: string;
    updatedAt: string;
};

export type CanvasNodeImage = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
    storageKey?: string;
    naturalWidth: number;
    naturalHeight: number;
    bytes: number;
    mimeType: string;
};

export type CanvasNodeText = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    reasoningEffort?: "auto" | "low" | "medium" | "high" | "xhigh";
    size?: string;
    quality?: string;
    background?: string;
    count?: number;
    cameraControl?: CanvasCameraControl;
    lutPresetId?: string;
    lighting?: CanvasLightingParams;
    textCount?: number;
    texts?: CanvasNodeText[];
    primaryTextId?: string;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    videoMode?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    images?: CanvasNodeImage[];
    primaryImageId?: string;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    videoTaskId?: string;
    videoTaskProvider?: "openai" | "gemini" | "minimax";
    groupId?: string;
    interactive?: boolean; // Plugin node interaction/move state; see CanvasNodeDefinition.interactionToggle.
    workflowKind?: "director-scene" | "director-shot" | "director-preview";
    directorSceneId?: string;
    directorShotId?: string;
    shotIndex?: number;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
