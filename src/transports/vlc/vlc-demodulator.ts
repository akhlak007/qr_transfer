/**
 * VLC Demodulator Foundation (Milestone 3B & 3C)
 *
 * Implements:
 * - Region-of-Interest (ROI) optical pixel extraction
 * - Intensity demodulation (OOK & 4-PAM)
 * - Color-Shift Keying demodulation (CSK-8 & CSK-16)
 * - Barker preamble synchronization & correlation search
 * - CRC-16 integrity validation handoff
 * - Detailed demodulation reporting and failure classification
 *
 * NOTE: Experimental VLC Research Prototype.
 */

import {
  decodeVlcFrame,
  findBarkerSyncIndex,
  BARKER_11_BITS,
  type VlcDecodedFrame,
  type VlcModulationScheme,
} from "./vlc-framing";
import {
  classifyNearestCskColor,
  type CalibrationResult,
} from "./vlc-calibration";
import type { RGBColor } from "./vlc-modulator";

export interface OpticalSample {
  rgb: RGBColor;
  luminance: number;
  timestamp: number;
}

export type VlcDemodulationStatus =
  | "success"
  | "crc_failure"
  | "sync_failure"
  | "insufficient_quality"
  | "incomplete_frame"
  | "unsupported_modulation";

export interface VlcDemodulationReport {
  status: VlcDemodulationStatus;
  frame: VlcDecodedFrame | null;
  syncIndex: number;
  totalSamples: number;
  error?: string;
}

/**
 * Extract center Region-of-Interest (ROI) average RGB color and luminance from raw image buffer.
 */
export function extractCenterRoiAverage(
  imageData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  roiFraction = 0.5
): { rgb: RGBColor; luminance: number } {
  const { data, width, height } = imageData;
  const roiW = Math.max(1, Math.floor(width * roiFraction));
  const roiH = Math.max(1, Math.floor(height * roiFraction));
  const startX = Math.floor((width - roiW) / 2);
  const startY = Math.floor((height - roiH) / 2);

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let pixelCount = 0;

  for (let y = startY; y < startY + roiH; y++) {
    for (let x = startX; x < startX + roiW; x++) {
      const idx = (y * width + x) * 4;
      totalR += data[idx];
      totalG += data[idx + 1];
      totalB += data[idx + 2];
      pixelCount++;
    }
  }

  if (pixelCount === 0) {
    return { rgb: [0, 0, 0], luminance: 0 };
  }

  const r = Math.round(totalR / pixelCount);
  const g = Math.round(totalG / pixelCount);
  const b = Math.round(totalB / pixelCount);
  const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

  return {
    rgb: [r, g, b],
    luminance,
  };
}

export class VlcDemodulator {
  private calibration: CalibrationResult;

  constructor(calibration: CalibrationResult) {
    this.calibration = calibration;
  }

  updateCalibration(calibration: CalibrationResult): void {
    this.calibration = calibration;
  }

  getCalibration(): CalibrationResult {
    return this.calibration;
  }

  /**
   * Demodulate an optical stream and return a structured report with status and decoded frame.
   */
  demodulateWithReport(
    samples: { rgb: RGBColor; luminance: number }[],
    modulation: VlcModulationScheme
  ): VlcDemodulationReport {
    if (samples.length < BARKER_11_BITS.length + 10) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex: -1,
        totalSamples: samples.length,
        error: "Insufficient sample count for frame synchronization and header",
      };
    }

    if (!this.calibration.isCalibrated) {
      return {
        status: "insufficient_quality",
        frame: null,
        syncIndex: -1,
        totalSamples: samples.length,
        error: this.calibration.reason ?? "Optical calibration quality below threshold",
      };
    }

    switch (modulation) {
      case "pam4":
        return this.demodulatePam4(samples);
      case "csk8":
        return this.demodulateCsk8(samples);
      case "csk16":
        return this.demodulateCsk16(samples);
      case "ook":
        return this.demodulateOok(samples);
      default:
        return {
          status: "unsupported_modulation",
          frame: null,
          syncIndex: -1,
          totalSamples: samples.length,
          error: `Unsupported VLC modulation scheme: ${String(modulation)}`,
        };
    }
  }

  /**
   * Convenience helper returning VlcDecodedFrame on success or null on any failure.
   */
  demodulate(
    samples: { rgb: RGBColor; luminance: number }[],
    modulation: VlcModulationScheme
  ): VlcDecodedFrame | null {
    const report = this.demodulateWithReport(samples, modulation);
    return report.status === "success" ? report.frame : null;
  }

  /**
   * Demodulate OOK optical samples (1 bit/symbol).
   */
  private demodulateOok(samples: { rgb: RGBColor; luminance: number }[]): VlcDemodulationReport {
    const threshold = this.calibration.adaptiveThreshold;
    const bits = new Uint8Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      bits[i] = samples[i].luminance >= threshold ? 1 : 0;
    }

    const syncIndex = findBarkerSyncIndex(bits, 0.72);
    if (syncIndex < 0) {
      return {
        status: "sync_failure",
        frame: null,
        syncIndex: -1,
        totalSamples: samples.length,
        error: "Failed to detect Barker synchronization preamble",
      };
    }

    const payloadBits = bits.subarray(syncIndex + BARKER_11_BITS.length);
    const numBytes = Math.floor(payloadBits.length / 8);
    if (numBytes < 10) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: `Incomplete frame bytes: extracted ${numBytes}, required minimum 10`,
      };
    }

    const frameBytes = new Uint8Array(numBytes);
    for (let b = 0; b < numBytes; b++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        byteVal = (byteVal << 1) | payloadBits[b * 8 + bit];
      }
      frameBytes[b] = byteVal;
    }

    const decoded = decodeVlcFrame(frameBytes);
    if (!decoded) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: "Failed to parse frame header",
      };
    }

    if (!decoded.isValidCrc) {
      return {
        status: "crc_failure",
        frame: decoded,
        syncIndex,
        totalSamples: samples.length,
        error: "CRC-16 checksum mismatch",
      };
    }

    return {
      status: "success",
      frame: decoded,
      syncIndex,
      totalSamples: samples.length,
    };
  }

  /**
   * Demodulate 4-PAM optical samples (2 bits/symbol).
   */
  private demodulatePam4(samples: { rgb: RGBColor; luminance: number }[]): VlcDemodulationReport {
    const [t1, t2, t3] = this.calibration.pam4Thresholds;
    const preambleBits = new Uint8Array(samples.length);

    // 1. Detect preamble (thresholded at median t2)
    for (let i = 0; i < samples.length; i++) {
      preambleBits[i] = samples[i].luminance >= t2 ? 1 : 0;
    }

    const syncIndex = findBarkerSyncIndex(preambleBits, 0.72);
    if (syncIndex < 0) {
      return {
        status: "sync_failure",
        frame: null,
        syncIndex: -1,
        totalSamples: samples.length,
        error: "Failed to detect Barker synchronization preamble",
      };
    }

    const payloadSamples = samples.slice(syncIndex + BARKER_11_BITS.length);
    const numBytes = Math.floor(payloadSamples.length / 4); // 4 symbols/byte
    if (numBytes < 10) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: "Incomplete frame payload",
      };
    }

    const frameBytes = new Uint8Array(numBytes);
    for (let b = 0; b < numBytes; b++) {
      let byteVal = 0;
      for (let s = 0; s < 4; s++) {
        const luma = payloadSamples[b * 4 + s].luminance;
        let symVal = 0;
        if (luma >= t3) {
          symVal = 2; // Gray level 3 -> 10
        } else if (luma >= t2) {
          symVal = 3; // Gray level 2 -> 11
        } else if (luma >= t1) {
          symVal = 1; // 01
        } else {
          symVal = 0; // 00
        }
        byteVal = (byteVal << 2) | symVal;
      }
      frameBytes[b] = byteVal;
    }

    const decoded = decodeVlcFrame(frameBytes);
    if (!decoded) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: "Failed to parse 4-PAM frame header",
      };
    }

    if (!decoded.isValidCrc) {
      return {
        status: "crc_failure",
        frame: decoded,
        syncIndex,
        totalSamples: samples.length,
        error: "CRC-16 checksum mismatch on 4-PAM frame",
      };
    }

    return {
      status: "success",
      frame: decoded,
      syncIndex,
      totalSamples: samples.length,
    };
  }

  /**
   * Demodulate CSK-8 optical samples (3 bits/symbol).
   */
  private demodulateCsk8(samples: { rgb: RGBColor; luminance: number }[]): VlcDemodulationReport {
    const threshold = this.calibration.adaptiveThreshold;
    const preambleBits = new Uint8Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      preambleBits[i] = samples[i].luminance >= threshold ? 1 : 0;
    }

    const syncIndex = findBarkerSyncIndex(preambleBits, 0.72);
    if (syncIndex < 0) {
      return {
        status: "sync_failure",
        frame: null,
        syncIndex: -1,
        totalSamples: samples.length,
        error: "Failed to detect Barker preamble for CSK-8",
      };
    }

    const payloadSamples = samples.slice(syncIndex + BARKER_11_BITS.length);
    const palette = this.calibration.calibratedPalette8;

    const bitStream: number[] = [];
    for (const sample of payloadSamples) {
      const { index } = classifyNearestCskColor(sample.rgb, palette);
      bitStream.push((index >> 2) & 1);
      bitStream.push((index >> 1) & 1);
      bitStream.push(index & 1);
    }

    const numBytes = Math.floor(bitStream.length / 8);
    if (numBytes < 10) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: "Incomplete CSK-8 bitstream",
      };
    }

    const frameBytes = new Uint8Array(numBytes);
    for (let b = 0; b < numBytes; b++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        byteVal = (byteVal << 1) | bitStream[b * 8 + bit];
      }
      frameBytes[b] = byteVal;
    }

    const decoded = decodeVlcFrame(frameBytes);
    if (!decoded) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: "Failed to parse CSK-8 frame header",
      };
    }

    if (!decoded.isValidCrc) {
      return {
        status: "crc_failure",
        frame: decoded,
        syncIndex,
        totalSamples: samples.length,
        error: "CRC-16 checksum mismatch on CSK-8 frame",
      };
    }

    return {
      status: "success",
      frame: decoded,
      syncIndex,
      totalSamples: samples.length,
    };
  }

  /**
   * Demodulate CSK-16 optical samples (4 bits/symbol: 2 symbols/byte).
   */
  private demodulateCsk16(samples: { rgb: RGBColor; luminance: number }[]): VlcDemodulationReport {
    const threshold = this.calibration.adaptiveThreshold;
    const preambleBits = new Uint8Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      preambleBits[i] = samples[i].luminance >= threshold ? 1 : 0;
    }

    const syncIndex = findBarkerSyncIndex(preambleBits, 0.72);
    if (syncIndex < 0) {
      return {
        status: "sync_failure",
        frame: null,
        syncIndex: -1,
        totalSamples: samples.length,
        error: "Failed to detect Barker preamble for CSK-16",
      };
    }

    const payloadSamples = samples.slice(syncIndex + BARKER_11_BITS.length);
    const palette = this.calibration.calibratedPalette16;

    const numBytes = Math.floor(payloadSamples.length / 2);
    if (numBytes < 10) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: "Incomplete CSK-16 symbols",
      };
    }

    const frameBytes = new Uint8Array(numBytes);
    for (let b = 0; b < numBytes; b++) {
      const highSym = classifyNearestCskColor(payloadSamples[b * 2].rgb, palette).index;
      const lowSym = classifyNearestCskColor(payloadSamples[b * 2 + 1].rgb, palette).index;
      frameBytes[b] = ((highSym & 0x0f) << 4) | (lowSym & 0x0f);
    }

    const decoded = decodeVlcFrame(frameBytes);
    if (!decoded) {
      return {
        status: "incomplete_frame",
        frame: null,
        syncIndex,
        totalSamples: samples.length,
        error: "Failed to parse CSK-16 frame header",
      };
    }

    if (!decoded.isValidCrc) {
      return {
        status: "crc_failure",
        frame: decoded,
        syncIndex,
        totalSamples: samples.length,
        error: "CRC-16 checksum mismatch on CSK-16 frame",
      };
    }

    return {
      status: "success",
      frame: decoded,
      syncIndex,
      totalSamples: samples.length,
    };
  }
}
