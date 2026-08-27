/**
 * Real Physical Camera Capture & Hardware Stream Pipeline (Milestone 6A)
 *
 * Implements:
 * - Real browser MediaDevices WebRTC camera acquisition
 * - Rear/Environment camera preference with fallback
 * - Configurable resolutions (640x480, 1280x720, 1920x1080) and frame rates
 * - MediaStreamTrack settings & capabilities inspection
 * - Accurate timestamp-based FPS calculation and dropped frame estimation
 * - Live ImageData optical frame extraction
 * - Real-time optical diagnostics (Luminance Mean/Variance, RGB Mean, Exposure Stability)
 * - Safe lifecycle management (start, captureFrame, stop) and typed error handling
 *
 * NOTE: Real hardware optical instrumentation. No synthetic or fake camera data is generated.
 */

import { CameraDiagnosticsTracker } from "./camera-diagnostics";
import { opticalDiagnosticTrace } from "../diagnostics/optical-trace";

export type CameraResolutionPreset = "640x480" | "1280x720" | "1920x1080";

export interface PhysicalCameraConfig {
  resolution: CameraResolutionPreset;
  requestedFps: number;
  facingMode: "environment" | "user";
  deviceId?: string;
}

export interface PhysicalCameraDiagnostics {
  width: number;
  height: number;
  requestedFps: number;
  actualFps: number;
  droppedFrames: number;
  luminanceMean: number;
  luminanceVariance: number;
  rgbMean: { r: number; g: number; b: number };
  exposureStable: boolean;
  timestamp: number;
}

export type PhysicalCameraErrorCode =
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "UNSUPPORTED_RESOLUTION"
  | "STREAM_TERMINATED"
  | "NOT_INITIALIZED";

export class PhysicalCameraException extends Error {
  public code: PhysicalCameraErrorCode;

  constructor(code: PhysicalCameraErrorCode, message: string) {
    super(message);
    this.name = "PhysicalCameraException";
    this.code = code;
  }
}

export const DEFAULT_CAMERA_CONFIG: PhysicalCameraConfig = {
  resolution: "1280x720",
  requestedFps: 30,
  facingMode: "environment",
};

const RESOLUTION_MAP: Record<CameraResolutionPreset, { width: number; height: number }> = {
  "640x480": { width: 640, height: 480 },
  "1280x720": { width: 1280, height: 720 },
  "1920x1080": { width: 1920, height: 1080 },
};

export class PhysicalCameraService {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private activeConfig: PhysicalCameraConfig = { ...DEFAULT_CAMERA_CONFIG };
  private tracker: CameraDiagnosticsTracker = new CameraDiagnosticsTracker();
  private lastCapturedTimestamp = 0;
  private active = false;

  /**
   * Enumerate available video input hardware devices.
   */
  public async listVideoDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput");
    } catch (err) {
      console.warn("Failed to enumerate video devices:", err);
      return [];
    }
  }

  /**
   * Start camera stream with requested configuration.
   */
  public async start(configPartial: Partial<PhysicalCameraConfig> = {}): Promise<MediaStream> {
    this.activeConfig = { ...DEFAULT_CAMERA_CONFIG, ...configPartial };

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new PhysicalCameraException(
        "CAMERA_UNAVAILABLE",
        "navigator.mediaDevices.getUserMedia is not supported in this environment"
      );
    }

    // Stop existing stream if any
    this.stop();

    const targetRes = RESOLUTION_MAP[this.activeConfig.resolution] ?? RESOLUTION_MAP["1280x720"];

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        width: { ideal: targetRes.width },
        height: { ideal: targetRes.height },
        frameRate: { ideal: this.activeConfig.requestedFps },
        facingMode: this.activeConfig.deviceId ? undefined : { ideal: this.activeConfig.facingMode },
        deviceId: this.activeConfig.deviceId ? { exact: this.activeConfig.deviceId } : undefined,
      },
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (errorObj?.name === "NotAllowedError" || errorObj?.name === "PermissionDeniedError") {
        throw new PhysicalCameraException(
          "CAMERA_PERMISSION_DENIED",
          "Camera access permission was denied by user or policy"
        );
      }
      throw new PhysicalCameraException(
        "CAMERA_UNAVAILABLE",
        `Failed to acquire camera stream: ${errorObj?.message ?? String(err)}`
      );
    }

    this.mediaStream = stream;

    // Create offscreen or backing video element for frame rasterization
    if (typeof document !== "undefined") {
      const video = document.createElement("video");
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;

      try {
        await video.play();
      } catch {
        // Autoplay may require user gesture in some browsers
      }
      this.videoElement = video;

      this.captureCanvas = document.createElement("canvas");
      this.canvasCtx = this.captureCanvas.getContext("2d", { willReadFrequently: true });
    }

    this.tracker.reset();
    this.active = true;
    const settings = stream.getVideoTracks()[0]?.getSettings?.();
    opticalDiagnosticTrace.record("PhysicalCameraService", "camera-started", {
      requestedFps: this.activeConfig.requestedFps, width: settings?.width ?? 0,
      height: settings?.height ?? 0, actualTrackFps: settings?.frameRate ?? 0,
    });
    return stream;
  }

  /**
   * Capture a single real optical frame into an ImageData buffer.
   */
  public captureFrame(targetCanvas?: HTMLCanvasElement): ImageData | null {
    if (!this.active || !this.mediaStream || !this.videoElement || !this.captureCanvas || !this.canvasCtx) {
      return null;
    }

    const video = this.videoElement;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    if (w <= 0 || h <= 0) return null;

    if (this.captureCanvas.width !== w || this.captureCanvas.height !== h) {
      this.captureCanvas.width = w;
      this.captureCanvas.height = h;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastCapturedTimestamp = now;

    // Draw video frame to raster canvas
    this.canvasCtx.drawImage(video, 0, 0, w, h);
    const imgData = this.canvasCtx.getImageData(0, 0, w, h);

    // Track optical metrics across frame
    this.tracker.processFrame(imgData.data, w, h, now);
    const diagnostics = this.getDiagnostics();
    opticalDiagnosticTrace.record("PhysicalCameraService", "frame-captured", {
      width: w, height: h, actualFps: diagnostics.actualFps,
      droppedFrames: diagnostics.droppedFrames, luminanceMean: diagnostics.luminanceMean,
      luminanceVariance: diagnostics.luminanceVariance, exposureStable: diagnostics.exposureStable,
    }, now);

    // If a target canvas was passed (e.g. for live inspector/preview), render to it
    if (targetCanvas) {
      const targetCtx = targetCanvas.getContext("2d");
      if (targetCtx) {
        if (targetCanvas.width !== w || targetCanvas.height !== h) {
          targetCanvas.width = w;
          targetCanvas.height = h;
        }
        targetCtx.putImageData(imgData, 0, 0);
      }
    }

    return imgData;
  }

  /**
   * Get structured real-time camera diagnostics.
   */
  public getDiagnostics(): PhysicalCameraDiagnostics {
    const snap = this.tracker.getSnapshot();
    const now = this.lastCapturedTimestamp || (typeof performance !== "undefined" ? performance.now() : Date.now());

    return {
      width: snap.actualWidth,
      height: snap.actualHeight,
      requestedFps: this.activeConfig.requestedFps,
      actualFps: snap.observedFps,
      droppedFrames: snap.estimatedDroppedFrames,
      luminanceMean: snap.averageLuminance,
      luminanceVariance: snap.opticalDynamicRange > 0 ? (snap.opticalDynamicRange * snap.opticalDynamicRange) / 12 : 0,
      rgbMean: snap.rgbBalance,
      exposureStable: snap.exposureStabilityScore >= 0.70,
      timestamp: now,
    };
  }

  /**
   * Inspect current MediaStreamTrack capabilities (exposure, focus, torch, etc.).
   */
  public getTrackCapabilities(): MediaTrackCapabilities | null {
    const track = this.mediaStream?.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === "function") {
      return track.getCapabilities();
    }
    return null;
  }

  /**
   * Inspect current MediaStreamTrack settings (actual width, height, frameRate, facingMode).
   */
  public getTrackSettings(): MediaTrackSettings | null {
    const track = this.mediaStream?.getVideoTracks()[0];
    if (track && typeof track.getSettings === "function") {
      return track.getSettings();
    }
    return null;
  }

  /**
   * Cleanly stop camera stream and release hardware handles.
   */
  public stop(): void {
    opticalDiagnosticTrace.record("PhysicalCameraService", "camera-stopped", { active: this.active });
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop error on cleanup
        }
      }
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.captureCanvas = null;
    this.canvasCtx = null;
    this.tracker.reset();
    this.active = false;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getConfig(): PhysicalCameraConfig {
    return { ...this.activeConfig };
  }
}
