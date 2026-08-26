/**
 * Visual OFDM Synchronization & Pilot Channel Equalization (Milestone 4B & 4C)
 *
 * Implements:
 * - 2D Spatial Pilot tone tracking
 * - Global Zero-Forcing Equalization
 * - Synchronization confidence scoring
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

import type { SubcarrierGridMap } from "./ofdm-framing";
import type { ComplexSymbol, OfdmSymbolGrid } from "./ofdm-modulator";

export interface OfdmSyncResult {
  synchronized: boolean;
  confidence: number; // 0.0 to 1.0
  channelGain: number;
  detectedPilots: number;
  totalPilots: number;
  pilotBer: number;
}

export interface EqualizedGrid {
  carriers: ComplexSymbol[];
  sync: OfdmSyncResult;
}

/**
 * Perform 2D Pilot-based Channel Estimation and Equalization.
 */
export function estimateAndEqualizeChannel(
  receivedGrid: ComplexSymbol[],
  gridMap: SubcarrierGridMap
): EqualizedGrid {
  const pilotIndices = gridMap.pilotIndices;
  let validPilotMatches = 0;
  let totalPilotEnergy = 0;
  let expectedPilotEnergy = 0;

  for (const pIdx of pilotIndices) {
    const carrier = gridMap.carriers[pIdx];
    const expectedVal = (carrier.pilotSign ?? 1) * 1.0;
    const received = receivedGrid[pIdx];

    const signMatch = Math.sign(received.real) === Math.sign(expectedVal);
    if (signMatch && Math.abs(received.real) > 0.01) {
      validPilotMatches++;
    }

    totalPilotEnergy += received.real * received.real;
    expectedPilotEnergy += expectedVal * expectedVal;
  }

  const totalPilots = pilotIndices.length;
  const pilotCorrelation = totalPilots > 0 ? validPilotMatches / totalPilots : 0;
  const rawGain = expectedPilotEnergy > 0 ? Math.sqrt(totalPilotEnergy / expectedPilotEnergy) : 1.0;
  const channelGain = Math.max(0.01, rawGain);

  const synchronized = pilotCorrelation >= 0.40;
  const confidence = Math.min(1.0, Math.max(0.0, pilotCorrelation));
  const pilotBer = 1.0 - pilotCorrelation;

  // Zero-Forcing Equalization
  const invGain = 1.0 / channelGain;
  const equalizedCarriers: ComplexSymbol[] = new Array(gridMap.totalCarriers);

  for (let i = 0; i < gridMap.totalCarriers; i++) {
    equalizedCarriers[i] = {
      real: receivedGrid[i].real * invGain,
      imag: 0.0,
    };
  }

  return {
    carriers: equalizedCarriers,
    sync: {
      synchronized,
      confidence,
      channelGain,
      detectedPilots: validPilotMatches,
      totalPilots,
      pilotBer,
    },
  };
}

/**
 * Generate a dedicated high-contrast synchronization preamble grid.
 */
export function generateOfdmPreambleGrid(gridSize: number, map: SubcarrierGridMap): OfdmSymbolGrid {
  const carriers: ComplexSymbol[] = new Array(map.totalCarriers);

  for (let i = 0; i < map.totalCarriers; i++) {
    const carrier = map.carriers[i];
    if (carrier.type === "pilot") {
      carriers[i] = { real: (carrier.pilotSign ?? 1) * 1.5, imag: 0.0 };
    } else if (carrier.type === "data") {
      const sign = (carrier.row + carrier.col) % 2 === 0 ? 1.0 : -1.0;
      carriers[i] = { real: sign, imag: 0.0 };
    } else {
      carriers[i] = { real: 0.0, imag: 0.0 };
    }
  }

  return {
    gridSize,
    modulation: "bpsk",
    carriers,
    dataCarriersCount: map.dataIndices.length,
    pilotCarriersCount: map.pilotIndices.length,
  };
}
