/**
 * VLC Modulator: Intensity & Color-Shift Keying (Milestone 3A & 3B)
 *
 * Implements:
 * - On-Off Keying (OOK) - 1 bit/symbol
 * - 4-level Pulse Amplitude Modulation (4-PAM) - 2 bits/symbol
 * - 8-ary Color-Shift Keying (CSK-8) - 3 bits/symbol
 * - 16-ary Color-Shift Keying (CSK-16) - 4 bits/symbol
 * - Barker-11 sync sequence prepending
 * - HTML5 2D Canvas rendering
 *
 * NOTE: Experimental VLC Research Prototype.
 */

import { BARKER_11_BITS, type VlcModulationScheme } from "./vlc-framing";

export type RGBColor = [number, number, number];

export const PAM4_INTENSITY_LEVELS = [0, 85, 170, 255]; // Gray order: 00, 01, 11, 10

const PAM4_GRAY_LEVEL_BY_DIBIT = [0, 1, 3, 2];

/**
 * 8-ary CSK Constellation (3 bits / symbol)
 * Vertices of normalized RGB color cube:
 * 0: Black [0, 0, 0]
 * 1: Blue [0, 0, 255]
 * 2: Green [0, 255, 0]
 * 3: Cyan [0, 255, 255]
 * 4: Red [255, 0, 0]
 * 5: Magenta [255, 0, 255]
 * 6: Yellow [255, 255, 0]
 * 7: White [255, 255, 255]
 */
export const CSK8_CONSTELLATION: RGBColor[] = [
  [0, 0, 0],       // 000
  [0, 0, 255],     // 001
  [0, 255, 0],     // 010
  [0, 255, 255],   // 011
  [255, 0, 0],     // 100
  [255, 0, 255],   // 101
  [255, 255, 0],   // 110
  [255, 255, 255], // 111
];

/**
 * 16-ary CSK Constellation (4 bits / symbol)
 * 8 corners + 8 midpoints/tints in RGB cube
 */
export const CSK16_CONSTELLATION: RGBColor[] = [
  [0, 0, 0],       // 0000: Black
  [0, 0, 128],     // 0001: Navy
  [0, 0, 255],     // 0010: Blue
  [0, 128, 0],     // 0011: Dark Green
  [0, 255, 0],     // 0100: Green
  [0, 255, 255],   // 0101: Cyan
  [0, 128, 128],   // 0110: Teal
  [128, 0, 0],     // 0111: Maroon
  [255, 0, 0],     // 1000: Red
  [255, 0, 255],   // 1001: Magenta
  [128, 0, 128],   // 1010: Purple
  [255, 128, 0],   // 1011: Orange
  [255, 255, 0],   // 1100: Yellow
  [128, 128, 0],   // 1101: Olive
  [128, 128, 128], // 1110: Gray
  [255, 255, 255], // 1111: White
];

export interface VlcModulatedStream {
  modulation: VlcModulationScheme;
  preambleLength: number;
  totalSymbols: number;
  levels: Uint8Array; // Grayscale intensity (0..255)
  colors: RGBColor[]; // RGB tuples for optical transmission
}

/**
 * Modulate raw bytes using OOK (1 bit/symbol).
 */
export function modulateOok(frameBytes: Uint8Array): VlcModulatedStream {
  const preambleLen = BARKER_11_BITS.length;
  const payloadBitsLen = frameBytes.length * 8;
  const totalSymbols = preambleLen + payloadBitsLen;
  const levels = new Uint8Array(totalSymbols);
  const colors: RGBColor[] = new Array(totalSymbols);

  for (let i = 0; i < preambleLen; i++) {
    const val = BARKER_11_BITS[i] === 1 ? 255 : 0;
    levels[i] = val;
    colors[i] = [val, val, val];
  }

  let symIdx = preambleLen;
  for (let b = 0; b < frameBytes.length; b++) {
    const byte = frameBytes[b];
    for (let bit = 7; bit >= 0; bit--) {
      const isOne = ((byte >> bit) & 1) === 1;
      const val = isOne ? 255 : 0;
      levels[symIdx] = val;
      colors[symIdx] = [val, val, val];
      symIdx++;
    }
  }

  return {
    modulation: "ook",
    preambleLength: preambleLen,
    totalSymbols,
    levels,
    colors,
  };
}

/**
 * Modulate raw bytes using 4-PAM (2 bits/symbol).
 */
export function modulatePam4(frameBytes: Uint8Array): VlcModulatedStream {
  const preambleLen = BARKER_11_BITS.length;
  const payloadSymbolsLen = frameBytes.length * 4;
  const totalSymbols = preambleLen + payloadSymbolsLen;
  const levels = new Uint8Array(totalSymbols);
  const colors: RGBColor[] = new Array(totalSymbols);

  for (let i = 0; i < preambleLen; i++) {
    const val = BARKER_11_BITS[i] === 1 ? PAM4_INTENSITY_LEVELS[3] : PAM4_INTENSITY_LEVELS[0];
    levels[i] = val;
    colors[i] = [val, val, val];
  }

  let symIdx = preambleLen;
  for (let b = 0; b < frameBytes.length; b++) {
    const byte = frameBytes[b];
    const s0 = (byte >> 6) & 0x03;
    const s1 = (byte >> 4) & 0x03;
    const s2 = (byte >> 2) & 0x03;
    const s3 = byte & 0x03;

    for (const sym of [s0, s1, s2, s3]) {
      const val = PAM4_INTENSITY_LEVELS[PAM4_GRAY_LEVEL_BY_DIBIT[sym]];
      levels[symIdx] = val;
      colors[symIdx] = [val, val, val];
      symIdx++;
    }
  }

  return {
    modulation: "pam4",
    preambleLength: preambleLen,
    totalSymbols,
    levels,
    colors,
  };
}

/**
 * Modulate raw bytes using CSK-8 (3 bits/symbol).
 * Encodes bitstream into 3-bit chunk symbols.
 */
export function modulateCsk8(frameBytes: Uint8Array): VlcModulatedStream {
  const preambleLen = BARKER_11_BITS.length;
  const totalBits = frameBytes.length * 8;
  const payloadSymbolsLen = Math.ceil(totalBits / 3);
  const totalSymbols = preambleLen + payloadSymbolsLen;
  const levels = new Uint8Array(totalSymbols);
  const colors: RGBColor[] = new Array(totalSymbols);

  // 1. Preamble (Black/White high-contrast)
  for (let i = 0; i < preambleLen; i++) {
    const isOne = BARKER_11_BITS[i] === 1;
    const color = isOne ? CSK8_CONSTELLATION[7] : CSK8_CONSTELLATION[0];
    const luma = isOne ? 255 : 0;
    levels[i] = luma;
    colors[i] = color;
  }

  // 2. Extract 3-bit symbols across the bitstream
  let bitBuffer = 0;
  let bitCount = 0;
  let symIdx = preambleLen;

  for (let b = 0; b < frameBytes.length; b++) {
    bitBuffer = (bitBuffer << 8) | frameBytes[b];
    bitCount += 8;

    while (bitCount >= 3) {
      const symbolVal = (bitBuffer >> (bitCount - 3)) & 0x07;
      bitCount -= 3;
      const color = CSK8_CONSTELLATION[symbolVal];
      colors[symIdx] = color;
      levels[symIdx] = Math.round(0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]);
      symIdx++;
    }
  }

  // Remaining bits (pad with 0s to complete 3 bits)
  if (bitCount > 0) {
    const symbolVal = (bitBuffer << (3 - bitCount)) & 0x07;
    const color = CSK8_CONSTELLATION[symbolVal];
    colors[symIdx] = color;
    levels[symIdx] = Math.round(0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]);
  }

  return {
    modulation: "csk8",
    preambleLength: preambleLen,
    totalSymbols,
    levels,
    colors,
  };
}

/**
 * Modulate raw bytes using CSK-16 (4 bits/symbol: 2 symbols/byte).
 */
export function modulateCsk16(frameBytes: Uint8Array): VlcModulatedStream {
  const preambleLen = BARKER_11_BITS.length;
  const payloadSymbolsLen = frameBytes.length * 2;
  const totalSymbols = preambleLen + payloadSymbolsLen;
  const levels = new Uint8Array(totalSymbols);
  const colors: RGBColor[] = new Array(totalSymbols);

  // 1. Preamble
  for (let i = 0; i < preambleLen; i++) {
    const isOne = BARKER_11_BITS[i] === 1;
    const color = isOne ? CSK16_CONSTELLATION[15] : CSK16_CONSTELLATION[0];
    const luma = isOne ? 255 : 0;
    levels[i] = luma;
    colors[i] = color;
  }

  // 2. 2 4-bit nibble symbols per byte (high nibble, low nibble)
  let symIdx = preambleLen;
  for (let b = 0; b < frameBytes.length; b++) {
    const byte = frameBytes[b];
    const high = (byte >> 4) & 0x0f;
    const low = byte & 0x0f;

    for (const sym of [high, low]) {
      const color = CSK16_CONSTELLATION[sym];
      colors[symIdx] = color;
      levels[symIdx] = Math.round(0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]);
      symIdx++;
    }
  }

  return {
    modulation: "csk16",
    preambleLength: preambleLen,
    totalSymbols,
    levels,
    colors,
  };
}

/**
 * Modulate a frame based on its declared modulation scheme.
 */
export function modulateVlcFrame(frameBytes: Uint8Array, modulation: VlcModulationScheme): VlcModulatedStream {
  switch (modulation) {
    case "pam4":
      return modulatePam4(frameBytes);
    case "csk8":
      return modulateCsk8(frameBytes);
    case "csk16":
      return modulateCsk16(frameBytes);
    case "ook":
    default:
      return modulateOok(frameBytes);
  }
}

/**
 * Render a single intensity symbol (0..255) onto a canvas element.
 */
export function renderVlcSymbolToCanvas(canvas: HTMLCanvasElement, level: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const safeLevel = Math.max(0, Math.min(255, Math.round(level)));
  ctx.fillStyle = `rgb(${safeLevel}, ${safeLevel}, ${safeLevel})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Render an RGB color symbol onto a canvas element.
 */
export function renderVlcColorToCanvas(canvas: HTMLCanvasElement, color: RGBColor): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const r = Math.max(0, Math.min(255, Math.round(color[0])));
  const g = Math.max(0, Math.min(255, Math.round(color[1])));
  const b = Math.max(0, Math.min(255, Math.round(color[2])));
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
