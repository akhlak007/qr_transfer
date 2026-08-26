/**
 * Optical Calibration Engine & Color Space Utilities (Milestone 3B & 3C)
 *
 * Implements:
 * - Ambient light estimation
 * - Dynamic white/black reference calibration
 * - Camera exposure stabilization detection
 * - Adaptive luminance threshold calculation (OOK & 4-PAM)
 * - Color palette calibration for CSK-8 and CSK-16
 * - Quality/confidence scoring and insufficient dynamic range rejection
 * - RGB to YUV color conversion & nearest-neighbor classifier
 *
 * NOTE: Experimental VLC Research Prototype.
 */

import {
  CSK8_CONSTELLATION,
  CSK16_CONSTELLATION,
  type RGBColor,
} from "./vlc-modulator";

export interface CalibrationResult {
  isCalibrated: boolean;
  ambientLuminance: number;
  whiteLevel: number;
  blackLevel: number;
  dynamicRange: number;
  isExposureStable: boolean;
  adaptiveThreshold: number;
  pam4Thresholds: [number, number, number];
  calibratedPalette8: RGBColor[];
  calibratedPalette16: RGBColor[];
  confidenceScore: number; // 0.0 to 1.0
  reason?: string;
}

export interface CalibrationConfig {
  minDynamicRange: number; // minimum (white - black) level difference (default 30)
  exposureVarianceThreshold: number; // max luminance variance for stable exposure (default 10.0)
  minConfidence: number; // minimum confidence score threshold (default 0.5)
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  minDynamicRange: 30,
  exposureVarianceThreshold: 10.0,
  minConfidence: 0.5,
};

/**
 * Standard ITU-R BT.601 RGB to YUV conversion.
 * Y (Luminance): 0..255
 * U (Chroma Cb): -128..127
 * V (Chroma Cr): -128..127
 */
export function rgbToYuv(rgb: RGBColor): [number, number, number] {
  const [r, g, b] = rgb;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const u = -0.168736 * r - 0.331264 * g + 0.5 * b;
  const v = 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [y, u, v];
}

/**
 * Standard ITU-R BT.601 YUV to RGB conversion.
 */
export function yuvToRgb(yuv: [number, number, number]): RGBColor {
  const [y, u, v] = yuv;
  const r = Math.max(0, Math.min(255, Math.round(y + 1.402 * v)));
  const g = Math.max(0, Math.min(255, Math.round(y - 0.344136 * u - 0.714136 * v)));
  const b = Math.max(0, Math.min(255, Math.round(y + 1.772 * u)));
  return [r, g, b];
}

/**
 * Compute Euclidean distance in 3D RGB color space.
 */
export function euclideanDistanceRgb(c1: RGBColor, c2: RGBColor): number {
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Compute weighted Euclidean distance in YUV space.
 * Weights Chrominance more heavily than Luminance for robust color discrimination under intensity changes.
 */
export function euclideanDistanceYuv(
  yuv1: [number, number, number],
  yuv2: [number, number, number],
  weightY = 0.4,
  weightU = 1.0,
  weightV = 1.0
): number {
  const dy = (yuv1[0] - yuv2[0]) * weightY;
  const du = (yuv1[1] - yuv2[1]) * weightU;
  const dv = (yuv1[2] - yuv2[2]) * weightV;
  return Math.sqrt(dy * dy + du * du + dv * dv);
}

/**
 * Classify an observed RGB color against a reference constellation palette.
 * Returns the nearest constellation index and distance.
 */
export function classifyNearestCskColor(
  observed: RGBColor,
  palette: RGBColor[],
  maxAllowedDistance = 220
): { index: number; distance: number; valid: boolean } {
  const obsYuv = rgbToYuv(observed);
  let minDistance = Number.POSITIVE_INFINITY;
  let bestIndex = 0;

  for (let i = 0; i < palette.length; i++) {
    const palYuv = rgbToYuv(palette[i]);
    const dist = euclideanDistanceYuv(obsYuv, palYuv);
    if (dist < minDistance) {
      minDistance = dist;
      bestIndex = i;
    }
  }

  return {
    index: bestIndex,
    distance: minDistance,
    valid: minDistance <= maxAllowedDistance,
  };
}

/**
 * Optical Calibration Engine for estimating optical channel characteristics.
 */
export class OpticalCalibrationEngine {
  private config: CalibrationConfig;
  private luminanceHistory: number[] = [];

  constructor(config: Partial<CalibrationConfig> = {}) {
    this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
  }

  /**
   * Feed a frame's average luminance measurement to track exposure stability.
   */
  feedLuminanceSample(luminance: number, maxHistory = 15): boolean {
    this.luminanceHistory.push(luminance);
    if (this.luminanceHistory.length > maxHistory) {
      this.luminanceHistory.shift();
    }
    return this.isExposureStable();
  }

  /**
   * Determine if camera exposure is stabilized based on luminance variance.
   */
  isExposureStable(): boolean {
    if (this.luminanceHistory.length < 5) return false;

    const mean = this.luminanceHistory.reduce((a, b) => a + b, 0) / this.luminanceHistory.length;
    const variance =
      this.luminanceHistory.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      this.luminanceHistory.length;

    return variance <= this.config.exposureVarianceThreshold;
  }

  /**
   * Calibrate optical thresholds and color palettes given measured reference levels.
   */
  calibrate(
    whiteSample: number | RGBColor,
    blackSample: number | RGBColor,
    ambientSample = 10
  ): CalibrationResult {
    // 1. Extract scalar luminance levels
    const whiteLuma = typeof whiteSample === "number"
      ? whiteSample
      : 0.299 * whiteSample[0] + 0.587 * whiteSample[1] + 0.114 * whiteSample[2];

    const blackLuma = typeof blackSample === "number"
      ? blackSample
      : 0.299 * blackSample[0] + 0.587 * blackSample[1] + 0.114 * blackSample[2];

    const clampedWhite = Math.max(0, Math.min(255, whiteLuma));
    const clampedBlack = Math.max(0, Math.min(255, blackLuma));
    const dynamicRange = Math.max(0, clampedWhite - clampedBlack);

    const isStable = this.isExposureStable();

    // 2. Reject insufficient dynamic range
    if (dynamicRange < this.config.minDynamicRange) {
      return {
        isCalibrated: false,
        ambientLuminance: ambientSample,
        whiteLevel: clampedWhite,
        blackLevel: clampedBlack,
        dynamicRange,
        isExposureStable: isStable,
        adaptiveThreshold: 128,
        pam4Thresholds: [64, 128, 192],
        calibratedPalette8: CSK8_CONSTELLATION,
        calibratedPalette16: CSK16_CONSTELLATION,
        confidenceScore: 0.0,
        reason: `Insufficient dynamic range: measured ${dynamicRange.toFixed(1)}, minimum required ${this.config.minDynamicRange}`,
      };
    }

    // 3. Adaptive OOK threshold
    const adaptiveThreshold = clampedBlack + dynamicRange * 0.5;

    // 4. Adaptive 4-PAM decision thresholds (T1, T2, T3)
    const pam4Thresholds: [number, number, number] = [
      clampedBlack + (dynamicRange * 1) / 6,
      clampedBlack + (dynamicRange * 3) / 6,
      clampedBlack + (dynamicRange * 5) / 6,
    ];

    // 5. Calibrate CSK palettes based on channel gain and ambient offset
    const gain = dynamicRange / 255;
    const offset = clampedBlack;

    const calibratedPalette8 = CSK8_CONSTELLATION.map((c) => {
      const r = Math.round(c[0] * gain + offset);
      const g = Math.round(c[1] * gain + offset);
      const b = Math.round(c[2] * gain + offset);
      return [r, g, b] as RGBColor;
    });

    const calibratedPalette16 = CSK16_CONSTELLATION.map((c) => {
      const r = Math.round(c[0] * gain + offset);
      const g = Math.round(c[1] * gain + offset);
      const b = Math.round(c[2] * gain + offset);
      return [r, g, b] as RGBColor;
    });

    // 6. Compute calibration confidence score (0..1)
    let score = 0.6 * Math.min(1.0, dynamicRange / 100);
    if (isStable) {
      score += 0.4;
    } else {
      score += 0.2; // Partial score if exposure history is small
    }

    const confidenceScore = Math.min(1.0, Math.max(0.0, score));

    return {
      isCalibrated: confidenceScore >= this.config.minConfidence,
      ambientLuminance: ambientSample,
      whiteLevel: clampedWhite,
      blackLevel: clampedBlack,
      dynamicRange,
      isExposureStable: isStable,
      adaptiveThreshold,
      pam4Thresholds,
      calibratedPalette8,
      calibratedPalette16,
      confidenceScore,
      reason: confidenceScore >= this.config.minConfidence
        ? "Optical calibration successful"
        : `Confidence score ${confidenceScore.toFixed(2)} below threshold ${this.config.minConfidence}`,
    };
  }

  reset(): void {
    this.luminanceHistory = [];
  }
}
