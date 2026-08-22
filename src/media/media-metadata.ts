import type { MediaKind } from "../core/transfer-session";

export interface MediaMetadata {
  kind: MediaKind;
  format: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  codec?: string;
  extractionStatus: "complete" | "partial" | "unavailable";
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "aac", "m4a"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function classifyMedia(name: string, mimeType: string): MediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  const extension = extensionOf(name);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "other";
}

function formatOf(name: string, mimeType: string): string {
  return extensionOf(name).toUpperCase() || mimeType.split("/")[1]?.toUpperCase() || "Unknown";
}

function loadMediaElement(element: HTMLMediaElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    element.preload = "metadata";
    element.onloadedmetadata = () => resolve();
    element.onerror = () => reject(new Error("Browser could not decode media metadata"));
    element.src = url;
  });
}

export async function extractMediaMetadata(blob: Blob, name: string): Promise<MediaMetadata> {
  const kind = classifyMedia(name, blob.type);
  const base: MediaMetadata = {
    kind,
    format: formatOf(name, blob.type),
    mimeType: blob.type || "application/octet-stream",
    fileSize: blob.size,
    extractionStatus: kind === "other" ? "unavailable" : "partial",
  };
  if (kind === "other" || typeof document === "undefined") return base;

  const url = URL.createObjectURL(blob);
  try {
    if (kind === "image") {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { ...base, width: image.naturalWidth, height: image.naturalHeight, extractionStatus: "complete" };
    }

    const element = document.createElement(kind === "audio" ? "audio" : "video");
    await loadMediaElement(element, url);
    return {
      ...base,
      durationSeconds: Number.isFinite(element.duration) ? element.duration : undefined,
      width: kind === "video" ? (element as HTMLVideoElement).videoWidth : undefined,
      height: kind === "video" ? (element as HTMLVideoElement).videoHeight : undefined,
      extractionStatus: "complete",
    };
  } catch {
    return base;
  } finally {
    URL.revokeObjectURL(url);
  }
}
