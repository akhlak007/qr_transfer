/**
 * Physical Camera Diagnostics & Optical Capture Instrumentation (Milestone 5B)
 *
 * Implements:
 * - Real-time observed FPS calculation from frame interval timestamps
 * - Frame dimension tracking & dropped frame estimation
 * - Average luminance, variance, and RGB channel extraction
 * - Optical signal dynamic range and exposure stability scoring
 *
 * NOTE: For measuring physical optical channel properties directly from camera frame buffers.
 */

export interface FrameOpticalMetrics {
  timestampMs: number;
  width: number;
  height: number;
  averageLuminance: number;
  luminanceVariance: number;
  avgRed: number;
  avgGreen: number;
  avgBlue: number;
  dynamicRange: number; // Max luminance - Min luminance in sample
}

export interface CameraDiagnosticsSnapshot {
  reportedResolution: string; // e.g. "1280x720"
  actualWidth: number;
  actualHeight: number;
  observedFps: number;
  averageFrameIntervalMs: number;
  estimatedDroppedFrames: number;
  exposureStabilityScore: number; // 0.0 (erratic) to 1.0 (perfectly stable)
  opticalDynamicRange: number; // 0 to 255
  averageLuminance: number;
  rgbBalance: { r: number; g: number; b: number };
  sampleCount: number;
}

export class CameraDiagnosticsTracker {
  private frameTimestamps: number[] = [];
  private luminanceHistory: number[] = [];
  private latestMetrics: FrameOpticalMetrics | null = null;
  private maxHistorySize = 60; // Keep rolling window of 60 frames (~2 seconds at 30fps)

  /**
   * Process a captured video/canvas frame buffer (ImageData or RGBA Uint8ClampedArray).
   */
  public processFrame(
    pixelBuffer: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    timestampMs = performance.now()
  ): FrameOpticalMetrics {
    let sumR = 0, sumG = 0, sumB = 0, sumY = 0;
    let minY = 255, maxY = 0;

    // Sample every Nth pixel for high-speed performance (stride = 4 pixels)
    const stride = 4;
    let sampledPixels = 0;

    for (let i = 0; i < pixelBuffer.length; i += 4 * stride) {
      const r = pixelBuffer[i];
      const g = pixelBuffer[i + 1];
      const b = pixelBuffer[i + 2];
      // ITU-R BT.601 luminance
      const y = 0.299 * r + 0.587 * g + 0.114 * b;

      sumR += r;
      sumG += g;
      sumB += b;
      sumY += y;

      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sampledPixels++;
    }

    const avgR = sampledPixels > 0 ? sumR / sampledPixels : 0;
    const avgG = sampledPixels > 0 ? sumG / sampledPixels : 0;
    const avgB = sampledPixels > 0 ? sumB / sampledPixels : 0;
    const avgY = sampledPixels > 0 ? sumY / sampledPixels : 0;

    // Calculate luminance variance
    let sumSqDiffY = 0;
    for (let i = 0; i < pixelBuffer.length; i += 4 * stride) {
      const r = pixelBuffer[i];
      const g = pixelBuffer[i + 1];
      const b = pixelBuffer[i + 2];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const diff = y - avgY;
      sumSqDiffY += diff * diff;
    }
    const varianceY = sampledPixels > 0 ? sumSqDiffY / sampledPixels : 0;
    const dynamicRange = Math.max(0, maxY - minY);

    const metrics: FrameOpticalMetrics = {
      timestampMs,
      width,
      height,
      averageLuminance: avgY,
      luminanceVariance: varianceY,
      avgRed: avgR,
      avgGreen: avgG,
      avgBlue: avgB,
      dynamicRange,
    };

    // Update rolling history
    this.latestMetrics = metrics;
    this.frameTimestamps.push(timestampMs);
    this.luminanceHistory.push(avgY);

    if (this.frameTimestamps.length > this.maxHistorySize) {
      this.frameTimestamps.shift();
      this.luminanceHistory.shift();
    }

    return metrics;
  }

  /**
   * Get an aggregated diagnostics snapshot across the rolling window.
   */
  public getSnapshot(): CameraDiagnosticsSnapshot {
    if (!this.latestMetrics || this.frameTimestamps.length < 2) {
      return {
        reportedResolution: this.latestMetrics ? `${this.latestMetrics.width}x${this.latestMetrics.height}` : "0x0",
        actualWidth: this.latestMetrics?.width ?? 0,
        actualHeight: this.latestMetrics?.height ?? 0,
        observedFps: 0,
        averageFrameIntervalMs: 0,
        estimatedDroppedFrames: 0,
        exposureStabilityScore: 1.0,
        opticalDynamicRange: this.latestMetrics?.dynamicRange ?? 0,
        averageLuminance: this.latestMetrics?.averageLuminance ?? 0,
        rgbBalance: {
          r: this.latestMetrics?.avgRed ?? 0,
          g: this.latestMetrics?.avgGreen ?? 0,
          b: this.latestMetrics?.avgBlue ?? 0,
        },
        sampleCount: this.frameTimestamps.length,
      };
    }

    const n = this.frameTimestamps.length;
    const intervals: number[] = [];
    let droppedFrames = 0;

    for (let i = 1; i < n; i++) {
      const dt = this.frameTimestamps[i] - this.frameTimestamps[i - 1];
      intervals.push(dt);
      // If frame interval exceeds 1.75x standard interval (~33ms for 30fps), estimate a dropped frame
      if (dt > 58.0) {
        droppedFrames += Math.max(1, Math.round(dt / 33.3) - 1);
      }
    }

    const totalTimeMs = this.frameTimestamps[n - 1] - this.frameTimestamps[0];
    const avgIntervalMs = totalTimeMs / (n - 1);
    const observedFps = totalTimeMs > 0 ? ((n - 1) / totalTimeMs) * 1000.0 : 0;

    // Calculate Exposure Stability Score (1.0 - normalized standard deviation of average luminance)
    let sumLum = 0;
    for (const lum of this.luminanceHistory) sumLum += lum;
    const meanLum = sumLum / this.luminanceHistory.length;

    let sumSqLumDiff = 0;
    for (const lum of this.luminanceHistory) {
      const d = lum - meanLum;
      sumSqLumDiff += d * d;
    }
    const stdDevLum = Math.sqrt(sumSqLumDiff / this.luminanceHistory.length);
    const exposureStabilityScore = Math.max(0, Math.min(1.0, 1.0 - stdDevLum / 64.0));

    return {
      reportedResolution: `${this.latestMetrics.width}x${this.latestMetrics.height}`,
      actualWidth: this.latestMetrics.width,
      actualHeight: this.latestMetrics.height,
      observedFps: Math.round(observedFps * 10) / 10,
      averageFrameIntervalMs: Math.round(avgIntervalMs * 10) / 10,
      estimatedDroppedFrames: droppedFrames,
      exposureStabilityScore: Math.round(exposureStabilityScore * 100) / 100,
      opticalDynamicRange: Math.round(this.latestMetrics.dynamicRange),
      averageLuminance: Math.round(this.latestMetrics.averageLuminance * 10) / 10,
      rgbBalance: {
        r: Math.round(this.latestMetrics.avgRed),
        g: Math.round(this.latestMetrics.avgGreen),
        b: Math.round(this.latestMetrics.avgBlue),
      },
      sampleCount: n,
    };
  }

  public reset(): void {
    this.frameTimestamps = [];
    this.luminanceHistory = [];
    this.latestMetrics = null;
  }
}
