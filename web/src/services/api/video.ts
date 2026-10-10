import axios from "axios";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { dataUrlToFile, readFileAsDataUrl } from "@/lib/image-utils";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio } from "@/lib/media-size";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildApiUrl, modelOptionName, resolveModelRequestConfig, resolveModelScript, withLocalProxy, type AiConfig } from "@/stores/use-config-store";
import { buildMiniMaxH3Content, isMiniMaxH3Request, miniMaxH3ApiBaseUrl, miniMaxH3Resolution } from "./minimax-h3";
import { runModelPlugin } from "./model-plugin";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = {
    id?: string;
    task_id?: string;
    video_id?: string;
    status?: string;
    error?: { message?: string };
    url?: string;
    result_url?: string;
    video_url?: string;
    content?: { video_url?: string; url?: string } | null;
    metadata?: { url?: string } | null;
};
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = { signal?: AbortSignal };
type VideoMediaOptions = RequestOptions & { videos?: ReferenceVideo[]; audios?: ReferenceAudio[] };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "gemini" | "minimax" | "plugin"; model: string };
type GeminiInlineData = { bytesBase64Encoded: string; mimeType: string };
type GeminiVideoOperation = {
    name?: string;
    done?: boolean;
    error?: { message?: string };
    response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
};
type MiniMaxH3TaskResponse = {
    task_id?: string;
    task?: {
        id?: string;
        status?: string;
        content?: { url?: string } | null;
        error?: { message?: string } | string;
        fail_reason?: string;
    };
    error?: { message?: string } | string;
    message?: string;
};
export type VideoGenerationTaskState = { status: "pending"; retryAfterMs?: number } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationResult> {
    return waitForVideoGenerationTask(config, await createVideoGenerationTask(config, prompt, references, options), options);
}

export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationResult> {
    const requestConfig = task.provider === "plugin" ? null : resolveModelRequestConfig(config, task.model);
    const pollIntervalMs = requestConfig && isAgnesApi(requestConfig) ? 15_000 : 2_500;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw videoTaskFailed(state.error);
        if (attempt === 119) throw new Error(apiText("videoTimeout", { provider: "" }));
        await delay(state.retryAfterMs || pollIntervalMs, options?.signal);
    }
    throw new Error(apiText("videoTimeout", { provider: "" }));
}

export function isVideoTaskFailed(error: unknown) {
    return error instanceof Error && error.name === "VideoTaskFailed";
}

function videoTaskFailed(message: string) {
    const error = new Error(message);
    error.name = "VideoTaskFailed";
    return error;
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const script = resolveModelScript(config, selectedModel);
    if (script) return createPluginVideoTask(requestConfig, selectedModel, script, prompt, references, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (isMiniMaxH3Request(requestConfig.baseUrl, modelOptionName(selectedModel))) return createMiniMaxH3VideoTask(requestConfig, selectedModel, prompt, references, options);
    if (isAgnesApi(requestConfig)) return createAgnesVideoTask(requestConfig, selectedModel, prompt, references, options);
    if (requestConfig.apiFormat === "gemini") return createGeminiVideoTask(requestConfig, selectedModel, prompt, references, options);
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        return result ? { status: "completed", result } : { status: "failed", error: apiText("pluginVideoExpired") };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "minimax") return pollMiniMaxH3VideoTask(requestConfig, task, options);
    if (isAgnesApi(requestConfig)) return pollAgnesVideoTask(requestConfig, task, options);
    if (task.provider === "gemini") return pollGeminiVideoTask(requestConfig, task, options);
    return pollOpenAIVideoTask(requestConfig, task, options);
}

async function createPluginVideoTask(config: AiConfig, model: string, script: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images: refs,
            videos,
            audios,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds),
                size: normalizeVideoSize(config.size, config.vquality),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: videoAspectRatio(config.size),
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
                mode: resolveVideoMode(config.videoMode, refs.length),
            },
            signal: options?.signal,
        }),
    );
    const id = nanoid();
    pluginVideoResults.set(id, result);
    return { id, provider: "plugin", model };
}

function videoPluginResult(result: unknown): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error(apiText("scriptNoVideo"));
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        try {
            return await uploadMediaFile(result.url, "video");
        } catch {
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error(apiText("noPlayableVideo"));
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const images = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const mode = resolveVideoMode(config.videoMode, images.length);
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    body.append("size", normalizeVideoSize(config.size, config.vquality) || "1280x720");
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("generate_audio", String(boolConfig(config.videoGenerateAudio, true)));
    body.append("watermark", String(boolConfig(config.videoWatermark, false)));
    body.append("mode", mode);
    if (mode === "frames") {
        if (images[0]) body.append("first_frame", images[0], "first.png");
        if (images[1]) body.append("last_frame", images[1], "last.png");
    } else {
        images.forEach((file) => body.append("image[]", file, "ref.png"));
    }
    videos.forEach((file) => body.append("video[]", file));
    audios.forEach((file) => body.append("audio[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error(apiText("noVideoTaskId"));
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function createAgnesVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const modelName = modelOptionName(model);
    const images = await Promise.all(references.slice(0, 7).map(agnesVideoReference));
    const body = isAgnesVideo25(modelName) ? agnesVideo25Body(config, modelName, prompt, images) : agnesVideo20Body(config, modelName, prompt, images);
    try {
        const created = unwrapVideoResponse(
            (
                await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, {
                    headers: aiHeaders(config, "application/json"),
                    signal: options?.signal,
                })
            ).data,
        );
        const id = created.video_id || created.id || created.task_id;
        if (!id) throw new Error(apiText("noVideoTaskId"));
        return { id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollAgnesVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse(
            (
                await axios.get<ApiVideoResponse>(agnesResultUrl(config), {
                    headers: aiHeaders(config),
                    params: { video_id: task.id, model_name: modelOptionName(task.model) },
                    signal: options?.signal,
                })
            ).data,
        );
        const url = videoResultUrl(video);
        if (video.status === "completed" && url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: readApiErrorMessage(video.error?.message) || apiText("videoGenerationFailed") };
        return { status: "pending" };
    } catch (error) {
        const retryAfterMs = agnesPollRetryDelay(error);
        if (retryAfterMs) return { status: "pending", retryAfterMs };
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(video);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: readApiErrorMessage(video.error?.message) || apiText("videoGenerationFailed") };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

function miniMaxH3ApiUrl(config: Pick<AiConfig, "baseUrl">, path: string) {
    return withLocalProxy(`${miniMaxH3ApiBaseUrl(config.baseUrl)}/${path.replace(/^\/+/, "")}`);
}

async function createMiniMaxH3VideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const images = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const videoUrls = await Promise.all(videos.map((file) => readFileAsDataUrl(file)));
    const audioUrls = await Promise.all(audios.map((file) => readFileAsDataUrl(file)));
    const content = buildMiniMaxH3Content(prompt, images, videoUrls, audioUrls, resolveVideoMode(config.videoMode, images.length));
    const usesFrames = content.some((item) => item.type === "image_url" && (item.role === "first_frame" || item.role === "last_frame"));
    const hasReferences = content.length > 1;
    const ratio = inferVideoRatio(config.size);
    try {
        const created = unwrapEnvelope(
            (
                await axios.post<ApiEnvelope<MiniMaxH3TaskResponse>>(
                    miniMaxH3ApiUrl(config, "/video_generation"),
                    {
                        model: modelOptionName(model),
                        content,
                        resolution: miniMaxH3Resolution(normalizeVideoResolution(config.vquality)),
                        duration: Number(normalizeVideoSeconds(config.videoSeconds)),
                        ratio: usesFrames ? "adaptive" : ratio === "auto" ? (hasReferences ? "adaptive" : "16:9") : ratio,
                        aigc_watermark: boolConfig(config.videoWatermark, false),
                    },
                    { headers: aiHeaders(config, "application/json"), signal: options?.signal },
                )
            ).data,
            apiText("noVideoTask"),
        );
        if (!created.task_id) throw new Error(apiText("noVideoTaskId"));
        return { id: created.task_id, provider: "minimax", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollMiniMaxH3VideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const payload = unwrapEnvelope(
            (await axios.get<ApiEnvelope<MiniMaxH3TaskResponse>>(miniMaxH3ApiUrl(config, `/query/video_generation/${encodeURIComponent(task.id)}`), { headers: aiHeaders(config), signal: options?.signal })).data,
            apiText("videoTaskQueryFailed"),
        );
        const remoteTask = payload.task;
        if (!remoteTask) return { status: "failed", error: apiText("noVideoTask") };
        const status = remoteTask.status?.toLowerCase();
        if (status === "succeeded" || status === "completed") {
            const url = remoteTask.content?.url;
            if (!url) return { status: "failed", error: apiText("noPlayableVideo") };
            return { status: "completed", result: await videoResultFromUrl(url, options) };
        }
        if (status === "failed" || status === "cancelled") {
            return { status: "failed", error: readApiErrorMessage(remoteTask.error) || readApiErrorMessage(remoteTask.fail_reason) || apiText("videoGenerationFailed") };
        }
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(withLocalProxy(url), { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

async function createGeminiVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const images = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const mode = resolveVideoMode(config.videoMode, images.length);
    const instance: Record<string, unknown> = { prompt };
    if (mode === "frames") {
        if (images[0]) instance.image = parseDataUrlInline(images[0]);
        if (images[1]) instance.lastFrame = parseDataUrlInline(images[1]);
    } else {
        instance.referenceImages = images.map((dataUrl) => ({ image: parseDataUrlInline(dataUrl), referenceType: "asset" }));
    }
    if (videos[0]) instance.video = await fileToGeminiInline(videos[0]);
    if (audios[0]) instance.audio = await fileToGeminiInline(audios[0]);
    try {
        const created = unwrapEnvelope(
            (
                await axios.post<ApiEnvelope<GeminiVideoOperation>>(
                    geminiVideoUrl(config, model, "predictLongRunning"),
                    {
                        instances: [instance],
                        parameters: {
                            aspectRatio: videoAspectRatio(config.size),
                            durationSeconds: Number(normalizeVideoSeconds(config.videoSeconds)) || 8,
                            resolution: normalizeVideoResolution(config.vquality),
                            generateAudio: boolConfig(config.videoGenerateAudio, true),
                            addWatermark: boolConfig(config.videoWatermark, false),
                        },
                    },
                    { headers: geminiVideoHeaders(config), signal: options?.signal },
                )
            ).data,
            apiText("noVideoTask"),
        );
        if (!created.name) throw new Error(apiText("noVideoTaskId"));
        return { id: created.name, provider: "gemini", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollGeminiVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapEnvelope((await axios.get<ApiEnvelope<GeminiVideoOperation>>(geminiOperationUrl(config, task.id), { headers: geminiVideoHeaders(config), signal: options?.signal })).data, apiText("videoTaskQueryFailed"));
        if (state.error) return { status: "failed", error: readApiErrorMessage(state.error.message) || apiText("videoGenerationFailed") };
        if (!state.done) return { status: "pending" };
        const uri = state.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!uri) return { status: "failed", error: apiText("noPlayableVideo") };
        const url = uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}key=${config.apiKey}`;
        return { status: "completed", result: await videoResultFromUrl(url, options) };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error(apiText("videoModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
}

function geminiVideoBaseUrl(config: Pick<AiConfig, "baseUrl">) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    return lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
}

function geminiVideoUrl(config: Pick<AiConfig, "baseUrl">, model: string, action: string) {
    return withLocalProxy(`${geminiVideoBaseUrl(config)}/models/${encodeURIComponent(modelOptionName(model).replace(/^models\//, ""))}:${action}`);
}

function geminiOperationUrl(config: Pick<AiConfig, "baseUrl">, name: string) {
    return withLocalProxy(`${geminiVideoBaseUrl(config)}/${name.replace(/^\//, "")}`);
}

function geminiVideoHeaders(config: Pick<AiConfig, "apiKey">) {
    return { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" };
}

function videoAspectRatio(size: string) {
    const ratio = inferVideoRatio(size);
    return ratio === "auto" ? "16:9" : ratio;
}

function parseDataUrlInline(dataUrl: string, fallbackType = "image/png"): GeminiInlineData {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    return { bytesBase64Encoded: match?.[2] || "", mimeType: match?.[1] || fallbackType };
}

async function fileToGeminiInline(file: File): Promise<GeminiInlineData> {
    return parseDataUrlInline(await readFileAsDataUrl(file), file.type || "application/octet-stream");
}

async function referenceMediaToFile(item: { name: string; type?: string; url?: string; storageKey?: string }, fallbackName: string, errorKey: "invalidReferenceVideo" | "invalidReferenceAudio", options?: RequestOptions) {
    let blob = item.storageKey ? await getMediaBlob(item.storageKey) : null;
    if (!blob) {
        const url = item.storageKey ? await resolveMediaUrl(item.storageKey, item.url || "") : item.url || "";
        if (!url) throw new Error(apiText(errorKey));
        try {
            blob = await (await fetch(url, { signal: options?.signal })).blob();
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            throw new Error(apiText(errorKey));
        }
    }
    if (!blob.size) throw new Error(apiText(errorKey));
    return new File([blob], item.name || fallbackName, { type: item.type || blob.type || "application/octet-stream" });
}

function normalizeVideoSeconds(value: string) {
    return clampVideoSeconds(value);
}

function resolveVideoMode(mode: string | undefined, imageCount: number) {
    if (mode === "reference" || imageCount > 2) return "reference";
    return "frames";
}

function normalizeVideoSize(value: string, resolution?: string) {
    if (value === "auto") return null;
    if (/^\d+x\d+$/.test(value || "")) return value;
    const ratio = inferVideoRatio(value || "16:9");
    if (ratio === "auto") return null;
    return computeVideoSize(resolution || "720", ratio);
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function isAgnesApi(config: Pick<AiConfig, "baseUrl">) {
    try {
        const hostname = new URL(config.baseUrl).hostname.toLowerCase();
        return hostname === "agnes-ai.com" || hostname.endsWith(".agnes-ai.com");
    } catch {
        return false;
    }
}

function isAgnesVideo25(model: string) {
    return /^agnes-video-2\.5(?:-|$)/i.test(model.trim());
}

function agnesVideo20Body(config: AiConfig, model: string, prompt: string, images: string[]) {
    const { width, height } = videoDimensions(config.size);
    const frameRate = 24;
    const seconds = Math.max(1, Math.min(18, Math.floor(Number(config.videoSeconds) || 5)));
    const numFrames = Math.max(9, Math.min(441, Math.round((seconds * frameRate - 1) / 8) * 8 + 1));
    return {
        model,
        prompt,
        width,
        height,
        num_frames: numFrames,
        frame_rate: frameRate,
        ...(images.length === 1 ? { image: images[0], mode: "ti2vid" } : {}),
        ...(images.length > 1 ? { extra_body: { image: images, mode: "keyframes" } } : {}),
    };
}

function agnesVideo25Body(config: AiConfig, model: string, prompt: string, images: string[]) {
    const seconds = String(Math.max(4, Math.min(12, Math.floor(Number(config.videoSeconds) || 5))));
    const size = /-flash$/i.test(model) ? "720P" : agnesVideo25Size(config.vquality);
    const aspectRatio = videoAspectRatio(config.size);
    if (!images.length) return { model, prompt, seconds, mode: "text", size, aspect_ratio: aspectRatio, n: 1 };
    if (images.length <= 2) {
        return {
            model,
            prompt,
            seconds,
            mode: "keyframe",
            size,
            aspect_ratio: aspectRatio,
            first_frame: images[0],
            ...(images[1] ? { last_frame: images[1] } : {}),
            n: 1,
        };
    }
    return { model, prompt, seconds, mode: "reference", size, aspect_ratio: aspectRatio, images: images.slice(0, 5), n: 1 };
}

function agnesVideo25Size(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "2k" || normalized === "high") return "2K";
    if (normalized === "960" || normalized === "960p" || normalized === "medium") return "960P";
    return "720P";
}

function videoDimensions(value: string) {
    const size = normalizeVideoSize(value) || "1280x720";
    const [width, height] = size.split("x").map(Number);
    return { width, height };
}

function agnesResultUrl(config: Pick<AiConfig, "baseUrl">) {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
    return `${baseUrl}/agnesapi`;
}

function agnesPollRetryDelay(error: unknown) {
    const message = readApiErrorMessage(error);
    const rateLimited = axios.isAxiosError(error) ? error.response?.status === 429 : false;
    if (!rateLimited && !/(?:rate.?limit|too many requests|query frequency|查询频率|频率超出限制)/i.test(message)) return null;
    if (axios.isAxiosError(error)) {
        const retryAfter = error.response?.headers?.["retry-after"];
        const seconds = Number(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter);
        if (Number.isFinite(seconds) && seconds > 0) return Math.max(1_000, seconds * 1_000);
    }
    return 30_000;
}

async function agnesVideoReference(image: ReferenceImage) {
    const publicUrl = [image.url, image.dataUrl].find((value) => /^https?:\/\//i.test(value || ""));
    return publicUrl || imageToDataUrl(image);
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, apiText("noVideoTask"));
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || apiText("requestFailed"));
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse) {
    return [payload.metadata?.url, payload.video_url, payload.result_url, payload.url, payload.content?.video_url, payload.content?.url].find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    // error may be a string or an object containing a message.
    const errorMsg = typeof payload.error === "string" ? payload.error : (payload.error as { message?: unknown })?.message;
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(errorMsg) || readApiErrorMessage(payload.detail) || "";
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        const responseData = error.response?.data;
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || apiText("videoDownloadFailed"));
    if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
