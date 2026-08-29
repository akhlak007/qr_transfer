/**
 * TEXT_FLASH_PROTOCOL — frame list construction and 4×2 bit-card helpers.
 * No Manchester, Barker, CRC, or shared VLC/OFDM framing.
 */

import {
  TEXT_FLASH_GEOMETRY,
  TEXT_FLASH_MAX_BYTES,
  type TextFlashFrameKind,
  type TextFlashGeometry,
} from "./text-flash-types";

export type TextFlashLogicalFrame =
  | { kind: "start" }
  | { kind: "end" }
  | { kind: "idle" }
  | { kind: "length"; byte: number }
  | { kind: "data"; byte: number; index: number };

export class TextFlashPayloadTooLongError extends Error {
  readonly byteLength: number;
  readonly maxBytes: number;

  constructor(byteLength: number, maxBytes: number = TEXT_FLASH_MAX_BYTES) {
    super(
      `TEXT_FLASH_PROTOCOL payload is ${byteLength} UTF-8 bytes; max is ${maxBytes}`,
    );
    this.name = "TextFlashPayloadTooLongError";
    this.byteLength = byteLength;
    this.maxBytes = maxBytes;
  }
}

/**
 * Encode one UTF-8 byte as 8 booleans, MSB first, row-major 4×2:
 *   [7][6][5][4]
 *   [3][2][1][0]
 * true = white (1), false = black (0).
 */
export function byteToBitCard(byte: number): boolean[] {
  const value = byte & 0xff;
  const bits = new Array<boolean>(8);
  for (let i = 0; i < 8; i++) {
    bits[i] = ((value >> (7 - i)) & 1) === 1;
  }
  return bits;
}

/** Inverse of byteToBitCard. */
export function bitCardToByte(bits: readonly boolean[]): number {
  if (bits.length !== 8) {
    throw new Error(`bit card requires 8 cells, got ${bits.length}`);
  }
  let value = 0;
  for (let i = 0; i < 8; i++) {
    if (bits[i]) value |= 1 << (7 - i);
  }
  return value;
}

export function encodeTextFlashPayload(
  text: string,
  maxBytes: number = TEXT_FLASH_MAX_BYTES,
): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > maxBytes) {
    throw new TextFlashPayloadTooLongError(bytes.length, maxBytes);
  }
  return bytes;
}

/**
 * Build the optical frame sequence: START → LENGTH → DATA×N → END.
 * Empty string yields START → LENGTH(0) → END.
 */
export function buildTextFlashFrames(
  text: string,
  maxBytes: number = TEXT_FLASH_MAX_BYTES,
): TextFlashLogicalFrame[] {
  const bytes = encodeTextFlashPayload(text, maxBytes);
  const frames: TextFlashLogicalFrame[] = [
    { kind: "start" },
    { kind: "length", byte: bytes.length },
  ];
  for (let i = 0; i < bytes.length; i++) {
    frames.push({ kind: "data", byte: bytes[i]!, index: i });
  }
  frames.push({ kind: "end" });
  return frames;
}

export function textFlashFrameKind(
  frame: TextFlashLogicalFrame,
): TextFlashFrameKind {
  return frame.kind;
}

/** Bit-card byte for LENGTH/DATA frames; null for control/idle. */
export function textFlashFrameByte(
  frame: TextFlashLogicalFrame,
): number | null {
  if (frame.kind === "length" || frame.kind === "data") return frame.byte;
  return null;
}

export function getTextFlashGeometry(): TextFlashGeometry {
  return { ...TEXT_FLASH_GEOMETRY };
}

/**
 * Axis-aligned active region inside a canvas of the given size.
 * Margin is (1 - activeRegionRatio) / 2 on each side.
 */
export function activeRegionRect(
  width: number,
  height: number,
  ratio: number = TEXT_FLASH_GEOMETRY.activeRegionRatio,
): { x: number; y: number; w: number; h: number } {
  const r = Math.min(1, Math.max(0.1, ratio));
  const w = width * r;
  const h = height * r;
  return {
    x: (width - w) / 2,
    y: (height - h) / 2,
    w,
    h,
  };
}

/**
 * Centers of the 8 bit-card cells inside the active region (row-major).
 * Gaps are black strips between cells (cellGapRatio of active size distributed).
 */
export function bitCardCellCenters(
  region: { x: number; y: number; w: number; h: number },
  gapRatio: number = TEXT_FLASH_GEOMETRY.cellGapRatio,
): Array<{ x: number; y: number; w: number; h: number }> {
  const cols = 4;
  const rows = 2;
  const gapX = region.w * gapRatio;
  const gapY = region.h * gapRatio;
  const cellW = (region.w - gapX * (cols - 1)) / cols;
  const cellH = (region.h - gapY * (rows - 1)) / rows;
  const cells: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = region.x + col * (cellW + gapX);
      const y = region.y + row * (cellH + gapY);
      cells.push({
        x: x + cellW / 2,
        y: y + cellH / 2,
        w: cellW,
        h: cellH,
      });
    }
  }
  return cells;
}

/** Horizontal bar band for START/END (full active width, centered vertically). */
export function controlBarRect(
  region: { x: number; y: number; w: number; h: number },
  barHeightRatio: number = TEXT_FLASH_GEOMETRY.barHeightRatio,
): { x: number; y: number; w: number; h: number } {
  const h = region.h * barHeightRatio;
  return {
    x: region.x,
    y: region.y + (region.h - h) / 2,
    w: region.w,
    h,
  };
}
