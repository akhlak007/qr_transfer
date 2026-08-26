/**
 * Physical Display Diagnostics & Transmitter Optical Instrumentation (Milestone 5B)
 *
 * Implements:
 * - Screen resolution & device pixel ratio capture
 * - requestAnimationFrame refresh rate measurement
 * - Canvas render interval and rendering jitter tracking
 * - Explicit distinction between Declared display properties vs Measured optical properties
 *
 * NOTE: For measuring physical display transmitter characteristics.
 */

export interface DisplayDeclaredProperties {
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  colorDepth: number;
}

export interface DisplayMeasuredProperties {
  measuredRefreshRateHz: number;
  averageRenderIntervalMs: number;
  renderJitterMs: number;
  canvasWidth: number;
  canvasHeight: number;
  sampleCount: number;
}

export interface DisplayDiagnosticsSnapshot {
  declared: DisplayDeclaredProperties;
  measured: DisplayMeasuredProperties;
  disclaimer: string;
}

export class DisplayDiagnosticsTracker {
  private renderTimestamps: number[] = [];
  private maxHistorySize = 60;
  private canvasWidth = 0;
  private canvasHeight = 0;

  /**
   * Capture declared display environment properties from window/screen APIs.
   */
  public getDeclaredProperties(): DisplayDeclaredProperties {
    if (typeof window === "undefined") {
      return {
        screenWidth: 1920,
        screenHeight: 1080,
        devicePixelRatio: 1,
        viewportWidth: 1920,
        viewportHeight: 1080,
        colorDepth: 24,
      };
    }

    return {
      screenWidth: window.screen?.width ?? 0,
      screenHeight: window.screen?.height ?? 0,
      devicePixelRatio: window.devicePixelRatio ?? 1,
      viewportWidth: window.innerWidth ?? 0,
      viewportHeight: window.innerHeight ?? 0,
      colorDepth: window.screen?.colorDepth ?? 24,
    };
  }

  /**
   * Record a transmitter canvas frame rendering event.
   */
  public recordRenderEvent(
    canvasWidth: number,
    canvasHeight: number,
    timestampMs = performance.now()
  ): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.renderTimestamps.push(timestampMs);

    if (this.renderTimestamps.length > this.maxHistorySize) {
      this.renderTimestamps.shift();
    }
  }

  /**
   * Get an aggregated display diagnostics snapshot.
   */
  public getSnapshot(): DisplayDiagnosticsSnapshot {
    const declared = this.getDeclaredProperties();
    const n = this.renderTimestamps.length;

    if (n < 2) {
      return {
        declared,
        measured: {
          measuredRefreshRateHz: 60.0, // fallback default
          averageRenderIntervalMs: 16.6,
          renderJitterMs: 0,
          canvasWidth: this.canvasWidth,
          canvasHeight: this.canvasHeight,
          sampleCount: n,
        },
        disclaimer: "Declared display properties are reported by OS/Browser. Physical panel characteristics may differ.",
      };
    }

    const intervals: number[] = [];
    for (let i = 1; i < n; i++) {
      intervals.push(this.renderTimestamps[i] - this.renderTimestamps[i - 1]);
    }

    const totalTimeMs = this.renderTimestamps[n - 1] - this.renderTimestamps[0];
    const avgIntervalMs = totalTimeMs / (n - 1);
    const measuredHz = totalTimeMs > 0 ? ((n - 1) / totalTimeMs) * 1000.0 : 60.0;

    let sumSqDiff = 0;
    for (const dt of intervals) {
      const d = dt - avgIntervalMs;
      sumSqDiff += d * d;
    }
    const jitterMs = Math.sqrt(sumSqDiff / intervals.length);

    return {
      declared,
      measured: {
        measuredRefreshRateHz: Math.round(measuredHz * 10) / 10,
        averageRenderIntervalMs: Math.round(avgIntervalMs * 10) / 10,
        renderJitterMs: Math.round(jitterMs * 100) / 100,
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        sampleCount: n,
      },
      disclaimer: "Declared display properties are reported by OS/Browser. Physical panel characteristics may differ.",
    };
  }

  public reset(): void {
    this.renderTimestamps = [];
    this.canvasWidth = 0;
    this.canvasHeight = 0;
  }
}
