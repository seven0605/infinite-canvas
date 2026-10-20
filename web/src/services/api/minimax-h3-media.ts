export const MINIMAX_H3_REFERENCE_VIDEO_TOTAL_MS = 15_500;
export const MINIMAX_H3_REFERENCE_IMAGE_LIMIT = 9;

export function shouldSampleMiniMaxH3ReferenceVideos(durationsMs: Array<number | undefined>) {
    if (durationsMs.some((duration) => !duration || !Number.isFinite(duration))) return false;
    return durationsMs.reduce<number>((sum, duration) => sum + (duration || 0), 0) > MINIMAX_H3_REFERENCE_VIDEO_TOTAL_MS;
}

export async function prepareMiniMaxH3VideoReferences(files: File[], knownDurationMs: Array<number | undefined> = [], existingImageCount = 0) {
    if (!files.length) return { videos: files, frameImages: [] as string[] };
    const durationsMs = await Promise.all(files.map((file, index) => knownDurationMs[index] || readVideoDurationMs(file)));
    if (!shouldSampleMiniMaxH3ReferenceVideos(durationsMs)) return { videos: files, frameImages: [] as string[] };

    const frameBudget = Math.max(0, MINIMAX_H3_REFERENCE_IMAGE_LIMIT - existingImageCount);
    if (!frameBudget) throw new Error("H3 long-video fallback needs at least one available reference-image slot");
    const frameCounts = distributeFrameBudget(files.length, frameBudget);
    const frameImages = (await Promise.all(files.map((file, index) => sampleVideoFrames(file, frameCounts[index])))).flat();
    return { videos: [] as File[], frameImages };
}

function distributeFrameBudget(fileCount: number, frameBudget: number) {
    const counts = Array.from({ length: fileCount }, () => 0);
    for (let index = 0; index < frameBudget; index++) counts[index % fileCount] += 1;
    return counts;
}

async function readVideoDurationMs(file: File) {
    const video = await loadVideo(file);
    try {
        return Math.round(video.element.duration * 1000);
    } finally {
        video.dispose();
    }
}

async function sampleVideoFrames(file: File, count: number) {
    if (!count) return [];
    const video = await loadVideo(file);
    try {
        const sourceWidth = video.element.videoWidth || 1280;
        const sourceHeight = video.element.videoHeight || 720;
        const scale = Math.min(1, 1280 / Math.max(sourceWidth, sourceHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("H3 reference storyboard could not create a canvas context");

        const frames: string[] = [];
        for (let index = 0; index < count; index++) {
            const timestamp = Math.min(video.element.duration - 0.05, ((index + 0.5) / count) * video.element.duration);
            await seekVideo(video.element, Math.max(0, timestamp));
            context.drawImage(video.element, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
            if (!blob) throw new Error("H3 reference storyboard frame encoding failed");
            frames.push(await blobToDataUrl(blob));
        }
        return frames;
    } finally {
        video.dispose();
    }
}

function loadVideo(file: File) {
    return new Promise<{ element: HTMLVideoElement; dispose: () => void }>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const element = document.createElement("video");
        const dispose = () => {
            element.removeAttribute("src");
            element.load();
            URL.revokeObjectURL(url);
        };
        element.preload = "auto";
        element.muted = true;
        element.playsInline = true;
        element.onloadedmetadata = () => resolve({ element, dispose });
        element.onerror = () => {
            dispose();
            reject(new Error("H3 reference video metadata could not be read"));
        };
        element.src = url;
    });
}

function seekVideo(video: HTMLVideoElement, timestamp: number) {
    if (Math.abs(video.currentTime - timestamp) < 0.01) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
        };
        const onSeeked = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("H3 reference storyboard could not seek the video"));
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = timestamp;
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("H3 reference storyboard frame could not be read"));
        reader.readAsDataURL(blob);
    });
}
