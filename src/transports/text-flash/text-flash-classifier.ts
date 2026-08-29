/**
 * TEXT_FLASH_PROTOCOL — optical classifier (TF2).
 * Classifies IDLE / START / END / BITCARD / UNKNOWN only.
 * LENGTH vs DATA is a receiver-phase concern (TF3), not visual.
 * Synthetic-condition reliability only — not a phone-camera success claim.
 */

import {
  TEXT_FLASH_ACTIVE_REGION_RATIO,
  type TextFlashOpticalClass,
  type TextFlashSignalQuality,
} from "./text-flash-types";
import {
  activeRegionRect,
  bitCardCellCenters,
  bitCardToByte,
  controlBarRect,
} from "./text-flash-framing";
import type { TextFlashPixelBuffer } from "./text-flash-renderer";
import { sampleLuminance } from "./text-flash-renderer";

const COLOR = {
  black: 0,
  white: 255,
  gray: 128,
} as const;

export interface TextFlashClassifyOptions {
  activeRegionRatio?: number;
  /** Minimum |luminance - threshold| for a confident bit decision. */
  minBitMargin?: number;
  /** Minimum bar-vs-field contrast for START/END. */
  minBarContrast?: number;
}

export interface TextFlashClassificationDiagnostics {
  detectedKind: TextFlashOpticalClass["kind"];
  byte: number | null;
  confidence: number;
  quality: TextFlashSignalQuality;
  adaptiveThreshold: number;
  cellMargin: number;
  regionFound: boolean;
  /** Set by sample stream / synthetic channel, not the pure classifier. */
  missedSamples: number;
  reacquiring: boolean;
}

export interface TextFlashClassifyResult {
  classification: TextFlashOpticalClass;
  diagnostics: TextFlashClassificationDiagnostics;
}

function luminanceAt(
  buf: TextFlashPixelBuffer,
  x: number,
  y: number,
): number {
  return sampleLuminance(buf, x, y);
}

/** Collect luminance samples on a coarse grid inside the active region. */
function sampleRegionLuminances(
  buf: TextFlashPixelBuffer,
  region: { x: number; y: number; w: number; h: number },
  grid = 16,
): number[] {
  const values: number[] = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = region.x + ((gx + 0.5) / grid) * region.w;
      const y = region.y + ((gy + 0.5) / grid) * region.h;
      values.push(luminanceAt(buf, x, y));
    }
  }
  return values;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return COLOR.gray;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function qualityFromConfidence(confidence: number, margin: number): TextFlashSignalQuality {
  if (confidence >= 0.8 && margin >= 40) return "GOOD";
  if (confidence >= 0.5 && margin >= 25) return "FAIR";
  return "POOR";
}

function makeDiagnostics(
  classification: TextFlashOpticalClass,
  adaptiveThreshold: number,
  cellMargin: number,
  confidence: number,
  regionFound: boolean,
  stream?: { missedSamples: number; reacquiring: boolean },
): TextFlashClassificationDiagnostics {
  return {
    detectedKind: classification.kind,
    byte: classification.kind === "bitcard" ? classification.byte : null,
    confidence,
    quality: qualityFromConfidence(confidence, cellMargin),
    adaptiveThreshold,
    cellMargin,
    regionFound,
    missedSamples: stream?.missedSamples ?? 0,
    reacquiring: stream?.reacquiring ?? false,
  };
}

/**
 * Classify one camera/RGBA observation.
 * Uses fixed center active region matching the transmitter geometry (deterministic loopback).
 */
export function classifyTextFlashFrame(
  buf: TextFlashPixelBuffer,
  options: TextFlashClassifyOptions = {},
  stream?: { missedSamples: number; reacquiring: boolean },
): TextFlashClassifyResult {
  const ratio = options.activeRegionRatio ?? TEXT_FLASH_ACTIVE_REGION_RATIO;
  const minBitMargin = options.minBitMargin ?? 20;
  const minBarContrast = options.minBarContrast ?? 40;

  const region = activeRegionRect(buf.width, buf.height, ratio);
  const regionFound =
    region.w > 8 && region.h > 8 && buf.width > 0 && buf.height > 0;

  if (!regionFound) {
    const classification: TextFlashOpticalClass = { kind: "unknown" };
    return {
      classification,
      diagnostics: makeDiagnostics(classification, COLOR.gray, 0, 0, false, stream),
    };
  }

  // Percentiles from the full frame so gray margins keep dynamic range for
  // all-black / all-white bit-cards (active region alone would collapse).
  const frameSamples = sampleRegionLuminances(buf, {
    x: 0,
    y: 0,
    w: buf.width,
    h: buf.height,
  }, 16);
  const regionSamples = sampleRegionLuminances(buf, region, 16);
  const sorted = frameSamples.slice().sort((a, b) => a - b);
  const p10 = percentile(sorted, 0.1);
  const p90 = percentile(sorted, 0.9);
  const adaptiveThreshold = (p10 + p90) / 2;
  const regionMean = mean(regionSamples);
  const regionSorted = regionSamples.slice().sort((a, b) => a - b);
  const regionRange =
    percentile(regionSorted, 0.9) - percentile(regionSorted, 0.1);

  // IDLE: whole frame near mid-gray, low contrast in the active region
  const fullMean = mean(frameSamples);
  if (regionRange < 25 && Math.abs(fullMean - COLOR.gray) < 25) {
    const classification: TextFlashOpticalClass = { kind: "idle" };
    return {
      classification,
      diagnostics: makeDiagnostics(
        classification,
        adaptiveThreshold,
        regionRange,
        0.9,
        true,
        stream,
      ),
    };
  }

  const bar = controlBarRect(region);
  const barMean = mean(sampleRegionLuminances(buf, bar, 8));
  // Field = active region excluding bar band (sample top third)
  const topField = {
    x: region.x,
    y: region.y,
    w: region.w,
    h: Math.max(1, bar.y - region.y),
  };
  const fieldMean = mean(sampleRegionLuminances(buf, topField, 8));
  const barContrast = Math.abs(fieldMean - barMean);

  // START: bright field, dark bar
  if (
    fieldMean > adaptiveThreshold + 20 &&
    barMean < adaptiveThreshold - 20 &&
    barContrast >= minBarContrast &&
    regionMean > adaptiveThreshold
  ) {
    const confidence = Math.min(1, barContrast / 120);
    const classification: TextFlashOpticalClass = { kind: "start" };
    return {
      classification,
      diagnostics: makeDiagnostics(
        classification,
        adaptiveThreshold,
        barContrast,
        confidence,
        true,
        stream,
      ),
    };
  }

  // END: dark field, bright bar
  if (
    fieldMean < adaptiveThreshold - 20 &&
    barMean > adaptiveThreshold + 20 &&
    barContrast >= minBarContrast &&
    regionMean < adaptiveThreshold
  ) {
    const confidence = Math.min(1, barContrast / 120);
    const classification: TextFlashOpticalClass = { kind: "end" };
    return {
      classification,
      diagnostics: makeDiagnostics(
        classification,
        adaptiveThreshold,
        barContrast,
        confidence,
        true,
        stream,
      ),
    };
  }

  // BITCARD: 8 cell centers with margin
  const cells = bitCardCellCenters(region);
  const bits: boolean[] = [];
  let minMargin = Infinity;
  let weak = false;
  for (const cell of cells) {
    const lum = luminanceAt(buf, cell.x, cell.y);
    const margin = Math.abs(lum - adaptiveThreshold);
    minMargin = Math.min(minMargin, margin);
    if (margin < minBitMargin) {
      weak = true;
      break;
    }
    bits.push(lum > adaptiveThreshold);
  }

  if (!weak && bits.length === 8) {
    const byte = bitCardToByte(bits);
    const confidence = Math.min(1, minMargin / 80);
    const classification: TextFlashOpticalClass = { kind: "bitcard", byte };
    return {
      classification,
      diagnostics: makeDiagnostics(
        classification,
        adaptiveThreshold,
        minMargin,
        confidence,
        true,
        stream,
      ),
    };
  }

  const classification: TextFlashOpticalClass = { kind: "unknown" };
  return {
    classification,
    diagnostics: makeDiagnostics(
      classification,
      adaptiveThreshold,
      Number.isFinite(minMargin) ? minMargin : 0,
      0.1,
      true,
      stream,
    ),
  };
}

/** Compare two optical classes for duplicate-frame / stability checks. */
export function sameOpticalClass(
  a: TextFlashOpticalClass,
  b: TextFlashOpticalClass,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "bitcard" && b.kind === "bitcard") return a.byte === b.byte;
  return true;
}
