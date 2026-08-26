/**
 * Visual OFDM Modulator (Milestone 4A & 4B)
 *
 * Implements:
 * - BPSK Constellation mapping (1 bit/carrier)
 * - QPSK / 4-PAM real-basis Constellation mapping (2 bits/carrier) with unit energy normalization
 * - 16-QAM real-basis Constellation mapping (4 bits/carrier) with unit energy normalization
 * - Subcarrier grid population (Data, Pilots, DC, Guards)
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

import {
  createSubcarrierMap,
  type OfdmModulationScheme,
  type SubcarrierGridMap,
} from "./ofdm-framing";

export interface ComplexSymbol {
  real: number;
  imag: number;
}

export interface OfdmSymbolGrid {
  gridSize: number;
  modulation: OfdmModulationScheme;
  carriers: ComplexSymbol[]; // 1D array of length gridSize * gridSize
  dataCarriersCount: number;
  pilotCarriersCount: number;
}

// QPSK 4-level constellation points with unit average energy: (-1.3416^2 + -0.4472^2 + 0.4472^2 + 1.3416^2)/4 = 1.0
const QPSK_L0 = -1.3416407864998738; // 00
const QPSK_L1 = -0.4472135954999579; // 01
const QPSK_L2 =  0.4472135954999579; // 10
const QPSK_L3 =  1.3416407864998738; // 11

const QPSK_THRESH_LOW = -0.8944271909999159;
const QPSK_THRESH_HIGH = 0.8944271909999159;

// 16-QAM: 16 symmetric levels with unit average energy (sqrt(85) normalization)
const QAM16_NORM = Math.sqrt(85);

/**
 * Modulate binary bit to BPSK complex symbol:
 * 0 -> -1.0 + 0j
 * 1 -> +1.0 + 0j
 */
export function modulateBpskBit(bit: number): ComplexSymbol {
  return {
    real: bit === 1 ? 1.0 : -1.0,
    imag: 0.0,
  };
}

/**
 * Modulate 2-bit symbol to QPSK/4-QAM real-basis symbol (unit energy):
 * 00 -> -1.3416
 * 01 -> -0.4472
 * 10 -> +0.4472
 * 11 -> +1.3416
 */
export function modulateQpskBits(b0: number, b1: number): ComplexSymbol {
  let val: number;
  if (b0 === 0 && b1 === 0) {
    val = QPSK_L0;
  } else if (b0 === 0 && b1 === 1) {
    val = QPSK_L1;
  } else if (b0 === 1 && b1 === 0) {
    val = QPSK_L2;
  } else {
    val = QPSK_L3;
  }
  return { real: val, imag: 0.0 };
}

/**
 * Modulate 4-bit symbol to 16-QAM real-basis symbol (unit energy):
 */
export function modulate16QamBits(b0: number, b1: number, b2: number, b3: number): ComplexSymbol {
  const k = ((b0 & 1) << 3) | ((b1 & 1) << 2) | ((b2 & 1) << 1) | (b3 & 1);
  const unscaled = 2 * k - 15;
  return { real: unscaled / QAM16_NORM, imag: 0.0 };
}

/**
 * Demodulate BPSK complex symbol to binary bit:
 * Real >= 0 -> 1, Real < 0 -> 0
 */
export function demodulateBpskSymbol(symbol: ComplexSymbol): number {
  return symbol.real >= 0 ? 1 : 0;
}

/**
 * Demodulate QPSK real-basis complex symbol to 2 bits:
 */
export function demodulateQpskSymbol(symbol: ComplexSymbol): [number, number] {
  const r = symbol.real;
  if (r < QPSK_THRESH_LOW) {
    return [0, 0];
  } else if (r < 0) {
    return [0, 1];
  } else if (r < QPSK_THRESH_HIGH) {
    return [1, 0];
  } else {
    return [1, 1];
  }
}

/**
 * Demodulate 16-QAM real-basis complex symbol to 4 bits:
 */
export function demodulate16QamSymbol(symbol: ComplexSymbol): [number, number, number, number] {
  const r = symbol.real;
  const unscaled = r * QAM16_NORM;
  const kRaw = Math.round((unscaled + 15) / 2);
  const k = Math.max(0, Math.min(15, kRaw));
  return [
    (k >> 3) & 1,
    (k >> 2) & 1,
    (k >> 1) & 1,
    k & 1,
  ];
}

/**
 * Modulate raw bytes into an OFDM 2D spatial-frequency grid.
 */
export function modulateOfdmBytes(
  bytes: Uint8Array,
  modulation: OfdmModulationScheme = "bpsk",
  gridSize = 16,
  map?: SubcarrierGridMap
): OfdmSymbolGrid[] {
  const gridMap = map ?? createSubcarrierMap(gridSize);
  const bitsPerSym = modulation === "16qam" ? 4 : modulation === "qpsk" ? 2 : 1;
  const dataCapacityPerGrid = gridMap.dataIndices.length * bitsPerSym;
  const totalBits = bytes.length * 8;
  const gridsNeeded = Math.max(1, Math.ceil(totalBits / dataCapacityPerGrid));

  const grids: OfdmSymbolGrid[] = [];
  let bitCursor = 0;

  const getBit = (idx: number): number => {
    if (idx >= totalBits) return 0; // zero-pad
    const byteIdx = Math.floor(idx / 8);
    const bitOffset = 7 - (idx % 8);
    return (bytes[byteIdx] >> bitOffset) & 1;
  };

  for (let g = 0; g < gridsNeeded; g++) {
    const carriers: ComplexSymbol[] = new Array(gridMap.totalCarriers);

    // Initialize all carriers according to grid map
    for (let i = 0; i < gridMap.totalCarriers; i++) {
      const carrierInfo = gridMap.carriers[i];

      if (carrierInfo.type === "dc") {
        carriers[i] = { real: 0.0, imag: 0.0 };
      } else if (carrierInfo.type === "guard") {
        carriers[i] = { real: 0.0, imag: 0.0 };
      } else if (carrierInfo.type === "pilot") {
        const sign = carrierInfo.pilotSign ?? 1;
        carriers[i] = { real: sign * 1.0, imag: 0.0 };
      }
    }

    // Populate data carriers
    for (const dIdx of gridMap.dataIndices) {
      if (modulation === "16qam") {
        const b0 = getBit(bitCursor++);
        const b1 = getBit(bitCursor++);
        const b2 = getBit(bitCursor++);
        const b3 = getBit(bitCursor++);
        carriers[dIdx] = modulate16QamBits(b0, b1, b2, b3);
      } else if (modulation === "qpsk") {
        const b0 = getBit(bitCursor++);
        const b1 = getBit(bitCursor++);
        carriers[dIdx] = modulateQpskBits(b0, b1);
      } else {
        const b = getBit(bitCursor++);
        carriers[dIdx] = modulateBpskBit(b);
      }
    }

    grids.push({
      gridSize,
      modulation,
      carriers,
      dataCarriersCount: gridMap.dataIndices.length,
      pilotCarriersCount: gridMap.pilotIndices.length,
    });
  }

  return grids;
}
