import type { CanvasCameraControl, CanvasLightingParams } from "@/types/canvas";

type CameraProfile = { id: string; label: string; prompt: string };
type LensProfile = { id: string; label: string; prompt: string };
export type CameraCombinationPreset = CanvasCameraControl & { id: string; label: string; description: string; previewColumn: 0 | 1 | 2; previewRow: 0 | 1 };

export const CAMERA_PROFILES: CameraProfile[] = [
    { id: "arri-alexa-35", label: "阿莱 ALEXA 35（爱丽莎）", prompt: "ARRI ALEXA 35 color science, exceptionally natural highlight roll-off, rich color separation and high dynamic range" },
    { id: "arri-alexa-mini-lf", label: "阿莱 ALEXA Mini LF", prompt: "ARRI ALEXA Mini LF color science, natural highlight roll-off and cinematic large-format dynamic range" },
    { id: "arri-alexa-65", label: "阿莱 ALEXA 65", prompt: "ARRI ALEXA 65 large-format rendering, immersive dimensionality, refined skin tones and exceptionally smooth highlight response" },
    { id: "sony-venice-2", label: "Sony Venice 2", prompt: "Sony Venice 2 rendering, clean shadows, rich natural skin tones and wide latitude" },
    { id: "red-v-raptor", label: "RED V-Raptor 8K", prompt: "RED V-Raptor 8K capture, crisp high-frequency detail and bold cinematic contrast" },
    { id: "panavision-dxl2", label: "Panavision DXL2", prompt: "Panavision DXL2 large-format rendering, dimensional color and smooth highlight response" },
    { id: "canon-c500", label: "Canon C500 Mark II", prompt: "Canon C500 Mark II rendering, warm natural color and gentle highlight roll-off" },
];

export const LENS_PROFILES: LensProfile[] = [
    { id: "arri-signature", label: "ARRI Signature Prime", prompt: "ARRI Signature Prime optics, clean contrast, soft dimensional falloff and restrained flare" },
    { id: "cooke-s7", label: "Cooke S7/i", prompt: "Cooke S7/i optics, warm color, smooth contrast and rounded focus falloff" },
    { id: "zeiss-supreme", label: "Zeiss Supreme Prime", prompt: "Zeiss Supreme Prime optics, neutral color, high micro-contrast and controlled flare" },
    { id: "canon-sumire", label: "Canon Sumire Prime", prompt: "Canon Sumire Prime optics, gentle contrast, warm skin tones and expressive flare" },
    { id: "atlas-orion", label: "Atlas Orion Anamorphic", prompt: "Atlas Orion anamorphic optics, oval bokeh, horizontal flare and cinematic edge character" },
];

export const CAMERA_FOCAL_LENGTHS = [18, 24, 35, 50, 85, 135, 200];
export const CAMERA_APERTURES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];

export const CAMERA_COMBINATION_PRESETS: CameraCombinationPreset[] = [
    { id: "spatial-wide", label: "空间广角", description: "18mm · 强透视与宽阔环境", enabled: true, cameraId: "arri-alexa-35", lensId: "zeiss-supreme", focalLengthMm: 18, apertureF: 4, previewColumn: 0, previewRow: 0 },
    { id: "natural-story", label: "自然叙事", description: "35mm · 人物与环境平衡", enabled: true, cameraId: "arri-alexa-mini-lf", lensId: "arri-signature", focalLengthMm: 35, apertureF: 2.8, previewColumn: 1, previewRow: 0 },
    { id: "shallow-portrait", label: "浅景深人像", description: "85mm f/1.4 · 奶油散景", enabled: true, cameraId: "sony-venice-2", lensId: "cooke-s7", focalLengthMm: 85, apertureF: 1.4, previewColumn: 2, previewRow: 0 },
    { id: "tele-compression", label: "长焦压缩", description: "135mm · 压缩空间层次", enabled: true, cameraId: "arri-alexa-65", lensId: "arri-signature", focalLengthMm: 135, apertureF: 2.8, previewColumn: 0, previewRow: 1 },
    { id: "anamorphic", label: "变形宽银幕", description: "50mm · 椭圆散景与横向炫光", enabled: true, cameraId: "panavision-dxl2", lensId: "atlas-orion", focalLengthMm: 50, apertureF: 2, previewColumn: 1, previewRow: 1 },
    { id: "deep-focus", label: "全景深调度", description: "35mm f/11 · 前后景清晰", enabled: true, cameraId: "arri-alexa-35", lensId: "zeiss-supreme", focalLengthMm: 35, apertureF: 11, previewColumn: 2, previewRow: 1 },
];

export const DEFAULT_CAMERA_CONTROL: CanvasCameraControl = {
    enabled: false,
    cameraId: "arri-alexa-mini-lf",
    lensId: "arri-signature",
    focalLengthMm: 50,
    apertureF: 2.8,
};

export const DEFAULT_LIGHTING_PARAMS: CanvasLightingParams = {
    azimuth: -35,
    elevation: 30,
    brightness: 60,
    lightColor: "#fff1d6",
    rimLight: false,
    softness: "soft",
    presetId: "soft-key",
    smartDescription: "",
};

export function normalizeCameraControl(value?: Partial<CanvasCameraControl>): CanvasCameraControl {
    return { ...DEFAULT_CAMERA_CONTROL, ...value };
}

export function buildCameraSummary(value?: Partial<CanvasCameraControl>) {
    const camera = normalizeCameraControl(value);
    const profile = CAMERA_PROFILES.find((item) => item.id === camera.cameraId) || CAMERA_PROFILES[0];
    return `${profile.label} · ${camera.focalLengthMm}mm · f/${formatAperture(camera.apertureF)}`;
}

export function buildCameraPrompt(value?: Partial<CanvasCameraControl>, medium: "image" | "video" = "image") {
    const camera = normalizeCameraControl(value);
    if (!camera.enabled) return "";
    const profile = CAMERA_PROFILES.find((item) => item.id === camera.cameraId) || CAMERA_PROFILES[0];
    const lens = LENS_PROFILES.find((item) => item.id === camera.lensId) || LENS_PROFILES[0];
    return [
        "Cinematography requirements:",
        profile.prompt,
        lens.prompt,
        focalLengthPrompt(camera.focalLengthMm),
        aperturePrompt(camera.apertureF),
        medium === "video"
            ? "Apply these as real capture and optical constraints to every frame. Keep focal length, perspective, depth of field, bokeh and optical character continuous throughout the shot unless the prompt explicitly requests a lens change. Do not depict the camera or lens."
            : "Treat these as real capture and optical constraints for framing, perspective, depth of field, bokeh and rendering; do not depict the camera or lens in the image.",
    ].join(" ");
}

export function appendCameraPrompt(prompt: string, value?: Partial<CanvasCameraControl>, medium: "image" | "video" = "image") {
    const cameraPrompt = buildCameraPrompt(value, medium);
    if (!cameraPrompt || prompt.includes("Cinematography requirements:")) return prompt;
    return `${prompt.trim()}\n\n${cameraPrompt}`.trim();
}

export function buildLightingLabel(params: CanvasLightingParams) {
    const direction = lightingDirection(params.azimuth, params.elevation);
    return `AI 打光：${direction} · ${params.softness === "soft" ? "柔光" : "硬光"} · ${params.brightness}%`;
}

export function buildLightingPrompt(params: CanvasLightingParams) {
    const direction = lightingDirection(params.azimuth, params.elevation);
    const custom = params.smartDescription.trim();
    return [
        "Lighting-only image edit. Keep the exact same scene, subject identity, face, hairstyle, clothing, body pose, action, object count, composition, camera viewpoint and background.",
        `Change only the illumination: place the key light at ${direction} (azimuth ${params.azimuth} degrees, elevation ${params.elevation} degrees), ${params.softness} light, brightness ${params.brightness}%, light color ${params.lightColor}.`,
        params.rimLight ? "Add a restrained rim light that separates the existing subject from the background." : "Do not add rim lighting.",
        custom ? `Creative lighting direction: ${custom}.` : "",
        "Lighting instructions describe illumination, not physical objects. Do not add lamps, spotlights, fixtures, reflectors, softboxes, torches, candles, light stands or other equipment. Preserve all geometry and content; only change light direction, color, intensity, shadows, contrast and mood.",
    ]
        .filter(Boolean)
        .join(" ");
}

function focalLengthPrompt(focalLength: number) {
    if (focalLength <= 24) return `${focalLength}mm ultra-wide focal length with expanded spatial perspective and strong foreground-background depth`;
    if (focalLength <= 35) return `${focalLength}mm wide cinematic focal length with natural environmental context`;
    if (focalLength <= 60) return `${focalLength}mm normal focal length with natural perspective and balanced compression`;
    if (focalLength <= 100) return `${focalLength}mm short-telephoto focal length with flattering perspective and compressed background`;
    return `${focalLength}mm telephoto focal length with strong background compression and narrow field of view`;
}

function aperturePrompt(aperture: number) {
    if (aperture <= 2) return `f/${formatAperture(aperture)} aperture with very shallow depth of field and pronounced natural bokeh`;
    if (aperture <= 4) return `f/${formatAperture(aperture)} aperture with shallow cinematic depth of field and a clearly separated subject`;
    if (aperture <= 8) return `f/${formatAperture(aperture)} aperture with balanced depth of field and readable environment`;
    return `f/${formatAperture(aperture)} aperture with deep focus across foreground and background`;
}

function lightingDirection(azimuth: number, elevation: number) {
    if (elevation >= 50) return "high overhead";
    if (elevation <= -35) return "low upward";
    if (azimuth >= 135 || azimuth <= -135) return "behind the subject";
    if (azimuth >= 45) return "camera-right side";
    if (azimuth <= -45) return "camera-left side";
    return "front of the subject";
}

function formatAperture(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
