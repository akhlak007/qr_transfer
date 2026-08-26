/**
 * Visual OFDM Camera/Image Demodulator (Milestone 4C)
 *
 * Implements:
 * - Spatial luminance mean-centering and forward 2D-DCT transform
 * - Pilot tracking, Zero-Forcing channel equalization, and optimal decision boundaries
 * - BPSK & QPSK subcarrier symbol demodulation
 * - Bit reassembly, CRC-16 validation, and detailed telemetry reporting
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

import {
  createSubcarrierMap,
  decodeOfdmFrame,
  type OfdmDecodedFrame,
  type OfdmModulationScheme,
  type SubcarrierGridMap,
} from "./ofdm-framing";
import type { OfdmSyncResult } from "./ofdm-sync";
import { recoverOfdmGrid } from "./ofdm-grid-recovery";

export type OfdmDemodulationStatus =
  | "success"
  | "sync_failure"
  | "pilot_failure"
  | "insufficient_quality"
  | "crc_failure"
  | "incomplete_frame"
  | "unsupported_modulation";

export interface OfdmDemodulationReport {
  status: OfdmDemodulationStatus;
  frame: OfdmDecodedFrame | null;
  sync: OfdmSyncResult;
  estimatedSnrDb: number;
  estimatedBer: number;
  totalCarriers: number;
  activeDataCarriers: number;
  error?: string;
}

export class VisualOfdmDemodulator {
  private gridMap: SubcarrierGridMap;

  constructor(gridSize = 16) {
    this.gridMap = createSubcarrierMap(gridSize);
  }

  setGridSize(gridSize: number): void {
    if (this.gridMap.gridSize !== gridSize) {
      this.gridMap = createSubcarrierMap(gridSize);
    }
  }

  /**
   * Demodulate a spatial luminance pattern into an OFDM frame with telemetry report.
   */
  demodulateSpatialPattern(
    spatialLuminance: Float64Array | number[],
    modulation: OfdmModulationScheme = "bpsk"
  ): OfdmDemodulationReport {
    const N = this.gridMap.gridSize;
    const recovered = recoverOfdmGrid(spatialLuminance, modulation, N, this.gridMap);
    if (!recovered.synchronized) {
      return {
        status: spatialLuminance.length < N * N ? "incomplete_frame" : "sync_failure",
        frame: null,
        sync: recovered.sync,
        estimatedSnrDb: recovered.estimatedSnrDb,
        estimatedBer: recovered.estimatedBer,
        totalCarriers: recovered.totalCarriers,
        activeDataCarriers: recovered.activeDataCarriers,
        error: recovered.error,
      };
    }

    // 6. Pack bits into bytes
    const numBytes = Math.floor(recovered.bits.length / 8);
    if (numBytes < 12) { // 10 header + 2 CRC bytes
      return {
        status: "incomplete_frame",
        frame: null,
        sync: recovered.sync,
        estimatedSnrDb: recovered.estimatedSnrDb,
        estimatedBer: recovered.estimatedBer,
        totalCarriers: N * N,
        activeDataCarriers: this.gridMap.dataIndices.length,
        error: "Insufficient data subcarriers to form minimum 12-byte OFDM frame",
      };
    }

    const frameBytes = new Uint8Array(numBytes);
    for (let b = 0; b < numBytes; b++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        byteVal = (byteVal << 1) | recovered.bits[b * 8 + bit];
      }
      frameBytes[b] = byteVal;
    }

    // 7. Decode binary frame and check CRC-16
    const decoded = decodeOfdmFrame(frameBytes);
    if (!decoded) {
      return {
        status: "incomplete_frame",
        frame: null,
        sync: recovered.sync,
        estimatedSnrDb: recovered.estimatedSnrDb,
        estimatedBer: recovered.estimatedBer,
        totalCarriers: N * N,
        activeDataCarriers: this.gridMap.dataIndices.length,
        error: "Failed to parse OFDM frame header",
      };
    }

    if (!decoded.isValidCrc) {
      return {
        status: "crc_failure",
        frame: decoded,
        sync: recovered.sync,
        estimatedSnrDb: recovered.estimatedSnrDb,
        estimatedBer: recovered.estimatedBer,
        totalCarriers: N * N,
        activeDataCarriers: this.gridMap.dataIndices.length,
        error: "CRC-16 checksum mismatch on OFDM payload",
      };
    }

    return {
      status: "success",
      frame: decoded,
      sync: recovered.sync,
      estimatedSnrDb: recovered.estimatedSnrDb,
      estimatedBer: 0.0,
      totalCarriers: N * N,
      activeDataCarriers: this.gridMap.dataIndices.length,
    };
  }
}
